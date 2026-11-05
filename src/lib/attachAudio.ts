"use client";

/** Decode, tweak (speed / bass), and optionally re-encode chat audio attachments. */

export const AUDIO_EXTS = ["wav", "mp3", "aac", "m4a"] as const;
export type AudioExt = (typeof AUDIO_EXTS)[number];

const AUDIO_MIME_RE = /audio\/(wav|wave|x-wav|mpeg|mp3|aac|mp4|x-m4a|m4a|x-aac)/i;
const AUDIO_NAME_RE = /\.(wav|mp3|aac|m4a)$/i;

export function isEditableAudio(file: File | Blob & { name?: string }) {
  const type = (file.type || "").toLowerCase();
  const name = ("name" in file && file.name ? file.name : "").toLowerCase();
  return AUDIO_MIME_RE.test(type) || AUDIO_NAME_RE.test(name);
}

export type AudioEditOpts = {
  /** Playback rate 0.5–2 (also changes pitch). */
  speed?: number;
  /** Low-shelf gain in dB, roughly −12…+12. */
  bass?: number;
  /** Re-encode at a compact bitrate (AAC/Opus via MediaRecorder). */
  compress?: boolean;
  /** Target bitrate when compressing (default 96 kbps). */
  bitrate?: number;
  onProgress?: (label: string, ratio?: number) => void;
};

function audioCtx() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx();
}

export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const ctx = audioCtx();
  try {
    const buf = await file.arrayBuffer();
    return await ctx.decodeAudioData(buf.slice(0));
  } finally {
    void ctx.close().catch(() => {});
  }
}

function pickRecordMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function extForMime(mime: string, fallback: string) {
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  return fallback || "m4a";
}

function writeWav(buffer: AudioBuffer): Blob {
  const ch = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const len = buffer.length;
  const dataLen = len * ch * 2;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ch; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Render buffer with speed + bass into a new AudioBuffer via OfflineAudioContext. */
export async function renderAudioEdit(source: AudioBuffer, opts: AudioEditOpts = {}): Promise<AudioBuffer> {
  const speed = Math.max(0.5, Math.min(2, opts.speed ?? 1));
  const bass = Math.max(-12, Math.min(12, opts.bass ?? 0));
  const outRate = source.sampleRate;
  const outLen = Math.max(1, Math.ceil(source.duration / speed * outRate));
  const offline = new OfflineAudioContext(Math.min(2, source.numberOfChannels), outLen, outRate);
  const src = offline.createBufferSource();
  src.buffer = source;
  src.playbackRate.value = speed;
  let node: AudioNode = src;
  if (Math.abs(bass) > 0.05) {
    const shelf = offline.createBiquadFilter();
    shelf.type = "lowshelf";
    shelf.frequency.value = 180;
    shelf.gain.value = bass;
    node.connect(shelf);
    node = shelf;
  }
  const limit = offline.createDynamicsCompressor();
  limit.threshold.value = -8;
  limit.knee.value = 12;
  limit.ratio.value = 3;
  limit.attack.value = 0.01;
  limit.release.value = 0.15;
  node.connect(limit);
  limit.connect(offline.destination);
  src.start(0);
  opts.onProgress?.("Rendering audio…", 0.2);
  return offline.startRendering();
}

async function encodeCompressed(buffer: AudioBuffer, bitrate: number, onProgress?: AudioEditOpts["onProgress"]): Promise<{ blob: Blob; mime: string; ext: string }> {
  const mime = pickRecordMime();
  if (!mime) {
    onProgress?.("Compressor unavailable — writing WAV…");
    const wav = writeWav(buffer);
    return { blob: wav, mime: "audio/wav", ext: "wav" };
  }

  const ctx = audioCtx();
  try {
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);
    const mr = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: bitrate });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    onProgress?.("Compressing audio…", 0.4);
    const done = new Promise<Blob>((resolve, reject) => {
      mr.onerror = () => reject(new Error("Audio compress failed"));
      mr.onstop = () => resolve(new Blob(chunks, { type: mr.mimeType || mime }));
    });
    mr.start(100);
    src.start(0);
    await new Promise<void>((res) => {
      src.onended = () => res();
      setTimeout(res, Math.max(1500, buffer.duration * 1000 + 500));
    });
    // Let encoder flush a bit past end
    await new Promise((r) => setTimeout(r, 180));
    if (mr.state !== "inactive") mr.stop();
    const blob = await done;
    if (!blob.size) throw new Error("Empty compressed audio");
    const outMime = blob.type || mime;
    return { blob, mime: outMime, ext: extForMime(outMime, "m4a") };
  } finally {
    void ctx.close().catch(() => {});
  }
}

/**
 * Apply speed/bass and optionally compress. Returns a new File ready to upload.
 * If nothing changes and compress is off, returns the original file.
 */
export async function processChatAudio(file: File, opts: AudioEditOpts = {}): Promise<File> {
  const speed = opts.speed ?? 1;
  const bass = opts.bass ?? 0;
  const compress = !!opts.compress;
  const bitrate = opts.bitrate ?? 96_000;
  const unchanged = Math.abs(speed - 1) < 0.01 && Math.abs(bass) < 0.1 && !compress;
  if (unchanged) return file;

  opts.onProgress?.("Decoding…", 0.05);
  const decoded = await decodeAudioFile(file);
  const rendered = await renderAudioEdit(decoded, { ...opts, speed, bass });
  opts.onProgress?.("Encoding…", 0.55);

  if (compress || Math.abs(speed - 1) >= 0.01 || Math.abs(bass) >= 0.1) {
    // Prefer compressed encode when requested; otherwise WAV to keep quality after FX
    if (compress) {
      const { blob, mime, ext } = await encodeCompressed(rendered, bitrate, opts.onProgress);
      // Keep compressed only when smaller (or original was huge WAV)
      const keep = blob.size < file.size * 0.98 || /\.wav$/i.test(file.name) || file.size > 2_000_000;
      const out = keep ? blob : writeWav(rendered);
      const outMime = keep ? mime : "audio/wav";
      const outExt = keep ? ext : "wav";
      const base = file.name.replace(/\.[^.]+$/, "") || "audio";
      opts.onProgress?.("Done", 1);
      return new File([out], `${base}.${outExt}`, { type: outMime });
    }
    const wav = writeWav(rendered);
    const base = file.name.replace(/\.[^.]+$/, "") || "audio";
    opts.onProgress?.("Done", 1);
    return new File([wav], `${base}.wav`, { type: "audio/wav" });
  }

  return file;
}

export function formatDuration(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
