"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { thisDeviceId, type Handset } from "./handset";
import { useAcetatePlayer } from "./acetatePlayer";
import { addCloudFiles, addVoiceMemo, cloudUnlocked } from "./nexusCloud";
import { sendDrop } from "./nexusDrop";
import { openConversation } from "./data";

export type PhoneCommandKind =
  | "open_url"
  | "note"
  | "clipboard"
  | "ring"
  | "vibrate"
  | "torch"
  | "find_stop"
  | "play"
  | "pause"
  | "next"
  | "prev"
  | "volume"
  | "camera"
  | "voice"
  | "sign_out";

export type PhoneCommand = {
  id: string;
  user_id: string;
  device_id: string;
  kind: PhoneCommandKind;
  payload: { url?: string; text?: string; delta?: number };
  status: "pending" | "done" | "denied" | "expired";
  created_at: string;
};

export type HandsetInbox = {
  id: string;
  user_id: string;
  from_device: string | null;
  kind: "note" | "link" | "clipboard";
  body: string;
  created_at: string;
  seen_at: string | null;
};

export type DeviceNotice = {
  id: number;
  user_id: string;
  device_id: string | null;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  seen_at: string | null;
};

const SENSITIVE = new Set<PhoneCommandKind>(["camera", "voice", "sign_out"]);

export async function sendCommand(deviceId: string, kind: PhoneCommandKind, payload: PhoneCommand["payload"] = {}) {
  const userId = useApp.getState().userId;
  if (!userId) throw new Error("Sign in required");
  const { error } = await supabase.from("nexus_handset_commands").insert({ user_id: userId, device_id: deviceId, kind, payload });
  if (error) throw new Error(errorText(error));
}

export async function resolveCommand(id: string, status: "done" | "denied") {
  await supabase.from("nexus_handset_commands").update({ status }).eq("id", id);
}

export async function setControlEnabled(on: boolean) {
  const userId = useApp.getState().userId;
  if (!userId) throw new Error("Sign in required");
  const { error } = await supabase.from("nexus_handsets").update({ control_enabled: on }).eq("user_id", userId).eq("device_id", thisDeviceId());
  if (error) throw new Error(errorText(error));
}

export async function sendToComputers(kind: "note" | "link" | "clipboard", body: string) {
  const userId = useApp.getState().userId;
  if (!userId) throw new Error("Sign in required");
  const text = body.trim().slice(0, 4000);
  if (!text) throw new Error("Nothing to send");
  const { error } = await supabase.from("nexus_handset_inbox").insert({ user_id: userId, from_device: thisDeviceId(), kind, body: text });
  if (error) throw new Error(errorText(error));
}

export async function recordDeviceNotice(input: { title: string; body?: string | null; href?: string | null }) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  await supabase.from("nexus_device_notices").insert({
    user_id: userId,
    device_id: thisDeviceId(),
    title: input.title.slice(0, 120),
    body: input.body?.slice(0, 240) ?? null,
    href: input.href?.slice(0, 300) ?? null,
  });
}

export async function listInbox() {
  const userId = useApp.getState().userId;
  if (!userId) return [] as HandsetInbox[];
  const { data } = await supabase.from("nexus_handset_inbox").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  return (data ?? []) as HandsetInbox[];
}

export async function listNotices() {
  const userId = useApp.getState().userId;
  if (!userId) return [] as DeviceNotice[];
  const { data } = await supabase.from("nexus_device_notices").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  return (data ?? []) as DeviceNotice[];
}

export async function markNoticeSeen(id: number) {
  await supabase.from("nexus_device_notices").update({ seen_at: new Date().toISOString() }).eq("id", id);
}

let torchStream: MediaStream | null = null;
let ringTimer = 0;
let ringCtx: AudioContext | null = null;

export function stopFindEffects() {
  window.clearInterval(ringTimer);
  ringTimer = 0;
  ringCtx?.close().catch(() => undefined);
  ringCtx = null;
  torchStream?.getTracks().forEach((track) => track.stop());
  torchStream = null;
  navigator.vibrate?.(0);
}

function startRing() {
  stopFindEffects();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) {
    ringCtx = new Ctx();
    const beep = () => {
      if (!ringCtx) return;
      const osc = ringCtx.createOscillator();
      const gain = ringCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ringCtx.destination);
      osc.start();
      osc.stop(ringCtx.currentTime + 0.4);
    };
    beep();
    ringTimer = window.setInterval(beep, 1200);
  }
  navigator.vibrate?.([400, 200, 400, 200, 800]);
  window.setTimeout(() => stopFindEffects(), 30_000);
}

async function startTorch() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  torchStream = stream;
  const track = stream.getVideoTracks()[0];
  await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
}

async function runCommand(command: PhoneCommand) {
  const payload = command.payload ?? {};
  if (command.kind === "find_stop") {
    stopFindEffects();
    return;
  }
  if (command.kind === "ring") {
    startRing();
    toast("Your computer is ringing this phone", "info");
    return;
  }
  if (command.kind === "vibrate") {
    const ok = navigator.vibrate?.([500, 200, 500, 200, 800]);
    if (!ok) toast("This browser did not vibrate. iOS Safari usually ignores vibrate.", "info");
    else toast("Vibrating", "info");
    return;
  }
  if (command.kind === "torch") {
    try {
      await startTorch();
      toast("Flashlight is on. Your computer can turn it off.", "info");
    } catch {
      toast("This browser cannot toggle the flashlight. Android can when Nexus is open. iOS Safari cannot.", "info");
    }
    return;
  }
  if (command.kind === "open_url" && payload.url) {
    const url = payload.url;
    if (url.startsWith("/?conv=")) {
      const id = new URL(url, window.location.origin).searchParams.get("conv");
      if (id) {
        sessionStorage.setItem("nexus:open-conv", id);
        if (window.location.pathname === "/") openConversation(id, null);
        else window.location.assign(url);
        return;
      }
    }
    if (url.startsWith("/")) window.location.assign(url);
    else window.open(url, "_blank", "noopener");
    return;
  }
  if (command.kind === "note" || command.kind === "clipboard") {
    const text = payload.text || "";
    if (text && navigator.clipboard?.writeText) await navigator.clipboard.writeText(text).catch(() => undefined);
    toast(command.kind === "clipboard" ? "Clipboard text from your computer" : "Note from your computer", "info");
    return;
  }
  const player = useAcetatePlayer.getState();
  if (command.kind === "play" || command.kind === "pause") player.setPlaying(command.kind === "play");
  if (command.kind === "next") player.next();
  if (command.kind === "prev") player.prev();
  if (command.kind === "volume") {
    if (!player.queue.length) {
      toast("Volume here only changes Acetate, and nothing is playing.", "info");
      return;
    }
    player.setVolume(player.volume + (payload.delta ?? 0));
  }
}

async function finishSensitive(command: PhoneCommand, allow: boolean) {
  if (!allow) {
    await resolveCommand(command.id, "denied");
    return;
  }
  if (command.kind === "sign_out") {
    await resolveCommand(command.id, "done");
    const userId = useApp.getState().userId;
    if (userId) await supabase.from("nexus_handsets").delete().eq("user_id", userId).eq("device_id", thisDeviceId());
    await supabase.auth.signOut();
    return;
  }
  if (command.kind === "camera") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    const file = await new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
    if (!file) {
      await resolveCommand(command.id, "denied");
      return;
    }
    if (cloudUnlocked()) await addCloudFiles([file], "photo");
    else await sendDrop(file);
    toast(cloudUnlocked() ? "Photo saved to Cloud" : "Photo sent to your Nexus inbox", "success");
  }
  if (command.kind === "voice") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      window.setTimeout(() => recorder.stop(), 8000);
    });
    if (cloudUnlocked()) await addVoiceMemo(blob);
    else await sendDrop(new File([blob], "memo.webm", { type: blob.type }));
    toast("Voice memo saved", "success");
  }
  await resolveCommand(command.id, "done");
}

export function usePhoneAgent(userId: string | null) {
  const [prompt, setPrompt] = useState<PhoneCommand | null>(null);
  const [lost, setLost] = useState<Handset | null>(null);
  const seen = useRef(new Set<string>());
  const mine = thisDeviceId();

  useEffect(() => {
    if (!userId) return;
    let live = true;
    const loadLost = async () => {
      const { data } = await supabase.from("nexus_handsets").select("*").eq("user_id", userId).eq("device_id", mine).maybeSingle();
      if (live) setLost((data as Handset | null)?.lost ? (data as Handset) : null);
    };
    const take = async () => {
      const { data: self } = await supabase.from("nexus_handsets").select("control_enabled, lost, lost_message, label").eq("user_id", userId).eq("device_id", mine).maybeSingle();
      if (!live) return;
      const row = self as Handset | null;
      setLost(row?.lost ? row : null);
      if (!row?.control_enabled) return;
      const { data } = await supabase
        .from("nexus_handset_commands")
        .select("*")
        .eq("user_id", userId)
        .eq("device_id", mine)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(8);
      for (const command of (data ?? []) as PhoneCommand[]) {
        if (seen.current.has(command.id)) continue;
        if (Date.now() - Date.parse(command.created_at) > 10 * 60_000) {
          seen.current.add(command.id);
          await resolveCommand(command.id, "denied");
          continue;
        }
        seen.current.add(command.id);
        if (SENSITIVE.has(command.kind)) {
          setPrompt(command);
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            new Notification("Nexus Phone Link", { body: "Your computer asked this phone to confirm an action." });
          }
          break;
        }
        try {
          await runCommand(command);
          await resolveCommand(command.id, "done");
        } catch (error) {
          toast(error instanceof Error ? error.message : "That phone action failed", "error");
          await resolveCommand(command.id, "denied");
        }
      }
    };
    void loadLost();
    void take();
    const channel = supabase
      .channel(`phone-agent:${mine}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handset_commands", filter: `user_id=eq.${userId}` }, () => void take())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "nexus_handsets", filter: `user_id=eq.${userId}` }, () => void take())
      .subscribe();
    const timer = window.setInterval(() => void take(), 8000);
    return () => {
      live = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, mine]);

  return {
    prompt,
    lost,
    allow: () => {
      if (!prompt) return;
      const current = prompt;
      setPrompt(null);
      void finishSensitive(current, true).catch((error: Error) => toast(error.message, "error"));
    },
    deny: () => {
      if (!prompt) return;
      const current = prompt;
      setPrompt(null);
      void finishSensitive(current, false);
    },
  };
}
