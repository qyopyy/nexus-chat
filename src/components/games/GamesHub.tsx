"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Gamepad2, Maximize, Minimize, Play, Trophy } from "lucide-react";
import { useApp } from "@/store/app";
import { leaderboard, localBest, saveLocalBest, submitScore, type GameId, type Row } from "@/lib/games";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import StreetsLauncher from "./streets/StreetsLauncher";
import { useGames } from "@/store/games";
import Blocks from "./Blocks";
import Snake from "./Snake";
import G2048 from "./G2048";
import BeatBird from "./BeatBird";
import WebSwing from "./WebSwing";
import GeoGuess from "./GeoGuess";
import FourInRow from "./FourInRow";
import SunsetBay from "./bay/SunsetBay";
import FlappyHappy from "./flappy/FlappyHappy";
import Pinball from "./Pinball";
import BrickBash from "./BrickBash";
import PongDuel from "./PongDuel";
import MemoryFlip from "./MemoryFlip";
import TicTacToe from "./TicTacToe";
import Reaction from "./Reaction";
import Whack from "./Whack";
import Runner from "./Runner";
import Mines from "./Mines";

const GAMES: { id: GameId; name: string; tag: string; desc: string; bg: string; emoji: string; C: typeof Blocks | null; isNew?: boolean }[] = [
  { id: "streets", name: "Neon Streets", tag: "Open-city driving", desc: "Open-world island city. Jobs, cash, cops — and play live with friends using an invite code.", bg: "linear-gradient(135deg,#ff2bd6,#2b0b5c)", emoji: "🚗", C: null },
  { id: "bay", name: "Sunset Bay", tag: "3D open world · 80s neon", desc: "Drive a neon coastal city in 3D — drifts, stunt jumps, hidden tapes and a ranked checkpoint rush.", bg: "linear-gradient(180deg,#2b1055,#ff4f9a 70%,#ffb347)", emoji: "🌴", C: null },
  { id: "geo", name: "GeoGuess", tag: "Real places · multiplayer", desc: "Real photos from around the world — pin where you think you are.", bg: "linear-gradient(135deg,#00c96b,#0b2a5c)", emoji: "🌍", C: null },
  { id: "flappy", name: "Flappy Happy", tag: "Arcade · multiplayer race", desc: "Worlds, birds, daily gifts, chests — and live pipe races with friends.", bg: "linear-gradient(135deg,#38bdf8,#4ade80)", emoji: "🐤", C: null },
  { id: "runner", name: "Neon Runner", tag: "Endless · jump", desc: "Sprint the neon strip — tap to jump the blocks before they hit you.", bg: "linear-gradient(135deg,#ff2bd6,#0b0b2a)", emoji: "🏃", C: Runner, isNew: true },
  { id: "whack", name: "Whack Dash", tag: "Arcade · 30s", desc: "Tap the moles before the clock runs out.", bg: "linear-gradient(135deg,#facc15,#5c0b3a)", emoji: "🐹", C: Whack, isNew: true },
  { id: "reaction", name: "Reaction Rush", tag: "Reflex · 5 rounds", desc: "Wait for green, tap as fast as you can. Don't jump the gun.", bg: "linear-gradient(135deg,#22c55e,#0b2a1a)", emoji: "⚡", C: Reaction, isNew: true },
  { id: "tictactoe", name: "Tic Tac Toe", tag: "Vs bot", desc: "Classic Xs and Os against a blocking bot. Streak your wins.", bg: "linear-gradient(135deg,#60a5fa,#1e3a5f)", emoji: "⭕", C: TicTacToe, isNew: true },
  { id: "mines", name: "Mini Mines", tag: "Puzzle · 8×8", desc: "Clear the board without hitting a mine. Right-click to flag.", bg: "linear-gradient(135deg,#64748b,#0f172a)", emoji: "💣", C: Mines, isNew: true },
  { id: "pinball", name: "Sky Pinball", tag: "Arcade · flippers", desc: "Launch the ball, slap the bumpers, keep it alive with the flippers.", bg: "linear-gradient(135deg,#7c3aed,#0b1a5c)", emoji: "🌀", C: Pinball },
  { id: "bricks", name: "Brick Bash", tag: "Arcade · breakout", desc: "Bounce the ball, clear the rainbow wall, grow your paddle.", bg: "linear-gradient(135deg,#ef4444,#7c2d12)", emoji: "🧱", C: BrickBash },
  { id: "pong", name: "Pong Duel", tag: "Vs bot · first to 7", desc: "Classic paddle battle against a tracking bot.", bg: "linear-gradient(135deg,#38bdf8,#f472b6)", emoji: "🏓", C: PongDuel },
  { id: "memory", name: "Memory Flip", tag: "Puzzle · match pairs", desc: "Flip cards, find pairs, finish in fewer moves for a higher score.", bg: "linear-gradient(135deg,#a855f7,#1e293b)", emoji: "🃏", C: MemoryFlip },
  { id: "swing", name: "Web Swing", tag: "Action · swing the city", desc: "Hold to web the rooftops, release to fly. Flip for combos, dodge drones, never touch the street.", bg: "linear-gradient(135deg,#8b5cff,#ff2bd6)", emoji: "🕸️", C: WebSwing },
  { id: "four", name: "Four in a Row", tag: "Vs friends or bot", desc: "Connect four discs before your opponent does.", bg: "linear-gradient(135deg,#ff4d6d,#2b5cff)", emoji: "🔴", C: null },
  { id: "blocks", name: "Neon Blocks", tag: "Puzzle", desc: "Stack falling blocks and clear lines. It speeds up every 10 lines.", bg: "linear-gradient(135deg,#00e5ff,#0b1a5c)", emoji: "🧱", C: Blocks },
  { id: "beatbird", name: "Beat Bird", tag: "Arcade · with sound", desc: "Flap through the speaker stacks — every gap plays a note.", bg: "linear-gradient(135deg,#ffd400,#5c0b3a)", emoji: "🐦", C: BeatBird },
  { id: "snake", name: "Snake", tag: "Classic", desc: "Eat the notes, grow longer, don't bite yourself.", bg: "linear-gradient(135deg,#00ff9c,#0b3a2a)", emoji: "🐍", C: Snake },
  { id: "2048", name: "2048", tag: "Puzzle", desc: "Slide tiles, merge equal numbers, reach 2048.", bg: "linear-gradient(135deg,#ff9f2b,#5c2b0b)", emoji: "🔢", C: G2048 },
];

/** official, free browser games — they open on their own sites */
const WEB_GAMES: { name: string; url: string; tag: string; color: string }[] = [
  { name: "Minecraft Classic", url: "https://classic.minecraft.net", tag: "Official free Minecraft in the browser", color: "#62b33a" },
  { name: "Krunker", url: "https://krunker.io", tag: "Fast multiplayer FPS", color: "#ffb02b" },
  { name: "Smash Karts", url: "https://smashkarts.io", tag: "Multiplayer kart battles", color: "#ff4d6d" },
  { name: "PolyTrack", url: "https://kodub.itch.io/polytrack", tag: "Low-poly racing with a track editor", color: "#2b7bff" },
  { name: "Shell Shockers", url: "https://shellshock.io", tag: "Egg shooter multiplayer", color: "#ffd400" },
  { name: "Bloxd.io", url: "https://bloxd.io", tag: "Voxel parkour, survival and more", color: "#7c4dff" },
  { name: "Slither.io", url: "https://slither.io", tag: "Multiplayer snake", color: "#00ff9c" },
  { name: "GeoFS", url: "https://www.geo-fs.com", tag: "Free flight simulator on real maps", color: "#00b0ff" },
  { name: "Lichess", url: "https://lichess.org", tag: "Free open-source chess", color: "#b5bac1" },
  { name: "Wordle", url: "https://www.nytimes.com/games/wordle", tag: "Daily five-letter word puzzle", color: "#6aaa64" },
  { name: "2048 Official", url: "https://play2048.co", tag: "The classic 2048 in the browser", color: "#edc22e" },
  { name: "Cookie Clicker", url: "https://orteil.dashnet.org/cookieclicker/", tag: "Bake cookies forever", color: "#c4a484" },
];

export default function GamesHub({ mobile }: { mobile?: boolean }) {
  const [open, setOpen] = useState<GameId | null>(null);
  const [frame, setFrame] = useState<(typeof WEB_GAMES)[number] | null>(null);
  const joinCode = useGames((s) => s.joinCode);
  const joinFor = useGames((s) => s.joinGame);
  useEffect(() => {
    if (joinCode) setOpen(joinFor === "flappy" ? "flappy" : joinFor);
  }, [joinCode, joinFor]);
  if (frame) return <WebFrame game={frame} onBack={() => setFrame(null)} mobile={mobile} />;
  if (open === "streets") return <StreetsLauncher onBack={() => setOpen(null)} mobile={mobile} />;
  if (open === "bay") return <SunsetBay onBack={() => setOpen(null)} mobile={mobile} />;
  if (open === "geo") return <GeoGuess onBack={() => setOpen(null)} mobile={mobile} />;
  if (open === "four") return <FourInRow onBack={() => setOpen(null)} mobile={mobile} />;
  if (open === "flappy") return <FlappyHappy onBack={() => setOpen(null)} mobile={mobile} />;
  if (open) return <GameScreen id={open} onBack={() => setOpen(null)} mobile={mobile} />;
  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        {mobile && (
          <button onClick={() => useApp.setState({ mobileTab: "music" })} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to Music">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <Gamepad2 className="size-5 text-[#ff2bd6]" />
        <span className={cn("font-bold", mobile ? "text-2xl tracking-tight" : "text-base")}>Games</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl space-y-6 p-3 sm:p-5">
          {/* new: Sunset Bay */}
          <button onClick={() => setOpen("bay")} className="group relative block w-full overflow-hidden rounded-3xl text-left" style={{ background: "linear-gradient(180deg,#2b1055 0%,#ff4f9a 55%,#ffb347 72%,#1a0b2e 73%)" }}>
            <div className="pointer-events-none absolute right-[8%] bottom-[27%] size-40 rounded-full sm:size-56" style={{ background: "linear-gradient(#ffe45e,#ff2bd6)", maskImage: "repeating-linear-gradient(180deg,#000 0 12px,transparent 12px 17px)" }} />
            <div className="relative z-10 p-5 sm:p-8">
              <div className="text-xs font-bold tracking-widest text-white/85 uppercase">New · 3D open world · synthwave radio</div>
              <div className="mt-1 text-3xl font-black text-white italic sm:text-5xl">SUNSET BAY</div>
              <p className="mt-2 max-w-md text-sm text-white/90">An 80s neon coastal city: downtown towers, Ocean Drive, causeways and a lighthouse isle. Drift, jump, hunt tapes, race the clock.</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-bold text-black transition group-hover:scale-105">
                <Play className="size-4 fill-current" /> Drive now
              </span>
            </div>
            <div className="absolute -right-4 -bottom-6 text-[120px] sm:text-[170px]">🌴</div>
          </button>

          {/* new: GeoGuess */}
          <button onClick={() => setOpen("geo")} className="group relative block w-full overflow-hidden rounded-3xl text-left" style={{ background: "radial-gradient(120% 140% at 0% 0%, #00c96b 0%, #0b2a5c 65%, #06140e 100%)" }}>
            <div className="relative z-10 p-5 sm:p-8">
              <div className="text-xs font-bold tracking-widest text-white/80 uppercase">New · real photos · play with friends</div>
              <div className="mt-1 text-3xl font-black text-white sm:text-5xl">GeoGuess</div>
              <p className="mt-2 max-w-md text-sm text-white/85">Dropped somewhere on Earth — read the clues, pin the map. Daily challenge, solo, or live rooms with your friends.</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-bold text-black transition group-hover:scale-105">
                <Play className="size-4 fill-current" /> Play now
              </span>
            </div>
            <div className="absolute -right-6 -bottom-10 text-[140px] opacity-90 sm:text-[200px]">🌍</div>
          </button>

          {/* featured */}
          <button onClick={() => setOpen("streets")} className="group relative block w-full overflow-hidden rounded-3xl text-left" style={{ background: GAMES[0].bg }}>
            <div className="relative z-10 p-5 sm:p-8">
              <div className="text-xs font-bold tracking-widest text-white/80 uppercase">Open world · Multiplayer</div>
              <div className="mt-1 text-3xl font-black text-white sm:text-5xl">Neon Streets</div>
              <p className="mt-2 max-w-md text-sm text-white/85">{GAMES[0].desc}</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-bold text-black transition group-hover:scale-105">
                <Play className="size-4 fill-current" /> Play now
              </span>
            </div>
            <div className="absolute -right-6 -bottom-8 text-[140px] opacity-90 sm:text-[200px]">🚓</div>
          </button>

          {/* featured Flappy Happy */}
          <button onClick={() => setOpen("flappy")} className="group relative block w-full overflow-hidden rounded-3xl text-left" style={{ background: "linear-gradient(180deg,#7dd3fc 0%,#4ade80 55%,#15803d 100%)" }}>
            <div className="relative z-10 p-5 sm:p-8">
              <div className="text-xs font-bold tracking-widest text-white/90 uppercase">Updated · worlds · multiplayer race</div>
              <div className="mt-1 text-3xl font-black text-white sm:text-5xl">Flappy Happy</div>
              <p className="mt-2 max-w-md text-sm text-white/90">Collect birds, claim daily gifts, open Top-3 chests, and race friends on a shared pipe seed.</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#facc15] px-5 py-2.5 font-black text-black transition group-hover:scale-105">
                <Play className="size-4 fill-current" /> Play now
              </span>
            </div>
            <div className="absolute -right-4 -bottom-6 text-[120px] sm:text-[170px]">🐤</div>
          </button>

          <section>
            <h2 className="mb-3 text-lg font-bold">Nexus games</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {GAMES.map((g) => (
                <button key={g.id} onClick={() => setOpen(g.id)} className="group overflow-hidden rounded-2xl bg-side text-left transition hover:-translate-y-0.5">
                  <div className="relative grid aspect-[4/3] place-items-center text-5xl" style={{ background: g.bg }}>
                    <span className="transition group-hover:scale-110">{g.emoji}</span>
                    {g.isNew && <span className="absolute top-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-black">NEW</span>}
                  </div>
                  <div className="p-2.5">
                    <div className="truncate font-semibold">{g.name}</div>
                    <div className="truncate text-xs text-sub">{g.tag}</div>
                    <Best id={g.id} />
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-bold">Play on the web</h2>
            <p className="mb-3 text-sm text-sub">Free browser games from their official sites — play them right here in Nexus, or open them in a new tab.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {WEB_GAMES.map((g) => (
                <div key={g.url} className="flex items-center gap-3 rounded-2xl bg-side p-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl text-lg font-black text-black" style={{ background: g.color }}>
                    {g.name[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block truncate text-xs text-sub">{g.tag}</span>
                  </span>
                  <button onClick={() => setFrame(g)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white">
                    <Play className="size-3 fill-current" /> Play
                  </button>
                  <a href={g.url} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label={`Open ${g.name} in a new tab`}>
                    <ExternalLink className="size-4 text-sub" />
                  </a>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-faint">
              Browser ports of paid games like GTA V aren&apos;t included — they&apos;re unofficial copies and get taken down by the publishers. Neon Streets is our own take on the classic top-down city
              game.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Best({ id }: { id: GameId }) {
  const [b, setB] = useState(0);
  useEffect(() => setB(localBest(id)), [id]);
  return b ? (
    <div className="mt-1 flex items-center gap-1 text-[11px] text-[#ffd400]">
      <Trophy className="size-3" /> {b.toLocaleString()}
    </div>
  ) : null;
}

function GameScreen({ id, onBack, mobile }: { id: GameId; onBack: () => void; mobile?: boolean }) {
  const g = GAMES.find((x) => x.id === id)!;
  const [session, setSession] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [prevBest, setPrevBest] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [full, setFull] = useState(false);
  const live = useRef(0);
  const me = useApp((s) => s.userId);
  const wrap = useRef<HTMLDivElement>(null);

  const loadBoard = useCallback(() => void leaderboard(id).then(setRows), [id]);
  useEffect(loadBoard, [loadBoard]);

  const onScore = useCallback((s: number) => {
    live.current = s;
  }, []);
  const onOver = useCallback(
    (s: number) => {
      setPrevBest(localBest(id));
      setResult(s);
      saveLocalBest(id, s);
      void submitScore(id, s).then(loadBoard);
    },
    [id, loadBoard],
  );

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.current?.requestFullscreen();
    } catch {
      /* not allowed */
    }
  };
  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const myRank = rows.findIndex((r) => r.user_id === me);
  const C = g.C!;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07070d] text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-lg">{g.emoji}</span>
        <span className="min-w-0 flex-1 truncate font-bold">{g.name}</span>
        <button onClick={() => void toggleFull()} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Full screen">
          {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={wrap} className="relative min-h-0 flex-1 bg-[#07070d]">
          {session === 0 ? (
            <div className="grid size-full place-items-center p-6 text-center" style={{ background: g.bg }}>
              <div>
                <div className="text-7xl">{g.emoji}</div>
                <div className="mt-2 text-3xl font-black">{g.name}</div>
                <p className="mx-auto mt-2 max-w-sm text-sm text-white/85">{g.desc}</p>
                <button onClick={() => setSession(1)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-black">
                  <Play className="size-4 fill-current" /> Play
                </button>
              </div>
            </div>
          ) : (
            <C key={session} onOver={onOver} onScore={onScore} />
          )}
          {result !== null && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-6 text-center">
              <div>
                <div className="text-sm font-bold tracking-widest text-white/60 uppercase">Score</div>
                <div className="text-6xl font-black tabular-nums">{result.toLocaleString()}</div>
                {result > prevBest && result > 0 && <div className="mt-1 font-bold text-[#ffd400]">New personal best!</div>}
                <div className="mt-5 flex justify-center gap-2">
                  <button
                    onClick={() => {
                      setResult(null);
                      setSession((s) => s + 1);
                    }}
                    className="rounded-full bg-white px-6 py-2.5 font-bold text-black"
                  >
                    Play again
                  </button>
                  <button onClick={onBack} className="rounded-full bg-white/15 px-5 py-2.5 font-semibold">
                    Games
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <aside className={cn("shrink-0 border-white/10 bg-[#0d0d16] lg:w-72 lg:border-l", session > 0 && result === null ? "hidden lg:block" : "block")}>
          <div className="flex items-center gap-2 p-3 font-bold">
            <Trophy className="size-4 text-[#ffd400]" /> Leaderboard
            {myRank >= 0 && <span className="ml-auto text-xs font-normal text-white/60">you're #{myRank + 1}</span>}
          </div>
          <div className="max-h-64 overflow-y-auto px-2 pb-3 lg:max-h-none">
            {rows.length === 0 && <p className="px-2 text-sm text-white/50">No scores yet — be the first.</p>}
            {rows.map((r, i) => (
              <div key={r.user_id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", r.user_id === me && "bg-white/10")}>
                <span className={cn("w-6 text-center text-sm font-bold", i === 0 ? "text-[#ffd400]" : i === 1 ? "text-[#c0c0c0]" : i === 2 ? "text-[#cd7f32]" : "text-white/50")}>{i + 1}</span>
                <Avatar userId={r.user_id} size={24} plain />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <NameTag userId={r.user_id} badges={false} />
                </span>
                <span className="text-sm font-semibold tabular-nums">{r.best.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** The original Flappy Happy page, unchanged, inside the games pane. */
function LocalFrame({ title, src, onBack, mobile }: { title: string; src: string; onBack: () => void; mobile?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-bold">{title}</span>
        <button onClick={() => void box.current?.requestFullscreen?.().catch(() => {})} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Full screen">
          <Maximize className="size-4" />
        </button>
      </header>
      <div ref={box} className="relative min-h-0 flex-1 bg-[#090d16]">
        <iframe src={src} title={title} allow="fullscreen; autoplay" allowFullScreen className="absolute inset-0 size-full border-0" />
      </div>
    </div>
  );
}

/** plays an official web game inside Nexus (sites that refuse embedding get the new-tab button) */
function WebFrame({ game, onBack, mobile }: { game: (typeof WEB_GAMES)[number]; onBack: () => void; mobile?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-bold">{game.name}</span>
        <button onClick={() => void box.current?.requestFullscreen?.().catch(() => {})} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Full screen">
          <Maximize className="size-4" />
        </button>
        <a href={game.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
          <ExternalLink className="size-3.5" /> New tab
        </a>
      </header>
      <div ref={box} className="relative min-h-0 flex-1 bg-black">
        <iframe
          src={game.url}
          title={game.name}
          onLoad={() => setLoaded(true)}
          allow="fullscreen; autoplay; gamepad; pointer-lock; clipboard-write"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <div className="mx-auto size-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              <p className="mt-3 text-sm text-white/70">Loading {game.name}…</p>
            </div>
          </div>
        )}
        {slow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <a href={game.url} target="_blank" rel="noreferrer" className="pointer-events-auto rounded-full bg-black/80 px-4 py-2 text-xs backdrop-blur">
              Blank screen? {game.name} doesn&apos;t allow playing inside other sites — <b className="underline">open it in a new tab</b>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
