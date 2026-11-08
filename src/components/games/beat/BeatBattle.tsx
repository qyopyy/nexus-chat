"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileMusic, Loader2, Pause, Play, Settings2, Sparkles, Trophy, Upload } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { leaderboard, localBest, saveLocalBest, submitScore, type Row } from "@/lib/games";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { HEALTH_GAIN, HEALTH_MISS, JUDGE, SAFE_MS, accuracy, beatAt, fcLabel, grade, judge, newStats, parseChart, type Chart, type Note, type Stats } from "./chart";
import { analyze, buildChart, decodeFile, fitGrid, type Analysis, type Difficulty } from "./autochart";
import type { Song } from "./songs";
import { BeatLibrary } from "./BeatLibrary";
import { countBeatPlay } from "@/lib/beatLibrary";
import { arrow, burst, drawBoombox, drawFlash, drawHex, drawSparks, drawStage, drawVolt, iconHex, iconVolt, newStage, trail, LANE_COLORS, type Pose, type Spark } from "./art";

// ─────────────────────────────── songs ───────────────────────────────
const SONGS: Song[] = [
  { id: "sippin", title: "Sippin", credit: "Mod by qyopy & friends", diff: "Hard", chart: "/games/beat/sippin/chart.json", inst: "/games/beat/sippin/inst.m4a", voices: "/games/beat/sippin/voices.m4a", color: "#aa00ff", ranked: true, source: "built-in" },
];

// ─────────────────────────────── options ───────────────────────────────
type Opts = { downscroll: boolean; middlescroll: boolean; ghostTap: boolean; offset: number; speed: number; botplay: boolean; practice: boolean; keys: "wasd" | "dfjk"; flashing: boolean; hitsound: boolean };
const OPT_KEY = "nexus:beat:opts";
const DEF_OPTS: Opts = { downscroll: false, middlescroll: false, ghostTap: true, offset: 0, speed: 0, botplay: false, practice: false, keys: "wasd", flashing: true, hitsound: false };
const loadOpts = (): Opts => {
  try {
    return { ...DEF_OPTS, ...JSON.parse(localStorage.getItem(OPT_KEY) ?? "{}") };
  } catch {
    return DEF_OPTS;
  }
};
const KEYMAP: Record<Opts["keys"], string[][]> = {
  wasd: [
    ["KeyA", "ArrowLeft"],
    ["KeyS", "ArrowDown"],
    ["KeyW", "ArrowUp"],
    ["KeyD", "ArrowRight"],
  ],
  dfjk: [
    ["KeyD", "ArrowLeft"],
    ["KeyF", "ArrowDown"],
    ["KeyJ", "ArrowUp"],
    ["KeyK", "ArrowRight"],
  ],
};

type Result = { stats: Stats; title: string; ranked: boolean; died: boolean; best: number };

export default function BeatBattle({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [opts, setOptsState] = useState<Opts>(DEF_OPTS);
  const [screen, setScreen] = useState<"menu" | "options" | "play" | "results">("menu");
  const [song, setSong] = useState<Song>(SONGS[0]);
  const [customs, setCustoms] = useState<Song[]>([]);
  const addCustom = (song: Song) => setCustoms((list) => [song, ...list.filter((x) => x.id !== song.id)].slice(0, 30));
  const [result, setResult] = useState<Result | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [run, setRun] = useState(0);
  const me = useApp((s) => s.userId);
  useEffect(() => setOptsState(loadOpts()), []);
  const setOpts = (p: Partial<Opts>) =>
    setOptsState((o) => {
      const n = { ...o, ...p };
      try {
        localStorage.setItem(OPT_KEY, JSON.stringify(n));
      } catch {
        /* private mode */
      }
      return n;
    });
  const loadBoard = useCallback(() => void leaderboard("beat").then(setRows), []);
  useEffect(loadBoard, [loadBoard]);

  if (screen === "play")
    return (
      <Game
        key={run}
        song={song}
        opts={opts}
        mobile={!!mobile}
        onQuit={() => setScreen("menu")}
        onDone={(stats, died) => {
          const ranked = song.ranked && !opts.botplay && !opts.practice && !died;
          const best = localBest("beat");
          if (ranked) {
            saveLocalBest("beat", stats.score);
            void submitScore("beat", stats.score).then(loadBoard);
          }
          setResult({ stats, title: song.title, ranked, died, best });
          setScreen("results");
        }}
        onRestart={() => setRun((r) => r + 1)}
      />
    );

  const start = (s: Song) => {
    if (s.communityId) countBeatPlay(s.communityId);
    setSong(s);
    setRun((r) => r + 1);
    setScreen("play");
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-[#0b0618] text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, #4b1d7a 0%, #0b0618 60%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-25" style={{ backgroundImage: "repeating-linear-gradient(115deg, transparent 0 40px, rgba(170,0,255,.25) 40px 42px)" }} />
      <header className={cn("relative z-10 flex items-center gap-2 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={screen === "menu" ? onBack : () => setScreen("menu")} className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <span className="font-bold">{screen === "menu" ? "Games" : "Beat Battle"}</span>
        <div className="flex-1" />
        {screen === "menu" && (
          <button onClick={() => setScreen("options")} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">
            <Settings2 className="size-4" /> Options
          </button>
        )}
      </header>

      <div className="relative z-10 mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        {screen === "menu" && (
          <>
            <div className="text-center">
              <div className="text-xs font-bold tracking-[.4em] text-[#c9a6ff] uppercase">Rhythm battle</div>
              <h1 className="mt-1 text-5xl font-black tracking-tight italic sm:text-7xl" style={{ background: "linear-gradient(180deg,#fff,#d6a6ff 55%,#7a3cff)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 4px 0 #2a0b4a)" }}>
                BEAT BATTLE
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/75">Hit the arrows on the beat to out-sing your rival. Miss too many and you lose the battle.</p>
            </div>
            <div className="mt-6 space-y-3">
              {[...SONGS, ...customs].map((s) => (
                <button key={s.id} onClick={() => start(s)} className="group flex w-full items-center gap-4 rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-[#aa00ff]">
                  <div className="grid size-14 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `linear-gradient(135deg, ${s.color}, #2a0b4a)` }}>
                    <FileMusic className="size-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xl font-black">{s.title}</div>
                    <div className="truncate text-sm text-white/65">
                      {s.credit} · {s.diff}
                      {!s.ranked && " · unranked"}
                      {s.source && s.source !== "built-in" && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase">{s.source}</span>}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition group-hover:scale-105">
                    <Play className="size-4 fill-current" /> Play
                  </span>
                </button>
              ))}
              <BeatLibrary onReady={addCustom} />
              <AutoChart onReady={addCustom} />
              <ImportChart onReady={addCustom} />
            </div>
            <div className="mt-5 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Trophy className="size-4 text-[#ffd400]" /> Top scores
              </div>
              {rows.length === 0 ? (
                <div className="text-sm text-white/55">No scores yet — be the first.</div>
              ) : (
                rows.slice(0, 10).map((r, i) => (
                  <div key={r.user_id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-sm", r.user_id === me && "bg-white/10")}>
                    <span className="w-5 text-center font-bold text-white/60">{i + 1}</span>
                    <Avatar userId={r.user_id} size={22} plain />
                    <span className="min-w-0 flex-1 truncate">
                      <NameTag userId={r.user_id} badges={false} />
                    </span>
                    <b className="tabular-nums">{r.best.toLocaleString()}</b>
                  </div>
                ))
              )}
            </div>
            <p className="mt-3 text-center text-xs text-white/50">
              {mobile ? "Tap the four columns of the screen in time · pause button top-right" : `${opts.keys === "wasd" ? "A S W D" : "D F J K"} or arrow keys · Enter / Esc to pause`}
            </p>
          </>
        )}

        {screen === "options" && <Options opts={opts} set={setOpts} />}

        {screen === "results" && result && (
          <Results
            r={result}
            onRetry={() => start(song)}
            onMenu={() => setScreen("menu")}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── options screen ───────────────────────────────
function Options({ opts, set }: { opts: Opts; set: (p: Partial<Opts>) => void }) {
  const Row = ({ label, hint, on, k }: { label: string; hint?: string; on: boolean; k: keyof Opts }) => (
    <button onClick={() => set({ [k]: !on } as Partial<Opts>)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-white/55">{hint}</span>}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-[#aa00ff]" : "bg-white/20")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
  return (
    <div className="space-y-1">
      <h2 className="mb-3 text-2xl font-black">Options</h2>
      <Row label="Downscroll" hint="Arrows scroll down to strums at the bottom" on={opts.downscroll} k="downscroll" />
      <Row label="Middlescroll" hint="Your arrows in the centre, rival's hidden" on={opts.middlescroll} k="middlescroll" />
      <Row label="Ghost tapping" hint="Pressing with no arrow there doesn't count as a miss" on={opts.ghostTap} k="ghostTap" />
      <Row label="Hit sounds" hint="A click on every arrow you hit" on={opts.hitsound} k="hitsound" />
      <Row label="Flashing lights" hint="Lightning flashes on the stage" on={opts.flashing} k="flashing" />
      <Row label="Practice mode" hint="You can't lose (scores aren't ranked)" on={opts.practice} k="practice" />
      <Row label="Botplay" hint="Watch the chart play itself (unranked)" on={opts.botplay} k="botplay" />
      <div className="rounded-xl px-3 py-3">
        <div className="mb-1 flex justify-between font-semibold">
          <span>Note offset</span>
          <span className="text-white/70 tabular-nums">{opts.offset > 0 ? "+" : ""}{opts.offset} ms</span>
        </div>
        <input type="range" min={-200} max={200} step={5} value={opts.offset} onChange={(e) => set({ offset: Number(e.target.value) })} className="w-full accent-[#aa00ff]" />
        <div className="text-xs text-white/55">If arrows feel early, move right; if late (Bluetooth headphones), move left.</div>
      </div>
      <div className="rounded-xl px-3 py-3">
        <div className="mb-1 flex justify-between font-semibold">
          <span>Scroll speed</span>
          <span className="text-white/70 tabular-nums">{opts.speed ? opts.speed.toFixed(1) : "Chart"}</span>
        </div>
        <input type="range" min={0} max={5} step={0.1} value={opts.speed} onChange={(e) => set({ speed: Number(e.target.value) })} className="w-full accent-[#aa00ff]" />
        <div className="text-xs text-white/55">0 = use the speed the chart was made with.</div>
      </div>
      <div className="rounded-xl px-3 py-3">
        <div className="mb-2 font-semibold">Keys</div>
        <div className="flex gap-2">
          {(["wasd", "dfjk"] as const).map((k) => (
            <button key={k} onClick={() => set({ keys: k })} className={cn("flex-1 rounded-lg py-2 font-bold", opts.keys === k ? "bg-[#aa00ff]" : "bg-white/10")}>
              {k === "wasd" ? "A S W D + arrows" : "D F J K + arrows"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── results ───────────────────────────────
function Results({ r, onRetry, onMenu }: { r: Result; onRetry: () => void; onMenu: () => void }) {
  const acc = accuracy(r.stats);
  return (
    <div className="mx-auto max-w-md animate-pop text-center">
      <div className="text-xs font-bold tracking-widest text-white/60 uppercase">{r.died ? "You lost the battle" : "Song cleared"}</div>
      <div className="text-3xl font-black">{r.title}</div>
      <div className="my-4 text-8xl font-black italic" style={{ color: r.died ? "#ff5c8a" : "#ffd400", textShadow: "0 6px 0 #2a0b4a" }}>
        {r.died ? "✗" : grade(acc)}
      </div>
      <div className="text-4xl font-black tabular-nums">{r.stats.score.toLocaleString()}</div>
      <div className="text-sm text-white/70">
        {acc.toFixed(2)}% · {fcLabel(r.stats)} · max combo {r.stats.maxCombo}
        {r.ranked && r.stats.score > r.best && r.best > 0 && " · 🏆 new best!"}
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2 text-sm">
        {JUDGE.map((j, i) => (
          <div key={j.name} className="rounded-xl bg-white/5 py-2">
            <div className="text-[10px] font-bold" style={{ color: j.color }}>
              {j.name}
            </div>
            <div className="font-black tabular-nums">{r.stats.counts[i]}</div>
          </div>
        ))}
        <div className="rounded-xl bg-white/5 py-2">
          <div className="text-[10px] font-bold text-[#ff5c8a]">MISS</div>
          <div className="font-black tabular-nums">{r.stats.misses}</div>
        </div>
      </div>
      {!r.ranked && <p className="mt-3 text-xs text-white/50">Not ranked (botplay, practice, imported song or game over).</p>}
      <div className="mt-6 flex gap-2">
        <button onClick={onRetry} className="flex-1 rounded-full bg-[#aa00ff] py-3 font-bold">
          Play again
        </button>
        <button onClick={onMenu} className="flex-1 rounded-full bg-white/10 py-3 font-bold">
          Song list
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────── auto-chart any song ───────────────────────────────
const DIFFS: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];
function AutoChart({ onReady }: { onReady: (s: Song) => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [prog, setProg] = useState<number | null>(null);
  const [an, setAn] = useState<Analysis | null>(null);
  const [diff, setDiff] = useState<Difficulty>("normal");

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) return toast("That file is too big (40 MB max)", "error");
    setFile(f);
    setAn(null);
    setProg(0);
    try {
      const buf = await decodeFile(f);
      setAn(await analyze(buf, setProg));
    } catch (e) {
      toast((e as Error).message, "error");
      setFile(null);
    } finally {
      setProg(null);
    }
  };
  const retempo = (k: number) => an && setAn({ ...an, ...fitGrid(an, an.bpm * k) });
  const add = () => {
    if (!an || !file) return;
    const title = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 60) || "My song";
    try {
      const { json, playerNotes } = buildChart(an, diff, title);
      // blob URLs live for the session — the song list keeps several custom entries playable
      const chart = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      const inst = URL.createObjectURL(file);
      onReady({ id: `auto-${Date.now()}`, title, credit: "Auto-charted on this device", diff: `${DIFFS.find((d) => d.id === diff)?.label} · ${playerNotes} notes`, chart, inst, color: "#ff7a00", ranked: false, source: "device" });
      toast(`“${title}” is ready — play it from the list`, "success");
      setOpen(false);
      setFile(null);
      setAn(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/20 py-3 text-sm font-semibold text-white/70 hover:border-[#ff7a00] hover:text-white">
        <Sparkles className="size-4" /> Auto-chart any song from your device
      </button>
    );
  return (
    <div className="space-y-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="text-sm font-bold">Make a chart from any song</div>
      <label className={cn("flex cursor-pointer items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm hover:bg-white/10", prog !== null && "pointer-events-none opacity-60")}>
        <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <span className="font-semibold">Song</span>
        <span className="min-w-0 flex-1 truncate text-right text-white/55">{file?.name ?? "choose an MP3 / M4A…"}</span>
      </label>
      {prog !== null && (
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-white/70">
            <Loader2 className="size-3.5 animate-spin" /> Listening for the beat… {Math.round(prog * 100)}%
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#ff7a00] transition-all" style={{ width: `${Math.round(prog * 100)}%` }} />
          </div>
        </div>
      )}
      {an && (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm">
            <span className="text-white/60">Tempo</span>
            <b className="tabular-nums">{an.bpm} BPM</b>
            <span className="flex-1" />
            <button onClick={() => retempo(0.5)} disabled={an.bpm / 2 < 50} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold disabled:opacity-30">
              ½×
            </button>
            <button onClick={() => retempo(2)} disabled={an.bpm * 2 > 240} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold disabled:opacity-30">
              2×
            </button>
          </div>
          <div className="flex gap-1 rounded-xl bg-black/25 p-1">
            {DIFFS.map((d) => (
              <button key={d.id} onClick={() => setDiff(d.id)} className={cn("flex-1 rounded-lg py-2 text-sm font-bold", diff === d.id ? "bg-[#ff7a00] text-black" : "text-white/70")}>
                {d.label}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-white/50">The chart is made on this device — your song isn&apos;t uploaded. If the arrows feel twice too busy or too slow, try ½× or 2×. Auto charts aren&apos;t ranked.</p>
      <div className="flex gap-2">
        <button onClick={add} disabled={!an} className="flex-1 rounded-full bg-[#ff7a00] py-2 font-bold text-black disabled:opacity-40">
          Add song
        </button>
        <button onClick={() => setOpen(false)} className="rounded-full bg-white/10 px-4 font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────── import your own chart ───────────────────────────────
function ImportChart({ onReady }: { onReady: (s: Song) => void }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<{ chart?: File; inst?: File; voices?: File }>({});
  const go = async () => {
    if (!files.chart || !files.inst) return toast("Pick the chart .json and the Inst audio", "error");
    try {
      const c = parseChart(JSON.parse(await files.chart.text()), files.chart.name.replace(/\.json$/i, ""));
      onReady({
        id: `import-${Date.now()}`,
        title: c.title,
        credit: "Imported on this device",
        diff: `${c.notes.filter((n) => n.player).length} notes`,
        chart: URL.createObjectURL(files.chart),
        inst: URL.createObjectURL(files.inst),
        voices: files.voices ? URL.createObjectURL(files.voices) : undefined,
        color: "#00b3ff",
        ranked: false,
        source: "device",
      });
      setOpen(false);
      toast(`“${c.title}” added — play it from the list`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/20 py-3 text-sm font-semibold text-white/70 hover:border-[#aa00ff] hover:text-white">
        <Upload className="size-4" /> Play your own mod chart (Psych Engine .json)
      </button>
    );
  const pick = (k: keyof typeof files, accept: string, label: string) => (
    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
      <input type="file" accept={accept} className="hidden" onChange={(e) => setFiles((f) => ({ ...f, [k]: e.target.files?.[0] }))} />
      <span className="font-semibold">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-white/55">{files[k]?.name ?? "choose…"}</span>
    </label>
  );
  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="text-sm font-bold">Import a chart from your mod folder</div>
      {pick("chart", ".json,application/json", "Chart (data/song/song-hard.json)")}
      {pick("inst", "audio/*,.ogg", "Inst (songs/song/Inst.ogg)")}
      {pick("voices", "audio/*,.ogg", "Voices (optional)")}
      <p className="text-xs text-white/50">Plays only on this device and isn&apos;t ranked. iPhones may not play .ogg — convert to .m4a/.mp3 if it stays silent.</p>
      <div className="flex gap-2">
        <button onClick={() => void go()} className="flex-1 rounded-full bg-[#aa00ff] py-2 font-bold">
          Add song
        </button>
        <button onClick={() => setOpen(false)} className="rounded-full bg-white/10 px-4 font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────── the game ───────────────────────────────
const W = 1280,
  H = 720;
const NOTE = 112; // Psych: 160 px arrows at 0.7 scale
const STRUM_X = 42 + 50;

type Live = {
  chart: Chart;
  ctx: AudioContext;
  inst: AudioBufferSourceNode | null;
  voices: AudioBufferSourceNode | null;
  voiceGain: GainNode;
  startAt: number;
  stats: Stats;
};

function Game({ song, opts, mobile, onQuit, onDone, onRestart }: { song: Song; opts: Opts; mobile: boolean; onQuit: () => void; onDone: (s: Stats, died: boolean) => void; onRestart: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"loading" | "playing" | "paused" | "dead" | "error">("loading");
  const [err, setErr] = useState("");
  const live = useRef<Live | null>(null);
  const press = useRef([false, false, false, false]);
  const api = useRef<{ hit: (lane: number, down: boolean) => void; pause: () => void; resume: () => void } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let alive = true;
    let raf = 0;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: "interactive" });
    void ctx.resume();
    const cleanupRef = { current: () => {} };

    void (async () => {
      try {
        const [chartJson, instBuf, voiceBuf] = await Promise.all([
          fetch(song.chart).then((r) => {
            if (!r.ok) throw new Error("Couldn't load the chart");
            return r.json();
          }),
          fetch(song.inst)
            .then((r) => r.arrayBuffer())
            .then((b) => ctx.decodeAudioData(b)),
          song.voices
            ? fetch(song.voices)
                .then((r) => r.arrayBuffer())
                .then((b) => ctx.decodeAudioData(b))
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!alive) return;
        const chart = parseChart(chartJson, song.title);
        const speed = opts.speed || chart.speed;
        const crochet = 60000 / chart.bpm;
        const voiceGain = ctx.createGain();
        voiceGain.connect(ctx.destination);
        const instGain = ctx.createGain();
        instGain.gain.value = 0.9;
        instGain.connect(ctx.destination);
        // countdown: 4 beats (Psych "3 · 2 · 1 · Go") then the song starts
        const lead = (crochet * 5) / 1000;
        const startAt = ctx.currentTime + lead + 0.15;
        const inst = ctx.createBufferSource();
        inst.buffer = instBuf;
        inst.connect(instGain);
        inst.start(startAt);
        let voices: AudioBufferSourceNode | null = null;
        if (voiceBuf) {
          voices = ctx.createBufferSource();
          voices.buffer = voiceBuf;
          voices.connect(voiceGain);
          voices.start(startAt);
        }
        const L: Live = { chart, ctx, inst, voices, voiceGain, startAt, stats: newStats() };
        live.current = L;
        const songEnd = Math.max(chart.length * 0 + instBuf.duration * 1000, (chart.notes.at(-1)?.t ?? 0) + 1500);

        // ── sfx (synth)
        const blip = (f: number, len = 0.08, vol = 0.18, type: OscillatorType = "square") => {
          const o = ctx.createOscillator(),
            gg = ctx.createGain();
          o.type = type;
          o.frequency.value = f;
          gg.gain.setValueAtTime(vol, ctx.currentTime);
          gg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + len);
          o.connect(gg).connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + len + 0.02);
        };
        const noise = (() => {
          const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          const d = b.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
          return b;
        })();
        const thunder = () => {
          const s = ctx.createBufferSource();
          s.buffer = noise;
          const f = ctx.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.value = 380;
          const gg = ctx.createGain();
          gg.gain.value = 0.55;
          s.connect(f).connect(gg).connect(ctx.destination);
          s.start();
        };

        // ── state
        const st = L.stats;
        const stage = newStage();
        const sparks: Spark[] = [];
        const strumGlow = [0, 0, 0, 0, 0, 0, 0, 0]; // 0-3 opponent, 4-7 player (seconds left)
        let pPose: Pose = "idle",
          pPoseAt = -1e9,
          oPose: Pose = "idle",
          oPoseAt = -1e9;
        let rating: { name: string; color: string; at: number; combo: number } | null = null;
        let camX = 640,
          camY = 360,
          camZoom = 0.82,
          hudZoom = 1,
          camZooming = false,
          lastBeat = -99,
          lastLightning = -99,
          iconBop = 0,
          finished = false,
          died = false;
        const POSES: Pose[] = ["left", "down", "up", "right"];
        const songPos = () => (ctx.currentTime - startAt) * 1000 - opts.offset - ((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000;

        const miss = (lane: number, n?: Note) => {
          st.misses++;
          st.combo = 0;
          st.score -= 10;
          st.health -= HEALTH_MISS;
          voiceGain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
          pPose = "miss";
          pPoseAt = performance.now();
          if (n) n.missed = true;
          blip(110 + lane * 15, 0.12, 0.12, "sawtooth");
          rating = { name: "MISS", color: "#ff5c8a", at: performance.now(), combo: 0 };
        };
        const hitNote = (n: Note, diff: number) => {
          n.hit = true;
          if (n.kind === "Hurt Note") {
            st.health -= 0.3;
            pPose = "miss";
            pPoseAt = performance.now();
            return;
          }
          const j = judge(diff);
          const ji = JUDGE.indexOf(j);
          st.counts[ji]++;
          st.hits++;
          st.accSum += j.acc;
          st.score += j.score;
          st.combo++;
          st.maxCombo = Math.max(st.maxCombo, st.combo);
          st.health += HEALTH_GAIN;
          voiceGain.gain.setTargetAtTime(1, ctx.currentTime, 0.005);
          if (n.kind !== "No Animation") {
            pPose = POSES[n.lane];
            pPoseAt = performance.now();
          }
          strumGlow[4 + n.lane] = 0.15 + n.sus / 1000;
          if (n.sus > 0) n.holding = true;
          if (ji === 0) burst(sparks, laneX(true, n.lane), strumY, n.lane);
          if (opts.hitsound) blip(1320, 0.03, 0.09, "triangle");
          rating = { name: j.name, color: j.color, at: performance.now(), combo: st.combo };
        };

        // ── layout
        const strumY = opts.downscroll ? H - 150 + NOTE / 2 : 50 + NOTE / 2;
        const laneX = (player: boolean, lane: number) => {
          if (opts.middlescroll) return player ? W / 2 - NOTE * 2 + NOTE * lane + NOTE / 2 : -999;
          return (player ? STRUM_X + W / 2 : STRUM_X) + NOTE * lane + NOTE / 2;
        };
        const noteY = (t: number, pos: number) => strumY + (opts.downscroll ? -1 : 1) * 0.45 * (t - pos) * speed;

        // ── input
        const keyLane = (code: string) => KEYMAP[opts.keys].findIndex((ks) => ks.includes(code));
        const hit = (lane: number, down: boolean) => {
          if (finished || died) return;
          press.current[lane] = down;
          if (!down || opts.botplay) return;
          const pos = songPos();
          let best: Note | null = null;
          for (const n of chart.notes) {
            if (n.t - pos > SAFE_MS) break;
            if (!n.player || n.lane !== lane || n.hit || n.missed) continue;
            if (Math.abs(n.t - pos) <= SAFE_MS) {
              best = n;
              break;
            }
          }
          if (best) hitNote(best, best.t - pos);
          else if (!opts.ghostTap) miss(lane);
        };
        const pause = () => {
          if (finished || died) return;
          void ctx.suspend();
          setPhase("paused");
        };
        const resume = () => {
          void ctx.resume();
          setPhase("playing");
        };
        api.current = { hit, pause, resume };

        setPhase("playing");
        let last = performance.now();
        const g = cv.current!.getContext("2d")!;
        let firstNoteIdx = 0;

        const frame = () => {
          if (!alive) return;
          raf = requestAnimationFrame(frame);
          const c = cv.current;
          if (!c) return;
          // fit canvas to its box (keep 16:9 design, letterbox)
          const rect = c.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (c.width !== Math.round(rect.width * dpr) || c.height !== Math.round(rect.height * dpr)) {
            c.width = Math.round(rect.width * dpr);
            c.height = Math.round(rect.height * dpr);
          }
          const now = performance.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const paused = ctx.state !== "running";
          const pos = songPos();
          const beat = beatAt(chart, pos);
          const curBeat = Math.floor(beat);
          const t = now / 1000;

          // ── beat events
          if (curBeat !== lastBeat && !paused) {
            lastBeat = curBeat;
            if (pos < 0) {
              const left = Math.round(-pos / crochet);
              if (left >= 0 && left <= 3) blip(left === 0 ? 880 : 440, 0.12, 0.16, "triangle");
            } else {
              iconBop = 1;
              if (camZooming && curBeat % 4 === 0) {
                camZoom += 0.015;
                hudZoom += 0.03;
              }
              if (Math.random() < 0.1 && curBeat > lastLightning + 8) {
                lastLightning = curBeat;
                if (opts.flashing) stage.flash = 1;
                thunder();
              }
            }
          }

          // ── notes: opponent auto-hits, bot, misses, sustains
          if (!paused) {
            for (let i = firstNoteIdx; i < chart.notes.length; i++) {
              const n = chart.notes[i];
              if (n.t > pos + 200) break;
              if (!n.player) {
                if (!n.hit && n.t <= pos) {
                  n.hit = true;
                  camZooming = true;
                  if (n.kind !== "No Animation") {
                    oPose = POSES[n.lane];
                    oPoseAt = now;
                  }
                  strumGlow[n.lane] = 0.15 + n.sus / 1000;
                  if (voices) voiceGain.gain.setTargetAtTime(1, ctx.currentTime, 0.005);
                }
                if (n.sus > 0 && n.hit && pos < n.t + n.sus) {
                  oPoseAt = now;
                  strumGlow[n.lane] = 0.12;
                }
                continue;
              }
              if (opts.botplay && !n.hit && !n.missed && n.t <= pos && n.kind !== "Hurt Note") hitNote(n, 0);
              if (!n.hit && !n.missed && pos - n.t > SAFE_MS) {
                if (n.kind === "Hurt Note") n.missed = true;
                else miss(n.lane, n);
              }
              if (n.holding && !n.holdDone) {
                const held = opts.botplay || press.current[n.lane];
                if (pos >= n.t + n.sus) {
                  n.holdDone = true;
                  n.holding = false;
                } else if (!held && pos < n.t + n.sus - 120) {
                  n.holding = false;
                  n.holdDone = true;
                  miss(n.lane);
                } else {
                  st.health += HEALTH_GAIN * dt * 4;
                  pPoseAt = now;
                  strumGlow[4 + n.lane] = 0.12;
                }
              }
            }
            while (firstNoteIdx < chart.notes.length) {
              const n = chart.notes[firstNoteIdx];
              if (pos - (n.t + n.sus) > 1000 && (n.hit || n.missed)) firstNoteIdx++;
              else break;
            }
            st.health = Math.max(0, Math.min(2, st.health));
            if (st.health <= 0 && !opts.practice && !died) {
              died = true;
              void ctx.suspend();
              setPhase("dead");
            }
            if (!finished && pos > songEnd) {
              finished = true;
              setTimeout(() => alive && doneRef.current(st, false), 400);
            }
            for (let i = 0; i < 8; i++) strumGlow[i] = Math.max(0, strumGlow[i] - dt);
          }

          // ── camera
          const sec = chart.sections.find((s) => pos >= s.start && pos < s.end) ?? chart.sections[0];
          const tx = sec?.player ? 860 : 420,
            ty = sec?.player ? 400 : 330;
          camX += (tx - camX) * Math.min(1, dt * 2.4);
          camY += (ty - camY) * Math.min(1, dt * 2.4);
          camZoom += (0.82 - camZoom) * Math.min(1, dt * 3);
          hudZoom += (1 - hudZoom) * Math.min(1, dt * 3);
          iconBop = Math.max(0, iconBop - dt * 4);

          // ── draw world
          const scale = Math.min(c.width / W, c.height / H);
          const ox = (c.width - W * scale) / 2,
            oy = (c.height - H * scale) / 2;
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.fillStyle = "#000";
          g.fillRect(0, 0, c.width, c.height);
          g.save();
          g.beginPath();
          g.rect(ox, oy, W * scale, H * scale);
          g.clip();
          g.setTransform(scale * camZoom, 0, 0, scale * camZoom, ox + (W / 2) * scale - camX * scale * camZoom, oy + (H / 2) * scale - camY * scale * camZoom);
          drawStage(g, stage, t, paused ? 0 : dt);
          const idle = Math.pow(1 - ((beat >= 0 ? beat : 0) % 2) / 2, 3);
          const singMs = crochet * 1.1;
          const oK = Math.max(0, 1 - (now - oPoseAt) / singMs),
            pK = Math.max(0, 1 - (now - pPoseAt) / singMs);
          drawBoombox(g, 640, 600, beat >= 0 ? Math.pow(1 - (beat % 1), 3) : 0);
          drawHex(g, 300, 640, oK > 0 ? oPose : "idle", oK, idle, t);
          drawVolt(g, 1000, 650, pK > 0 ? pPose : "idle", pK, idle, t);
          g.restore();

          // ── HUD (screen space, design units)
          g.save();
          g.beginPath();
          g.rect(ox, oy, W * scale, H * scale);
          g.clip();
          const hs = scale * hudZoom;
          g.setTransform(hs, 0, 0, hs, ox + (W / 2) * scale - (W / 2) * hs, oy + (H / 2) * scale - (H / 2) * hs);
          // strums
          for (const player of [false, true]) {
            if (opts.middlescroll && !player) continue;
            for (let l = 0; l < 4; l++) {
              const x = laneX(player, l);
              const glow = strumGlow[(player ? 4 : 0) + l];
              const pressed = player && press.current[l] && !opts.botplay;
              arrow(g, x, strumY, NOTE * (pressed ? 0.92 : 1), l, glow > 0 ? "glow" : pressed ? "press" : "strum");
            }
          }
          // notes
          for (let i = firstNoteIdx; i < chart.notes.length; i++) {
            const n = chart.notes[i];
            const y = noteY(n.t, pos);
            if (opts.downscroll ? y < -NOTE * 2 : y > H + NOTE * 2) {
              if (!n.sus) break;
              if (opts.downscroll ? noteY(n.t, pos) < -2000 : noteY(n.t, pos) > H + 2000) break;
            }
            if (opts.middlescroll && !n.player) continue;
            const x = laneX(n.player, n.lane);
            if (n.sus > 0 && !n.holdDone) {
              const y0 = n.hit ? strumY : y;
              const y1 = noteY(n.t + n.sus, pos);
              if ((opts.downscroll ? y1 < y0 : y1 > y0) && !(n.player && n.missed)) trail(g, x, y0, y1, NOTE, n.lane, n.player ? 1 : 0.8);
            }
            if (n.hit || (n.missed && Math.abs(y - strumY) > NOTE * 3)) continue;
            if (n.kind === "Hurt Note") {
              g.save();
              g.filter = "grayscale(1) brightness(.6)";
              arrow(g, x, y, NOTE, n.lane, "note", n.missed ? 0.35 : 1);
              g.restore();
            } else arrow(g, x, y, NOTE, n.lane, "note", n.missed ? 0.35 : 1);
          }
          drawSparks(g, sparks, paused ? 0 : dt);

          // health bar
          const hbY = opts.downscroll ? H * 0.11 : H * 0.89;
          const hbW = 601,
            hbX = (W - hbW) / 2;
          g.fillStyle = "#000";
          g.fillRect(hbX - 4, hbY - 4, hbW + 8, 27);
          const split = hbX + hbW * (1 - st.health / 2);
          g.fillStyle = "#8a3cff";
          g.fillRect(hbX, hbY, split - hbX, 19);
          g.fillStyle = "#26e0ff";
          g.fillRect(split, hbY, hbX + hbW - split, 19);
          const ib = 1 + iconBop * 0.2;
          iconHex(g, split - 52, hbY + 9, ib * 0.95, st.health > 1.6);
          iconVolt(g, split + 52, hbY + 9, ib * 0.95, st.health < 0.4);
          // score line
          const acc = accuracy(st);
          g.font = "bold 20px system-ui, sans-serif";
          g.textAlign = "center";
          g.lineWidth = 4;
          g.strokeStyle = "#000";
          g.fillStyle = "#fff";
          const line = opts.botplay ? "BOTPLAY" : `Score: ${st.score.toLocaleString()} | Misses: ${st.misses} | Rating: ${st.hits + st.misses ? `${grade(acc)} (${acc.toFixed(2)}%) - ${fcLabel(st)}` : "?"}`;
          g.strokeText(line, W / 2, hbY + 56);
          g.fillText(line, W / 2, hbY + 56);
          // time bar
          const tbY = opts.downscroll ? H - 32 : 18;
          const prog = Math.max(0, Math.min(1, pos / songEnd));
          g.fillStyle = "rgba(0,0,0,.7)";
          g.fillRect(W / 2 - 200, tbY - 2, 400, 22);
          g.fillStyle = "#aa00ff";
          g.fillRect(W / 2 - 198, tbY, 396 * prog, 18);
          g.font = "bold 16px system-ui, sans-serif";
          g.fillStyle = "#fff";
          const leftS = Math.max(0, Math.round((songEnd - pos) / 1000));
          const tl = `${song.title}  ·  ${Math.floor(leftS / 60)}:${String(leftS % 60).padStart(2, "0")}`;
          g.strokeText(tl, W / 2, tbY + 15);
          g.fillText(tl, W / 2, tbY + 15);
          // countdown
          if (pos < 0) {
            const left = Math.ceil(-pos / crochet);
            const label = left >= 4 ? "" : left === 3 ? "3" : left === 2 ? "2" : left === 1 ? "1" : "";
            const k = 1 - ((-pos / crochet) % 1);
            if (label) {
              g.save();
              g.globalAlpha = 1 - k;
              g.font = "900 120px system-ui, sans-serif";
              g.fillStyle = "#fff";
              g.strokeStyle = "#2a0b4a";
              g.lineWidth = 10;
              g.strokeText(label, W / 2, H / 2 + 40);
              g.fillText(label, W / 2, H / 2 + 40);
              g.restore();
            }
          } else if (pos < crochet) {
            g.save();
            g.globalAlpha = 1 - pos / crochet;
            g.font = "900 130px system-ui, sans-serif";
            g.fillStyle = "#ffd400";
            g.strokeStyle = "#2a0b4a";
            g.lineWidth = 10;
            g.strokeText("GO!", W / 2, H / 2 + 45);
            g.fillText("GO!", W / 2, H / 2 + 45);
            g.restore();
          }
          // rating popup
          if (rating && now - rating.at < 700) {
            const k = (now - rating.at) / 700;
            g.save();
            g.globalAlpha = 1 - Math.max(0, k - 0.5) * 2;
            const ry = H * 0.48 - k * 24;
            g.font = "italic 900 46px system-ui, sans-serif";
            g.fillStyle = rating.color;
            g.strokeStyle = "#16061f";
            g.lineWidth = 8;
            g.strokeText(rating.name, W * 0.44, ry);
            g.fillText(rating.name, W * 0.44, ry);
            if (rating.combo >= 10) {
              g.font = "900 40px system-ui, sans-serif";
              g.fillStyle = "#fff";
              const cs = String(rating.combo);
              g.strokeText(cs, W * 0.44, ry + 52);
              g.fillText(cs, W * 0.44, ry + 52);
            }
            g.restore();
          }
          if (opts.botplay && Math.sin(t * 3) > 0) {
            g.font = "900 32px system-ui, sans-serif";
            g.fillStyle = "#fff";
            g.strokeText("BOTPLAY", W / 2, opts.downscroll ? H - 120 : 150);
            g.fillText("BOTPLAY", W / 2, opts.downscroll ? H - 120 : 150);
          }
          g.restore();
          g.setTransform(1, 0, 0, 1, 0, 0);
          drawFlash(g, stage, c.width, c.height, paused ? 0 : dt);
        };
        raf = requestAnimationFrame(frame);

        const kd = (e: KeyboardEvent) => {
          if (e.repeat) return;
          if (e.code === "Escape" || e.code === "Enter") {
            e.preventDefault();
            if (ctx.state === "running") pause();
            else if (!died) resume();
            return;
          }
          const l = keyLane(e.code);
          if (l >= 0) {
            e.preventDefault();
            if (ctx.state === "running") hit(l, true);
          }
        };
        const ku = (e: KeyboardEvent) => {
          const l = keyLane(e.code);
          if (l >= 0) hit(l, false);
        };
        const blur = () => ctx.state === "running" && pause();
        window.addEventListener("keydown", kd);
        window.addEventListener("keyup", ku);
        window.addEventListener("blur", blur);
        cleanupRef.current = () => {
          window.removeEventListener("keydown", kd);
          window.removeEventListener("keyup", ku);
          window.removeEventListener("blur", blur);
        };
        void died;
      } catch (e) {
        if (!alive) return;
        setErr((e as Error).message || "Couldn't load the song");
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      cleanupRef.current();
      try {
        live.current?.inst?.stop();
        live.current?.voices?.stop();
      } catch {
        /* not started */
      }
      void ctx.close();
    };
  }, [song, opts]);

  // touch hitbox: four columns
  const touch = (e: React.PointerEvent, down: boolean) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lane = Math.max(0, Math.min(3, Math.floor(((e.clientX - r.left) / r.width) * 4)));
    if (down) {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      lanesByPointer.current.set(e.pointerId, lane);
      api.current?.hit(lane, true);
    } else {
      const l = lanesByPointer.current.get(e.pointerId);
      lanesByPointer.current.delete(e.pointerId);
      if (l != null) api.current?.hit(l, false);
    }
  };
  const lanesByPointer = useRef(new Map<number, number>());

  return (
    <div className="relative h-full min-h-0 w-full touch-none overflow-hidden bg-black select-none">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      {mobile && phase === "playing" && (
        <div className="absolute inset-0 grid grid-cols-4" onPointerDown={(e) => touch(e, true)} onPointerUp={(e) => touch(e, false)} onPointerCancel={(e) => touch(e, false)}>
          {LANE_COLORS.map((c, i) => (
            <div key={i} className="h-full border-x border-white/5" style={{ boxShadow: `inset 0 -60px 60px -60px ${c}` }} />
          ))}
        </div>
      )}
      {phase === "playing" && (
        <button onClick={() => api.current?.pause()} className="absolute top-2 right-2 z-10 grid size-10 place-items-center rounded-full bg-black/50 text-white" aria-label="Pause">
          <Pause className="size-5" />
        </button>
      )}
      {phase === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-[#0b0618] text-white">
          <div className="text-center">
            <div className="mx-auto size-12 animate-spin rounded-full border-4 border-[#aa00ff] border-t-transparent" />
            <div className="mt-3 font-bold">Loading {song.title}…</div>
          </div>
        </div>
      )}
      {phase === "error" && (
        <Overlay title="Couldn't start the song" sub={err}>
          <button onClick={onQuit} className="rounded-full bg-white px-6 py-3 font-bold text-black">
            Back
          </button>
        </Overlay>
      )}
      {phase === "paused" && (
        <Overlay title="Paused" sub={song.title}>
          <button onClick={() => api.current?.resume()} className="rounded-full bg-[#aa00ff] px-6 py-3 font-bold text-white">
            Resume
          </button>
          <button onClick={onRestart} className="rounded-full bg-white/15 px-6 py-3 font-bold text-white">
            Restart song
          </button>
          <button onClick={onQuit} className="rounded-full bg-white/15 px-6 py-3 font-bold text-white">
            Exit to menu
          </button>
        </Overlay>
      )}
      {phase === "dead" && (
        <Overlay title="You lost the battle" sub="Hex out-sang you this time.">
          <button onClick={onRestart} className="rounded-full bg-[#aa00ff] px-6 py-3 font-bold text-white">
            Retry
          </button>
          <button onClick={() => live.current && onDone(live.current.stats, true)} className="rounded-full bg-white/15 px-6 py-3 font-bold text-white">
            See stats
          </button>
          <button onClick={onQuit} className="rounded-full bg-white/15 px-6 py-3 font-bold text-white">
            Exit
          </button>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-4 text-white backdrop-blur-sm">
      <div className="flex w-full max-w-xs flex-col gap-2 text-center">
        <div className="text-3xl font-black italic">{title}</div>
        {sub && <div className="mb-3 text-sm text-white/70">{sub}</div>}
        {children}
      </div>
    </div>
  );
}
