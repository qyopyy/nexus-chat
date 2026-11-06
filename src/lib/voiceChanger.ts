"use client";

/**
 * Call / studio voice changer — built-in FX + optional AI model zip packs.
 * Pack format (nexus-voice.zip):
 *   nexus-voice.json  { "name", "ratio"?, "wet"?, "robot"?, "formantHz"?, "formantGain"?, "version": 1 }
 *   optional weights.bin / model.wasm (reserved for future WASM models; ratio still applied)
 */

import { readZip, zipFind } from "./zipLite";
import { loadJSON, saveJSON } from "./utils";

export type VoiceFxId = "off" | "chipmunk" | "deep" | "robot" | "radio" | "helium" | "bass" | "custom";

export type VoiceFxPreset = {
  id: VoiceFxId;
  label: string;
  ratio: number;
  wet: number;
  robot?: boolean;
  formantHz?: number;
  formantGain?: number;
  highpass?: number;
  lowpass?: number;
};

export const VOICE_FX: VoiceFxPreset[] = [
  { id: "off", label: "Natural", ratio: 1, wet: 0 },
  { id: "chipmunk", label: "Chipmunk", ratio: 1.45, wet: 0.92 },
  { id: "helium", label: "Helium", ratio: 1.28, wet: 0.85, formantHz: 4200, formantGain: 4 },
  { id: "deep", label: "Deep", ratio: 0.72, wet: 0.9, formantHz: 180, formantGain: 3 },
  { id: "bass", label: "Bass boost", ratio: 0.88, wet: 0.55, formantHz: 120, formantGain: 6, lowpass: 5500 },
  { id: "robot", label: "Robot", ratio: 1.02, wet: 0.95, robot: true, formantHz: 900, formantGain: -4 },
  { id: "radio", label: "Radio", ratio: 1, wet: 0.35, highpass: 400, lowpass: 3400, formantHz: 1800, formantGain: 5 },
  { id: "custom", label: "AI model", ratio: 1, wet: 1 },
];

export type VoiceModelPack = {
  name: string;
  ratio: number;
  wet: number;
  robot?: boolean;
  formantHz?: number;
  formantGain?: number;
  highpass?: number;
  lowpass?: number;
  /** original zip bytes for re-attach / share */
  zipName?: string;
  loadedAt: number;
};

const MODEL_KEY = "nexus.voiceModel";
const FX_KEY = "nexus.voiceFx";

let workletReady: Promise<boolean> | null = null;

export async function ensureVoiceFxWorklet(ctx: AudioContext): Promise<boolean> {
  if (!ctx.audioWorklet) return false;
  workletReady ??= (async () => {
    try {
      await ctx.audioWorklet.addModule("/voice-changer/worklet.js");
      return true;
    } catch (e) {
      console.warn("Voice FX worklet unavailable", e);
      return false;
    }
  })();
  return workletReady;
}

export function loadSavedFxId(): VoiceFxId {
  const id = loadJSON<string>(FX_KEY, "off");
  return VOICE_FX.some((p) => p.id === id) ? (id as VoiceFxId) : "off";
}

export function saveFxId(id: VoiceFxId) {
  saveJSON(FX_KEY, id);
}

export function loadSavedModel(): VoiceModelPack | null {
  return loadJSON<VoiceModelPack | null>(MODEL_KEY, null);
}

export function saveModel(m: VoiceModelPack | null) {
  if (!m) {
    try {
      localStorage.removeItem(MODEL_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  saveJSON(MODEL_KEY, m);
}

export async function parseVoiceModelZip(file: File | Blob, zipName?: string): Promise<VoiceModelPack> {
  const buf = await file.arrayBuffer();
  const files = await readZip(buf);
  const manifest = zipFind(files, /^nexus-voice\.json$/i) || zipFind(files, /voice.*\.json$/i);
  if (!manifest) throw new Error("Zip needs nexus-voice.json (AI voice model pack)");
  const json = JSON.parse(new TextDecoder().decode(manifest.data)) as Record<string, unknown>;
  const name = String(json.name || zipName || "Custom model").slice(0, 64);
  const ratio = typeof json.ratio === "number" ? json.ratio : 1;
  const wet = typeof json.wet === "number" ? json.wet : 1;
  const pack: VoiceModelPack = {
    name,
    ratio: Math.max(0.35, Math.min(2.4, ratio)),
    wet: Math.max(0, Math.min(1, wet)),
    robot: !!json.robot,
    formantHz: typeof json.formantHz === "number" ? json.formantHz : undefined,
    formantGain: typeof json.formantGain === "number" ? json.formantGain : undefined,
    highpass: typeof json.highpass === "number" ? json.highpass : undefined,
    lowpass: typeof json.lowpass === "number" ? json.lowpass : undefined,
    zipName: zipName || (file instanceof File ? file.name : "model.zip"),
    loadedAt: Date.now(),
  };
  // Prefer custom when a pack is loaded
  saveModel(pack);
  saveFxId("custom");
  return pack;
}

export function resolvePreset(id: VoiceFxId, model: VoiceModelPack | null): VoiceFxPreset {
  if (id === "custom" && model) {
    return {
      id: "custom",
      label: model.name,
      ratio: model.ratio,
      wet: model.wet,
      robot: model.robot,
      formantHz: model.formantHz,
      formantGain: model.formantGain,
      highpass: model.highpass,
      lowpass: model.lowpass,
    };
  }
  return VOICE_FX.find((p) => p.id === id) || VOICE_FX[0]!;
}

export function voiceFxLabel(id: VoiceFxId, model: VoiceModelPack | null) {
  if (id === "off") return "Voice FX off";
  if (id === "custom") return model ? `AI · ${model.name}` : "AI model (attach zip)";
  return VOICE_FX.find((p) => p.id === id)?.label || "Voice FX";
}

/** Example pack bytes for download from the Voice Changer app. */
export function exampleModelJson() {
  return JSON.stringify(
    {
      version: 1,
      name: "Studio Warm",
      ratio: 0.96,
      wet: 0.7,
      formantHz: 220,
      formantGain: 2.5,
      highpass: 60,
      lowpass: 14000,
      robot: false,
    },
    null,
    2,
  );
}
