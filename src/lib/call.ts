"use client";

/**
 * Call engine — WebRTC mesh (great for 2–8 people) with:
 *  - "perfect negotiation" so peers can add/remove camera + screenshare at any time
 *  - Supabase Realtime private channel `call:<conversationId>` for signaling + presence
 *  - Web Audio graph: input gain → voice-activity / push-to-talk gate → outgoing track
 *                     per-user gain (0–400%) → master output gain → limiter → output device
 *  - speaking detection for every participant (green ring like Discord)
 */

import { create } from "zustand";
import { loadNetPrefs } from "./netPrefs";
import { newRoomCode } from "./room";
import { NEED, gate as premiumGate, myTier } from "./premium";
import type { RoomGame } from "@/store/games";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { loadJSON, saveJSON } from "./utils";
import { sfx, startRing, stopRing } from "./sounds";
import { builtinMeta, isSoundUrl, renderBuiltin, type Sound } from "./soundboard";
import { isMobileDevice, startAvatar, type AvatarEngine, type VAvatar } from "./vavatar";
import {
  ensureVoiceFxWorklet,
  loadSavedFxId,
  loadSavedModel,
  resolvePreset,
  saveFxId,
  voiceFxLabel,
  type VoiceFxId,
  type VoiceModelPack,
} from "./voiceChanger";

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
  avatar: boolean;
  hand: boolean;
};

export type NoiseMode = "off" | "standard" | "ai";
/** Opus kbps — 510 is near the practical Opus ceiling for stereo studio voice */
export type VoiceQuality = 64 | 128 | 320 | 510;

export type ScreenQuality = "720p30" | "1080p30" | "1080p60" | "1440p30" | "2160p30" | "source";
/** camera send quality — 1080p needs Nexus Lighting; auto = the best your plan allows */
export type CameraQuality = "auto" | "720p30" | "1080p30" | "1080p60";

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
  cameraQuality: CameraQuality;
  /** off · browser noise suppression · Nexus Clear (RNNoise AI) */
  noiseMode: NoiseMode;
  /** Opus bitrate in kbps (Discord: 64 default, 96–384 boosted) */
  voiceQuality: VoiceQuality;
  /** settings schema bump: v3 defaults to 510 kbps studio */
  qualityV?: number;
  soundboardVolume: number; // 0..1
  /** mirror local camera tile */
  mirrorSelf: boolean;
  /** Capture stereo for studio / music calls when quality ≥ 320 */
  stereoStudio: boolean;
  /** Soft whisper — lower outbound gain without hard mute */
  whisper: boolean;
  /** Live voice changer preset */
  voiceFx: VoiceFxId;
};

export type IncomingCall = { conversationId: string; callerId: string; at: number };
export type CallLayout = "gallery" | "speaker";
export type CallQuality = "good" | "ok" | "poor" | null;
/** Play Together: one game room for the call (Global Strike, Neon Streets, GeoGuess …). */
export type PlayState = { game: RoomGame; code: string; by: string; rev: number };
const PLAY_GAMES: RoomGame[] = ["globalstrike", "classicstrike", "streets", "geo", "flappy", "four"];

/** Watch Together: one shared video for everyone in the call. `pos` was the position at local time `t` (performance.now()). */
export type WatchState = {
  kind: "youtube" | "video" | "instagram";
  src: string;
  id: string | null;
  title: string;
  playing: boolean;
  pos: number;
  t: number;
  rate: number;
  by: string;
  rev: number;
};

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
  /** sending the V-Avatar instead of the real camera */
  avatarOn: boolean;
  /** Nexus Clear status: null = not used, true = running, false = unavailable on this device */
  clearActive: boolean | null;
  /** last soundboard sound played by anyone in the call (for the little toast) */
  soundToast: { from: string; name: string; emoji: string; at: number } | null;
  /** floating emoji reactions over the call */
  reactions: { id: number; from: string; emoji: string; x: number }[];
  myHand: boolean;
  /** gallery grid vs auto-spotlight the loudest / focused tile */
  layout: CallLayout;
  /** local call-audio recording in progress */
  recording: boolean;
  recordingStartedAt: number | null;
  /** aggregate WebRTC link quality */
  callQuality: CallQuality;
  /** latest max RTT across peers (ms); null when idle / unknown */
  callPingMs: number | null;
  /** front / back camera preference for flip */
  facingMode: "user" | "environment";
  /** loaded AI voice-model pack (from zip) */
  voiceModel: VoiceModelPack | null;
  /** Watch Together session (null = nothing playing) */
  watch: WatchState | null;
  /** Play Together: a multiplayer game room everyone in the call can join */
  play: PlayState | null;
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
  vadThreshold: 0.015,
  screenQuality: "1080p30",
  cameraQuality: "auto",
  noiseMode: "ai",
  voiceQuality: 510,
  qualityV: 3,
  soundboardVolume: 0.7,
  mirrorSelf: true,
  stereoStudio: true,
  whisper: false,
  voiceFx: "off",
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
  avatarOn: false,
  clearActive: null,
  soundToast: null,
  reactions: [],
  myHand: false,
  layout: "gallery",
  recording: false,
  recordingStartedAt: null,
  callQuality: null,
  callPingMs: null,
  facingMode: "user",
  voiceModel: null,
  watch: null,
  play: null,
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
  /** when connection last looked stuck in new/connecting */
  stuckSince: number;
  /** last ICE restart attempt (performance.now) */
  lastIceRestart: number;
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
  avatar?: boolean;
  hand?: boolean;
};

// TURN relay credentials from the `turn` edge function (Cloudflare / Metered / own coturn, when configured)
let turnIce: RTCIceServer[] = [];
let turnAt = 0;
let turnProvider = "none";
export async function loadTurn(force = false): Promise<{ servers: number; provider: string }> {
  if (!force && turnAt && Date.now() - turnAt < 3 * 3600_000) return { servers: turnIce.length, provider: turnProvider };
  try {
    const r = await Promise.race([
      supabase.functions.invoke("turn", { body: {} }),
      new Promise<{ data: null }>((res) => setTimeout(() => res({ data: null }), 3000)),
    ]);
    const d = (r as { data: { iceServers?: RTCIceServer[]; provider?: string } | null }).data;
    if (d) {
      turnIce = Array.isArray(d.iceServers) ? d.iceServers : [];
      turnProvider = d.provider ?? "none";
      turnAt = Date.now();
    }
  } catch {
    /* calls still work peer-to-peer */
  }
  return { servers: turnIce.length, provider: turnProvider };
}
/** "Hide my IP in calls": relay-only when the user asked for it and a relay exists */
function relayOnly() {
  return turnIce.length > 0 && loadNetPrefs().relayCalls;
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    ...(relayOnly() ? [] : [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }]),
    ...turnIce,
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
/** after joining, briefly use a softer VAD threshold so the first words aren't clipped */
let joinBoostUntil = 0;
let initialized = false;
let clearReady = false;
const peers = new Map<string, Peer>();
const deadSessions = new Set<string>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let mySession = "";
const buf = new Float32Array(512);
let recorder: MediaRecorder | null = null;
let recordChunks: BlobPart[] = [];
let recordDest: MediaStreamAudioDestinationNode | null = null;
let recordLocalTap: GainNode | null = null;
let qualityTimer: ReturnType<typeof setInterval> | null = null;

function rms(an: AnalyserNode) {
  an.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function ensureAudio(): AudioContext {
  if (!ctx) {
    try {
      ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 }); // RNNoise + Opus both run at 48 kHz
    } catch {
      ctx = new AudioContext({ latencyHint: "interactive" });
    }
    master = ctx.createGain();
    // safety limiter: lets people boost a quiet friend up to 400% without harsh clipping
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  applyOutput();
  // Chrome only unlocks remote WebRTC→WebAudio after a media element has played under a gesture.
  for (const p of peers.values()) {
    for (const s of p.sinks) void s.el.play().catch(() => {});
  }
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

/** high-quality capture: 48 kHz, no browser resampling; browser NS only in "standard" mode (Nexus Clear replaces it) */
export function micConstraints(s: VoiceSettings): MediaTrackConstraints {
  const stereo = !!s.stereoStudio && s.voiceQuality >= 320;
  const c: MediaTrackConstraints & { voiceIsolation?: boolean; latency?: number } = {
    noiseSuppression: s.noiseMode === "standard",
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
    channelCount: stereo ? 2 : 1,
    sampleRate: 48000,
    sampleSize: 16,
    latency: 0.01,
  };
  if (s.noiseMode !== "off") c.voiceIsolation = true; // Chrome/Safari on supported hardware (Apple voice isolation etc.)
  return c;
}

async function acquireMic(): Promise<MediaStream> {
  const s = get().settings;
  const base = micConstraints(s);
  if (s.inputDeviceId && s.inputDeviceId !== "default") {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: s.inputDeviceId } } });
    } catch {
      /* device vanished — fall back to default */
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base });
}

/** Make sure every peer has our mic sender (needed if peers joined before mic permission, or after rebuild). */
function attachMicToPeers() {
  const mt = micTrack();
  if (!mt || !micDest) return;
  for (const p of peers.values()) {
    if (p.senders.mic?.track === mt) continue;
    if (p.senders.mic) {
      void p.senders.mic.replaceTrack(mt).then(() => tuneAudioSender(p.senders.mic!)).catch(() => {
        try {
          p.pc.removeTrack(p.senders.mic!);
        } catch {
          /* closed */
        }
        p.senders.mic = p.pc.addTrack(mt, micDest!.stream);
        void tuneAudioSender(p.senders.mic);
      });
    } else {
      p.senders.mic = p.pc.addTrack(mt, micDest.stream);
      void tuneAudioSender(p.senders.mic);
    }
  }
}

async function buildMic() {
  const a = ensureAudio();
  await a.resume().catch(() => {});
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
    await buildVoiceChain(a);
    micSource.connect(voiceIn!);
    attachMicToPeers();
  } catch {
    set({ error: "Microphone unavailable — you joined in listen-only mode. Check browser mic permission and try Voice settings." });
  }
}

// ------------------------------------------------------------------ voice DSP ("Nexus Clear" + Voice FX)
// mic → high-pass → [RNNoise] → voice FX → presence / de-ess → leveler → input gain
let voiceIn: AudioNode | null = null;
let clearNode: AudioWorkletNode | null = null;
let voiceFxNode: AudioWorkletNode | null = null;
let clearVad = 1;
let clearLoad: Promise<boolean> | null = null;
let wasmBytes: ArrayBuffer | null = null;

async function loadClear(a: AudioContext): Promise<boolean> {
  if (a.sampleRate !== 48000 || !a.audioWorklet) return false;
  clearLoad ??= (async () => {
    try {
      const [, bin] = await Promise.all([a.audioWorklet.addModule("/rnnoise/worklet.js"), fetch("/rnnoise/rnnoise.wasm").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))]);
      wasmBytes = bin;
      return true;
    } catch (e) {
      console.warn("Nexus Clear unavailable", e);
      return false;
    }
  })();
  return clearLoad;
}

async function buildVoiceChain(a: AudioContext) {
  const s = get().settings;
  const model = get().voiceModel;
  const preset = resolvePreset(s.voiceFx || "off", model);
  if (voiceIn) {
    // rebuild: drop the old chain head (keeps inputGain → gate → micDest intact, so no renegotiation)
    voiceIn.disconnect();
    clearNode?.disconnect();
    clearNode?.port.close();
    clearNode = null;
    voiceFxNode?.disconnect();
    voiceFxNode?.port.close();
    voiceFxNode = null;
  }
  const hpHz = preset.highpass ?? 75;
  const hp = a.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = hpHz;
  hp.Q.value = 0.7;
  const air = a.createBiquadFilter(); // gentle presence lift, makes voices clearer on small speakers
  air.type = "peaking";
  air.frequency.value = preset.formantHz ?? 3200;
  air.Q.value = 0.9;
  air.gain.value = preset.formantGain ?? 1.5;
  const ess = a.createBiquadFilter(); // tame harsh sibilance
  ess.type = "highshelf";
  ess.frequency.value = 9000;
  ess.gain.value = preset.id === "radio" ? -1 : -2;
  const lev = a.createDynamicsCompressor(); // broadcast-style leveler — studio-ish
  lev.threshold.value = s.voiceQuality >= 320 ? -22 : -26;
  lev.knee.value = 12;
  lev.ratio.value = s.voiceQuality >= 510 ? 2.4 : 3;
  lev.attack.value = 0.003;
  lev.release.value = 0.18;

  let chainTail: AudioNode = hp;
  clearVad = 1;
  clearReady = false;
  if (s.noiseMode === "ai" && (await loadClear(a)) && wasmBytes) {
    try {
      clearNode = new AudioWorkletNode(a, "nexus-clear", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { wasm: wasmBytes } });
      clearNode.port.onmessage = (e) => {
        const d = e.data as { vad?: number; ready?: boolean };
        if (typeof d.vad === "number") clearVad = d.vad;
        if (typeof d.ready === "boolean") {
          clearReady = d.ready;
          set({ clearActive: d.ready });
        }
      };
      hp.connect(clearNode);
      chainTail = clearNode;
    } catch {
      set({ clearActive: false });
    }
  } else set({ clearActive: s.noiseMode === "ai" ? false : null });

  if (preset.id !== "off" && preset.wet > 0 && (await ensureVoiceFxWorklet(a))) {
    try {
      voiceFxNode = new AudioWorkletNode(a, "nexus-voice-fx", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { ratio: preset.ratio, wet: preset.wet, robot: !!preset.robot },
      });
      chainTail.connect(voiceFxNode);
      chainTail = voiceFxNode;
    } catch (e) {
      console.warn("Voice FX unavailable", e);
    }
  }

  if (preset.lowpass) {
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = preset.lowpass;
    chainTail.connect(lp);
    chainTail = lp;
  }

  chainTail.connect(air).connect(ess).connect(lev).connect(inputGain!);
  if (inputGain) {
    const base = s.inputVolume * (s.whisper ? 0.28 : 1);
    inputGain.gain.setTargetAtTime(base, a.currentTime, 0.02);
  }
  voiceIn = hp;
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
  const soft = now < joinBoostUntil;
  const threshold = s.mode === "vad" ? (soft ? Math.min(s.vadThreshold, 0.01) : s.vadThreshold) : 0.012;
  // only enforce Nexus Clear VAD after the worklet reports ready — otherwise the mic stays closed forever
  const aiSaysVoice = !(clearNode && clearReady) || clearVad > 0.22;
  if (lvl >= threshold && aiSaysVoice) vadHangUntil = now + (soft ? 500 : 320);
  const voiced = now < vadHangUntil;
  const silenced = st.muted || st.deafened;
  const open = !silenced && (s.mode === "ptt" ? st.pttActive : voiced);
  if (gate && ctx) {
    if (silenced) {
      gate.gain.cancelScheduledValues(ctx.currentTime);
      gate.gain.setValueAtTime(0, ctx.currentTime); // hard zero when muted
    } else gate.gain.setTargetAtTime(open ? 1 : 0, ctx.currentTime, open ? 0.006 : 0.03);
  }
  const speaking = open && voiced;

  const patch: Partial<CallState> = {};
  if (speaking !== st.speaking) patch.speaking = speaking;
  if (Math.abs(lvl - st.inputLevel) > 0.004) patch.inputLevel = lvl;

  // remote speaking + ICE watchdog for peers stuck on "connecting"
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
    const cs = p.pc.connectionState;
    if (cs === "new" || cs === "connecting") {
      if (!p.stuckSince) p.stuckSince = now;
      else if (now - p.stuckSince > 14000) {
        const session = p.session;
        removePeer(p.id, true);
        const np = ensurePeer(p.id, session);
        void renegotiate(np);
      } else if (now - p.stuckSince > 4500 && now - p.lastIceRestart > 4000) {
        p.lastIceRestart = now;
        try {
          p.pc.restartIce();
        } catch {
          /* ignore */
        }
        // missed early offers (sent before both sides were SUBSCRIBED) — re-offer
        void renegotiate(p);
      }
    } else {
      p.stuckSince = 0;
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
    avatar: st.avatarOn,
    hand: st.myHand,
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
  const pc = new RTCPeerConnection({ iceServers: iceServers(), iceTransportPolicy: relayOnly() ? "relay" : "all" });
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
    stuckSince: performance.now(),
    lastIceRestart: 0,
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
        avatar: false,
        hand: false,
      },
    },
  });
  // callee presence means the ring was answered — clear the caller's "connecting" ring UI
  if (get().outgoingRing) {
    set({ outgoingRing: null });
    stopRing();
  }

  const mt = micTrack();
  if (mt && micDest) {
    p.senders.mic = pc.addTrack(mt, micDest.stream);
    void tuneAudioSender(p.senders.mic);
  }
  const { localCam, localScreen } = get();
  if (localCam) localCam.getVideoTracks().forEach((t) => (p.senders.cam = pc.addTrack(t, localCam)));
  if (localScreen) localScreen.getTracks().forEach((t) => p.senders.screen.push(pc.addTrack(t, localScreen)));

  pc.onnegotiationneeded = async () => {
    try {
      p.makingOffer = true;
      await setLocalTuned(pc);
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
    if (pc.connectionState === "failed") {
      p.lastIceRestart = performance.now();
      try {
        pc.restartIce();
      } catch {
        /* ignore */
      }
      void renegotiate(p);
    }
    if (pc.connectionState === "connected") {
      p.stuckSince = 0;
      pc.getSenders().forEach((sn) => sn.track?.kind === "audio" && void tuneAudioSender(sn));
      tunePeerVideo(p);
    }
  };
  // video encodings only exist after (re)negotiation — set HD bitrates every time it settles
  pc.addEventListener("signalingstatechange", () => {
    if (pc.signalingState === "stable") tunePeerVideo(p);
  });

  applyPeerVolume(id);
  sfx.join();
  return p;
}

/** Force a new local offer — recovers when the first offer was broadcast before the peer subscribed. */
async function setLocalTuned(pc: RTCPeerConnection) {
  const kbps = get().settings.voiceQuality;
  const stereo = !!get().settings.stereoStudio && kbps >= 320;
  if (pc.signalingState === "have-remote-offer") {
    const answer = await pc.createAnswer();
    if (answer.sdp) answer.sdp = tuneOpus(answer.sdp, kbps, stereo);
    await pc.setLocalDescription(answer);
  } else {
    const offer = await pc.createOffer();
    if (offer.sdp) offer.sdp = tuneOpus(offer.sdp, kbps, stereo);
    await pc.setLocalDescription(offer);
  }
}

async function renegotiate(p: Peer) {
  if (!p || p.pc.signalingState === "closed") return;
  if (p.makingOffer || p.pc.signalingState !== "stable") return;
  try {
    p.makingOffer = true;
    await setLocalTuned(p.pc);
    const desc = p.pc.localDescription;
    if (desc) send("signal", { to: p.id, toSession: p.session, description: desc.toJSON() });
  } catch (e) {
    console.warn("renegotiate failed", e);
  } finally {
    p.makingOffer = false;
  }
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
    const stereo = !!get().settings.stereoStudio && get().settings.voiceQuality >= 320;
    await pc.setRemoteDescription(desc.sdp ? { type: desc.type, sdp: tuneOpus(desc.sdp, get().settings.voiceQuality, stereo) } : desc);
    p.settingRemoteAnswer = false;
    if (desc.type === "offer") {
      await setLocalTuned(pc);
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

/**
 * HQ Opus: the remote's fmtp line tells OUR encoder what to send, so we raise it before applying:
 * fullband 48 kHz, stereo, up to `kbps` (Discord's default is 64), in-band FEC for packet loss, no DTX (no pumping).
 */
export function tuneOpus(sdp: string, kbps: number, stereo = true) {
  const pts = [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000(?:\/2)?/gi)].map((m) => m[1]);
  let out = sdp;
  for (const pt of pts) {
    const want: Record<string, string> = {
      minptime: "10",
      useinbandfec: "1",
      usedtx: "0",
      stereo: stereo ? "1" : "0",
      "sprop-stereo": stereo ? "1" : "0",
      maxaveragebitrate: String(Math.min(510_000, kbps * 1000)),
      maxplaybackrate: "48000",
      "sprop-maxcapturerate": "48000",
      cbr: "0",
    };
    const re = new RegExp(`a=fmtp:${pt} ([^\r\n]*)`);
    const m = out.match(re);
    if (m) {
      const cur = Object.fromEntries(
        m[1]
          .split(";")
          .map((kv) => kv.trim().split("="))
          .filter((kv) => kv[0]),
      ) as Record<string, string>;
      const merged = { ...cur, ...want };
      out = out.replace(re, `a=fmtp:${pt} ${Object.entries(merged).map(([k, v]) => `${k}=${v}`).join(";")}`);
    } else {
      out = out.replace(new RegExp(`(a=rtpmap:${pt} opus\/48000(?:\/2)?\r?\n)`, "i"), `$1a=fmtp:${pt} ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(";")}\r\n`);
    }
  }
  return out;
}

async function tuneAudioSender(sender: RTCRtpSender) {
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    const kbps = get().settings.voiceQuality;
    for (const e of params.encodings) {
      e.maxBitrate = Math.min(510_000, kbps * 1000);
      e.priority = "high";
      e.maxFramerate = undefined;
      (e as RTCRtpEncodingParameters & { networkPriority?: string }).networkPriority = "high";
    }
    await sender.setParameters(params);
  } catch {
    /* not negotiated yet — retried once connected */
  }
}

/** camera presets; kbps lifts WebRTC's default ~2.5 Mbps ceiling so 1080p actually looks like 1080p */
const CAM_PRESETS = {
  "720p30": { w: 1280, h: 720, fps: 30, kbps: 2_500 },
  "1080p30": { w: 1920, h: 1080, fps: 30, kbps: 4_500 },
  "1080p60": { w: 1920, h: 1080, fps: 60, kbps: 7_000 },
} as const;
const SCREEN_KBPS: Record<ScreenQuality, number> = { "720p30": 2_500, "1080p30": 4_500, "1080p60": 8_000, "1440p30": 8_000, "2160p30": 16_000, source: 8_000 };

/** what your camera really sends: free = 720p30 · Lighting+ = 1080p30 (auto) or 1080p60 */
export function effectiveCameraQuality(): Exclude<CameraQuality, "auto"> {
  const want = get().settings.cameraQuality ?? "auto";
  if (myTier() < NEED.hdCalls) return "720p30";
  return want === "auto" ? "1080p30" : want;
}
export const CAMERA_QUALITY_OPTIONS: { value: CameraQuality; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "720p30", label: "720p · 30fps" },
  { value: "1080p30", label: "1080p · 30fps ⚡" },
  { value: "1080p60", label: "1080p · 60fps ⚡" },
];
/** settings picker — 1080p options open the Lighting upsell on free accounts */
export function pickCameraQuality(v: string) {
  const q = (CAMERA_QUALITY_OPTIONS.find((o) => o.value === v)?.value ?? "auto") as CameraQuality;
  if (q.startsWith("1080") && !premiumGate(NEED.hdCalls, "1080p HD camera")) return;
  void updateSettings({ cameraQuality: q });
}
function camConstraints(extra: MediaTrackConstraints = {}): MediaTrackConstraints {
  const p = CAM_PRESETS[effectiveCameraQuality()];
  return { width: { ideal: p.w }, height: { ideal: p.h }, frameRate: { ideal: p.fps }, ...extra };
}

async function tuneVideoSender(sender: RTCRtpSender | undefined, kbps: number) {
  if (!sender?.track || sender.track.kind !== "video") return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) return; // not negotiated yet — retried when signaling settles
    if (params.encodings.every((e) => e.maxBitrate === kbps * 1000)) return;
    for (const e of params.encodings) e.maxBitrate = kbps * 1000;
    await sender.setParameters(params);
  } catch {
    /* retried when signaling settles */
  }
}
function tunePeerVideo(p: Peer) {
  void tuneVideoSender(p.senders.cam, get().avatarOn ? 2_500 : CAM_PRESETS[effectiveCameraQuality()].kbps);
  const sk = SCREEN_KBPS[get().settings.screenQuality] ?? 4_500;
  p.senders.screen.forEach((sn) => void tuneVideoSender(sn, sk));
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
  updateParticipant(msg.from, { muted: msg.muted, deafened: msg.deafened, video: msg.video, screen: msg.screen, avatar: !!msg.avatar, hand: !!msg.hand });
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

// ------------------------------------------------------------------ soundboard
// The clicker broadcasts which sound; every client plays it locally at full quality (like Discord),
// routed through that person's volume slider / local mute, so it also works for listen-only members.
type SoundMsg = Envelope & { builtin?: string; url?: string; name?: string; emoji?: string; volume?: number };
const soundCache = new Map<string, Promise<AudioBuffer | null>>();
const activeSounds: { src: AudioBufferSourceNode; from: string }[] = [];
let lastSoundSent = 0;
const lastSoundFrom = new Map<string, number>();

function soundBuffer(m: { builtin?: string; url?: string }): Promise<AudioBuffer | null> {
  const key = m.builtin ? `b:${m.builtin}` : m.url!;
  let hit = soundCache.get(key);
  if (!hit) {
    hit = (async () => {
      try {
        if (m.builtin) return await renderBuiltin(m.builtin);
        const res = await fetch(m.url!);
        if (!res.ok) return null;
        const a = ensureAudio();
        return await a.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    soundCache.set(key, hit);
    void hit.then((b) => !b && soundCache.delete(key));
  }
  return hit;
}

function playBuffer(buf: AudioBuffer, dest: AudioNode, vol: number, from: string) {
  const a = ensureAudio();
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = Math.max(0, Math.min(1, vol));
  src.connect(g).connect(dest);
  const stopAt = a.currentTime + Math.min(buf.duration, 30.5);
  src.start();
  src.stop(stopAt);
  const item = { src, from };
  activeSounds.push(item);
  // max 4 overlapping sounds per person
  const theirs = activeSounds.filter((x) => x.from === from);
  if (theirs.length > 4) {
    try {
      theirs[0].src.stop();
    } catch {
      /* done */
    }
  }
  src.onended = () => {
    const i = activeSounds.indexOf(item);
    if (i >= 0) activeSounds.splice(i, 1);
    g.disconnect();
  };
}

/** play a soundboard sound — everyone in the call hears it (or just a preview when you're not in a call) */
export async function playSound(s: Sound) {
  const now = Date.now();
  if (now - lastSoundSent < 450) return; // spam guard
  lastSoundSent = now;
  const inCall = get().status !== "idle" && !!channel;
  const msg = s.builtin ? { builtin: s.builtin } : s.url && isSoundUrl(s.url) ? { url: s.url } : null;
  if (!msg) return;
  if (inCall) send("sound", { ...msg, name: s.name.slice(0, 32), emoji: s.emoji.slice(0, 16), volume: s.volume });
  const buf = await soundBuffer(msg);
  if (!buf) return;
  playBuffer(buf, ensureAudio() && master!, s.volume * get().settings.soundboardVolume, me ?? "me");
  if (inCall && me) set({ soundToast: { from: me, name: s.name, emoji: s.emoji, at: now } });
}

/** stop every sound you started (for everyone) */
export function stopSounds() {
  const mine = me ?? "me";
  activeSounds.filter((x) => x.from === mine).forEach((x) => {
    try {
      x.src.stop();
    } catch {
      /* done */
    }
  });
  if (get().status !== "idle") send("soundstop", {});
}

function onSound(msg: SoundMsg) {
  if (!me || msg.from === me || isStale(msg)) return;
  const p = peers.get(msg.from);
  if (!p) return;
  const now = Date.now();
  if (now - (lastSoundFrom.get(msg.from) ?? 0) < 350) return;
  lastSoundFrom.set(msg.from, now);
  const valid = msg.builtin ? !!builtinMeta(msg.builtin) : isSoundUrl(msg.url);
  if (!valid) return;
  const vol = (typeof msg.volume === "number" ? msg.volume : 1) * get().settings.soundboardVolume;
  void soundBuffer(msg.builtin ? { builtin: msg.builtin } : { url: msg.url }).then((buf) => buf && peers.get(msg.from) === p && playBuffer(buf, p.gain, vol, msg.from));
  set({ soundToast: { from: msg.from, name: String(msg.name ?? "Sound").slice(0, 32), emoji: String(msg.emoji ?? "🔊").slice(0, 16), at: now } });
}

function onSoundStop(msg: Envelope) {
  if (!me || msg.from === me || isStale(msg)) return;
  activeSounds.filter((x) => x.from === msg.from).forEach((x) => {
    try {
      x.src.stop();
    } catch {
      /* done */
    }
  });
}

// ------------------------------------------------------------------ watch together
// Everyone in the call can start, pause, seek or stop. The newest change (highest rev) wins; on a tie the
// author id decides so every client lands on the same state. Positions travel as "where it was when sent"
// and each client advances them with its own clock, so device clocks never need to agree.
type WatchMsg = Envelope & { state: Omit<WatchState, "t"> | null; rev: number; by: string };
let watchRev = 0;
let watchBy = "";

/** YouTube links (watch, youtu.be, shorts, live, embed, music), Instagram reels/posts and direct video files (incl. NexusGram videos). */
export function parseWatchUrl(raw: string): Pick<WatchState, "kind" | "src" | "id" | "title"> | null {
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v");
    const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([\w-]{11})/);
    if (!id && m) id = m[2];
  }
  if (id !== null) return /^[\w-]{11}$/.test(id) ? { kind: "youtube", src: `https://www.youtube.com/watch?v=${id}`, id, title: "YouTube video" } : null;
  if (host === "instagram.com" || host === "instagr.am") {
    const ig = u.pathname.match(/^\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]{5,40})/);
    if (!ig) return null;
    const type = ig[1] === "p" ? "p" : ig[1] === "tv" ? "tv" : "reel";
    return { kind: "instagram", src: `https://www.instagram.com/${type}/${ig[2]}/`, id: `${type}/${ig[2]}`, title: type === "p" ? "Instagram post" : "Instagram reel" };
  }
  if (u.protocol === "https:" && /\.(mp4|webm|m4v|mov|ogv)$/i.test(u.pathname)) {
    const name = decodeURIComponent(u.pathname.split("/").pop() ?? "Video").replace(/\.[a-z0-9]+$/i, "");
    return { kind: "video", src: u.toString(), id: null, title: name.slice(0, 80) || "Video" };
  }
  return null;
}

/** where the shared video should be right now (seconds) */
export function watchPos(w: WatchState, now = performance.now()) {
  return w.playing ? w.pos + ((now - w.t) / 1000) * w.rate : w.pos;
}

function sendWatch(w: WatchState | null) {
  const state = w ? { kind: w.kind, src: w.src, id: w.id, title: w.title, playing: w.playing, pos: watchPos(w), rate: w.rate, by: w.by, rev: w.rev } : null;
  send("watch", { state, rev: watchRev, by: watchBy });
}

/** re-announce the current video / game so someone who just joined catches up */
function shareWatch() {
  const w = get().watch;
  if (w) sendWatch(w);
  const p = get().play;
  if (p) send("play", { state: p, rev: playRev, by: playBy });
}

function onWatch(m: WatchMsg) {
  if (!me || m.from === me || isStale(m) || typeof m.rev !== "number") return;
  const newer = m.rev > watchRev || (m.rev === watchRev && typeof m.by === "string" && m.by > watchBy);
  if (!newer) return;
  watchRev = m.rev;
  watchBy = m.by;
  const st = m.state;
  if (!st || (st.kind !== "youtube" && st.kind !== "video" && st.kind !== "instagram") || typeof st.src !== "string") {
    set({ watch: null });
    return;
  }
  const checked = parseWatchUrl(st.src);
  if (!checked || checked.kind !== st.kind) return; // only links we'd accept ourselves
  set({
    watch: {
      ...checked,
      title: typeof st.title === "string" ? st.title.slice(0, 120) : checked.title,
      playing: !!st.playing,
      pos: Math.max(0, Number(st.pos) || 0),
      t: performance.now(),
      rate: Math.min(2, Math.max(0.25, Number(st.rate) || 1)),
      by: typeof st.by === "string" ? st.by : m.from,
      rev: m.rev,
    },
  });
}

function commitWatch(w: WatchState | null) {
  watchRev += 1;
  watchBy = me ?? "";
  const next = w ? { ...w, rev: watchRev } : null;
  set({ watch: next });
  sendWatch(next);
}

export function startWatch(url: string, title?: string): string | null {
  if (get().status === "idle" || !me) return "Join the call first";
  const p = parseWatchUrl(url);
  if (!p) return "Paste a YouTube, Instagram or NexusGram link (or a direct .mp4 video link)";
  // embeds that can't be remote-controlled (Instagram) start paused so everyone can count down together
  commitWatch({ ...p, title: title?.slice(0, 120) || p.title, playing: p.kind !== "instagram", pos: 0, t: performance.now(), rate: 1, by: me, rev: 0 });
  return null;
}

/** a local play / pause / seek, shared with everyone */
export function watchControl(patch: { playing?: boolean; pos?: number; title?: string }) {
  const w = get().watch;
  if (!w) return;
  const now = performance.now();
  commitWatch({
    ...w,
    playing: patch.playing ?? w.playing,
    pos: Math.max(0, patch.pos ?? watchPos(w, now)),
    title: patch.title ?? w.title,
    t: now,
  });
}

export function stopWatch() {
  if (get().watch) commitWatch(null);
}

// ------------------------------------------------------------------ play together
type PlayMsg = Envelope & { state: PlayState | null; rev: number; by: string };
let playRev = 0;
let playBy = "";

function onPlay(m: PlayMsg) {
  if (!me || m.from === me || isStale(m) || typeof m.rev !== "number") return;
  const newer = m.rev > playRev || (m.rev === playRev && typeof m.by === "string" && m.by > playBy);
  if (!newer) return;
  playRev = m.rev;
  playBy = m.by;
  const st = m.state;
  if (!st) return set({ play: null });
  if (!PLAY_GAMES.includes(st.game) || typeof st.code !== "string" || !/^[A-Z2-9]{6}$/.test(st.code)) return;
  set({ play: { game: st.game, code: st.code, by: typeof st.by === "string" ? st.by : m.from, rev: m.rev } });
  if (st.by !== me) sfx.join();
}

/** start a game room for everyone in the call; returns the room code (the caller joins it too) */
export function startPlayTogether(game: RoomGame): string | null {
  if (get().status === "idle" || !me || !PLAY_GAMES.includes(game)) return null;
  const code = newRoomCode();
  playRev += 1;
  playBy = me;
  const state: PlayState = { game, code, by: me, rev: playRev };
  set({ play: state });
  send("play", { state, rev: playRev, by: playBy });
  return code;
}

export function stopPlayTogether() {
  if (!get().play || !me) return;
  playRev += 1;
  playBy = me;
  set({ play: null });
  send("play", { state: null, rev: playRev, by: playBy });
}

// ------------------------------------------------------------------ reactions & raise hand
export const REACTIONS = ["👍", "😂", "❤️", "🔥", "👏", "😮", "🎉", "💀", "🎵", "🙌", "🤯", "👀"];
let reactSeq = 0;
let lastReact = 0;
function pushReaction(from: string, emoji: string) {
  const id = ++reactSeq;
  set({ reactions: [...get().reactions.slice(-24), { id, from, emoji, x: 10 + Math.random() * 80 }] });
  setTimeout(() => set({ reactions: get().reactions.filter((r) => r.id !== id) }), 3200);
}
export function sendReaction(emoji: string) {
  if (!REACTIONS.includes(emoji) || get().status === "idle" || !me) return;
  const now = Date.now();
  if (now - lastReact < 250) return;
  lastReact = now;
  pushReaction(me, emoji);
  send("react", { emoji });
}
export function toggleHand() {
  if (get().status === "idle") return;
  set({ myHand: !get().myHand });
  broadcastState();
  if (get().myHand) sfx.unmute();
}

function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

// ------------------------------------------------------------------ public API

function migrateSettings(saved: Partial<VoiceSettings>): VoiceSettings {
  const s = { ...DEFAULT_SETTINGS, ...saved };
  if (!saved.noiseMode) s.noiseMode = saved.noiseSuppression === false ? "off" : "ai";
  const allowed: VoiceQuality[] = [64, 128, 320, 510];
  if (saved.qualityV !== 3 || !allowed.includes(s.voiceQuality as VoiceQuality)) {
    // bump older installs to studio max once
    if (!saved.voiceQuality || saved.qualityV === 2 || (saved.voiceQuality as number) === 320) s.voiceQuality = 510;
    else if (!allowed.includes(s.voiceQuality as VoiceQuality)) s.voiceQuality = 510;
    s.qualityV = 3;
  }
  if (saved.stereoStudio === undefined) s.stereoStudio = true;
  if (!saved.voiceFx) s.voiceFx = loadSavedFxId();
  return s;
}

export function initCallEngine(userId: string) {
  me = userId;
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  set({
    settings: migrateSettings(loadJSON<Partial<VoiceSettings>>("nexus.voice", DEFAULT_SETTINGS)),
    userVolumes: loadJSON<Record<string, number>>("nexus.volumes", {}),
    localMutes: loadJSON<Record<string, boolean>>("nexus.localMutes", {}),
    muted: loadJSON("nexus.selfmute", { muted: false }).muted,
    deafened: loadJSON("nexus.selfdeaf", { deafened: false }).deafened,
    voiceModel: loadSavedModel(),
  });

  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

  window.addEventListener("keydown", (e) => {
    const s = get().settings;
    if (s.mode === "ptt" && e.code === s.pttKey && !e.repeat && !isTyping(e.target) && get().status !== "idle") {
      set({ pttActive: true });
      return;
    }
    // Call shortcuts (Discord-style) — ignored while typing
    if (get().status === "idle" || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "m") (e.preventDefault(), toggleMute());
    else if (k === "d") (e.preventDefault(), toggleDeafen());
    else if (k === "v") (e.preventDefault(), void toggleVideo());
    else if (k === "h") (e.preventDefault(), toggleHand());
    else if (k === "g") (e.preventDefault(), setCallLayout(get().layout === "gallery" ? "speaker" : "gallery"));
    else if (k === "f") (e.preventDefault(), void cycleVoiceFx());
    else if (k === "w") (e.preventDefault(), toggleWhisper());
    else if (k === "r" && !e.shiftKey) (e.preventDefault(), sendReaction(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]!));
    else if (k === "r" && e.shiftKey) (e.preventDefault(), toggleCallRecording());
    else if (e.code === "Space" && s.mode !== "ptt") {
      /* don't steal space from scroll unless PTT — skip */
    }
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
  await Promise.all([buildMic(), loadTurn()]);
  if (get().conversationId !== conversationId) return; // left while waiting for permission
  joinBoostUntil = performance.now() + 2000;
  applyMuteState();
  startTick();

  const ch = supabase.channel(`call:${conversationId}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: me } },
  });
  ch.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as SignalPayload))
    .on("broadcast", { event: "state" }, ({ payload }) => onState(payload as StatePayload))
    .on("broadcast", { event: "hello" }, ({ payload }) => {
      const msg = payload as Envelope;
      if (!me || msg.from === me || isStale(msg)) return;
      const p = ensurePeer(msg.from, msg.session);
      attachMicToPeers();
      broadcastState();
      shareWatch();
      // peer just came online — re-offer in case our first offer was lost pre-subscribe
      void renegotiate(p);
    })
    .on("broadcast", { event: "sound" }, ({ payload }) => onSound(payload as SoundMsg))
    .on("broadcast", { event: "soundstop" }, ({ payload }) => onSoundStop(payload as Envelope))
    .on("broadcast", { event: "react" }, ({ payload }) => {
      const m = payload as Envelope & { emoji?: string };
      if (!me || m.from === me || isStale(m) || !peers.has(m.from) || !REACTIONS.includes(m.emoji ?? "")) return;
      pushReaction(m.from, m.emoji!);
    })
    .on("broadcast", { event: "watch" }, ({ payload }) => onWatch(payload as WatchMsg))
    .on("broadcast", { event: "play" }, ({ payload }) => onPlay(payload as PlayMsg))
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
      const p = ensurePeer(key, session);
      attachMicToPeers();
      broadcastState();
      shareWatch();
      void renegotiate(p);
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
        attachMicToPeers();
        broadcastState();
        // announce ourselves so the other side can recover any offer lost while we were connecting
        send("hello", {});
        for (const p of peers.values()) void renegotiate(p);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      set({ error: "Couldn't reach the call server. Check Realtime settings / your connection." });
    }
  });

  sfx.join();
  startQualityMonitor();
  if (opts.video) await toggleVideo();
}

export async function leaveCall() {
  const { conversationId, outgoingRing } = get();
  if (!conversationId) return;
  if (get().recording) stopCallRecording(false);
  send("bye", {});
  leaveTimers.forEach((t) => clearTimeout(t));
  leaveTimers.clear();
  if (qualityTimer) {
    clearInterval(qualityTimer);
    qualityTimer = null;
  }
  for (const id of [...peers.keys()]) removePeer(id, true);
  if (avatarEngine) {
    avatarEngine.stop();
    avatarEngine = null;
  }
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
  joinBoostUntil = 0;
  clearReady = false;
  clearVad = 1;
  if (outgoingRing && me) {
    void supabase.from("call_events").insert({ conversation_id: outgoingRing, caller_id: me, kind: "cancel" });
  }
  set({
    status: "idle",
    conversationId: null,
    participants: {},
    localCam: null,
    localScreen: null,
    avatarOn: false,
    soundToast: null,
    reactions: [],
    myHand: false,
    startedAt: null,
    focused: null,
    outgoingRing: null,
    speaking: false,
    pttActive: false,
    error: null,
    clearActive: null,
    recording: false,
    recordingStartedAt: null,
    callQuality: null,
    callPingMs: null,
    watch: null,
    play: null,
    layout: get().layout,
  });
  watchRev = 0;
  watchBy = "";
  playRev = 0;
  playBy = "";
  sfx.leave();
}

/** Unlock WebAudio under a user gesture (accept / join click) so remote audio + mic resume work. */
export function unlockCallAudio() {
  ensureAudio();
}

/** Start a call in a DM/group and ring the other members. */
export async function startCall(conversationId: string, opts: { video?: boolean } = {}) {
  unlockCallAudio();
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

function removeCamSenders() {
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
}

// ------------------------------------------------------------------ V-Avatar in calls
let avatarEngine: AvatarEngine | null = null;

function stopAvatar() {
  if (!avatarEngine) return;
  removeCamSenders();
  avatarEngine.stop();
  avatarEngine = null;
  set({ avatarOn: false, localCam: null, focused: get().focused === `${me}:cam` ? null : get().focused });
}

/** send your animated V-Avatar instead of the camera (face-tracked when a camera is available) */
export async function toggleAvatar(look: VAvatar) {
  if (get().status === "idle") return;
  if (get().avatarOn) {
    stopAvatar();
    broadcastState();
    return;
  }
  if (get().localCam) await toggleVideo(); // real camera off first
  const phone = isMobileDevice();
  const engine = startAvatar({
    cfg: look,
    width: phone ? 854 : 1280,
    height: phone ? 480 : 720,
    camera: true,
    cameraId: get().settings.cameraDeviceId,
    level: () => (localAnalyser && get().speaking ? rms(localAnalyser) : 0),
  });
  avatarEngine = engine;
  const stream = engine.stream();
  const track = stream.getVideoTracks()[0];
  if (!track) {
    engine.stop();
    avatarEngine = null;
    set({ error: "Your browser can't stream the V-Avatar." });
    return;
  }
  track.contentHint = "motion";
  for (const p of peers.values()) p.senders.cam = p.pc.addTrack(track, stream);
  set({ localCam: stream, avatarOn: true });
  broadcastState();
}

/** live-update the look while you're on a call */
export function setAvatarLook(look: VAvatar) {
  avatarEngine?.setLook(look);
}

export async function toggleVideo() {
  if (get().status === "idle") return;
  if (get().avatarOn) {
    // the camera button turns the avatar off too
    stopAvatar();
    broadcastState();
    return;
  }
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
    const video = camConstraints({ facingMode: { ideal: get().facingMode } });
    if (s.cameraDeviceId && s.cameraDeviceId !== "default") video.deviceId = { exact: s.cameraDeviceId };
    const cam = await navigator.mediaDevices.getUserMedia({ video });
    if (get().status === "idle") {
      stopStream(cam);
      return;
    }
    const track = cam.getVideoTracks()[0];
    track.contentHint = "motion";
    for (const p of peers.values()) {
      p.senders.cam = p.pc.addTrack(track, cam);
      tunePeerVideo(p);
    }
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
  "1440p30": { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } },
  "2160p30": { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
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
      tunePeerVideo(p);
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

export const MAX_USER_VOLUME = 4; // 400%
export function setUserVolume(id: string, v: number) {
  const userVolumes = { ...get().userVolumes, [id]: Math.max(0, Math.min(MAX_USER_VOLUME, Number.isFinite(v) ? v : 1)) };
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
  if (patch.voiceFx) saveFxId(patch.voiceFx);

  if (inputGain && ctx && (patch.inputVolume !== undefined || patch.whisper !== undefined)) {
    const base = settings.inputVolume * (settings.whisper ? 0.28 : 1);
    inputGain.gain.setTargetAtTime(base, ctx.currentTime, 0.02);
  }
  if (patch.outputVolume !== undefined || patch.outputDeviceId !== undefined) applyOutput();

  const inCall = get().status !== "idle";
  const micChanged =
    (patch.inputDeviceId !== undefined && patch.inputDeviceId !== prev.inputDeviceId) ||
    (patch.noiseSuppression !== undefined && patch.noiseSuppression !== prev.noiseSuppression) ||
    (patch.echoCancellation !== undefined && patch.echoCancellation !== prev.echoCancellation) ||
    (patch.autoGainControl !== undefined && patch.autoGainControl !== prev.autoGainControl) ||
    (patch.noiseMode !== undefined && patch.noiseMode !== prev.noiseMode) ||
    (patch.stereoStudio !== undefined && patch.stereoStudio !== prev.stereoStudio) ||
    (patch.voiceFx !== undefined && patch.voiceFx !== prev.voiceFx) ||
    (patch.voiceQuality !== undefined && patch.voiceQuality !== prev.voiceQuality && (patch.voiceQuality >= 320) !== (prev.voiceQuality >= 320));
  if (inCall && micChanged) await buildMic(); // outgoing track stays the same → no renegotiation
  else if (inCall && ctx && patch.voiceFx !== undefined && patch.voiceFx !== prev.voiceFx) {
    await buildVoiceChain(ctx);
    if (micSource && voiceIn) {
      try {
        micSource.disconnect();
      } catch {
        /* ignore */
      }
      micSource.connect(voiceIn);
    }
  }
  if (inCall && patch.voiceQuality && patch.voiceQuality !== prev.voiceQuality) {
    for (const p of peers.values()) p.pc.getSenders().forEach((sn) => sn.track?.kind === "audio" && void tuneAudioSender(sn));
  }

  const cam = get().localCam;
  const camSwitched = !!patch.cameraDeviceId && patch.cameraDeviceId !== prev.cameraDeviceId;
  const camQualityChanged = !!patch.cameraQuality && patch.cameraQuality !== prev.cameraQuality;
  if (inCall && cam && !get().avatarOn && (camSwitched || camQualityChanged)) {
    // quality only → re-tune the live track in place (no second capture; iOS dislikes two)
    const live = cam.getVideoTracks()[0];
    if (!camSwitched && live) {
      try {
        await live.applyConstraints(camConstraints());
        for (const p of peers.values()) tunePeerVideo(p);
        return;
      } catch {
        /* fall back to a fresh capture */
      }
    }
    try {
      const video = camConstraints(settings.cameraDeviceId && settings.cameraDeviceId !== "default" ? {} : { facingMode: { ideal: get().facingMode } });
      if (settings.cameraDeviceId && settings.cameraDeviceId !== "default") video.deviceId = { exact: settings.cameraDeviceId };
      const fresh = await navigator.mediaDevices.getUserMedia({ video });
      const nt = fresh.getVideoTracks()[0];
      nt.contentHint = "motion";
      for (const p of peers.values()) {
        await p.senders.cam?.replaceTrack(nt);
        tunePeerVideo(p);
      }
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

export function setCallLayout(layout: CallLayout) {
  set({ layout });
  if (layout === "gallery") set({ focused: null });
  else if (!get().focused) {
    const parts = Object.values(get().participants);
    const loud = parts.find((p) => p.speaking) ?? parts[0];
    if (loud) set({ focused: `${loud.id}:cam` });
    else if (get().localCam && me) set({ focused: `${me}:cam` });
  }
}

export function clearCallError() {
  set({ error: null });
}

/** Cycle Nexus Clear → browser NS → off */
export async function cycleNoiseMode() {
  const order: NoiseMode[] = ["ai", "standard", "off"];
  const cur = get().settings.noiseMode;
  const next = order[(order.indexOf(cur) + 1) % order.length]!;
  await updateSettings({ noiseMode: next, noiseSuppression: next === "standard" });
  return next;
}

export function toggleMirrorSelf() {
  const mirrorSelf = !get().settings.mirrorSelf;
  void updateSettings({ mirrorSelf });
  return mirrorSelf;
}

/** Flip between front and back camera (phones) or reacquire with opposite facingMode. */
export async function flipCamera() {
  if (get().status === "idle" || get().avatarOn) return;
  const next: "user" | "environment" = get().facingMode === "user" ? "environment" : "user";
  set({ facingMode: next });
  const cam = get().localCam;
  if (!cam) {
    await toggleVideo();
    return;
  }
  try {
    const fresh = await navigator.mediaDevices.getUserMedia({
      video: camConstraints({ facingMode: { ideal: next } }),
    });
    const nt = fresh.getVideoTracks()[0];
    if (!nt) throw new Error("no track");
    nt.contentHint = "motion";
    for (const p of peers.values()) await p.senders.cam?.replaceTrack(nt);
    cam.getVideoTracks().forEach((t) => {
      cam.removeTrack(t);
      t.stop();
    });
    cam.addTrack(nt);
    set({ localCam: cam, settings: { ...get().settings, cameraDeviceId: "default" } });
  } catch {
    set({ error: "Couldn't flip the camera on this device." });
  }
}

export function canRecordCall() {
  return typeof MediaRecorder !== "undefined";
}

/** Record mixed call audio locally (your mic + everyone you hear). Downloads a .webm when stopped. */
export function startCallRecording() {
  if (get().status === "idle") return false;
  if (recorder) return true;
  if (!canRecordCall()) {
    set({ error: "Recording isn't supported in this browser." });
    return false;
  }
  const a = ensureAudio();
  recordDest = a.createMediaStreamDestination();
  // everyone you hear
  if (master) master.connect(recordDest);
  // your own processed mic (not normally played back through master)
  recordLocalTap = a.createGain();
  recordLocalTap.gain.value = 1;
  if (inputGain) inputGain.connect(recordLocalTap);
  recordLocalTap.connect(recordDest);

  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
  try {
    recorder = mime ? new MediaRecorder(recordDest.stream, { mimeType: mime }) : new MediaRecorder(recordDest.stream);
  } catch {
    set({ error: "Couldn't start call recording." });
    teardownRecordGraph();
    return false;
  }
  recordChunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) recordChunks.push(e.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(recordChunks, { type: recorder?.mimeType || "audio/webm" });
    recordChunks = [];
    const rec = recorder;
    recorder = null;
    teardownRecordGraph();
    if (blob.size < 256) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const aEl = document.createElement("a");
    aEl.href = URL.createObjectURL(blob);
    aEl.download = `nexus-call-${stamp}.webm`;
    aEl.click();
    setTimeout(() => URL.revokeObjectURL(aEl.href), 60_000);
    void rec;
  };
  recorder.start(1000);
  set({ recording: true, recordingStartedAt: Date.now() });
  return true;
}

export function stopCallRecording(download = true) {
  if (!recorder) {
    set({ recording: false, recordingStartedAt: null });
    return;
  }
  try {
    if (!download) {
      recorder.ondataavailable = null;
      recorder.onstop = () => {
        recorder = null;
        recordChunks = [];
        teardownRecordGraph();
      };
    }
    if (recorder.state !== "inactive") recorder.stop();
    else {
      recorder = null;
      teardownRecordGraph();
    }
  } catch {
    recorder = null;
    teardownRecordGraph();
  }
  set({ recording: false, recordingStartedAt: null });
}

export function toggleCallRecording() {
  if (get().recording) stopCallRecording(true);
  else startCallRecording();
}

function teardownRecordGraph() {
  try {
    recordLocalTap?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    if (master && recordDest) master.disconnect(recordDest);
  } catch {
    /* ignore */
  }
  recordLocalTap = null;
  recordDest = null;
}

/** Re-ring members who aren't in the call yet. */
export async function ringAgain() {
  const cid = get().conversationId;
  if (!cid || !me) return;
  set({ outgoingRing: cid });
  const { error } = await supabase.from("call_events").insert({ conversation_id: cid, caller_id: me, kind: "ring" });
  if (error) set({ error: "Couldn't send the ring." });
  else startRing(true);
}

async function sampleCallQuality() {
  if (get().status === "idle" || !peers.size) {
    if (get().callQuality !== null || get().callPingMs !== null) set({ callQuality: null, callPingMs: null });
    return;
  }
  let loss = 0;
  let rtt = 0;
  let samples = 0;
  let rttSamples = 0;
  for (const p of peers.values()) {
    try {
      const stats = await p.pc.getStats();
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "audio") {
          const packets = (r.packetsReceived as number) || 0;
          const lost = (r.packetsLost as number) || 0;
          if (packets + lost > 0) {
            loss += lost / (packets + lost);
            samples++;
          }
        }
        if (r.type === "candidate-pair" && (r as { state?: string }).state === "succeeded") {
          const ms = (r.currentRoundTripTime as number) || 0;
          if (ms > 0) {
            rtt = Math.max(rtt, ms * 1000);
            rttSamples++;
          }
        }
      });
    } catch {
      /* ignore */
    }
  }
  if (!samples && !rttSamples) return;
  const avgLoss = samples ? loss / samples : 0;
  const ping = rttSamples ? Math.round(rtt) : null;
  const q: CallQuality = avgLoss > 0.08 || (ping ?? 0) > 400 ? "poor" : avgLoss > 0.03 || (ping ?? 0) > 200 ? "ok" : "good";
  const cur = get();
  if (q !== cur.callQuality || ping !== cur.callPingMs) set({ callQuality: q, callPingMs: ping });
  // speaker layout: auto-focus whoever is speaking
  if (get().layout === "speaker" && !get().focused?.endsWith(":screen")) {
    const loud = Object.values(get().participants).find((p) => p.speaking);
    if (loud) {
      const key = `${loud.id}:cam`;
      if (get().focused !== key) set({ focused: key });
    }
  }
}

export function startQualityMonitor() {
  if (qualityTimer) return;
  qualityTimer = setInterval(() => void sampleCallQuality(), 2500);
  void sampleCallQuality();
}

/** iOS Safari / in-app WebViews don't support screen capture */
export function canScreenShare() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
}

export function myCallId() {
  return me;
}

export function noiseModeLabel(m: NoiseMode) {
  return m === "ai" ? "Nexus Clear" : m === "standard" ? "Browser NS" : "Noise off";
}

export function voiceQualityLabel(q: VoiceQuality) {
  return q === 510 ? "Ultra studio 510" : q === 320 ? "Studio 320" : q === 128 ? "High 128" : "Standard 64";
}

/** Cycle built-in voice FX (+ custom AI pack when loaded). */
export async function cycleVoiceFx() {
  const model = get().voiceModel;
  const order: VoiceFxId[] = model
    ? ["off", "chipmunk", "helium", "deep", "bass", "robot", "radio", "custom"]
    : ["off", "chipmunk", "helium", "deep", "bass", "robot", "radio"];
  const cur = get().settings.voiceFx || "off";
  const next = order[(Math.max(0, order.indexOf(cur)) + 1) % order.length]!;
  await updateSettings({ voiceFx: next });
  return next;
}

export function toggleWhisper() {
  const whisper = !get().settings.whisper;
  void updateSettings({ whisper });
  return whisper;
}

/** Attach / replace an AI voice-model zip (nexus-voice.json inside). */
export async function attachVoiceModelZip(file: File) {
  const { parseVoiceModelZip } = await import("./voiceChanger");
  const pack = await parseVoiceModelZip(file, file.name);
  set({ voiceModel: pack });
  await updateSettings({ voiceFx: "custom" });
  return pack;
}

export async function clearVoiceModel() {
  const { saveModel } = await import("./voiceChanger");
  saveModel(null);
  set({ voiceModel: null });
  await updateSettings({ voiceFx: "off" });
}

export function currentVoiceFxLabel() {
  return voiceFxLabel(get().settings.voiceFx || "off", get().voiceModel);
}
