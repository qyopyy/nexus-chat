"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Download, ImagePlus, Music2, Square } from "lucide-react";
import { toast } from "@/store/app";
import { decodeFile, fmtTime } from "@/lib/audio";
import { createPost, uploadMedia } from "@/lib/gram";
import { download } from "@/lib/dsp";
import { cn } from "@/lib/utils";

type Style = "circle" | "bars" | "wave" | "glow";
type Aspect = "9:16" | "1:1" | "16:9";
const SIZE: Record<Aspect, [number, number]> = { "9:16": [720, 1280], "1:1": [1080, 1080], "16:9": [1280, 720] };
const MIMES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

/** song (+ cover) → animated visualizer video for TikTok / Reels / Shorts / YouTube */
export default function VisualizerMaker() {
  const [audio, setAudio] = useState<{ file: File; buf: AudioBuffer } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [style, setStyle] = useState<Style>("circle");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [color, setColor] = useState("#8b5cff");
  const [start, setStart] = useState(0);
  const [len, setLen] = useState(30);
  const [rec, setRec] = useState<{ progress: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const opts = useRef({ title, artist, style, color, img, aspect });
  opts.current = { title, artist, style, color, img, aspect };

  // idle preview frame
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || rec) return;
    const [W, H] = SIZE[aspect];
    cv.width = W;
    cv.height = H;
    const fake = new Uint8Array(256).map((_, i) => 140 + Math.sin(i / 6) * 60 * (1 - i / 256));
    const wave = new Uint8Array(1024).map((_, i) => 128 + Math.sin(i / 20) * 40);
    drawFrame(cv.getContext("2d")!, W, H, fake, wave, 0.4, opts.current, 0.35);
  }, [aspect, style, color, img, title, artist, rec]);

  const pickAudio = async (f?: File | null) => {
    if (!f) return;
    try {
      const buf = await decodeFile(f);
      setAudio({ file: f, buf });
      setStart(0);
      setLen(Math.min(30, Math.floor(buf.duration)));
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 40));
    } catch {
      toast("Couldn't read that audio file", "error");
    }
  };
  const pickImage = (f?: File | null) => {
    if (!f) return;
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = URL.createObjectURL(f);
  };

  const record = async () => {
    if (!audio || !canvas.current) return;
    if (typeof MediaRecorder === "undefined" || !canvas.current.captureStream) return toast("Your browser can't record video — try Chrome, Edge or Safari 17+", "error");
    setResult(null);
    const cv = canvas.current;
    const [W, H] = SIZE[aspect];
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d")!;
    const ac = new AudioContext();
    const src = ac.createBufferSource();
    src.buffer = audio.buf;
    const an = ac.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.78;
    const dest = ac.createMediaStreamDestination();
    src.connect(an);
    an.connect(dest);
    an.connect(ac.destination); // you hear it while it renders
    const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 256_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const freq = new Uint8Array(an.frequencyBinCount);
    const wave = new Uint8Array(an.fftSize);
    const dur = Math.min(len, audio.buf.duration - start);
    let raf = 0;
    let done = false;
    const t0 = performance.now();
    const loop = () => {
      if (done) return;
      an.getByteFrequencyData(freq);
      an.getByteTimeDomainData(wave);
      const el = (performance.now() - t0) / 1000;
      drawFrame(g, W, H, freq, wave, el, opts.current, Math.min(1, el / dur));
      setRec({ progress: Math.min(1, el / dur) });
      raf = requestAnimationFrame(loop);
    };
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      try {
        src.stop();
      } catch {
        /* ended */
      }
      if (mr.state !== "inactive") mr.stop();
    };
    stopRef.current = finish;
    mr.onstop = () => {
      void ac.close();
      const type = mr.mimeType || mime || "video/webm";
      const blob = new Blob(chunks, { type });
      setResult({ blob, url: URL.createObjectURL(blob), ext: type.includes("mp4") ? "mp4" : "webm" });
      setRec(null);
      stopRef.current = null;
    };
    src.onended = finish;
    mr.start(250);
    src.start(0, start, dur);
    setRec({ progress: 0 });
    loop();
  };

  const postShort = async () => {
    if (!result) return;
    setPosting(true);
    try {
      const f = new File([result.blob], `visualizer.${result.ext}`, { type: result.blob.type });
      const media = await uploadMedia(f);
      await createPost("short", [media], [title, artist].filter(Boolean).join(" — "));
      toast("Posted to NexusGram Shorts", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setPosting(false);
  };

  const maxLen = audio ? Math.max(5, Math.min(600, Math.floor(audio.buf.duration - start))) : 60;
  const input = "w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className={cn("flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed p-3 text-sm", audio ? "border-accent/50" : "border-line hover:border-accent")}>
            <Music2 className="size-5 shrink-0" />
            <span className="min-w-0 truncate">{audio ? audio.file.name : "Choose audio"}</span>
            <input type="file" accept="audio/*,.wav,.mp3,.m4a,.flac" hidden onChange={(e) => void pickAudio(e.target.files?.[0])} />
          </label>
          <label className={cn("flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed p-3 text-sm", img ? "border-accent/50" : "border-line hover:border-accent")}>
            <ImagePlus className="size-5 shrink-0" />
            <span className="min-w-0 truncate">{img ? "Cover art ✓" : "Cover art (optional)"}</span>
            <input type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
          <input className={input} value={artist} maxLength={60} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
        </div>
        <Row label="Style">
          {(["circle", "bars", "wave", "glow"] as const).map((s) => (
            <Chip key={s} on={style === s} onClick={() => setStyle(s)}>
              {s === "circle" ? "Ring" : s === "bars" ? "Bars" : s === "wave" ? "Waveform" : "Glow pulse"}
            </Chip>
          ))}
        </Row>
        <Row label="Format">
          {(["9:16", "1:1", "16:9"] as const).map((a) => (
            <Chip key={a} on={aspect === a} onClick={() => setAspect(a)}>
              {a === "9:16" ? "9:16 · TikTok/Reels/Shorts" : a === "1:1" ? "1:1 · Feed" : "16:9 · YouTube"}
            </Chip>
          ))}
        </Row>
        <Row label="Color">
          {["#8b5cff", "#ff2bd6", "#00e5ff", "#36d39a", "#ffb02e", "#ff4d6d", "#ffffff"].map((c) => (
            <button key={c} onClick={() => setColor(c)} className={cn("size-8 rounded-full ring-offset-2 ring-offset-chat", color === c && "ring-2 ring-accent")} style={{ background: c }} aria-label={c} />
          ))}
        </Row>
        {audio && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-sub">
              Start at {fmtTime(start)}
              <input type="range" min={0} max={Math.max(0, audio.buf.duration - 5)} step={0.5} value={start} onChange={(e) => setStart(Number(e.target.value))} className="vol mt-1 w-full" />
            </label>
            <label className="block text-xs text-sub">
              Length {fmtTime(Math.min(len, maxLen))}
              <input type="range" min={5} max={maxLen} step={1} value={Math.min(len, maxLen)} onChange={(e) => setLen(Number(e.target.value))} className="vol mt-1 w-full" />
            </label>
          </div>
        )}
        {rec ? (
          <button onClick={() => stopRef.current?.()} className="flex w-full items-center justify-center gap-2 rounded-full bg-dnd py-3 font-bold text-white">
            <Square className="size-4 fill-current" /> Stop · {Math.round(rec.progress * 100)}%
          </button>
        ) : (
          <button disabled={!audio} onClick={() => void record()} className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 font-bold text-white disabled:opacity-50">
            <Clapperboard className="size-5" /> Render video ({fmtTime(Math.min(len, maxLen))})
          </button>
        )}
        <p className="text-xs text-sub">Renders in real time on your device (keep this tab open). MP4 on Chrome/Edge/Safari, WebM on Firefox.</p>
        {result && (
          <div className="space-y-2 rounded-2xl bg-side p-3">
            <video src={result.url} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => download(result.blob, `${(title || "visualizer").replace(/[^\w\- ]+/g, "")}.${result.ext}`)} className="flex items-center gap-1.5 rounded-full bg-txt px-4 py-2 text-sm font-bold text-chat">
                <Download className="size-4" /> Download .{result.ext}
              </button>
              {aspect === "9:16" && len <= 180 && (
                <button disabled={posting} onClick={() => void postShort()} className="rounded-full bg-gradient-to-r from-[#ff2bd6] to-[#8b5cff] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {posting ? "Posting…" : "Post as NexusGram Short"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <canvas ref={canvas} className={cn("mx-auto w-full rounded-2xl bg-black shadow-xl", aspect === "9:16" ? "max-w-[300px]" : aspect === "1:1" ? "max-w-[360px]" : "")} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", on ? "bg-accent text-white" : "bg-hover hover:bg-active")}>
      {children}
    </button>
  );
}

function drawFrame(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  freq: Uint8Array,
  wave: Uint8Array,
  t: number,
  o: { title: string; artist: string; style: Style; color: string; img: HTMLImageElement | null; aspect: Aspect },
  progress: number,
) {
  const bass = freq.slice(2, 12).reduce((a, b) => a + b, 0) / (10 * 255);
  const m = Math.min(W, H);
  // background: blurred cover or gradient
  g.save();
  if (o.img) {
    const s = Math.max(W / o.img.width, H / o.img.height) * 1.15;
    g.filter = "blur(40px) brightness(0.45) saturate(1.3)";
    g.drawImage(o.img, (W - o.img.width * s) / 2, (H - o.img.height * s) / 2, o.img.width * s, o.img.height * s);
    g.filter = "none";
  } else {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, "#0b0618");
    gr.addColorStop(1, "#1a0b33");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  g.fillStyle = "rgba(0,0,0,.25)";
  g.fillRect(0, 0, W, H);
  g.restore();

  const cx = W / 2;
  const cy = o.aspect === "16:9" ? H * 0.45 : H * 0.42;
  const art = m * (o.aspect === "16:9" ? 0.42 : 0.5) * (1 + bass * 0.06);

  // glow
  const glow = g.createRadialGradient(cx, cy, art * 0.3, cx, cy, art * (1.2 + bass * 0.6));
  glow.addColorStop(0, o.color + "88");
  glow.addColorStop(1, o.color + "00");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // visualizer
  g.strokeStyle = o.color;
  g.fillStyle = o.color;
  g.lineCap = "round";
  if (o.style === "circle") {
    const n = 120;
    const r0 = art * 0.62;
    for (let i = 0; i < n; i++) {
      const v = freq[Math.floor((i < n / 2 ? i : n - i) * 2.2) + 2] / 255;
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const len = 6 + v * art * 0.45;
      g.lineWidth = Math.max(2, (m / 720) * 4);
      g.globalAlpha = 0.55 + v * 0.45;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (o.style === "bars") {
    const n = 64;
    const bw = W / n;
    const base = H * (o.aspect === "16:9" ? 0.92 : 0.86);
    for (let i = 0; i < n; i++) {
      const v = freq[Math.floor(Math.pow(i / n, 1.6) * 420) + 2] / 255;
      const h = 4 + v * H * 0.22;
      g.globalAlpha = 0.5 + v * 0.5;
      g.fillRect(i * bw + bw * 0.15, base - h, bw * 0.7, h);
      g.globalAlpha = 0.18;
      g.fillRect(i * bw + bw * 0.15, base + 4, bw * 0.7, h * 0.35);
    }
    g.globalAlpha = 1;
  } else if (o.style === "wave") {
    const y0 = H * (o.aspect === "16:9" ? 0.88 : 0.84);
    g.lineWidth = Math.max(3, m / 200);
    g.shadowColor = o.color;
    g.shadowBlur = 20;
    g.beginPath();
    for (let i = 0; i < wave.length; i += 4) {
      const x = (i / wave.length) * W;
      const y = y0 + ((wave[i] - 128) / 128) * H * 0.12;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    g.shadowBlur = 0;
  } else {
    for (let k = 3; k >= 1; k--) {
      g.globalAlpha = 0.12 * k;
      g.beginPath();
      g.arc(cx, cy, art * (0.55 + k * 0.12 + bass * 0.25 * k), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // cover art
  g.save();
  const s = art;
  const x = cx - s / 2,
    y = cy - s / 2;
  g.shadowColor = "rgba(0,0,0,.6)";
  g.shadowBlur = 40;
  g.beginPath();
  if (o.style === "circle") g.arc(cx, cy, s / 2, 0, Math.PI * 2);
  else g.roundRect(x, y, s, s, s * 0.06);
  g.fillStyle = "#111";
  g.fill();
  g.shadowBlur = 0;
  g.clip();
  if (o.img) {
    const sc = Math.max(s / o.img.width, s / o.img.height);
    if (o.style === "circle") {
      g.translate(cx, cy);
      g.rotate(t * 0.25);
      g.drawImage(o.img, (-o.img.width * sc) / 2, (-o.img.height * sc) / 2, o.img.width * sc, o.img.height * sc);
    } else g.drawImage(o.img, cx - (o.img.width * sc) / 2, cy - (o.img.height * sc) / 2, o.img.width * sc, o.img.height * sc);
  } else {
    const gr = g.createLinearGradient(x, y, x + s, y + s);
    gr.addColorStop(0, o.color);
    gr.addColorStop(1, "#111");
    g.fillStyle = gr;
    g.fillRect(x, y, s, s);
    g.fillStyle = "rgba(255,255,255,.85)";
    g.font = `900 ${s * 0.3}px system-ui`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("♪", cx, cy);
  }
  g.restore();

  // text
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#fff";
  const ty = cy + art / 2 + m * (o.style === "circle" ? 0.2 : 0.11);
  g.font = `800 ${Math.round(m * 0.055)}px system-ui, -apple-system, sans-serif`;
  g.fillText(o.title || "Untitled", cx, ty, W * 0.9);
  g.fillStyle = "rgba(255,255,255,.75)";
  g.font = `600 ${Math.round(m * 0.036)}px system-ui, -apple-system, sans-serif`;
  if (o.artist) g.fillText(o.artist, cx, ty + m * 0.055, W * 0.9);
  // progress
  const pw = W * 0.7,
    px = (W - pw) / 2,
    py = H * (o.aspect === "16:9" ? 0.965 : 0.94);
  g.fillStyle = "rgba(255,255,255,.2)";
  g.fillRect(px, py, pw, 4);
  g.fillStyle = "#fff";
  g.fillRect(px, py, pw * progress, 4);
}
