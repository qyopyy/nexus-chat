"use client";

import { loadFeatureFlags } from "./featureFlags";
import { encodeWavPcm } from "./acetateWav";

export { encodeWavPcm };

/** Browser conversion limit. ffmpeg.wasm needs cross-origin isolation, which the iOS shell does not have. */
export const CONVERT_MAX_BYTES = 48 * 1024 * 1024;
export const CONVERT_MAX_SECONDS = 8 * 60;

export type ConvertChoice =
  | { format: "mp3"; kbps: 128 | 192 | 320 }
  | { format: "wav"; bits: 16 | 24 }
  | { format: "m4a"; kbps: 256 };

export function convertLimitMessage(bytes?: number) {
  const size = bytes != null ? ` This file is ${Math.ceil(bytes / (1024 * 1024))} MB.` : "";
  return `Acetate converts in the browser, up to 48 MB and 8 minutes, so it can run in the iPhone app. There is no server encoder for larger masters.${size} The original file is unchanged.`;
}

export function m4aEncoderAvailable() {
  return typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined";
}

export function choiceLabel(choice: ConvertChoice) {
  if (choice.format === "mp3") return `MP3 ${choice.kbps} kbps`;
  if (choice.format === "wav") return `WAV ${choice.bits}-bit`;
  return "M4A 256 kbps";
}

export function choiceExt(choice: ConvertChoice) {
  return choice.format;
}

function fileBase(name: string) {
  const clean = name.replace(/\.[^.]+$/, "").replace(/[^\w .()'#-]+/g, "").trim().slice(0, 80);
  return clean || "Acetate";
}

export async function deliverConvertedFile(file: File) {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title: file.name });
      return;
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function probeDuration(file: Blob) {
  return new Promise<number | null>((resolve) => {
    try {
      const audio = document.createElement("audio");
      const url = URL.createObjectURL(file);
      let settled = false;
      const done = (value: number | null) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        audio.removeAttribute("src");
        resolve(value);
      };
      audio.preload = "metadata";
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => done(null);
      audio.src = url;
      setTimeout(() => done(null), 8000);
    } catch {
      resolve(null);
    }
  });
}

async function decodeAudio(file: Blob) {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("This browser can't decode audio.");
  const ctx = new Ctx();
  try {
    const raw = await file.arrayBuffer();
    return await ctx.decodeAudioData(raw.slice(0));
  } catch {
    throw new Error("This browser couldn't read that audio. Try MP3, WAV, M4A, AAC, FLAC, or AIFF under the size limit. The original file is unchanged.");
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function mixdown(buffer: AudioBuffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const out: Float32Array[] = [];
  for (let i = 0; i < channels; i += 1) out.push(buffer.getChannelData(i));
  return { channels: out, rate: buffer.sampleRate };
}

function resample(input: Float32Array, from: number, to: number) {
  if (from === to) return input;
  const length = Math.max(1, Math.round((input.length * to) / from));
  const out = new Float32Array(length);
  const ratio = from / to;
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(input.length - 1, left + 1);
    const mix = pos - left;
    out[i] = (input[left] || 0) * (1 - mix) + (input[right] || 0) * mix;
  }
  return out;
}

const LAME_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);

function floatTo16(input: Float32Array) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i] || 0));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

async function encodeMp3(channels: Float32Array[], sampleRate: number, kbps: 128 | 192 | 320) {
  const rate = LAME_RATES.has(sampleRate) ? sampleRate : 44100;
  const audio = channels.map((channel) => resample(channel, sampleRate, rate));
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(audio.length, rate, kbps);
  const left = floatTo16(audio[0]);
  const right = audio[1] ? floatTo16(audio[1]) : null;
  const parts: Uint8Array[] = [];
  const block = 1152;
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const encoded = right ? encoder.encodeBuffer(l, right.subarray(i, i + block)) : encoder.encodeBuffer(l);
    if (encoded.length) parts.push(new Uint8Array(encoded));
  }
  const end = encoder.flush();
  if (end.length) parts.push(new Uint8Array(end));
  if (!parts.length) throw new Error("MP3 encoder produced an empty file");
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}

async function encodeM4a(channels: Float32Array[], sampleRate: number) {
  if (!m4aEncoderAvailable()) {
    throw new Error("This browser can't encode M4A (AAC). Choose MP3 or WAV. The original file is unchanged.");
  }
  const rate = sampleRate === 48000 ? 48000 : 44100;
  const audio = channels.map((channel) => resample(channel, sampleRate, rate));
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    audio: { codec: "aac", numberOfChannels: audio.length, sampleRate: rate },
    fastStart: "in-memory",
    firstTimestampBehavior: "strict",
  });
  const frames: EncodedAudioChunk[] = [];
  let meta: EncodedAudioChunkMetadata | undefined;
  const encoder = new AudioEncoder({
    output: (chunk, chunkMeta) => {
      frames.push(chunk);
      if (chunkMeta) meta = chunkMeta;
    },
    error: (error) => {
      throw error;
    },
  });
  const support = await AudioEncoder.isConfigSupported({
    codec: "mp4a.40.2",
    numberOfChannels: audio.length,
    sampleRate: rate,
    bitrate: 256_000,
  }).catch(() => ({ supported: false }));
  if (!support.supported) {
    throw new Error("This browser can't encode M4A (AAC). Choose MP3 or WAV. The original file is unchanged.");
  }
  encoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels: audio.length,
    sampleRate: rate,
    bitrate: 256_000,
  });
  const step = 1024;
  const total = audio[0].length;
  for (let start = 0; start < total; start += step) {
    const count = Math.min(step, total - start);
    const planar = new Float32Array(count * audio.length);
    for (let channel = 0; channel < audio.length; channel += 1) {
      planar.set(audio[channel].subarray(start, start + count), channel * count);
    }
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: count,
      numberOfChannels: audio.length,
      timestamp: Math.round((start / rate) * 1_000_000),
      data: planar,
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  for (const chunk of frames) muxer.addAudioChunk(chunk, meta);
  muxer.finalize();
  return new Blob([target.buffer], { type: "audio/mp4" });
}

export async function convertOwnedAudio(file: Blob, name: string, choice: ConvertChoice) {
  const flags = await loadFeatureFlags();
  if (!flags.format_convert) throw new Error("Format conversion is turned off");
  if (file.size <= 0) throw new Error("That file is empty");
  if (file.size > CONVERT_MAX_BYTES) throw new Error(convertLimitMessage(file.size));
  const duration = await probeDuration(file);
  if (duration != null && (!Number.isFinite(duration) || duration > CONVERT_MAX_SECONDS)) {
    throw new Error(convertLimitMessage(file.size));
  }
  const decoded = await decodeAudio(file);
  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > CONVERT_MAX_SECONDS) {
    throw new Error(convertLimitMessage(file.size));
  }
  const mixed = mixdown(decoded);
  let blob: Blob;
  if (choice.format === "wav") blob = new Blob([encodeWavPcm(mixed.channels, mixed.rate, choice.bits) as BlobPart], { type: "audio/wav" });
  else if (choice.format === "mp3") blob = await encodeMp3(mixed.channels, mixed.rate, choice.kbps);
  else blob = await encodeM4a(mixed.channels, mixed.rate);
  const filename = `${fileBase(name)}.${choiceExt(choice)}`;
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}
