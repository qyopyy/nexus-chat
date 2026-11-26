"use client";

/**
 * Client-side media compression for uploads.
 * Re-encodes to browser-friendly H.264/MP4 (or WebM) so iPhone HEVC/.mov
 * plays everywhere. Defaults: Full HD (1920) @ up to 60fps.
 */

/** Shared Full HD 60fps policy used by chat, Gram, and Studio MOV convert. */
export const FULL_HD_60 = { maxEdge: 1920, maxFps: 60 } as const;

function isMovLike(type: string, name: string) {
  return /quicktime|hevc|hvc1|dolby|\.mov$|\.m4v$/i.test(`${type} ${name}`);
}

export type CompressProgress = (label: string, ratio?: number) => void;

const VIDEO_MIMES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2", // H.264 High + AAC
  "video/mp4;codecs=avc1.4D401F,mp4a.40.2", // H.264 Main
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm",
];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return VIDEO_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function extFor(mime: string) {
  return mime.includes("mp4") ? "mp4" : "webm";
}

/** High-quality bitrate by resolution (Full HD 60fps stays crisp) */
function videoBitrate(w: number, h: number, fps: number) {
  const px = w * h;
  const fpsBoost = fps > 45 ? 1.45 : fps > 30 ? 1.2 : 1;
  let base = 2_800_000;
  if (px >= 2_500_000) base = 12_000_000; // ~1440p+
  else if (px >= 1_800_000) base = 10_000_000; // Full HD ~1080p
  else if (px >= 900_000) base = 5_500_000; // ~720p
  else base = 3_200_000;
  return Math.round(base * fpsBoost);
}

function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.preload = "auto";
    v.src = url;
    let settled = false;
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    v.onloadeddata = ok;
    v.onloadedmetadata = () => {
      if (v.readyState >= 2) ok();
    };
    v.onerror = () => fail("Can't read this video for compression");
    setTimeout(() => {
      if (!settled && v.readyState >= 1) ok();
      else if (!settled) fail("Timed out reading video");
    }, 12_000);
  });
}

export type CompressedVideo = {
  blob: Blob;
  w: number;
  h: number;
  dur: number;
  fps: number;
  mime: string;
  ext: string;
  poster: Blob | null;
  skipped: boolean;
};

export type CompressVideoOpts = {
  maxEdge?: number;
  /** hard cap — default 60 */
  maxFps?: number;
  /** force re-encode even for small mp4/webm (used when repairing stories) */
  force?: boolean;
  onProgress?: CompressProgress;
};

/**
 * Re-encode video via canvas + MediaRecorder.
 * .mov / QuickTime / HEVC always become MP4 at Full HD (1920) @ up to 60fps.
 */
async function compressVideoCore(file: File | Blob, opts: CompressVideoOpts = {}): Promise<CompressedVideo> {
  // Platform lock: never encode below Full HD 60fps policy (callers may still force re-encode).
  const maxEdge = Math.max(opts.maxEdge ?? FULL_HD_60.maxEdge, FULL_HD_60.maxEdge);
  const maxFps = Math.max(opts.maxFps ?? FULL_HD_60.maxFps, FULL_HD_60.maxFps);
  const onProgress = opts.onProgress;
  const mime = pickMime();
  const name = file instanceof File ? file.name : "clip.mp4";
  const lower = name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  const movLike = isMovLike(type, lower);
  const alreadyFriendly = !movLike && (/mp4|webm/.test(type) || /\.(mp4|webm)$/.test(lower));
  // Always convert MOV/HEVC → MP4; also force non-web containers
  const needsTranscode = opts.force || movLike || /mkv|avi$/i.test(lower) || /\/x-matroska|\/avi/i.test(type) || !alreadyFriendly;

  // Tiny already-web files: skip re-encode unless forced / MOV
  if (!needsTranscode && !opts.force && file.size < 4 * 1024 * 1024 && alreadyFriendly) {
    onProgress?.("Video looks good — skipping compress…");
    const info = await probe(file);
    return { blob: file, ...info, mime: type || "video/mp4", ext: lower.endsWith("webm") ? "webm" : "mp4", skipped: true };
  }

  if (!mime || typeof MediaRecorder === "undefined") {
    onProgress?.("Compressor unavailable — uploading original…");
    const info = await probe(file);
    const ext = (lower.split(".").pop() || "mp4").replace(/[^a-z0-9]/g, "") || "mp4";
    return { blob: file, ...info, mime: type || "video/mp4", ext, skipped: true };
  }

  onProgress?.("Preparing video…");
  const v = await loadVideo(file);
  const srcUrl = v.src;
  let ac: AudioContext | null = null;
  try {
    const sw = v.videoWidth || 720;
    const sh = v.videoHeight || 1280;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const w = Math.max(2, Math.round((sw * scale) / 2) * 2);
    const h = Math.max(2, Math.round((sh * scale) / 2) * 2);
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;

    let fps = 30;
    try {
      const anyV = v as HTMLVideoElement & { captureStream?: (f?: number) => MediaStream };
      if (typeof anyV.captureStream === "function") {
        const probeStream = anyV.captureStream();
        const settings = probeStream.getVideoTracks()[0]?.getSettings();
        probeStream.getTracks().forEach((t) => t.stop());
        if (settings?.frameRate && settings.frameRate > 1) fps = Math.min(maxFps, Math.round(settings.frameRate));
      }
    } catch {
      /* keep 30 */
    }
    // Prefer Full HD 60fps: phones often report 30 while the source is 60
    if (maxFps >= 60 && fps < 50) {
      if (movLike || Math.max(sw, sh) >= 1080 || file.size / Math.max(dur, 1) > 800_000) {
        fps = 60;
      }
    }
    fps = Math.max(24, Math.min(maxFps, fps));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(v, 0, 0, w, h);
    const poster = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.92));

    const tracks: MediaStreamTrack[] = [...canvas.captureStream(fps).getVideoTracks()];
    try {
      ac = new AudioContext();
      const src = ac.createMediaElementSource(v);
      const dest = ac.createMediaStreamDestination();
      const silent = ac.createGain();
      silent.gain.value = 0;
      src.connect(dest);
      src.connect(silent);
      silent.connect(ac.destination);
      for (const t of dest.stream.getAudioTracks()) tracks.push(t);
    } catch {
      if (ac) {
        void ac.close().catch(() => {});
        ac = null;
      }
    }
    const stream = new MediaStream(tracks);

    const bitrate = videoBitrate(w, h, fps);
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    onProgress?.("Compressing video…", 0);
    v.currentTime = 0;
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      setTimeout(res, 800);
    });

    const recorded = new Promise<Blob>((resolve, reject) => {
      mr.onerror = () => reject(new Error("Compression failed"));
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: mr.mimeType || mime }));
      };
    });

    mr.start(100); // smaller timeslice → smoother high-fps encodes
    try {
      await v.play();
    } catch {
      /* play may be blocked — we advance currentTime manually below */
    }

    await new Promise<void>((resolve) => {
      let last = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (mr.state !== "inactive") mr.stop();
        resolve();
      };
      const tick = () => {
        if (finished) return;
        if (v.ended || (dur > 0 && v.currentTime >= dur - 0.05)) return finish();
        ctx.drawImage(v, 0, 0, w, h);
        if (dur > 0) {
          const r = Math.min(1, v.currentTime / dur);
          if (r - last > 0.015) {
            last = r;
            onProgress?.("Compressing video…", r);
          }
        }
        if (v.paused && dur > 0) {
          try {
            v.currentTime = Math.min(dur, v.currentTime + 1 / fps);
          } catch {
            /* seek may throw while already seeking */
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(finish, Math.max(20_000, (dur || 30) * 1000 + 8_000));
    });

    const blob = await recorded;
    if (ac) void ac.close().catch(() => {});
    ac = null;
    if (!blob.size) throw new Error("Compression produced an empty file");

    // Never keep original MOV/HEVC — always ship the converted MP4
    if (!opts.force && !movLike && alreadyFriendly && blob.size > file.size * 1.05) {
      onProgress?.("Keeping original (already efficient)…");
      const info = await probe(file);
      return { blob: file, ...info, mime: type || "video/mp4", ext: lower.endsWith("webm") ? "webm" : "mp4", skipped: true };
    }

    // Prefer .mp4 extension even if recorder fell back to webm mime with mp4 codecs string
    const outMime = blob.type || mime;
    const outExt = movLike ? "mp4" : extFor(outMime);
    onProgress?.(movLike ? "Converted MOV → MP4" : "Compression done", 1);
    return {
      blob: outExt === "mp4" && !outMime.includes("mp4") ? new Blob([blob], { type: "video/mp4" }) : blob,
      w,
      h,
      dur: Math.round((dur || 0) * 10) / 10,
      fps,
      mime: outExt === "mp4" ? "video/mp4" : outMime,
      ext: outExt,
      poster,
      skipped: false,
    };
  } finally {
    if (ac) void ac.close().catch(() => {});
    v.pause();
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(srcUrl);
  }
}

// ---------------------------------------------------------------- MOV → MP4 (lossless remux)

const isQuickTime = (type: string, name: string) => /quicktime|\.mov$|\.qt$/i.test(`${type} ${name}`);

/** "avc" = H.264 (plays everywhere) · "hevc" = H.265 (Apple/Chrome only) · null = unknown. Looks for the codec tag in the file head + tail (where `moov` lives). */
async function sniffCodec(file: Blob): Promise<"avc" | "hevc" | null> {
  try {
    const parts = [file.slice(0, Math.min(file.size, 2_000_000))];
    if (file.size > 6_000_000) parts.push(file.slice(file.size - 4_000_000));
    const text = await new Blob(parts).text().catch(() => "");
    const raw = text || "";
    if (/hvc1|hev1/.test(raw)) return "hevc";
    if (/avc1|avc3/.test(raw)) return "avc";
  } catch {
    /* unknown */
  }
  return null;
}

function canPlayVideo(file: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    const done = (ok: boolean) => {
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    v.onloadedmetadata = () => done(v.videoWidth > 0 && Number.isFinite(v.duration));
    v.onerror = () => done(false);
    setTimeout(() => done(v.readyState >= 1 && v.videoWidth > 0), 9000);
    v.src = url;
  });
}

/**
 * Turn a QuickTime .mov into an .mp4 without re-encoding: MOV and MP4 share the same box format, so
 * rewriting the `ftyp` brand in place (same byte length → every chunk offset stays valid) is enough.
 * Instant, lossless, and works on multi-GB files because the rest of the file is never read.
 * Returns null when the file isn't a remuxable QuickTime file or the result doesn't actually play.
 */
export async function remuxMovToMp4(file: Blob, name = "video.mov"): Promise<File | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (head.length < 16) return null;
    const dv = new DataView(head.buffer);
    const size = dv.getUint32(0);
    const tag = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (tag !== "ftyp" || size < 16 || size > head.length || size % 4 !== 0) return null;
    const out = head.slice(0, size);
    const put = (at: number, t: string) => {
      for (let i = 0; i < 4; i++) out[at + i] = t.charCodeAt(i);
    };
    put(8, "mp42"); // major brand
    out[12] = out[13] = out[14] = out[15] = 0; // minor version
    const slots = (size - 16) / 4;
    const brands = ["isom", "mp42", "mp41", "iso2"];
    for (let i = 0; i < slots; i++) put(16 + i * 4, brands[i % brands.length]);
    const mp4Name = name.replace(/\.[^./\\]+$/, "") + ".mp4";
    const mp4 = new File([out, file.slice(size)], mp4Name, { type: "video/mp4", lastModified: file instanceof File ? file.lastModified : Date.now() });
    return (await canPlayVideo(mp4)) ? mp4 : null;
  } catch {
    return null;
  }
}

async function mp4Result(mp4: File): Promise<CompressedVideo> {
  const info = await probe(mp4);
  return { blob: mp4, ...info, mime: "video/mp4", ext: "mp4", skipped: false };
}

/**
 * Chat, Gram, Cloud, Drop, Studio — every upload goes through here.
 * H.264 .mov → instant lossless MP4. HEVC .mov → re-encoded to H.264 MP4 (plays on every device),
 * and if that can't run, remuxed to HEVC MP4 as a last resort. A .mov is never uploaded as-is when it can be avoided.
 */
export async function compressVideo(file: File | Blob, opts: CompressVideoOpts = {}): Promise<CompressedVideo> {
  const name = file instanceof File ? file.name : "clip.mp4";
  const mov = isQuickTime((file.type || "").toLowerCase(), name.toLowerCase());
  if (!mov) return compressVideoCore(file, opts);

  if (!opts.force) {
    const codec = await sniffCodec(file);
    if (codec !== "hevc") {
      opts.onProgress?.("Converting MOV → MP4…", 0.1);
      const mp4 = await remuxMovToMp4(file, name);
      if (mp4) {
        opts.onProgress?.("Converted MOV → MP4", 1);
        return mp4Result(mp4);
      }
    }
  }
  let out: CompressedVideo | null = null;
  let err: unknown = null;
  try {
    out = await compressVideoCore(file, opts);
    if (!out.skipped) return out;
  } catch (e) {
    err = e;
  }
  const mp4 = await remuxMovToMp4(file, name);
  if (mp4) return mp4Result(mp4);
  if (out) return out;
  throw err ?? new Error("Couldn't convert this video");
}

/** Convenience for plain upload paths: .mov in → .mp4 File out (anything else comes back untouched). */
export async function ensureMp4(file: File, onStep?: CompressProgress): Promise<File> {
  if (!isQuickTime((file.type || "").toLowerCase(), file.name.toLowerCase())) return file;
  try {
    const out = await compressVideo(file, { onProgress: onStep });
    if (out.ext === "mp4" && out.blob !== file) {
      return out.blob instanceof File ? out.blob : new File([out.blob], file.name.replace(/\.[^./\\]+$/, "") + ".mp4", { type: "video/mp4" });
    }
  } catch {
    /* keep the original */
  }
  return file;
}

async function probe(file: Blob): Promise<{ w: number; h: number; dur: number; fps: number; poster: Blob | null }> {
  try {
    const v = await loadVideo(file);
    const url = v.src;
    try {
      const w = v.videoWidth || 720;
      const h = v.videoHeight || 1280;
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      try {
        v.currentTime = Math.min(0.35, dur > 0 ? dur / 4 : 0.1);
        await new Promise<void>((res) => {
          v.onseeked = () => res();
          setTimeout(res, 1500);
        });
      } catch {
        /* */
      }
      let poster: Blob | null = null;
      if (v.videoWidth > 0) {
        const k = Math.min(1, 900 / Math.max(w, h));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * k));
        c.height = Math.max(1, Math.round(h * k));
        const g = c.getContext("2d")!;
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(v, 0, 0, c.width, c.height);
        poster = await new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.9));
      }
      return { w, h, dur: Math.round(dur * 10) / 10, fps: 30, poster };
    } finally {
      v.pause();
      URL.revokeObjectURL(url);
    }
  } catch {
    return { w: 720, h: 1280, dur: 0, fps: 30, poster: null };
  }
}

/** Downscale + high-quality JPEG (keeps PNG only when it stays smaller). */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.9): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, w: 0, h: 0 };
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const smallEnough = k === 1 && file.size < 900_000 && /jpe?g|webp/i.test(file.type);
  if (smallEnough) {
    bmp.close();
    return { blob: file, w, h };
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const jpeg = await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", quality));
  if (/png/i.test(file.type) && file.size < jpeg.size) return { blob: file, w, h };
  return { blob: jpeg, w, h };
}
