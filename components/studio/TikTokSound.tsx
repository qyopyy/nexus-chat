"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Music, Pause, Play, Sparkles, Upload } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useStudio } from "@/store/studio";
import { audioCtx, decodeFile } from "@/lib/audio";
import { listWorks, vaultUrl, type ShieldWork } from "@/lib/shield";
import { MAX_SECONDS, uploadSound } from "@/lib/soundboard";
import { findHook, handoffText, peaksOf, renderClip, safeFile, wavBytes } from "@/lib/tiktokSound";
import { cn } from "@/lib/utils";
import { Card, H } from "./Studio";

const BINS = 400;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Src = { name: string; buf: AudioBuffer; peaks: number[]; isrc?: string | null; artist?: string | null; title?: string };

export default function TikTokSound() {
  const me = useApp((s) => s.userId);
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "");
  const [src, setSrc] = useState<Src | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [works, setWorks] = useState<ShieldWork[]>([]);
  const [start, setStart] = useState(0);
  const [len, setLen] = useState(30);
  const [name, setName] = useState("");
  const [artist, setArtist] = useState("");
  const [emoji, setEmoji] = useState("🎵");
  const [fadeIn, setFadeIn] = useState(0.3);
  const [fadeOut, setFadeOut] = useState(1);
  const [normalize, setNormalize] = useState(true);
  const [playing, setPlaying] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const node = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    void listWorks().then((w) => setWorks(w.filter((x) => x.owner_id === me && x.file_path)));
  }, [me]);

  const total = src?.buf.duration ?? 0;
  const L = Math.min(len, total || len);
  const S = Math.max(0, Math.min(start, Math.max(0, total - L)));

  const stop = useCallback(() => {
    try {
      node.current?.stop();
    } catch {
      /* already stopped */
    }
    node.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);

  const load = async (blob: Blob, label: string, extra?: Partial<Src>) => {
    stop();
    setBusy("Reading audio…");
    try {
      const buf = await decodeFile(blob);
      const peaks = peaksOf(buf.getChannelData(0), BINS);
      const s: Src = { name: label, buf, peaks, ...extra };
      setSrc(s);
      const l = Math.min(30, buf.duration);
      setLen(l);
      setStart(findHook(buf.getChannelData(0), buf.sampleRate, l));
      setName((n) => n || (extra?.title ?? label).slice(0, 100));
      setArtist((a) => a || extra?.artist || myName);
    } catch (e) {
      toast(`Couldn't read that audio: ${(e as Error).message}`, "error");
    }
    setBusy(null);
  };

  const fromFile = (f: File | undefined) => {
    if (!f) return;
    void load(f, f.name.replace(/\.[^.]+$/, "").replace(/_+/g, " "));
  };
  const fromWork = async (w: ShieldWork) => {
    setBusy("Opening your vault copy…");
    const url = await vaultUrl(w);
    if (!url) {
      setBusy(null);
      return toast("Couldn't open that vault file", "error");
    }
    try {
      const blob = await (await fetch(url)).blob();
      await load(blob, w.title, { isrc: w.isrc, artist: w.artist, title: w.title });
    } catch {
      toast("Download from the vault failed", "error");
      setBusy(null);
    }
  };

  const clip = useCallback(() => {
    if (!src) return null;
    const chs = Array.from({ length: Math.min(2, src.buf.numberOfChannels) }, (_, k) => src.buf.getChannelData(k));
    return renderClip(chs, src.buf.sampleRate, S, L, { fadeIn, fadeOut, normalize });
  }, [src, S, L, fadeIn, fadeOut, normalize]);

  const toBuffer = (chs: Float32Array[], rate: number) => {
    const b = audioCtx().createBuffer(chs.length, Math.max(1, chs[0].length), rate);
    chs.forEach((c, k) => b.copyToChannel(c as Float32Array<ArrayBuffer>, k));
    return b;
  };

  const preview = async () => {
    if (playing) return stop();
    const c = clip();
    if (!c || !src) return;
    const ctx = audioCtx();
    await ctx.resume().catch(() => null);
    const s = ctx.createBufferSource();
    s.buffer = toBuffer(c, src.buf.sampleRate);
    s.connect(ctx.destination);
    s.onended = () => setPlaying(false);
    s.start();
    node.current = s;
    setPlaying(true);
  };

  const wavFile = () => {
    const c = clip();
    if (!c || !src) return null;
    return { bytes: wavBytes(c, src.buf.sampleRate), chs: c };
  };

  const download = () => {
    const w = wavFile();
    if (!w) return;
    const url = URL.createObjectURL(new Blob([w.bytes.buffer as ArrayBuffer], { type: "audio/wav" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFile(name)}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast("Saved — upload it with a video on TikTok, or release it through distribution", "success");
  };

  const addToNexus = async () => {
    const w = wavFile();
    if (!w || !src) return;
    if (L > MAX_SECONDS + 0.4) return toast(`Nexus Sounds clips are up to ${MAX_SECONDS}s — shorten the clip`, "error");
    setBusy("Adding to your Nexus sounds…");
    try {
      const file = new File([w.bytes.buffer as ArrayBuffer], `${safeFile(name)}.wav`, { type: "audio/wav" });
      await uploadSound(file, { name: name.trim().slice(0, 32) || "Sound", emoji, volume: 1 }, toBuffer(w.chs, src.buf.sampleRate));
      toast(`“${name.trim().slice(0, 32)}” is in your Nexus sounds`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  const info = useMemo(() => handoffText({ name, artist, isrc: src?.isrc, seconds: L }), [name, artist, src?.isrc, L]);

  // waveform
  useEffect(() => {
    const c = cv.current;
    if (!c || !src) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const x0 = (S / total) * w;
    const x1 = ((S + L) / total) * w;
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.fillRect(x0, 0, x1 - x0, h);
    const bw = w / BINS;
    src.peaks.forEach((p, i) => {
      const x = i * bw;
      const inside = x >= x0 - 1 && x <= x1;
      g.fillStyle = inside ? "#25f4ee" : "rgba(255,255,255,0.28)";
      const bh = Math.max(2, p * (h - 6));
      g.fillRect(x, (h - bh) / 2, Math.max(1, bw - 1), bh);
    });
    g.fillStyle = "#fe2c55";
    g.fillRect(x0, 0, 2, h);
    g.fillRect(x1 - 2, 0, 2, h);
  }, [src, S, L, total]);

  const drag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!src || (e.type === "pointermove" && e.buttons === 0)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * total - L / 2;
    setStart(Math.max(0, Math.min(total - L, t)));
  };

  const label = "block text-xs font-semibold text-sub mb-1";
  const inp = "w-full rounded-lg border border-line bg-transparent px-2.5 py-2 text-sm outline-none focus:border-accent";

  return (
    <>
      <H>TikTok sounds</H>
      <div className="mb-4 overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg,#010101,#1b1b2f 55%,#fe2c55)" }}>
        <div className="text-xs font-bold tracking-widest text-white/70 uppercase">Sound studio</div>
        <div className="mt-1 text-2xl font-black sm:text-3xl">Turn a song into a TikTok sound</div>
        <p className="mt-1 max-w-2xl text-sm text-white/80">Pick the hook, name it, polish it, then add it to your Nexus sounds or take the TikTok-ready file straight to TikTok or your distributor.</p>
      </div>

      {!src ? (
        <Card title="1 · Choose the song">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              fromFile(e.dataTransfer.files[0]);
            }}
            onClick={() => pick.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line p-6 text-center hover:border-accent/60"
          >
            <Upload className="size-7 text-sub" />
            <div className="font-semibold">Drop a song or tap to choose</div>
            <div className="text-xs text-sub">WAV, MP3, M4A, FLAC</div>
            <input ref={pick} type="file" accept="audio/*,.wav,.flac,.mp3,.m4a,.aiff" hidden onChange={(e) => (fromFile(e.target.files?.[0]), (e.target.value = ""))} />
          </div>
          {works.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold text-sub">…or one of your protected songs (from your private vault)</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {works.slice(0, 12).map((w) => (
                  <button key={w.id} disabled={!!busy} onClick={() => void fromWork(w)} className="flex min-w-0 items-center gap-2 rounded-xl bg-black/20 p-2.5 text-left hover:bg-hover disabled:opacity-50">
                    <Music className="size-4 shrink-0 text-sub" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{w.title}</span>
                    <span className="shrink-0 text-xs text-sub">{w.duration ? fmt(w.duration) : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {busy && <p className="mt-3 text-sm text-sub">{busy}</p>}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <Card title="2 · Pick the part" right={<button onClick={() => (stop(), setSrc(null))} className="rounded-full bg-hover px-3 py-1 text-xs font-semibold">Change song</button>}>
              <div className="mb-2 truncate text-sm text-sub">{src.name} · {fmt(total)}</div>
              <canvas ref={cv} onPointerDown={drag} onPointerMove={drag} className="h-24 w-full touch-none rounded-xl bg-black/25" aria-label="Waveform — drag to move the clip" />
              <div className="mt-1 flex justify-between text-xs text-sub">
                <span>{fmt(S)}</span>
                <span className="font-semibold text-txt">{L.toFixed(1)}s clip</span>
                <span>{fmt(S + L)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="min-w-0">
                  <span className={label}>Start · {fmt(S)}</span>
                  <input type="range" min={0} max={Math.max(0, total - L)} step={0.1} value={S} onChange={(e) => setStart(Number(e.target.value))} className="w-full" />
                </label>
                <label className="min-w-0">
                  <span className={label}>Length · {L.toFixed(0)}s</span>
                  <input type="range" min={5} max={Math.min(60, Math.floor(total))} step={1} value={L} onChange={(e) => setLen(Number(e.target.value))} className="w-full" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[15, 30, 60].map((n) => (
                  <button key={n} onClick={() => setLen(Math.min(n, Math.floor(total)))} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", Math.round(L) === n ? "bg-accent text-white" : "bg-hover")}>
                    {n}s
                  </button>
                ))}
                <button onClick={() => setStart(findHook(src.buf.getChannelData(0), src.buf.sampleRate, L))} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-bold">
                  <Sparkles className="size-3.5" /> Find the hook
                </button>
                <button onClick={() => void preview()} className="ml-auto flex items-center gap-1.5 rounded-full bg-[#fe2c55] px-4 py-1.5 text-sm font-bold text-white">
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />} {playing ? "Stop" : "Preview"}
                </button>
              </div>
            </Card>

            <Card title="3 · Name & polish">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5rem]">
                <label className="min-w-0">
                  <span className={label}>Sound name</span>
                  <input className={inp} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Moon (slowed hook)" />
                </label>
                <label>
                  <span className={label}>Emoji</span>
                  <input className={inp} value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} />
                </label>
                <label className="min-w-0 sm:col-span-2">
                  <span className={label}>Artist shown</span>
                  <input className={inp} value={artist} maxLength={100} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
                </label>
                <label className="min-w-0">
                  <span className={label}>Fade in · {fadeIn.toFixed(1)}s</span>
                  <input type="range" min={0} max={3} step={0.1} value={fadeIn} onChange={(e) => setFadeIn(Number(e.target.value))} className="w-full" />
                </label>
                <label className="min-w-0">
                  <span className={label}>Fade out · {fadeOut.toFixed(1)}s</span>
                  <input type="range" min={0} max={5} step={0.1} value={fadeOut} onChange={(e) => setFadeOut(Number(e.target.value))} className="w-full" />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} className="size-4" /> Make it loud &amp; even (normalise to −1 dB)
                </label>
              </div>
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <Card title="4 · Add it">
              <div className="space-y-2">
                <button disabled={!!busy || !name.trim()} onClick={() => void addToNexus()} className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
                  <Music className="size-4" /> {busy ?? "Add to my Nexus sounds"}
                </button>
                {L > MAX_SECONDS + 0.4 && <p className="text-xs text-dnd">Nexus sounds are up to {MAX_SECONDS}s — pick a shorter clip for this one.</p>}
                <button disabled={!name.trim()} onClick={download} className="flex w-full items-center justify-center gap-2 rounded-full bg-hover py-2.5 font-bold disabled:opacity-50">
                  <Download className="size-4" /> Download TikTok-ready audio (WAV)
                </button>
              </div>
            </Card>

            <Card title="Put it in TikTok's library">
              <p className="mb-2 text-sm text-sub">TikTok has no public upload API, so a sound only reaches its library through one of these routes:</p>
              <ol className="space-y-2 text-sm">
                <li className="rounded-lg bg-black/20 p-2.5">
                  <b>1 · Post it yourself.</b> Upload a video with this audio on TikTok — it appears as a reusable sound with your title (rename it in TikTok → Edit sound).
                  <a href="https://www.tiktok.com/upload" target="_blank" rel="noreferrer" className="mt-1.5 flex w-fit items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs font-semibold">
                    <ExternalLink className="size-3.5" /> Open TikTok upload
                  </a>
                </li>
                <li className="rounded-lg bg-black/20 p-2.5">
                  <b>2 · Release it.</b> Send it as a single through Nexus distribution with TikTok selected — it lands in the TikTok sound library with official metadata.
                  <button onClick={() => useStudio.setState({ section: "releases", releaseId: "new" })} className="mt-1.5 flex items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs font-semibold">
                    <Disc3Icon /> New release
                  </button>
                </li>
              </ol>
              <pre className="mt-3 max-w-full overflow-x-auto rounded-lg bg-black/30 p-2.5 text-xs whitespace-pre-wrap">{info}</pre>
              <button
                onClick={() => void navigator.clipboard.writeText(info).then(() => toast("Details copied", "success"))}
                className="mt-2 flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold"
              >
                <Copy className="size-3.5" /> Copy details
              </button>
              <p className="mt-3 text-xs text-faint">Tip: for a vertical video with your cover art, use Music tools → Visualizer video, then post that on TikTok.</p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Disc3Icon() {
  return <span aria-hidden>💿</span>;
}
