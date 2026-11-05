"use client";

/**
 * Nexus Live — Twitch-style star-topology WebRTC broadcast.
 * Host publishes camera and/or screen; viewers receive only.
 * Signaling over Supabase Realtime channel `live:<streamId>`.
 */

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import { isMobileDevice, startAvatar, type AvatarEngine, type VAvatar } from "./vavatar";

export type LiveQuality = "720p30" | "1080p30" | "1080p60" | "1440p30" | "2160p30" | "source";
export type LiveSource = "camera" | "screen" | "both";

export type LiveStream = {
  id: string;
  host_id: string;
  title: string;
  category: string;
  quality: LiveQuality;
  source: LiveSource;
  status: "live" | "ended";
  viewer_peak: number;
  started_at: string;
  ended_at: string | null;
};

export type LiveChatMsg = { id: number; stream_id: string; author_id: string; body: string; created_at: string };

export const LIVE_QUALITIES: { id: LiveQuality; label: string; hint: string }[] = [
  { id: "720p30", label: "HD 720p", hint: "1280×720 · 30fps" },
  { id: "1080p30", label: "Full HD", hint: "1920×1080 · 30fps" },
  { id: "1080p60", label: "Full HD 60", hint: "1920×1080 · 60fps" },
  { id: "1440p30", label: "QHD", hint: "2560×1440 · 30fps" },
  { id: "2160p30", label: "4K UHD", hint: "3840×2160 · 30fps" },
  { id: "source", label: "Source", hint: "Native resolution" },
];

const VIDEO_PRESETS: Record<LiveQuality, MediaTrackConstraints> = {
  "720p30": { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  "1080p30": { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
  "1080p60": { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
  "1440p30": { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } },
  "2160p30": { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
  source: { frameRate: { ideal: 30 } },
};

const BITRATE: Record<LiveQuality, number> = {
  "720p30": 2_500_000,
  "1080p30": 4_500_000,
  "1080p60": 6_500_000,
  "1440p30": 8_000_000,
  "2160p30": 15_000_000,
  source: 12_000_000,
};

type Peer = { pc: RTCPeerConnection; polite: boolean; makingOffer: boolean };

type State = {
  stream: LiveStream | null;
  role: "host" | "viewer" | null;
  localCam: MediaStream | null;
  localScreen: MediaStream | null;
  remote: MediaStream | null;
  chat: LiveChatMsg[];
  viewers: number;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  /** host is sending V-Avatar instead of the real camera */
  avatarOn: boolean;
  liveList: LiveStream[];
};

export const useLive = create<State>(() => ({
  stream: null,
  role: null,
  localCam: null,
  localScreen: null,
  remote: null,
  chat: [],
  viewers: 0,
  micOn: true,
  camOn: true,
  screenOn: false,
  avatarOn: false,
  liveList: [],
}));

let channel: RealtimeChannel | null = null;
let meId: string | null = null;
const peers = new Map<string, Peer>();
let outbound: MediaStream | null = null;
let quality: LiveQuality = "1080p30";
let liveAvatar: AvatarEngine | null = null;
/** real camera stream kept while V-Avatar is on (restored on toggle off) */
let camBackup: MediaStream | null = null;
let liveAnalyser: AnalyserNode | null = null;
let liveAudioCtx: AudioContext | null = null;

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
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

function send(event: string, payload: Record<string, unknown>) {
  if (!channel || !meId) return;
  void channel.send({ type: "broadcast", event, payload: { ...payload, from: meId } });
}

async function tuneSender(pc: RTCPeerConnection) {
  for (const s of pc.getSenders()) {
    if (s.track?.kind !== "video") continue;
    const p = s.getParameters();
    if (!p.encodings?.length) p.encodings = [{}];
    p.encodings[0]!.maxBitrate = BITRATE[quality];
    p.encodings[0]!.maxFramerate = quality.includes("60") ? 60 : 30;
    try {
      await s.setParameters(p);
    } catch {
      /* ignore */
    }
  }
}

function ensureOutbound() {
  if (!outbound) outbound = new MediaStream();
  return outbound;
}

function addTracksToPeer(pc: RTCPeerConnection) {
  const stream = ensureOutbound();
  const existing = new Set(pc.getSenders().map((s) => s.track?.id));
  for (const t of stream.getTracks()) {
    if (!existing.has(t.id)) pc.addTrack(t, stream);
  }
  void tuneSender(pc);
}

async function createPeer(peerId: string, asHost: boolean) {
  if (peers.has(peerId)) return peers.get(peerId)!;
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const peer: Peer = { pc, polite: !asHost, makingOffer: false };
  peers.set(peerId, peer);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) send("signal", { to: peerId, candidate });
  };

  pc.ontrack = ({ streams }) => {
    const remote = streams[0] ?? new MediaStream([...(useLive.getState().remote?.getTracks() ?? []), ...pc.getReceivers().map((r) => r.track).filter(Boolean) as MediaStreamTrack[]]);
    useLive.setState({ remote });
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      peers.delete(peerId);
      updateViewerCount();
    }
  };

  if (asHost) addTracksToPeer(pc);

  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      send("signal", { to: peerId, description: pc.localDescription });
    } catch {
      /* ignore */
    } finally {
      peer.makingOffer = false;
    }
  };

  return peer;
}

async function onSignal(payload: { from: string; to?: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
  if (!meId || payload.from === meId) return;
  if (payload.to && payload.to !== meId) return;
  const asHost = useLive.getState().role === "host";
  const peer = await createPeer(payload.from, asHost);
  const { pc, polite, makingOffer } = peer;

  try {
    if (payload.description) {
      const offerCollision = payload.description.type === "offer" && (makingOffer || pc.signalingState !== "stable");
      if (offerCollision && !polite) return;
      await pc.setRemoteDescription(payload.description);
      if (payload.description.type === "offer") {
        if (asHost) addTracksToPeer(pc);
        await pc.setLocalDescription();
        send("signal", { to: payload.from, description: pc.localDescription });
      }
    } else if (payload.candidate) {
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    console.warn("live signal", e);
  }
}

function updateViewerCount() {
  const n = peers.size;
  useLive.setState({ viewers: n });
  const stream = useLive.getState().stream;
  if (stream && useLive.getState().role === "host" && n > stream.viewer_peak) {
    void supabase.from("live_streams").update({ viewer_peak: n }).eq("id", stream.id);
    useLive.setState({ stream: { ...stream, viewer_peak: n } });
  }
}

async function attachChannel(streamId: string) {
  if (channel) {
    await supabase.removeChannel(channel);
    channel = null;
  }
  channel = supabase.channel(`live:${streamId}`, { config: { broadcast: { self: false }, presence: { key: meId! } } });
  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => void onSignal(payload as never))
    .on("broadcast", { event: "join" }, ({ payload }) => {
      const from = (payload as { from: string }).from;
      if (useLive.getState().role !== "host" || from === meId) return;
      void createPeer(from, true).then(() => updateViewerCount());
    })
    .on("broadcast", { event: "bye" }, ({ payload }) => {
      const from = (payload as { from: string }).from;
      const p = peers.get(from);
      if (p) {
        p.pc.close();
        peers.delete(from);
        updateViewerCount();
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat", filter: `stream_id=eq.${streamId}` }, ({ new: row }) => {
      const msg = row as LiveChatMsg;
      useLive.setState((s) => ({ chat: [...s.chat, msg].slice(-200) }));
      void loadProfiles([msg.author_id]);
    })
    .on("presence", { event: "sync" }, () => {
      if (useLive.getState().role === "viewer") {
        const state = channel?.presenceState() ?? {};
        useLive.setState({ viewers: Math.max(0, Object.keys(state).length - 1) });
      } else updateViewerCount();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel?.track({ id: meId, role: useLive.getState().role, at: Date.now() });
        if (useLive.getState().role === "viewer") send("join", {});
      }
    });
}

function stopTracks(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

function isScreenTrack(t: MediaStreamTrack) {
  const s = t.getSettings() as MediaTrackSettings & { displaySurface?: string };
  return !!s.displaySurface || /screen|window|display|tab|monitor/i.test(t.label);
}

function camVideoTracks(stream: MediaStream | null) {
  return (stream?.getVideoTracks() ?? []).filter((t) => !isScreenTrack(t));
}

function wireLiveAnalyser(stream: MediaStream | null) {
  liveAnalyser = null;
  try {
    liveAudioCtx?.close();
  } catch {
    /* */
  }
  liveAudioCtx = null;
  const track = stream?.getAudioTracks()[0];
  if (!track) return;
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const a = ctx.createAnalyser();
    a.fftSize = 256;
    src.connect(a);
    liveAudioCtx = ctx;
    liveAnalyser = a;
  } catch {
    /* */
  }
}

function liveMicLevel() {
  if (!liveAnalyser || !useLive.getState().micOn) return 0;
  const buf = new Uint8Array(liveAnalyser.frequencyBinCount);
  liveAnalyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

function replaceCamVideoOnPeers(next: MediaStreamTrack | null, prevId?: string) {
  for (const p of peers.values()) {
    const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === "video" && !isScreenTrack(s.track) && (!prevId || s.track.id === prevId));
    if (sender) {
      void sender.replaceTrack(next);
    } else if (next) {
      p.pc.addTrack(next, ensureOutbound());
      void tuneSender(p.pc);
    }
  }
}

function stopLiveAvatar(restoreCam = true) {
  if (!liveAvatar && !useLive.getState().avatarOn) return;
  const out = ensureOutbound();
  const avatarTracks = liveAvatar?.stream().getVideoTracks() ?? [];
  const avatarIds = new Set(avatarTracks.map((t) => t.id));
  out.getVideoTracks().forEach((t) => {
    if (avatarIds.has(t.id)) out.removeTrack(t);
  });
  liveAvatar?.stop();
  liveAvatar = null;

  if (restoreCam && camBackup) {
    const vt = camBackup.getVideoTracks()[0];
    if (vt) {
      vt.enabled = true;
      if (!out.getTracks().some((t) => t.id === vt.id)) out.addTrack(vt);
      replaceCamVideoOnPeers(vt);
      useLive.setState({ localCam: camBackup, avatarOn: false, camOn: true });
    } else {
      useLive.setState({ avatarOn: false, camOn: false, localCam: camBackup });
    }
  } else {
    replaceCamVideoOnPeers(null);
    useLive.setState({ avatarOn: false, localCam: restoreCam ? camBackup : null, camOn: false });
  }
  if (!restoreCam) {
    stopTracks(camBackup);
    camBackup = null;
  }
}

/** Host: send animated V-Avatar instead of the camera (face-tracked when possible). */
export async function toggleLiveAvatar(look: VAvatar) {
  if (useLive.getState().role !== "host") return;
  if (useLive.getState().avatarOn) {
    stopLiveAvatar(true);
    toast("Camera restored", "info");
    return;
  }

  const out = ensureOutbound();
  // Keep real cam around so we can restore; prefer current localCam
  const current = useLive.getState().localCam;
  if (current && !camBackup) camBackup = current;
  wireLiveAnalyser(out);

  const phone = isMobileDevice();
  const engine = startAvatar({
    cfg: look,
    width: phone ? 854 : 1280,
    height: phone ? 480 : 720,
    camera: true,
    level: liveMicLevel,
  });
  const avatarStream = engine.stream();
  const avatarTrack = avatarStream.getVideoTracks()[0];
  if (!avatarTrack) {
    engine.stop();
    toast("Your browser can't stream the V-Avatar", "error");
    return;
  }
  avatarTrack.contentHint = "motion";
  liveAvatar = engine;

  const prev = camVideoTracks(out)[0] ?? camVideoTracks(current)[0];
  const prevId = prev?.id;
  if (prev) {
    out.removeTrack(prev);
    prev.enabled = false;
  }
  out.addTrack(avatarTrack);
  replaceCamVideoOnPeers(avatarTrack, prevId);

  const preview = new MediaStream([avatarTrack, ...(out.getAudioTracks().length ? out.getAudioTracks() : current?.getAudioTracks() ?? [])]);
  useLive.setState({ localCam: preview, avatarOn: true, camOn: true });
  toast("V-Avatar is live", "success");
}

export function setLiveAvatarLook(look: VAvatar) {
  liveAvatar?.setLook(look);
}

export async function listLiveStreams() {
  const { data, error } = await supabase.from("live_streams").select("*").eq("status", "live").order("started_at", { ascending: false }).limit(50);
  if (error) throw new Error(errorText(error));
  const rows = (data ?? []) as LiveStream[];
  void loadProfiles(rows.map((r) => r.host_id));
  useLive.setState({ liveList: rows });
  return rows;
}

export async function goLive(opts: { title: string; category: string; quality: LiveQuality; source: LiveSource }) {
  const me = useApp.getState().userId!;
  meId = me;
  quality = opts.quality;

  const camOn = opts.source === "camera" || opts.source === "both";
  const screenOn = opts.source === "screen" || opts.source === "both";

  let cam: MediaStream | null = null;
  let screen: MediaStream | null = null;
  const out = ensureOutbound();
  out.getTracks().forEach((t) => out.removeTrack(t));

  try {
    if (camOn) {
      cam = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_PRESETS[opts.quality],
        audio: true,
      });
      cam.getTracks().forEach((t) => {
        if (t.kind === "video") t.contentHint = "motion";
        out.addTrack(t);
      });
    }
    if (screenOn) {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen share isn't supported in this browser");
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: VIDEO_PRESETS[opts.quality],
        audio: true,
      });
      const vt = screen.getVideoTracks()[0];
      if (vt) {
        vt.contentHint = opts.quality.includes("60") ? "motion" : "detail";
        vt.addEventListener("ended", () => void stopScreenShare());
        out.addTrack(vt);
      }
      screen.getAudioTracks().forEach((t) => out.addTrack(t));
    }
    if (!camOn) {
      // mic-only if screen without cam
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        mic.getAudioTracks().forEach((t) => out.addTrack(t));
      } catch {
        /* optional */
      }
    }
  } catch (e) {
    stopTracks(cam);
    stopTracks(screen);
    outbound = null;
    throw e instanceof Error ? e : new Error("Couldn't start capture");
  }

  const { data, error } = await supabase
    .from("live_streams")
    .insert({
      host_id: me,
      title: opts.title.trim().slice(0, 120) || "Live",
      category: opts.category.slice(0, 60),
      quality: opts.quality,
      source: opts.source,
      status: "live",
    })
    .select()
    .single();
  if (error) {
    stopTracks(cam);
    stopTracks(screen);
    outbound = null;
    throw new Error(errorText(error));
  }

  const stream = data as LiveStream;
  camBackup = null;
  liveAvatar = null;
  wireLiveAnalyser(out);
  useLive.setState({
    stream,
    role: "host",
    localCam: cam,
    localScreen: screen,
    remote: null,
    chat: [],
    viewers: 0,
    micOn: true,
    camOn: !!cam,
    screenOn: !!screen,
    avatarOn: false,
  });
  await attachChannel(stream.id);
  useApp.setState({ hub: "live" });
  return stream;
}

export async function watchLive(streamId: string) {
  const me = useApp.getState().userId!;
  meId = me;
  const { data, error } = await supabase.from("live_streams").select("*").eq("id", streamId).maybeSingle();
  if (error || !data) throw new Error("Stream not found");
  const stream = data as LiveStream;
  if (stream.status !== "live") throw new Error("This stream has ended");
  if (stream.host_id === me) {
    // rejoin as host without new capture — just open UI if already hosting
    useLive.setState({ stream, role: "host" });
    useApp.setState({ hub: "live" });
    return stream;
  }

  const { data: chat } = await supabase.from("live_chat").select("*").eq("stream_id", streamId).order("id", { ascending: false }).limit(80);
  const msgs = ((chat ?? []) as LiveChatMsg[]).reverse();
  void loadProfiles([stream.host_id, ...msgs.map((m) => m.author_id)]);

  useLive.setState({
    stream,
    role: "viewer",
    localCam: null,
    localScreen: null,
    remote: null,
    chat: msgs,
    viewers: 0,
    micOn: false,
    camOn: false,
    screenOn: false,
    avatarOn: false,
  });
  await attachChannel(streamId);
  useApp.setState({ hub: "live" });
  return stream;
}

export async function endLive() {
  const { stream, role } = useLive.getState();
  if (role === "host" && stream) {
    await supabase.from("live_streams").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", stream.id);
  }
  leaveLive();
}

export function leaveLive() {
  send("bye", {});
  for (const p of peers.values()) p.pc.close();
  peers.clear();
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  stopLiveAvatar(false);
  stopTracks(camBackup);
  camBackup = null;
  stopTracks(useLive.getState().localCam);
  stopTracks(useLive.getState().localScreen);
  outbound?.getTracks().forEach((t) => t.stop());
  outbound = null;
  try {
    liveAudioCtx?.close();
  } catch {
    /* */
  }
  liveAudioCtx = null;
  liveAnalyser = null;
  useLive.setState({
    stream: null,
    role: null,
    localCam: null,
    localScreen: null,
    remote: null,
    chat: [],
    viewers: 0,
    micOn: true,
    camOn: true,
    screenOn: false,
    avatarOn: false,
  });
}

export async function toggleLiveScreen() {
  if (useLive.getState().role !== "host") return;
  if (useLive.getState().localScreen) {
    stopScreenShare();
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) return toast("Screen share not supported here", "error");
  try {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: VIDEO_PRESETS[quality], audio: true });
    const vt = screen.getVideoTracks()[0];
    vt.contentHint = "detail";
    vt.addEventListener("ended", () => stopScreenShare());
    const out = ensureOutbound();
    // replace previous screen track if any
    out.getVideoTracks().filter((t) => t.label.toLowerCase().includes("screen") || t.getSettings().displaySurface).forEach((t) => {
      out.removeTrack(t);
      t.stop();
    });
    out.addTrack(vt);
    screen.getAudioTracks().forEach((t) => out.addTrack(t));
    for (const p of peers.values()) {
      p.pc.addTrack(vt, out);
      void tuneSender(p.pc);
    }
    useLive.setState({ localScreen: screen, screenOn: true });
  } catch {
    /* cancelled */
  }
}

function stopScreenShare() {
  const screen = useLive.getState().localScreen;
  if (!screen) return;
  const ids = new Set(screen.getTracks().map((t) => t.id));
  for (const p of peers.values()) {
    p.pc.getSenders().forEach((s) => {
      if (s.track && ids.has(s.track.id)) {
        try {
          p.pc.removeTrack(s);
        } catch {
          /* */
        }
      }
    });
  }
  outbound?.getTracks().forEach((t) => {
    if (ids.has(t.id)) outbound!.removeTrack(t);
  });
  stopTracks(screen);
  useLive.setState({ localScreen: null, screenOn: false });
}

export function toggleLiveMic() {
  const on = !useLive.getState().micOn;
  outbound?.getAudioTracks().forEach((t) => {
    t.enabled = on;
  });
  useLive.setState({ micOn: on });
}

export function toggleLiveCam() {
  if (useLive.getState().avatarOn) {
    stopLiveAvatar(true);
    return;
  }
  const on = !useLive.getState().camOn;
  useLive.getState().localCam?.getVideoTracks().forEach((t) => {
    t.enabled = on;
  });
  useLive.setState({ camOn: on });
}

export async function sendLiveChat(body: string) {
  const stream = useLive.getState().stream;
  const me = useApp.getState().userId;
  if (!stream || !me) return;
  const text = body.trim().slice(0, 500);
  if (!text) return;
  const { error } = await supabase.from("live_chat").insert({ stream_id: stream.id, author_id: me, body: text });
  if (error) toast(errorText(error), "error");
}

export function openLiveHub() {
  useApp.setState({ hub: "live", mobileTab: "videos" });
  void listLiveStreams();
}

export function canLiveScreenShare() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
}
