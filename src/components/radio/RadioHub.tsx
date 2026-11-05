"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Headphones,
  Link2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Upload,
  Users,
  Volume2,
} from "lucide-react";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import { loadProfiles } from "@/lib/data";
import { INSTS, NOTES, hit, pctx, type Pattern } from "@/components/music/Tools2";
import {
  openRadio,
  radioAddUrl,
  radioExpectedPosition,
  radioNext,
  radioPlayTrack,
  radioPrev,
  radioRemove,
  radioSeek,
  radioTogglePlay,
  radioUpload,
  saveRadioJam,
  setRadioListening,
  setRadioVolume,
  useRadio,
  type RadioJam,
} from "@/lib/radio";

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

export default function RadioHub({ mobile }: { mobile?: boolean }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const tracks = useRadio((s) => s.tracks);
  const player = useRadio((s) => s.player);
  const jam = useRadio((s) => s.jam);
  const listening = useRadio((s) => s.listening);
  const volume = useRadio((s) => s.volume);
  const progress = useRadio((s) => s.progress);
  const duration = useRadio((s) => s.duration);
  const loading = useRadio((s) => s.loading);
  const listeners = useRadio((s) => s.listeners);
  const [uploading, setUploading] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [tab, setTab] = useState<"queue" | "jam">("queue");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    void openRadio();
  }, []);

  useEffect(() => {
    const ids = [...new Set([...tracks.map((t) => t.added_by), player?.updated_by].filter(Boolean) as string[])];
    if (ids.length) void loadProfiles(ids);
  }, [tracks, player?.updated_by]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const current = tracks.find((t) => t.id === player?.track_id);
  const pos = listening ? progress : radioExpectedPosition(player);
  const dur = listening ? duration : current?.duration ?? 0;
  const playing = !!player?.is_playing && !!current;

  const onFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|flac|m4a|aac|ogg|opus|webm)$/i.test(f.name));
    if (!list.length) return toast("Drop audio files (mp3, m4a, wav…)", "error");
    setUploading(true);
    try {
      for (const f of list) await radioUpload(f);
    } catch (e) {
      toast(String((e as Error)?.message ?? e), "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden text-white"
      style={{ background: "linear-gradient(165deg,#0a0614 0%,#160b28 40%,#0d1520 100%)" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void onFiles(e.dataTransfer.files);
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: "radial-gradient(ellipse at 70% 0%,rgba(255,45,214,0.18),transparent 45%), radial-gradient(ellipse at 10% 80%,rgba(56,189,248,0.12),transparent 40%)" }} />
      {dragOver && (
        <div className="pointer-events-none absolute inset-4 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-[#ff2bd6]/50 bg-black/50 text-sm font-semibold text-[#ff2bd6]">
          Drop songs onto Nexus Radio
        </div>
      )}

      <header className={cn("relative z-10 flex shrink-0 items-center gap-2 border-b border-white/5 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button
          onClick={() => useApp.setState(mobile ? { hub: null, mobileTab: "music" } : { hub: "music" })}
          className="grid size-9 place-items-center rounded-full hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Radio className="size-5 text-[#ff2bd6]" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold tracking-wide">Nexus Radio</div>
          <div className="truncate text-[11px] text-white/50">Everyone listens · anyone can add · jam live</div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/60">
          <Users className="size-3.5" />
          {listeners.length || (listening ? 1 : 0)}
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-36">
          {/* Now playing card */}
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className={cn("grid size-20 shrink-0 place-items-center rounded-2xl text-3xl", playing ? "bg-gradient-to-br from-[#ff2bd6] to-[#7c4dff]" : "bg-white/5")}>
                {playing ? (
                  <span className="eq-on flex h-6 items-end gap-1">
                    <span className="eq bg-white" />
                    <span className="eq bg-white" />
                    <span className="eq bg-white" />
                  </span>
                ) : (
                  "📻"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-[0.2em] text-[#ff2bd6]/80 uppercase">On air</div>
                <div className="mt-1 truncate text-xl font-bold">{current?.title ?? (tracks.length ? "Nothing playing" : "Queue is empty")}</div>
                <div className="truncate text-sm text-white/55">{current ? current.artist || "Added by the community" : "Upload or paste a song link to start"}</div>
                {current && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-white/45">
                    <Avatar userId={current.added_by} size={18} plain />
                    added by {profiles[current.added_by]?.username ? `@${profiles[current.added_by]!.username}` : "someone"}
                    {player?.updated_by && (
                      <>
                        <span>·</span>
                        <Avatar userId={player.updated_by} size={18} plain />
                        DJ {player.updated_by === me ? "you" : profiles[player.updated_by]?.username ?? "…"}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <input
                type="range"
                min={0}
                max={Math.max(1, dur || 1)}
                step={0.5}
                value={Math.min(pos, dur || pos)}
                onChange={(e) => radioSeek(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#ff2bd6]"
                aria-label="Seek"
              />
              <div className="mt-1 flex justify-between text-[11px] tabular-nums text-white/45">
                <span>{fmt(pos)}</span>
                <span>{dur ? fmt(dur) : loading ? "…" : "—"}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-3">
              <button onClick={() => radioPrev()} className="grid size-10 place-items-center rounded-full bg-white/5 hover:bg-white/10" aria-label="Previous">
                <SkipBack className="size-4 fill-current" />
              </button>
              <button
                onClick={() => {
                  if (!listening) setRadioListening(true);
                  radioTogglePlay();
                }}
                className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-[#ff2bd6] to-[#7c4dff] text-white shadow-lg shadow-[#ff2bd6]/25"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
              </button>
              <button onClick={() => void radioNext(false)} className="grid size-10 place-items-center rounded-full bg-white/5 hover:bg-white/10" aria-label="Next">
                <SkipForward className="size-4 fill-current" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!listening ? (
                <button onClick={() => setRadioListening(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-black">
                  <Headphones className="size-4" /> Tune in
                </button>
              ) : (
                <button onClick={() => setRadioListening(false)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70">
                  Tuned in · tap to mute
                </button>
              )}
              <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-white/60">
                <Volume2 className="size-3.5" />
                <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setRadioVolume(Number(e.target.value))} className="w-20 accent-[#ff2bd6]" />
              </label>
            </div>
          </div>

          {/* Listeners */}
          {listeners.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 text-[11px] font-semibold tracking-wide text-white/40 uppercase">Live</span>
              {listeners.map((l) => (
                <div key={l.id} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] py-1 pr-2.5 pl-1">
                  <Avatar userId={l.id} size={22} plain />
                  <span className="text-xs text-white/70">@{l.username}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add songs */}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#ff2bd6] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <Upload className="size-3.5" /> {uploading ? "Uploading…" : "Add songs"}
            </button>
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg" multiple className="hidden" onChange={(e) => { const f = e.target.files; e.target.value = ""; if (f) void onFiles(f); }} />
            <button onClick={() => setUrlOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold">
              <Link2 className="size-3.5" /> Paste URL
            </button>
            <span className="self-center text-[11px] text-white/40">Unlimited queue · drag & drop works too</span>
          </div>

          {urlOpen && (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <input value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} placeholder="Title (optional)" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…direct audio link" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none" />
              <button
                onClick={async () => {
                  await radioAddUrl(url, urlTitle || undefined);
                  setUrl("");
                  setUrlTitle("");
                  setUrlOpen(false);
                }}
                className="w-full rounded-full bg-white py-2 text-sm font-bold text-black"
              >
                Add to queue
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/5">
            {(
              [
                ["queue", "Queue"],
                ["jam", "Live jam"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={cn("px-3 py-2 text-xs font-semibold", tab === id ? "border-b-2 border-[#ff2bd6] text-[#ff2bd6]" : "text-white/45")}>
                {label}
                {id === "queue" ? ` · ${tracks.length}` : ""}
              </button>
            ))}
          </div>

          {tab === "queue" && (
            <div className="space-y-1">
              {tracks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-white/45">No songs yet — be the first to add one.</div>
              ) : (
                tracks.map((t, i) => {
                  const on = t.id === player?.track_id;
                  return (
                    <div key={t.id} className={cn("group flex items-center gap-2 rounded-xl px-2 py-2", on ? "bg-[#ff2bd6]/15" : "hover:bg-white/[0.04]")}>
                      <button onClick={() => radioPlayTrack(t.id)} className="grid size-9 place-items-center rounded-full bg-white/5 text-[#ff2bd6]">
                        {on && playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{t.title}</div>
                        <div className="truncate text-[11px] text-white/45">
                          {i + 1} · {t.artist || "—"} · {t.duration ? fmt(t.duration) : t.kind} · @{profiles[t.added_by]?.username ?? "…"}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm("Remove from the radio queue?")) void radioRemove(t.id);
                        }}
                        className="opacity-0 group-hover:opacity-100"
                        aria-label="Remove"
                      >
                        <Trash2 className="size-4 text-white/40" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "jam" && jam && <RadioJamPanel jam={jam} />}
        </div>
      </div>
    </div>
  );
}

function RadioJamPanel({ jam }: { jam: RadioJam }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const [local, setLocal] = useState(jam);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const live = useRef(local);
  live.current = local;
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<RadioJam>>({});

  useEffect(() => {
    // don't clobber local edits mid-save
    if (saveT.current && jam.updated_by === me) return;
    setLocal(jam);
  }, [jam, me]);

  const queueSave = (patch: Partial<RadioJam>) => {
    pending.current = { ...pending.current, ...patch };
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const p = pending.current;
      pending.current = {};
      saveT.current = null;
      void saveRadioJam(p as Partial<Pick<RadioJam, "pattern" | "bpm" | "root">>);
    }, 350);
  };

  useEffect(() => {
    if (!playing) return;
    const c = pctx();
    void c.resume();
    const bus = c.createDynamicsCompressor();
    bus.threshold.value = -10;
    bus.ratio.value = 3;
    bus.connect(c.destination);
    let next = c.currentTime + 0.06;
    let s = 0;
    const iv = setInterval(() => {
      const j = live.current;
      if (!j?.pattern) return;
      while (next < c.currentTime + 0.12) {
        const six = 60 / j.bpm / 4;
        for (const ins of INSTS) if (j.pattern[ins.id]?.[s]) hit(c, bus, ins.id, next, j.root);
        const shown = s;
        setTimeout(() => setStep(shown), Math.max(0, (next - c.currentTime) * 1000));
        next += six;
        s = (s + 1) % 16;
      }
    }, 25);
    return () => {
      clearInterval(iv);
      setTimeout(() => bus.disconnect(), 400);
      setStep(-1);
    };
  }, [playing]);

  const editor = local.updated_by ? profiles[local.updated_by] : null;
  const toggle = (inst: string, s: number) => {
    const row = local.pattern[inst as keyof Pattern] ?? Array(16).fill(false);
    const pattern = { ...local.pattern, [inst]: row.map((x, k) => (k === s ? !x : x)) } as Pattern;
    if (!row[s]) hit(pctx(), pctx().destination, inst as keyof Pattern, pctx().currentTime, local.root);
    setLocal({ ...local, pattern, updated_by: me });
    queueSave({ pattern });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0a1a] p-3">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => setPlaying(!playing)} className={cn("grid size-10 place-items-center rounded-full", playing ? "bg-[#ed4245]" : "bg-[#ff2bd6]")} aria-label={playing ? "Stop jam" : "Play jam"}>
          {playing ? <Square className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Live jam</div>
          <div className="truncate text-[11px] text-white/50">{editor ? `last edit: ${local.updated_by === me ? "you" : editor.display_name}` : "tap the grid — everyone edits together"}</div>
        </div>
        <label className="flex items-center gap-1 text-[11px] text-white/60">
          <input
            type="number"
            min={60}
            max={200}
            value={local.bpm}
            onChange={(e) => {
              const bpm = Math.max(60, Math.min(200, Number(e.target.value) || 120));
              setLocal({ ...local, bpm });
              queueSave({ bpm });
            }}
            className="w-12 rounded bg-white/10 px-1 py-0.5 text-center text-xs outline-none"
          />
          BPM
        </label>
        <select
          value={local.root}
          onChange={(e) => {
            const root = Number(e.target.value);
            setLocal({ ...local, root });
            queueSave({ root });
          }}
          className="rounded bg-white/10 px-1 py-0.5 text-xs"
        >
          {NOTES.map((n, i) => (
            <option key={n} value={i} className="bg-[#0d0a1a]">
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-[3px]">
        {INSTS.map((ins) => (
          <div key={ins.id} className="flex items-center gap-[3px]">
            <span className="w-9 shrink-0 truncate text-[9px] font-bold text-white/60 uppercase">{ins.name}</span>
            {(local.pattern[ins.id] ?? Array(16).fill(false)).map((on: boolean, s: number) => (
              <button
                key={s}
                onClick={() => toggle(ins.id, s)}
                className={cn("h-4 flex-1 rounded-[3px] transition", s % 4 === 0 && "ml-[2px]", step === s && "ring-1 ring-white")}
                style={{ background: on ? ins.color : s % 8 < 4 ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.04)" }}
                aria-label={`${ins.name} ${s + 1}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-white/40">Jam plays on your device while the radio song stays synced for everyone.</p>
    </div>
  );
}
