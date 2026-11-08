"use client";

import { useEffect, useRef, useState } from "react";
import { Disc3, Folder, Globe, Loader2, Play, Search, Trash2, Upload, Wand2, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { myRank } from "@/lib/admin";
import Avatar from "@/components/ui/Avatar";
import { parseChart } from "./chart";
import type { Difficulty } from "./autochart";
import { SYNTH_PRESETS, makeSynthSong, type SynthPreset } from "./synth";
import { findModSongs, readZip, type ModSong } from "./modzip";
import { beatFileUrl, deleteBeatSong, hideBeatSong, listBeatSongs, publishBeatSong, type BeatSong } from "@/lib/beatLibrary";
import type { Song } from "./songs";

type Tab = "synth" | "community" | "mod";

/** Extra ways to get songs: generated originals, the community list, and mod zips from your device. */
export function BeatLibrary({ onReady }: { onReady: (s: Song) => void }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const tabs: { id: Tab; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: "synth", label: "Synth pack", icon: <Wand2 className="size-4" />, hint: "6 original tracks made on your device" },
    { id: "community", label: "Community", icon: <Globe className="size-4" />, hint: "Songs other members published" },
    { id: "mod", label: "Mod zip", icon: <Folder className="size-4" />, hint: "Play a mod you downloaded" },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(tab === t.id ? null : t.id)} className={cn("flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-1 transition", tab === t.id ? "bg-white/15 ring-[#aa00ff]" : "bg-white/5 ring-white/10 hover:bg-white/10")}>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              {t.icon} {t.label}
            </span>
            <span className="text-[11px] leading-tight text-white/55">{t.hint}</span>
          </button>
        ))}
      </div>
      {tab === "synth" && <SynthPack onReady={onReady} />}
      {tab === "community" && <Community onReady={onReady} />}
      {tab === "mod" && <ModZip onReady={onReady} />}
    </div>
  );
}

const DIFFS: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];

function SynthPack({ onReady }: { onReady: (s: Song) => void }) {
  const [diff, setDiff] = useState<Difficulty>("normal");
  const [busy, setBusy] = useState<{ id: string; p: number } | null>(null);
  const cache = useRef(new Map<string, Song>());
  const make = async (p: SynthPreset) => {
    const key = `${p.id}-${diff}`;
    const hit = cache.current.get(key);
    if (hit) return onReady(hit);
    setBusy({ id: p.id, p: 0 });
    try {
      const r = await makeSynthSong(p, diff, (x) => setBusy({ id: p.id, p: x }));
      const song: Song = { id: key, title: p.title, credit: `Nexus Synth Pack · ${p.style} · ${p.bpm} BPM`, diff: `${r.diffLabel} · ${r.notes} notes`, chart: r.chartUrl, inst: r.instUrl, color: p.color, ranked: false, source: "synth" };
      cache.current.set(key, song);
      onReady(song);
      toast(`“${p.title}” is ready — play it from the list`, "success");
    } catch (e) {
      toast((e as Error).message || "Couldn't render", "error");
    }
    setBusy(null);
  };
  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold">Nexus Synth Pack</div>
        <div className="flex gap-1 rounded-xl bg-black/25 p-1">
          {DIFFS.map((d) => (
            <button key={d.id} onClick={() => setDiff(d.id)} className={cn("rounded-lg px-3 py-1 text-xs font-bold", diff === d.id ? "bg-[#aa00ff] text-white" : "text-white/70")}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-white/55">Original instrumentals generated right here, then auto-charted. Same preset = same song every time.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SYNTH_PRESETS.map((p) => (
          <button key={p.id} disabled={!!busy} onClick={() => void make(p)} className="flex items-center gap-3 rounded-xl bg-black/25 p-2.5 text-left ring-1 ring-white/5 hover:bg-black/40 disabled:opacity-60">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: `linear-gradient(135deg, ${p.color}, #2a0b4a)` }}>
              {busy?.id === p.id ? <Loader2 className="size-5 animate-spin" /> : <Disc3 className="size-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{p.title}</span>
              <span className="block truncate text-[11px] text-white/55">
                {p.style} · {p.bpm} BPM{busy?.id === p.id ? ` · ${Math.round(busy.p * 100)}%` : ""}
              </span>
            </span>
            <Play className="size-4 fill-current opacity-70" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ModZip({ onReady }: { onReady: (s: Song) => void }) {
  const [songs, setSongs] = useState<ModSong[] | null>(null);
  const [modName, setModName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy("zip");
    try {
      const files = await readZip(f);
      const name = f.name.replace(/\.zip$/i, "").replace(/[_-]+/g, " ");
      const found = findModSongs(files, name);
      setModName(name);
      setSongs(found);
      if (!found.length) toast("No songs found — the zip needs chart .json files plus Inst audio", "error");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };
  const add = async (s: ModSong, ci: number) => {
    setBusy(s.key);
    try {
      const c = s.charts[ci];
      const chartBlob = await c.file.blob();
      const parsed = parseChart(JSON.parse(await chartBlob.text()), s.title);
      const inst = await s.inst!.blob();
      const voices = s.voices ? await s.voices.blob() : null;
      onReady({
        id: `mod-${s.key}-${c.label}`,
        title: parsed.title || s.title,
        credit: s.credit ? `From ${s.credit}` : "Mod zip",
        diff: `${c.label} · ${parsed.notes.filter((n) => n.player).length} notes`,
        chart: URL.createObjectURL(chartBlob),
        inst: URL.createObjectURL(inst),
        voices: voices ? URL.createObjectURL(voices) : undefined,
        color: "#00b3ff",
        ranked: false,
        source: "mod",
      });
      toast(`“${parsed.title || s.title}” added — play it from the list`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };
  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="text-sm font-bold">Play a mod from a zip</div>
      <p className="text-xs text-white/55">
        Download a mod (GameBanana etc.) and pick the .zip here — it stays on your device. Works with the base game, Psych and Kade folder layouts. iPhones may not play .ogg audio.
      </p>
      <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/20 py-3 text-sm font-semibold text-white/70 hover:border-[#00b3ff] hover:text-white", busy === "zip" && "pointer-events-none opacity-60")}>
        <input type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {busy === "zip" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {songs ? `Another zip (current: ${modName})` : "Choose mod .zip"}
      </label>
      {songs && songs.length > 0 && (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {songs.map((s) => (
            <li key={s.key} className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{s.title}</span>
                <span className="block truncate text-[11px] text-white/55">
                  {s.inst?.name.split("/").pop()}
                  {s.voices ? " + voices" : ""}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                {s.charts.slice(0, 4).map((c, i) => (
                  <button key={c.label + i} disabled={!!busy} onClick={() => void add(s, i)} className="rounded-full bg-[#00b3ff]/20 px-2.5 py-1 text-[11px] font-bold text-[#8fdcff] hover:bg-[#00b3ff]/35 disabled:opacity-50">
                    {busy === s.key ? "…" : c.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Community({ onReady }: { onReady: (s: Song) => void }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const [sort, setSort] = useState<"new" | "top">("new");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<BeatSong[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const staff = myRank() >= 2;
  const load = () => void listBeatSongs(sort, q).then(setRows);
  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, q]);

  const play = (s: BeatSong) =>
    onReady({
      id: `community-${s.id}`,
      title: s.title,
      credit: s.credit || `by ${profiles[s.owner_id]?.display_name || profiles[s.owner_id]?.username || "a member"}`,
      diff: `${s.difficulty} · ${s.notes} notes`,
      chart: beatFileUrl(s.chart_path),
      inst: beatFileUrl(s.inst_path),
      voices: s.voices_path ? beatFileUrl(s.voices_path) : undefined,
      color: s.color || "#22c55a",
      ranked: false,
      source: "community",
      communityId: s.id,
    });

  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-bold">Community songs</div>
        <div className="flex gap-1 rounded-xl bg-black/25 p-1">
          {(["new", "top"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={cn("rounded-lg px-3 py-1 text-xs font-bold capitalize", sort === s ? "bg-[#22c55a] text-black" : "text-white/70")}>
              {s === "new" ? "Newest" : "Most played"}
            </button>
          ))}
        </div>
        <button onClick={() => setPublishing((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
          <Upload className="size-3.5" /> Publish yours
        </button>
      </div>
      <label className="flex items-center gap-2 rounded-xl bg-black/25 px-3">
        <Search className="size-4 text-white/50" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs or artists" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear">
            <X className="size-4 text-white/50" />
          </button>
        )}
      </label>
      {publishing && <Publish onDone={() => (setPublishing(false), load())} />}
      {rows === null ? (
        <div className="py-6 text-center text-sm text-white/55">Loading…</div>
      ) : !rows.length ? (
        <div className="py-6 text-center text-sm text-white/55">{q ? "Nothing matches." : "No community songs yet — publish the first one."}</div>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 rounded-xl bg-black/25 px-2.5 py-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: `linear-gradient(135deg, ${s.color || "#22c55a"}, #2a0b4a)` }}>
                <Disc3 className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{s.title}</span>
                <span className="flex items-center gap-1 truncate text-[11px] text-white/55">
                  <Avatar userId={s.owner_id} size={14} plain /> {s.credit || profiles[s.owner_id]?.username || "member"} · {s.difficulty} · {s.notes} notes · {s.plays} plays
                </span>
              </span>
              {(s.owner_id === me || staff) && (
                <button
                  onClick={() => {
                    if (!confirm(`Remove “${s.title}” from the community list?`)) return;
                    void (s.owner_id === me ? deleteBeatSong(s) : hideBeatSong(s.id, true)).then((ok) => ok && load());
                  }}
                  className="grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-[#ff2e63]"
                  aria-label="Remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
              <button onClick={() => play(s)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
                <Play className="size-3.5 fill-current" /> Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Publish({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<{ chart?: File; inst?: File; voices?: File }>({});
  const [title, setTitle] = useState("");
  const [credit, setCredit] = useState("");
  const [difficulty, setDifficulty] = useState("Hard");
  const [rights, setRights] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const pick = (k: keyof typeof files, accept: string, label: string) => (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm hover:bg-black/40">
      <input type="file" accept={accept} className="hidden" onChange={(e) => setFiles((f) => ({ ...f, [k]: e.target.files?.[0] }))} />
      <span className="font-semibold">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-white/55">{files[k]?.name ?? "choose…"}</span>
    </label>
  );
  const go = async () => {
    if (!files.chart || !files.inst) return toast("Pick the chart .json and the Inst audio", "error");
    if (!rights) return toast("Confirm you made this song (or have the rights)", "error");
    setStep("Checking chart…");
    try {
      const parsed = parseChart(JSON.parse(await files.chart.text()), title || files.chart.name);
      const notes = parsed.notes.filter((n) => n.player).length;
      if (notes < 10) throw new Error("That chart has almost no player notes");
      const r = await publishBeatSong({
        title: title.trim() || parsed.title,
        credit,
        difficulty,
        chart: files.chart,
        inst: files.inst,
        instName: files.inst.name,
        voices: files.voices ?? null,
        voicesName: files.voices?.name,
        notes,
        bpm: parsed.bpm,
        lengthMs: parsed.length,
        onStep: setStep,
      });
      if (r) {
        setFiles({});
        setTitle("");
        setCredit("");
        setRights(false);
        onDone();
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setStep(null);
  };
  return (
    <div className="space-y-2 rounded-xl bg-black/30 p-3 ring-1 ring-[#22c55a]/40">
      <div className="text-sm font-bold">Publish a song you made</div>
      <p className="text-xs text-white/55">Only your own music and charts (or music you have permission to share). Other people&apos;s mod songs will be taken down.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Title (from the chart if empty)" className="rounded-xl bg-black/25 px-3 py-2 text-sm outline-none" />
        <input value={credit} onChange={(e) => setCredit(e.target.value.slice(0, 120))} placeholder="Credit — artist / charter" className="rounded-xl bg-black/25 px-3 py-2 text-sm outline-none" />
      </div>
      {pick("chart", ".json,application/json", "Chart (.json)")}
      {pick("inst", "audio/*,.mp3,.m4a,.ogg,.wav", "Inst audio")}
      {pick("voices", "audio/*,.mp3,.m4a,.ogg,.wav", "Voices (optional)")}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/60">Difficulty</span>
        {["Easy", "Normal", "Hard", "Erect"].map((d) => (
          <button key={d} onClick={() => setDifficulty(d)} className={cn("rounded-full px-3 py-1 text-xs font-bold", difficulty === d ? "bg-[#22c55a] text-black" : "bg-white/10 text-white/70")}>
            {d}
          </button>
        ))}
      </div>
      <label className="flex items-start gap-2 text-xs text-white/70">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" /> I made this song and chart, or I have the rights to share them on Nexus.
      </label>
      <p className="text-[11px] text-white/45">Tip: use MP3 or M4A so it plays on iPhone. Songs aren&apos;t ranked on the leaderboard.</p>
      <button disabled={!!step} onClick={() => void go()} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#22c55a] py-2 text-sm font-bold text-black disabled:opacity-60">
        {step ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {step ?? "Publish"}
      </button>
    </div>
  );
}
