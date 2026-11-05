"use client";

/**
 * Client-side media compression for uploads.
 * Re-encodes to browser-friendly H.264/MP4 (or WebM) so iPhone HEVC/.mov
 * plays everywhere. Preserves source FPS up to 60 with a high-quality bitrate.
 */

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

/** High-quality bitrate by resolution (cleaner encodes, still smaller than phone HEVC) */
function videoBitrate(w: number, h: number, fps: number) {
  const px = w * h;
  const fpsBoost = fps > 45 ? 1.35 : fps > 30 ? 1.15 : 1;
  let base = 2_800_000;
  if (px >= 2_500_000) base = 10_000_000; // ~1440p
  else if (px >= 1_800_000) base = 8_000_000; // ~1080p
  else if (px >= 900_000) base = 5_000_000; // ~720p
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
 * Keeps source FPS (capped at 60 by default), high-quality bitrate, even dimensions.
 */
export async function compressVideo(file: File | Blob, opts: CompressVideoOpts = {}): Promise<CompressedVideo> {
  const maxEdge = opts.maxEdge ?? 1440;
  const maxFps = opts.maxFps ?? 60;
  const onProgress = opts.onProgress;
  const mime = pickMime();
  const name = file instanceof File ? file.name : "clip.mp4";
  const lower = name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  const alreadyFriendly = /mp4|webm/.test(type) || /\.(mp4|webm)$/.test(lower);
  const needsTranscode = opts.force || /quicktime|hevc|hvc1|dolby|\.mov$|\.m4v$|\.mkv$|\.avi$/i.test(`${type} ${lower}`) || !alreadyFriendly;

  // Tiny already-web files: skip re-encode unless forced
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
    // Prefer 60 when source is clearly high-frame (common on phones) even if getSettings lies
    if (fps < 50 && maxFps >= 60) {
      // Many phone clips are 60fps but browsers report 30 — bump when resolution is story/reel sized
      if (Math.max(sw, sh) >= 1080 && file.size / Math.max(dur, 1) > 1.2e6) fps = Math.min(maxFps, 60);
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

    // Only keep original when it was already web-friendly AND smaller (and not a forced repair)
    if (!opts.force && alreadyFriendly && blob.size > file.size * 1.05) {
      onProgress?.("Keeping original (already efficient)…");
      const info = await probe(file);
      return { blob: file, ...info, mime: type || "video/mp4", ext: lower.endsWith("webm") ? "webm" : "mp4", skipped: true };
    }

    onProgress?.("Compression done", 1);
    return {
      blob,
      w,
      h,
      dur: Math.round((dur || 0) * 10) / 10,
      fps,
      mime: blob.type || mime,
      ext: extFor(blob.type || mime),
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
