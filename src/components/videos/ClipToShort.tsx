"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Scissors, X } from "lucide-react";
import { toast } from "@/store/app";
import { playbackUrl } from "@/lib/videos";
import { createPost, uploadMedia } from "@/lib/gram";
import { download } from "@/lib/dsp";
import { fmtTime } from "@/lib/audio";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

const MIMES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];

/** cut a vertical 9:16 Short out of your own video → post to NexusGram or download */
export default function ClipToShort({ v, onClose }: { v: Video; onClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [start, setStart] = useState(0);
  const [len, setLen] = useState(30);
  const [mode, setMode] = useState<"fill" | "fit">("fill");
  const [caption, setCaption] = useState(v.title.slice(0, 120));
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ blob: Blob; url: string; ext: string } | null>(null);

  useEffect(() => void playbackUrl(v).then(setSrc), [v]);

  const draw = (g: CanvasRenderingContext2D, el: HTMLVideoElement) => {
    const W = 720,
      H = 1280;
    const vw = el.videoWidth || 16,
      vh = el.videoHeight || 9;
    if (mode === "fill") {
      const s = Math.max(W / vw, H / vh);
      g.drawImage(el, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
    } else {
      const sb = Math.max(W / vw, H / vh);
      g.filter = "blur(28px) brightness(0.5)";
      g.drawImage(el, (W - vw * sb) / 2, (H - vh * sb) / 2, vw * sb, vh * sb);
      g.filter = "none";
      const s = Math.min(W / vw, H / vh);
      g.drawImage(el, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
    }
  };
  // live preview of the framing
  useEffect(() => {
    const el = vid.current,
      cv = canvas.current;
    if (!el || !cv || busy) return;
    cv.width = 720;
    cv.height = 1280;
    const g = cv.getContext("2d")!;
    const paint = () => el.readyState >= 2 && draw(g, el);
    el.addEventListener("seeked", paint);
    el.addEventListener("loadeddata", paint);
    paint();
    return () => {
      el.removeEventListener("seeked", paint);
      el.removeEventListener("loadeddata", paint);
    };
  }, [mode, src, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (vid.current && !busy) vid.current.currentTime = start;
  }, [start, busy]);

  const render = async () => {
    const el = vid.current,
      cv = canvas.current;
    if (!el || !cv) return;
    if (typeof MediaRecorder === "undefined") return toast("Your browser can't record video", "error");
    setOut(null);
    setBusy("Rendering 0%");
    const g = cv.getContext("2d")!;
    const ac = new AudioContext();
    let stream: MediaStream;
    try {
      const node = ac.createMediaElementSource(el);
      const dest = ac.createMediaStreamDestination();
      node.connect(dest);
      stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    } catch {
      setBusy(null);
      return toast("This video's file can't be re-encoded in the browser", "error");
    }
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const end = Math.min(dur, start + len);
    el.currentTime = start;
    await new Promise((r) => el.addEventListener("seeked", r, { once: true }));
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      el.pause();
      if (mr.state !== "inactive") mr.stop();
    };
    const loop = () => {
      draw(g, el);
      setBusy(`Rendering ${Math.round(((el.currentTime - start) / (end - start)) * 100)}%`);
      if (el.currentTime >= end || el.ended) return stop();
      raf = requestAnimationFrame(loop);
    };
    mr.onstop = () => {
      void ac.close();
      const type = mr.mimeType || mime || "video/webm";
      const blob = new Blob(chunks, { type });
      setOut({ blob, url: URL.createObjectURL(blob), ext: type.includes("mp4") ? "mp4" : "webm" });
      setBusy(null);
    };
    mr.start(250);
    el.muted = false;
    await el.play();
    loop();
  };

  const post = async () => {
    if (!out) return;
    setBusy("Uploading…");
    try {
      const media = await uploadMedia(new File([out.blob], `short.${out.ext}`, { type: out.blob.type }));
      await createPost("short", [media], caption);
      toast("Your Short is live on NexusGram", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  const maxLen = Math.max(3, Math.min(60, Math.floor(dur - start)));
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center" onClick={() => !busy && onClose()}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-chat p-4 pb-safe-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Scissors className="size-5 text-accent" />
          <span className="flex-1 text-lg font-bold">Make a Short</span>
          <button onClick={onClose} disabled={!!busy} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <canvas ref={canvas} className="mx-auto aspect-[9/16] w-[200px] rounded-2xl bg-black sm:w-full" />
          <div className="space-y-3">
            {src && <video ref={vid} src={src} crossOrigin="anonymous" playsInline preload="auto" className="hidden" onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onError={() => toast("This video can't be loaded for editing", "error")} />}
            {!dur ? (
              <p className="text-sm text-sub">Loading video…</p>
            ) : (
              <>
                <label className="block text-xs text-sub">
                  Start {fmtTime(start)}
                  <input type="range" min={0} max={Math.max(0, dur - 3)} step={0.1} value={start} onChange={(e) => setStart(Number(e.target.value))} disabled={!!busy} className="vol mt-1 w-full" />
                </label>
                <label className="block text-xs text-sub">
                  Length {fmtTime(Math.min(len, maxLen))} (max 60 s)
                  <input type="range" min={3} max={maxLen} step={1} value={Math.min(len, maxLen)} onChange={(e) => setLen(Number(e.target.value))} disabled={!!busy} className="vol mt-1 w-full" />
                </label>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["fill", "Fill (crop)"],
                      ["fit", "Fit (blurred bars)"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} onClick={() => setMode(k)} disabled={!!busy} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", mode === k ? "bg-accent text-white" : "bg-hover")}>
                      {l}
                    </button>
                  ))}
                </div>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Caption" className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
                {!out ? (
                  <button disabled={!!busy} onClick={() => void render()} className="w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-60">
                    {busy ?? "Render Short"}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <video src={out.url} controls playsInline className="mx-auto max-h-72 rounded-xl bg-black" />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={!!busy} onClick={() => void post()} className="flex-1 rounded-full bg-gradient-to-r from-[#ff2bd6] to-[#8b5cff] py-2.5 font-bold text-white disabled:opacity-60">
                        {busy ?? "Post to NexusGram"}
                      </button>
                      <button onClick={() => download(out.blob, `short.${out.ext}`)} className="flex items-center gap-1.5 rounded-full bg-hover px-4 font-semibold">
                        <Download className="size-4" /> Save
                      </button>
                      <button onClick={() => setOut(null)} className="rounded-full bg-hover px-4 font-semibold">
                        Redo
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-sub">Renders in real time — a 30-second Short takes 30 seconds.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
