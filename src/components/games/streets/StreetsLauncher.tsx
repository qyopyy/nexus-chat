"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Send, Trophy, Users } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useGames } from "@/store/games";
import { friendIds, sendMessage } from "@/lib/data";
import { supabase, errorText } from "@/lib/supabase";
import { leaderboard, localBest, saveLocalBest, submitScore, type Row } from "@/lib/games";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import NeonStreets, { type StreetsMode } from "./NeonStreets";
import { joinRoom, newCode, validCode, type Net } from "./net";

const COLORS = ["#ff2bd6", "#00e5ff", "#ffd400", "#00ff9c", "#ff6b2b", "#7c4dff", "#ff4d6d", "#ffffff"];

export const inviteLink = (code: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexus-chat-plum.vercel.app"}/?play=${code}`;

export default function StreetsLauncher({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const me = useApp((s) => s.userId)!;
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "Driver");
  const pending = useGames((s) => s.joinCode);
  const [color, setColor] = useState(() => {
    try {
      return localStorage.getItem("nexus:streets-color") ?? COLORS[0];
    } catch {
      return COLORS[0];
    }
  });
  const [play, setPlay] = useState<{ mode: StreetsMode; net: Net | null; run: number } | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState<{ score: number; best: number } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => void leaderboard("streets").then(setRows), []);
  useEffect(() => {
    try {
      localStorage.setItem("nexus:streets-color", color);
    } catch {
      /* private mode */
    }
  }, [color]);

  const start = useCallback(
    (mode: StreetsMode, roomCode?: string) => {
      const net = mode === "online" && roomCode ? joinRoom(roomCode, me, myName, color) : null;
      setPlay({ mode, net, run: Date.now() });
      useGames.setState({ playing: true, joinCode: null });
    },
    [me, myName, color],
  );

  // opened from an invite (?play=CODE or a chat invite card)
  useEffect(() => {
    if (pending && validCode(pending) && !play) {
      setRoom(pending);
      start("online", pending);
    }
  }, [pending, play, start]);

  const exit = useCallback(() => {
    play?.net?.leave();
    setPlay(null);
    useGames.setState({ playing: false });
  }, [play]);
  useEffect(() => () => useGames.setState({ playing: false }), []);

  const onOver = useCallback(
    (score: number) => {
      const best = localBest("streets");
      saveLocalBest("streets", score);
      void submitScore("streets", score).then(() => leaderboard("streets").then(setRows));
      setResult({ score, best });
      play?.net?.leave();
      setPlay(null);
      useGames.setState({ playing: false });
    },
    [play],
  );

  if (play) {
    return (
      <div className="fixed inset-0 z-[70] bg-black">
        <NeonStreets key={play.run} mode={play.mode} net={play.net} name={myName} color={color} onOver={play.mode === "rush" ? onOver : undefined} onExit={exit} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07070d] text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-lg">🚗</span>
        <span className="font-bold">Neon Streets</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <div className="rounded-3xl p-5" style={{ background: "linear-gradient(135deg,#ff2bd6,#2b0b5c)" }}>
            <div className="text-3xl font-black">Neon Streets</div>
            <p className="mt-1 max-w-lg text-sm text-white/85">A whole island city to drive around — downtown towers, suburbs, the river and bridges, the beach. Do jobs, collect cash, lose the cops, and race your friends.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-white/80">Your car</span>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={cn("size-7 rounded-full ring-2 transition", color === c ? "scale-110 ring-white" : "ring-transparent")} style={{ background: c }} aria-label={c} />
              ))}
            </div>
          </div>

          {result && (
            <div className="rounded-2xl bg-white/10 p-4 text-center">
              <div className="text-xs font-bold tracking-widest text-white/60 uppercase">Delivery Rush score</div>
              <div className="text-5xl font-black">${result.score.toLocaleString()}</div>
              {result.score > result.best && <div className="font-bold text-[#ffd400]">New personal best!</div>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard title="Free roam" emoji="🌆" text="No timer. Explore the city, take delivery jobs, grab cash, outrun the police." onClick={() => start("free")} />
            <ModeCard title="Delivery Rush" emoji="⏱️" text="Deliver as many packages as you can before time runs out. Scores go on the leaderboard." onClick={() => start("rush")} />
          </div>

          {/* multiplayer */}
          <div className="rounded-2xl bg-white/[.06] p-4">
            <div className="mb-1 flex items-center gap-2 font-bold">
              <Users className="size-5 text-[#00e5ff]" /> Play with friends
            </div>
            <p className="mb-3 text-sm text-white/70">Same city, live together: see each other drive, honk, emote and race. Share the 6-letter code.</p>
            {room ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl bg-black/40 px-4 py-2 font-mono text-3xl font-black tracking-[.3em]">{room}</div>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(inviteLink(room));
                      toast("Invite link copied", "success");
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold"
                  >
                    <Copy className="size-4" /> Copy link
                  </button>
                  <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold">
                    <Send className="size-4" /> Invite friends
                  </button>
                </div>
                <button onClick={() => start("online", room)} className="w-full rounded-full bg-[#00e5ff] py-3 font-black text-black">
                  Start driving
                </button>
                <button onClick={() => setRoom(null)} className="w-full text-sm text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={() => setRoom(newCode())} className="rounded-full bg-[#00e5ff] px-5 py-2.5 font-black text-black">
                  Create room
                </button>
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = code.trim().toUpperCase();
                    if (!validCode(c)) return toast("Codes are 6 letters/numbers", "error");
                    setRoom(c);
                    start("online", c);
                  }}
                >
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                    placeholder="Enter code"
                    className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-2.5 font-mono text-lg tracking-widest uppercase outline-none placeholder:font-sans placeholder:text-sm placeholder:tracking-normal"
                  />
                  <button className="rounded-full bg-white/15 px-5 font-bold">Join</button>
                </form>
              </div>
            )}
          </div>

          {/* leaderboard */}
          <div className="rounded-2xl bg-white/[.06] p-4">
            <div className="mb-2 flex items-center gap-2 font-bold">
              <Trophy className="size-4 text-[#ffd400]" /> Delivery Rush leaderboard
            </div>
            {rows.length === 0 && <p className="text-sm text-white/50">No scores yet — be the first.</p>}
            {rows.slice(0, 10).map((r, i) => (
              <div key={r.user_id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", r.user_id === me && "bg-white/10")}>
                <span className="w-6 text-center text-sm font-bold text-white/60">{i + 1}</span>
                <Avatar userId={r.user_id} size={24} plain />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <NameTag userId={r.user_id} badges={false} />
                </span>
                <span className="text-sm font-semibold tabular-nums">${r.best.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="pb-4 text-center text-xs text-white/40">Phone: steer with the pad, GAS / BRAKE / DRIFT on the right · Computer: WASD or arrows, Space drift, H horn, M map</p>
        </div>
      </div>
      {inviteOpen && room && <InviteSheet code={room} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function ModeCard({ title, emoji, text, onClick }: { title: string; emoji: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 rounded-2xl bg-white/[.06] p-4 text-left transition hover:bg-white/10 active:scale-[.98]">
      <span className="text-3xl">{emoji}</span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-white/65">{text}</span>
      </span>
    </button>
  );
}

function InviteSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const ids = friendIds();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const invite = async (uid: string) => {
    const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: uid });
    if (error) return toast(errorText(error), "error");
    await sendMessage(data as string, `🎮 Join me in Neon Streets! Room code: ${code}\n${inviteLink(code)}`);
    setSent((s) => ({ ...s, [uid]: true }));
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 sm:place-items-center" onClick={onClose}>
      <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-[#14141f] p-4 pb-safe-4 text-white sm:max-w-sm sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-lg font-bold">Invite friends</div>
        {ids.length === 0 && <p className="text-sm text-white/60">Add friends first — or copy the link and send it anywhere.</p>}
        {ids.map((id) => (
          <div key={id} className="flex items-center gap-3 py-1.5">
            <Avatar userId={id} size={36} />
            <span className="min-w-0 flex-1 truncate">
              <NameTag userId={id} badges={false} />
            </span>
            <button disabled={sent[id]} onClick={() => void invite(id)} className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold", sent[id] ? "bg-white/10 text-white/60" : "bg-[#00e5ff] text-black")}>
              {sent[id] ? (
                <>
                  <Check className="size-4" /> Sent
                </>
              ) : (
                "Invite"
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
