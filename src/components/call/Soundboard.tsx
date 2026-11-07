"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Plus, Square, Upload, Volume2, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { playSound, stopSounds, updateSettings, useCall } from "@/lib/call";
import { BUILTINS, MAX_BYTES, MAX_SECONDS, decodeFile, deleteSound, loadMySounds, loadPinnedSounds, togglePinnedSound, uploadSound, useSounds, type Sound } from "@/lib/soundboard";
import { cn } from "@/lib/utils";

const EMOJIS = ["🔊", "😂", "🔥", "💀", "🎉", "👏", "😱", "🤣", "🥁", "📯", "🐐", "💯", "😎", "🤡", "👀", "🚨", "🎵", "💥", "🫡", "😭"];

/** the soundboard grid — click a sound and everyone in the call hears it */
export function SoundboardPanel({ onClose, className }: { onClose?: () => void; className?: string }) {
  const mine = useSounds((s) => s.mine);
  const vol = useCall((s) => s.settings.soundboardVolume);
  const inCall = useCall((s) => s.status !== "idle");
  const [upload, setUpload] = useState(false);
  const [edit, setEdit] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>(() => loadPinnedSounds());
  useEffect(() => void loadMySounds(), []);

  const fire = (s: Sound) => {
    setFlash(s.id);
    setTimeout(() => setFlash((f) => (f === s.id ? null : f)), 350);
    void playSound(s);
  };
  const tile = (s: Sound, own: boolean) => (
    <div key={s.id} className="relative">
      <button
        onClick={() => fire(s)}
        title={`${s.name} · ${s.duration.toFixed(1)}s`}
        className={cn(
          "flex h-[54px] w-full items-center gap-1.5 rounded-xl px-2.5 text-left text-[13px] font-semibold transition active:scale-95",
          flash === s.id ? "bg-accent text-white" : "bg-white/[.07] hover:bg-white/[.13]",
        )}
      >
        <span className="text-xl leading-none">{s.emoji}</span>
        <span className="line-clamp-2 min-w-0 leading-tight">{s.name}</span>
      </button>
      <button
        type="button"
        title={pins.includes(s.id) ? "Unpin from call bar" : "Pin to call bar (max 3)"}
        onClick={() => setPins(togglePinnedSound(s.id))}
        className={cn(
          "absolute -bottom-1.5 -left-1.5 grid size-6 place-items-center rounded-full text-[10px] font-black shadow",
          pins.includes(s.id) ? "bg-accent text-white" : "bg-[#2b2d31] text-white/70 ring-1 ring-white/15",
        )}
      >
        {pins.includes(s.id) ? "★" : "☆"}
      </button>
      {own && edit && (
        <button
          onClick={() => confirm(`Delete “${s.name}”?`) && void deleteSound(s)}
          className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-dnd text-white shadow"
          aria-label={`Delete ${s.name}`}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className={cn("w-[340px] max-w-[94vw] rounded-2xl bg-menu p-3 text-txt shadow-2xl ring-1 ring-white/10", className)} onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 font-bold">Soundboard</span>
        <button onClick={stopSounds} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/15" title="Stop your sounds for everyone">
          <Square className="size-3 fill-current" /> Stop
        </button>
        {onClose && (
          <button onClick={onClose} className="grid size-7 place-items-center rounded-full hover:bg-white/10" aria-label="Close soundboard">
            <X className="size-4" />
          </button>
        )}
      </div>
      {!inCall && <p className="mb-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-sub">Not in a call — sounds only play for you (preview).</p>}

      <div className="max-h-[46vh] overflow-y-auto pr-0.5">
        <div className="mb-1 flex items-center text-[11px] font-bold tracking-wide text-sub uppercase">
          <span className="flex-1">Your sounds</span>
          {!!mine?.length && (
            <button onClick={() => setEdit(!edit)} className="normal-case hover:text-txt">
              {edit ? "Done" : "Edit"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(mine ?? []).map((s) => tile(s, true))}
          <button onClick={() => setUpload(true)} className="flex h-[54px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/15 text-xs font-semibold text-sub hover:border-accent hover:text-txt">
            <Plus className="size-4" /> Upload
          </button>
        </div>
        <div className="mt-3 mb-1 text-[11px] font-bold tracking-wide text-sub uppercase">Nexus sounds</div>
        <div className="grid grid-cols-3 gap-1.5">{BUILTINS.map((s) => tile(s, false))}</div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2.5">
        <Volume2 className="size-4 shrink-0 text-sub" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={vol}
          onChange={(e) => void updateSettings({ soundboardVolume: Number(e.target.value) })}
          className="vol flex-1"
          style={{ ["--fill" as string]: `${vol * 100}%` }}
          aria-label="Soundboard volume"
        />
        <span className="w-9 text-right text-xs text-sub tabular-nums">{Math.round(vol * 100)}%</span>
      </div>
      {upload && <UploadSound onClose={() => setUpload(false)} />}
    </div>
  );
}

/** pick a file → check it → (trim to 30 s) → name + emoji → upload */
function UploadSound({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🔊");
  const [volume, setVolume] = useState(1);
  const [start, setStart] = useState(0);
  const [len, setLen] = useState(MAX_SECONDS);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const prev = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null);

  const stopPreview = () => {
    try {
      prev.current?.src.stop();
    } catch {
      /* done */
    }
    void prev.current?.ctx.close();
    prev.current = null;
    setPlaying(false);
  };
  useEffect(() => stopPreview, []);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return toast("Max file size is 1 GB", "error");
    if (!f.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(f.name)) return toast("Pick an audio file", "error");
    setBusy("Reading…");
    try {
      const b = await decodeFile(f);
      setFile(f);
      setBuf(b);
      setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 32));
      setStart(0);
      setLen(Math.min(MAX_SECONDS, b.duration));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  const preview = () => {
    if (playing) return stopPreview();
    if (!buf) return;
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.start(0, start, len);
    src.onended = () => stopPreview();
    prev.current = { ctx, src };
    setPlaying(true);
  };

  const save = async () => {
    if (!file || !buf) return;
    stopPreview();
    setBusy("Uploading…");
    try {
      const long = buf.duration > MAX_SECONDS + 0.4;
      await uploadSound(file, { name, emoji, volume }, buf, long || start > 0 || len < buf.duration - 0.05 ? [start, len] : undefined);
      toast(`“${name || "Sound"}” added to your soundboard`, "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  const long = !!buf && buf.duration > MAX_SECONDS;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}${s < 60 ? `.${Math.floor((s % 1) * 10)}` : ""}`;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-t-3xl bg-chat p-5 pb-safe-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <span className="flex-1 text-lg font-bold">Add a sound</span>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <input ref={pick} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus" hidden onChange={(e) => (void choose(e.target.files?.[0]), (e.target.value = ""))} />
        {!buf ? (
          <button
            onClick={() => pick.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => (e.preventDefault(), void choose(e.dataTransfer.files[0]))}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line py-10 text-sub hover:border-accent hover:text-txt"
          >
            <Upload className="size-9" />
            <span className="font-semibold">{busy ?? "Choose an audio file"}</span>
            <span className="text-xs">MP3, WAV, OGG, M4A, FLAC · up to 1 GB · max 30 seconds</span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-hover p-3">
              <button onClick={preview} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white" aria-label={playing ? "Stop preview" : "Play preview"}>
                {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
              </button>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-semibold">{file?.name}</div>
                <div className="text-xs text-sub">
                  {fmt(buf.duration)} · {((file?.size ?? 0) / 1048576).toFixed(1)} MB
                </div>
              </div>
              <button onClick={() => (stopPreview(), setBuf(null), setFile(null))} className="text-xs text-sub hover:text-txt">
                Change
              </button>
            </div>

            {long && <p className="rounded-lg bg-[#f0b232]/15 px-3 py-2 text-xs text-[#f0b232]">This file is {fmt(buf.duration)} long — pick the 30 seconds you want.</p>}
            <div>
              <div className="mb-1 flex justify-between text-xs text-sub">
                <span>Start {fmt(start)}</span>
                <span>
                  Clip {fmt(len)} · ends {fmt(Math.min(buf.duration, start + len))}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, buf.duration - 0.2)}
                step={0.05}
                value={start}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setStart(v);
                  setLen((l) => Math.min(l, MAX_SECONDS, buf.duration - v));
                }}
                className="vol w-full"
                style={{ ["--fill" as string]: `${(start / Math.max(0.1, buf.duration)) * 100}%` }}
                aria-label="Clip start"
              />
              <input
                type="range"
                min={0.3}
                max={Math.min(MAX_SECONDS, buf.duration - start)}
                step={0.05}
                value={len}
                onChange={(e) => setLen(Number(e.target.value))}
                className="vol mt-2 w-full"
                style={{ ["--fill" as string]: `${(len / Math.min(MAX_SECONDS, Math.max(0.3, buf.duration - start))) * 100}%` }}
                aria-label="Clip length"
              />
            </div>

            <div className="flex gap-2">
              <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Sound name" className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => setEmoji(e)} className={cn("grid size-9 place-items-center rounded-lg text-lg", emoji === e ? "bg-accent/30 ring-2 ring-accent" : "hover:bg-hover")}>
                  {e}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-16 text-sub">Volume</span>
              <input type="range" min={0.05} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="vol flex-1" style={{ ["--fill" as string]: `${volume * 100}%` }} />
              <span className="w-10 text-right text-xs text-sub">{Math.round(volume * 100)}%</span>
            </label>
            <button disabled={!!busy || !name.trim()} onClick={() => void save()} className="w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
              {busy ?? "Add to soundboard"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "🔊 Name played Airhorn" bubble over the call */
export function SoundToast() {
  const t = useCall((s) => s.soundToast);
  const who = useApp((s) => (t ? s.profiles[t.from] : undefined));
  const meId = useApp((s) => s.userId);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!t) return;
    setShow(true);
    const id = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(id);
  }, [t]);
  if (!t || !show) return null;
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-30 flex -translate-x-1/2 animate-pop items-center gap-2 rounded-full bg-black/70 px-3.5 py-1.5 text-sm text-white shadow-xl backdrop-blur">
      <span className="text-lg">{t.emoji}</span>
      <span>
        <b>{t.from === meId ? "You" : (who?.display_name ?? "Someone")}</b> played <b>{t.name}</b>
      </span>
    </div>
  );
}

/** call-bar button + popover */
export function SoundboardButton({ className, mobile }: { className?: string; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <div className={cn("relative", className)}>
      {mobile ? (
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1.5" aria-label="Soundboard">
          <span className={cn("grid size-[52px] place-items-center rounded-full active:scale-90", open ? "bg-white text-black" : "bg-white/15 text-white")}>
            <Volume2 className="size-6" />
          </span>
          <span className="text-[11px] font-medium text-white/80">Sounds</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          title="Soundboard"
          aria-label="Soundboard"
          className={cn("grid size-14 place-items-center rounded-full text-white transition", open ? "bg-accent" : "bg-[#2b2d31] hover:bg-[#3a3c42]")}
        >
          <SoundIcon />
        </button>
      )}
      {open &&
        (mobile ? (
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50" onClick={() => setOpen(false)}>
            <SoundboardPanel onClose={() => setOpen(false)} className="mb-safe-3 w-[min(420px,96vw)]" />
          </div>
        ) : (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <SoundboardPanel onClose={() => setOpen(false)} className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 animate-pop" />
          </>
        ))}
    </div>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <path d="M14.5 15.5h1.5l2.5-2v7l-2.5-2h-1.5z" fill="currentColor" stroke="none" />
      <path d="M20.5 15.2a2.8 2.8 0 0 1 0 3.6" />
    </svg>
  );
}

