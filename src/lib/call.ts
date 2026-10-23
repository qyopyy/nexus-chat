"use client";

/**
 * Call engine — WebRTC mesh (great for 2–8 people) with:
 *  - "perfect negotiation" so peers can add/remove camera + screenshare at any time
 *  - Supabase Realtime private channel `call:<conversationId>` for signaling + presence
 *  - Web Audio graph: input gain → voice-activity / push-to-talk gate → outgoing track
 *                     per-user gain (0–200%) → master output gain → output device
 *  - speaking detection for every participant (green ring like Discord)
 */

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { loadJSON, saveJSON } from "./utils";
import { sfx, startRing, stopRing } from "./sounds";

// ------------------------------------------------------------------ types

export type RemoteParticipant = {
  id: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  speaking: boolean;
  camStream: MediaStream | null;
  screenStream: MediaStream | null;
  connection: RTCPeerConnectionState;
};

export type ScreenQuality = "720p30" | "1080p30" | "1080p60" | "source";

export type VoiceSettings = {
  inputDeviceId: string;
  outputDeviceId: string;
  cameraDeviceId: string;
  inputVolume: number; // 0..2
  outputVolume: number; // 0..2
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  mode: "vad" | "ptt";
  pttKey: string; // KeyboardEvent.code
  vadThreshold: number; // RMS 0..0.2
  screenQuality: ScreenQuality;
};

export type IncomingCall = { conversationId: string; callerId: string; at: number };

type CallState = {
  status: "idle" | "connecting" | "connected";
  conversationId: string | null;
  startedAt: number | null;
  error: string | null;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  pttActive: boolean;
  inputLevel: number;
  localCam: MediaStream | null;
  localScreen: MediaStream | null;
  participants: Record<string, RemoteParticipant>;
  userVolumes: Record<string, number>;
  localMutes: Record<string, boolean>;
  settings: VoiceSettings;
  focused: string | null; // `${userId}:cam` | `${userId}:screen`
  incoming: IncomingCall | null;
  outgoingRing: string | null;
};

export const DEFAULT_SETTINGS: VoiceSettings = {
  inputDeviceId: "default",
  outputDeviceId: "default",
  cameraDeviceId: "default",
  inputVolume: 1,
  outputVolume: 1,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  mode: "vad",
  pttKey: "Backquote",
  vadThreshold: 0.02,
  screenQuality: "1080p30",
};

export const useCall = create<CallState>(() => ({
  status: "idle",
  conversationId: null,
  startedAt: null,
  error: null,
  muted: false,
  deafened: false,
  speaking: false,
  pttActive: false,
  inputLevel: 0,
  localCam: null,
  localScreen: null,
  participants: {},
  userVolumes: {},
  localMutes: {},
  settings: DEFAULT_SETTINGS,
  focused: null,
  incoming: null,
  outgoingRing: null,
}));

const get = useCall.getState;
const set = useCall.setState;

// ------------------------------------------------------------------ internals

type Peer = {
  id: string;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  queue: Promise<void>;
  gain: GainNode;
  analyser: AnalyserNode;
  sinks: { el: HTMLAudioElement; src: MediaStreamAudioSourceNode; trackId: string }[];
  streams: Map<string, MediaStream>;
  meta: { camStreamId: string | null; screenStreamId: string | null };
  senders: { mic?: RTCRtpSender; cam?: RTCRtpSender; screen: RTCRtpSender[] };
  speakHang: number;
  /** the remote's per-join session id — a new id means they reloaded/rejoined */
  session: string | null;
};

type Envelope = { from: string; session?: string; toSession?: string | null };

type SignalPayload = Envelope & {
  to: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type StatePayload = Envelope & {
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  camStreamId: string | null;
  screenStreamId: string | null;
};

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
  ];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(",").map((s) => s.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

let me: string | null = null;
let channel: RealtimeChannel | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let micRaw: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let inputGain: GainNode | null = null;
let localAnalyser: AnalyserNode | null = null;
let gate: GainNode | null = null;
let micDest: MediaStreamAudioDestinationNode | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let vadHangUntil = 0;
let initialized = false;
const peers = new Map<string, Peer>();
const deadSessions = new Set<string>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let mySession = "";
const buf = new Float32Array(512);

function rms(an: AnalyserNode) {
  an.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function ensureAudio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  applyOutput();
  return ctx;
}

function applyOutput() {
  if (!ctx || !master) return;
  const { settings, deafened } = get();
  master.gain.setTargetAtTime(deafened ? 0 : settings.outputVolume, ctx.currentTime, 0.02);
  const sinkable = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof sinkable.setSinkId === "function") {
    sinkable.setSinkId(settings.outputDeviceId === "default" ? "" : settings.outputDeviceId).catch(() => {});
  }
}

async function acquireMic(): Promise<MediaStream> {
  const s = get().settings;
  const base: MediaTrackConstraints = {
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
    channelCount: 1,
  };
  if (s.inputDeviceId && s.inputDeviceId !== "default") {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: s.inputDeviceId } } });
    } catch {
      /* device vanished — fall back to default */
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base });
}

async function buildMic() {
  const a = ensureAudio();
  if (!inputGain) {
    inputGain = a.createGain();
    localAnalyser = a.createAnalyser();
    localAnalyser.fftSize = 512;
    gate = a.createGain();
    gate.gain.value = 0;
    micDest = a.createMediaStreamDestination();
    inputGain.connect(localAnalyser);
    inputGain.connect(gate);
    gate.connect(micDest);
  }
  inputGain.gain.value = get().settings.inputVolume;
  try {
    const stream = await acquireMic();
    micSource?.disconnect();
    micRaw?.getTracks().forEach((t) => t.stop());
    micRaw = stream;
    micSource = a.createMediaStreamSource(stream);
    micSource.connect(inputGain);
  } catch {
    set({ error: "Microphone unavailable — you joined in listen-only mode." });
  }
}

function micTrack(): MediaStreamTrack | null {
  return micDest?.stream.getAudioTracks()[0] ?? null;
}

function applyMuteState() {
  const { muted, deafened } = get();
  const t = micTrack();
  if (t) t.enabled = !(muted || deafened);
  applyOutput();
}

function tick() {
  const st = get();
  const now = performance.now();
  const s = st.settings;

  // local mic gate
  const lvl = localAnalyser ? rms(localAnalyser) : 0;
  const threshold = s.mode === "vad" ? s.vadThreshold : 0.012;
  if (lvl >= threshold) vadHangUntil = now + 300;
  const voiced = now < vadHangUntil;
  const silenced = st.muted || st.deafened;
  const open = !silenced && (s.mode === "ptt" ? st.pttActive : voiced);
  if (gate && ctx) gate.gain.setTargetAtTime(open ? 1 : 0, ctx.currentTime, 0.012);
  const speaking = open && voiced;

  const patch: Partial<CallState> = {};
  if (speaking !== st.speaking) patch.speaking = speaking;
  if (Math.abs(lvl - st.inputLevel) > 0.004) patch.inputLevel = lvl;

  // remote speaking
  let changed = false;
  const parts = { ...st.participants };
  for (const p of peers.values()) {
    const l = rms(p.analyser);
    if (l > 0.012) p.speakHang = now + 300;
    const sp = now < p.speakHang && !st.deafened;
    const cur = parts[p.id];
    if (cur && cur.speaking !== sp) {
      parts[p.id] = { ...cur, speaking: sp };
      changed = true;
    }
  }
  if (changed) patch.participants = parts;
  if (Object.keys(patch).length) set(patch);
}

function startTick() {
  if (!tickTimer) tickTimer = setInterval(tick, 60);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

function send(event: string, payload: Record<string, unknown>) {
  if (!channel || !me) return;
  void channel.send({ type: "broadcast", event, payload: { ...payload, from: me, session: mySession } });
}

function broadcastState() {
  const st = get();
  send("state", {
    muted: st.muted,
    deafened: st.deafened,
    video: !!st.localCam,
    screen: !!st.localScreen,
    camStreamId: st.localCam?.id ?? null,
    screenStreamId: st.localScreen?.id ?? null,
  });
}

function updateParticipant(id: string, patch: Partial<RemoteParticipant>) {
  const cur = get().participants[id];
  if (!cur) return;
  set({ participants: { ...get().participants, [id]: { ...cur, ...patch } } });
}

function applyPeerVolume(id: string) {
  const p = peers.get(id);
  if (!p || !ctx) return;
  const { userVolumes, localMutes } = get();
  const v = localMutes[id] ? 0 : userVolumes[id] ?? 1;
  p.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

function syncPeerStreams(p: Peer) {
  const live = (id: string | null) => {
    if (!id) return null;
    const s = p.streams.get(id);
    return s && s.getVideoTracks().some((t) => t.readyState === "live") ? s : null;
  };
  updateParticipant(p.id, { camStream: live(p.meta.camStreamId), screenStream: live(p.meta.screenStreamId) });
}

function removeSink(p: Peer, trackId: string) {
  p.sinks = p.sinks.filter((s) => {
    if (s.trackId !== trackId) return true;
    s.src.disconnect();
    s.el.srcObject = null;
    return false;
  });
}

function onRemoteTrack(p: Peer, ev: RTCTrackEvent) {
  const track = ev.track;
  const stream = ev.streams[0] ?? new MediaStream([track]);
  p.streams.set(stream.id, stream);
  if (track.kind === "audio" && ctx) {
    const solo = new MediaStream([track]);
    // Chrome only pipes remote WebRTC audio into WebAudio when it's also attached to a media element.
    const el = new Audio();
    el.muted = true;
    el.srcObject = solo;
    void el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(solo);
    src.connect(p.gain);
    src.connect(p.analyser);
    p.sinks.push({ el, src, trackId: track.id });
    track.addEventListener("ended", () => removeSink(p, track.id));
  }
  stream.onremovetrack = () => syncPeerStreams(p);
  track.onunmute = () => syncPeerStreams(p);
  syncPeerStreams(p);
}

function ensurePeer(id: string, session?: string | null): Peer {
  const existing = peers.get(id);
  if (existing) {
    if (!session || existing.session === session) return existing;
    if (existing.session === null) {
      existing.session = session;
      return existing;
    }
    // same user, new session (page reload / rejoin) → tear down the stale connection
    removePeer(id, true, true);
  }
  const a = ensureAudio();
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const gain = a.createGain();
  const analyser = a.createAnalyser();
  analyser.fftSize = 512;
  gain.connect(master!);

  const p: Peer = {
    id,
    pc,
    polite: (me ?? "") > id,
    makingOffer: false,
    ignoreOffer: false,
    settingRemoteAnswer: false,
    queue: Promise.resolve(),
    gain,
    analyser,
    sinks: [],
    streams: new Map(),
    meta: { camStreamId: null, screenStreamId: null },
    senders: { screen: [] },
    speakHang: 0,
    session: session ?? null,
  };
  peers.set(id, p);

  set({
    participants: {
      ...get().participants,
      [id]: {
        id,
        muted: false,
        deafened: false,
        video: false,
        screen: false,
        speaking: false,
        camStream: null,
        screenStream: null,
        connection: "new",
      },
    },
  });

  const mt = micTrack();
  if (mt && micDest) p.senders.mic = pc.addTrack(mt, micDest.stream);
  const { localCam, localScreen } = get();
  if (localCam) localCam.getVideoTracks().forEach((t) => (p.senders.cam = pc.addTrack(t, localCam)));
  if (localScreen) localScreen.getTracks().forEach((t) => p.senders.screen.push(pc.addTrack(t, localScreen)));

  pc.onnegotiationneeded = async () => {
    try {
      p.makingOffer = true;
      await pc.setLocalDescription();
      send("signal", { to: id, toSession: p.session, description: pc.localDescription?.toJSON() });
    } catch (e) {
      console.warn("negotiation failed", e);
    } finally {
      p.makingOffer = false;
    }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) send("signal", { to: id, toSession: p.session, candidate: candidate.toJSON() });
  };
  pc.ontrack = (ev) => onRemoteTrack(p, ev);
  pc.onconnectionstatechange = () => {
    updateParticipant(id, { connection: pc.connectionState });
    if (pc.connectionState === "failed") pc.restartIce();
  };

  applyPeerVolume(id);
  sfx.join();
  return p;
}

async function handleSignal(p: Peer, msg: SignalPayload) {
  const { pc } = p;
  if (msg.description) {
    const desc = msg.description;
    const readyForOffer = !p.makingOffer && (pc.signalingState === "stable" || p.settingRemoteAnswer);
    const collision = desc.type === "offer" && !readyForOffer;
    p.ignoreOffer = !p.polite && collision;
    if (p.ignoreOffer) return;
    p.settingRemoteAnswer = desc.type === "answer";
    await pc.setRemoteDescription(desc);
    p.settingRemoteAnswer = false;
    if (desc.type === "offer") {
      await pc.setLocalDescription();
      send("signal", { to: p.id, toSession: p.session, description: pc.localDescription?.toJSON() });
    }
  } else if (msg.candidate) {
    try {
      await pc.addIceCandidate(msg.candidate);
    } catch (e) {
      if (!p.ignoreOffer) console.warn("ice candidate failed", e);
    }
  }
}

function isStale(msg: Envelope) {
  if (msg.session && deadSessions.has(msg.session)) return true;
  if (msg.toSession && msg.toSession !== mySession) return true;
  return false;
}

function onSignal(msg: SignalPayload) {
  if (!me || msg.to !== me || msg.from === me || isStale(msg)) return;
  const p = ensurePeer(msg.from, msg.session);
  p.queue = p.queue.then(() => handleSignal(p, msg)).catch((e) => console.warn("signal error", e));
}

function onState(msg: StatePayload) {
  if (!me || msg.from === me || isStale(msg)) return;
  const p = ensurePeer(msg.from, msg.session);
  p.meta = { camStreamId: msg.camStreamId, screenStreamId: msg.screenStreamId };
  updateParticipant(msg.from, { muted: msg.muted, deafened: msg.deafened, video: msg.video, screen: msg.screen });
  syncPeerStreams(p);
}

function removePeer(id: string, silent = false, markDead = false) {
  const p = peers.get(id);
  if (!p) return;
  p.pc.onnegotiationneeded = null;
  p.pc.onicecandidate = null;
  p.pc.ontrack = null;
  p.pc.onconnectionstatechange = null;
  p.pc.close();
  p.sinks.forEach((s) => {
    s.src.disconnect();
    s.el.srcObject = null;
  });
  p.gain.disconnect();
  if (markDead && p.session) deadSessions.add(p.session);
  peers.delete(id);
  const parts = { ...get().participants };
  delete parts[id];
  const focused = get().focused;
  set({ participants: parts, focused: focused?.startsWith(id + ":") ? null : focused });
  if (!silent) sfx.leave();
  // someone joined → stop outgoing ring
}

function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

// ------------------------------------------------------------------ public API

export function initCallEngine(userId: string) {
  me = userId;
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  set({
    settings: loadJSON("nexus.voice", DEFAULT_SETTINGS),
    userVolumes: loadJSON<Record<string, number>>("nexus.volumes", {}),
    localMutes: loadJSON<Record<string, boolean>>("nexus.localMutes", {}),
    muted: loadJSON("nexus.selfmute", { muted: false }).muted,
    deafened: loadJSON("nexus.selfdeaf", { deafened: false }).deafened,
  });

  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

  window.addEventListener("keydown", (e) => {
    const s = get().settings;
    if (s.mode !== "ptt" || e.code !== s.pttKey || e.repeat || isTyping(e.target)) return;
    if (get().status !== "idle") set({ pttActive: true });
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === get().settings.pttKey) set({ pttActive: false });
  });
  window.addEventListener("blur", () => set({ pttActive: false }));
  window.addEventListener("beforeunload", () => {
    if (get().status !== "idle") send("bye", {});
  });
}

export async function joinCall(conversationId: string, opts: { video?: boolean } = {}) {
  if (!me) return;
  const st = get();
  if (st.conversationId === conversationId && st.status !== "idle") return;
  if (st.status !== "idle") await leaveCall();

  stopRing();
  mySession = crypto.randomUUID();
  deadSessions.clear();
  set({
    status: "connecting",
    conversationId,
    error: null,
    participants: {},
    startedAt: Date.now(),
    incoming: null,
    focused: null,
  });

  ensureAudio();
  await buildMic();
  if (get().conversationId !== conversationId) return; // left while waiting for permission
  applyMuteState();
  startTick();

  const ch = supabase.channel(`call:${conversationId}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: me } },
  });
  ch.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as SignalPayload))
    .on("broadcast", { event: "state" }, ({ payload }) => onState(payload as StatePayload))
    .on("broadcast", { event: "bye" }, ({ payload }) => {
      const msg = payload as Envelope;
      const p = peers.get(msg.from);
      if (!p || isStale(msg) || (p.session && msg.session && p.session !== msg.session)) return;
      removePeer(msg.from, false, true);
    })
    .on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as unknown as Record<string, { session?: string }[]>;
      for (const [key, metas] of Object.entries(state)) {
        const session = metas[metas.length - 1]?.session ?? null;
        if (key !== me && !(session && deadSessions.has(session))) ensurePeer(key, session);
      }
      if (Object.keys(get().participants).length > 0 && get().outgoingRing) {
        set({ outgoingRing: null });
        stopRing();
      }
    })
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      if (key === me) return;
      const session = (newPresences[newPresences.length - 1] as { session?: string } | undefined)?.session ?? null;
      if (session && deadSessions.has(session)) return;
      clearTimeout(leaveTimers.get(key));
      leaveTimers.delete(key);
      ensurePeer(key, session);
      broadcastState();
    })
    .on("presence", { event: "leave" }, ({ key, currentPresences }) => {
      if (key === me || currentPresences.length > 0) return;
      // grace period: a network blip re-joins with the same session and keeps the connection
      clearTimeout(leaveTimers.get(key));
      leaveTimers.set(
        key,
        setTimeout(() => {
          leaveTimers.delete(key);
          if (channel === ch && !(key in ch.presenceState())) removePeer(key);
        }, 8000),
      );
    });

  channel = ch;
  ch.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await ch.track({ user_id: me, session: mySession, at: Date.now() });
      if (get().conversationId === conversationId) {
        set({ status: "connected" });
        broadcastState();
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      set({ error: "Couldn't reach the call server. Check Realtime settings / your connection." });
    }
  });

  sfx.join();
  if (opts.video) await toggleVideo();
}

export async function leaveCall() {
  const { conversationId, outgoingRing } = get();
  if (!conversationId) return;
  send("bye", {});
  leaveTimers.forEach((t) => clearTimeout(t));
  leaveTimers.clear();
  for (const id of [...peers.keys()]) removePeer(id, true);
  stopStream(get().localCam);
  stopStream(get().localScreen);
  micSource?.disconnect();
  micRaw?.getTracks().forEach((t) => t.stop());
  micRaw = null;
  micSource = null;
  if (gate && ctx) gate.gain.value = 0;
  if (channel) {
    const ch = channel;
    channel = null;
    await ch.untrack().catch(() => {});
    await supabase.removeChannel(ch);
  }
  stopTick();
  stopRing();
  if (outgoingRing && me) {
    void supabase.from("call_events").insert({ conversation_id: outgoingRing, caller_id: me, kind: "cancel" });
  }
  set({
    status: "idle",
    conversationId: null,
    participants: {},
    localCam: null,
    localScreen: null,
    startedAt: null,
    focused: null,
    outgoingRing: null,
    speaking: false,
    pttActive: false,
    error: null,
  });
  sfx.leave();
}

/** Start a call in a DM/group and ring the other members. */
export async function startCall(conversationId: string, opts: { video?: boolean } = {}) {
  await joinCall(conversationId, opts);
  if (!me) return;
  const { error } = await supabase.from("call_events").insert({ conversation_id: conversationId, caller_id: me, kind: "ring" });
  if (!error) {
    set({ outgoingRing: conversationId });
    startRing(true);
    setTimeout(() => {
      if (get().outgoingRing === conversationId) {
        set({ outgoingRing: null });
        stopRing();
      }
    }, 30000);
  }
}

export function receiveRing(conversationId: string, callerId: string) {
  if (get().conversationId === conversationId) return;
  set({ incoming: { conversationId, callerId, at: Date.now() } });
  startRing(false);
  setTimeout(() => {
    if (get().incoming?.conversationId === conversationId) dismissIncoming();
  }, 30000);
}

export function cancelRing(conversationId: string) {
  if (get().incoming?.conversationId === conversationId) dismissIncoming();
}

export function declineRing(conversationId: string) {
  stopRing();
  if (get().outgoingRing === conversationId) set({ outgoingRing: null });
}

export function dismissIncoming(sendDecline = false) {
  const inc = get().incoming;
  stopRing();
  set({ incoming: null });
  if (sendDecline && inc && me) {
    void supabase.from("call_events").insert({ conversation_id: inc.conversationId, caller_id: me, kind: "decline" });
  }
}

export function toggleMute() {
  const { muted, deafened } = get();
  if (deafened) {
    set({ deafened: false, muted: false });
  } else {
    set({ muted: !muted });
  }
  const now = get();
  saveJSON("nexus.selfmute", { muted: now.muted });
  saveJSON("nexus.selfdeaf", { deafened: now.deafened });
  applyMuteState();
  broadcastState();
  if (now.muted || now.deafened) sfx.mute();
  else sfx.unmute();
}

export function toggleDeafen() {
  const deafened = !get().deafened;
  set({ deafened });
  saveJSON("nexus.selfdeaf", { deafened });
  applyMuteState();
  broadcastState();
  if (deafened) sfx.mute();
  else sfx.unmute();
}

export async function toggleVideo() {
  if (get().status === "idle") return;
  const cur = get().localCam;
  if (cur) {
    for (const p of peers.values()) {
      if (p.senders.cam) {
        try {
          p.pc.removeTrack(p.senders.cam);
        } catch {
          /* already closed */
        }
        p.senders.cam = undefined;
      }
    }
    stopStream(cur);
    set({ localCam: null, focused: get().focused === `${me}:cam` ? null : get().focused });
    broadcastState();
    return;
  }
  try {
    const s = get().settings;
    const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    if (s.cameraDeviceId && s.cameraDeviceId !== "default") video.deviceId = { exact: s.cameraDeviceId };
    const cam = await navigator.mediaDevices.getUserMedia({ video });
    if (get().status === "idle") {
      stopStream(cam);
      return;
    }
    const track = cam.getVideoTracks()[0];
    track.contentHint = "motion";
    for (const p of peers.values()) p.senders.cam = p.pc.addTrack(track, cam);
    set({ localCam: cam });
    broadcastState();
  } catch {
    set({ error: "Camera unavailable or permission denied." });
  }
}

const SCREEN_PRESETS: Record<ScreenQuality, MediaTrackConstraints> = {
  "720p30": { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  "1080p30": { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
  "1080p60": { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
  source: { frameRate: { ideal: 30 } },
};

export async function toggleScreen() {
  if (get().status === "idle") return;
  if (get().localScreen) {
    stopScreen();
    return;
  }
  try {
    const q = get().settings.screenQuality;
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: SCREEN_PRESETS[q], audio: true });
    if (get().status === "idle") {
      stopStream(screen);
      return;
    }
    const vt = screen.getVideoTracks()[0];
    vt.contentHint = q === "1080p60" ? "motion" : "detail";
    vt.addEventListener("ended", stopScreen);
    for (const p of peers.values()) {
      screen.getTracks().forEach((t) => p.senders.screen.push(p.pc.addTrack(t, screen)));
    }
    set({ localScreen: screen, focused: `${me}:screen` });
    broadcastState();
    sfx.screenOn();
  } catch {
    /* user cancelled the picker */
  }
}

export function stopScreen() {
  const cur = get().localScreen;
  if (!cur) return;
  for (const p of peers.values()) {
    p.senders.screen.forEach((s) => {
      try {
        p.pc.removeTrack(s);
      } catch {
        /* closed */
      }
    });
    p.senders.screen = [];
  }
  stopStream(cur);
  set({ localScreen: null, focused: get().focused === `${me}:screen` ? null : get().focused });
  broadcastState();
  sfx.screenOff();
}

export function setUserVolume(id: string, v: number) {
  const userVolumes = { ...get().userVolumes, [id]: v };
  set({ userVolumes });
  saveJSON("nexus.volumes", userVolumes);
  applyPeerVolume(id);
}

export function toggleLocalMute(id: string) {
  const localMutes = { ...get().localMutes, [id]: !get().localMutes[id] };
  set({ localMutes });
  saveJSON("nexus.localMutes", localMutes);
  applyPeerVolume(id);
}

export async function updateSettings(patch: Partial<VoiceSettings>) {
  const prev = get().settings;
  const settings = { ...prev, ...patch };
  set({ settings });
  saveJSON("nexus.voice", settings);

  if (inputGain && ctx && patch.inputVolume !== undefined) inputGain.gain.setTargetAtTime(settings.inputVolume, ctx.currentTime, 0.02);
  if (patch.outputVolume !== undefined || patch.outputDeviceId !== undefined) applyOutput();

  const inCall = get().status !== "idle";
  const micChanged =
    (patch.inputDeviceId !== undefined && patch.inputDeviceId !== prev.inputDeviceId) ||
    (patch.noiseSuppression !== undefined && patch.noiseSuppression !== prev.noiseSuppression) ||
    (patch.echoCancellation !== undefined && patch.echoCancellation !== prev.echoCancellation) ||
    (patch.autoGainControl !== undefined && patch.autoGainControl !== prev.autoGainControl);
  if (inCall && micChanged) await buildMic(); // outgoing track stays the same → no renegotiation

  const cam = get().localCam;
  if (inCall && cam && patch.cameraDeviceId && patch.cameraDeviceId !== prev.cameraDeviceId) {
    try {
      const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (patch.cameraDeviceId !== "default") video.deviceId = { exact: patch.cameraDeviceId };
      const fresh = await navigator.mediaDevices.getUserMedia({ video });
      const nt = fresh.getVideoTracks()[0];
      for (const p of peers.values()) await p.senders.cam?.replaceTrack(nt);
      cam.getVideoTracks().forEach((t) => {
        cam.removeTrack(t);
        t.stop();
      });
      cam.addTrack(nt);
      set({ localCam: cam });
    } catch {
      set({ error: "Couldn't switch camera." });
    }
  }
}

export function setFocused(tile: string | null) {
  set({ focused: get().focused === tile ? null : tile });
}

export function clearCallError() {
  set({ error: null });
}

/** iOS Safari / in-app WebViews don't support screen capture */
export function canScreenShare() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
}

export function myCallId() {
  return me;
}
