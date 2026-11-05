"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Send, Trophy, Users } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useGames } from "@/store/games";
import { friendIds, sendMessage } from "@/lib/data";
import { supabase, errorText } from "@/lib/supabase";
import { leaderboard, localBest, saveLocalBest, submitScore, type Row } from "@/lib/games";
import { cn } from "@/lib/utils";
import { roomLink } from "@/lib/room";
import { sendGameInvites } from "@/lib/gameInvites";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import ClassicStrike from "../ClassicStrike";
import { joinRoom, newCode, validCode, type CsNet, type Team } from "./net";

export default function ClassicStrikeLauncher({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const me = useApp((s) => s.userId)!;
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "Player");
  const pending = useGames((s) => (s.joinGame === "classicstrike" ? s.joinCode : null));
  const [team, setTeam] = useState<Team>("T");
  const [play, setPlay] = useState<{ mode: "solo" | "online"; net: CsNet | null; run: number } | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState<{ score: number; best: number } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => void leaderboard("classicstrike").then(setRows), []);

  const start = useCallback(
    (mode: "solo" | "online", roomCode?: string) => {
      const net = mode === "online" && roomCode ? joinRoom(roomCode, me, myName, team) : null;
      setPlay({ mode, net, run: Date.now() });
      useGames.setState({ playing: true, joinCode: null });
    },
    [me, myName, team],
  );

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
      const best = localBest("classicstrike");
      saveLocalBest("classicstrike", score);
      void submitScore("classicstrike", score).then(() => leaderboard("classicstrike").then(setRows));
      setResult({ score, best });
      play?.net?.leave();
      setPlay(null);
      useGames.setState({ playing: false });
    },
    [play],
  );

  if (play) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-black">
        <div className="absolute top-2 left-2 z-[80] flex gap-2">
          <button
            type="button"
            onClick={exit}
            className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/20 hover:bg-black/80"
          >
            Leave
          </button>
          {play.mode === "online" && play.net && (
            <span className="rounded-full bg-black/60 px-3 py-1.5 font-mono text-xs font-bold tracking-widest text-lime-300 ring-1 ring-lime-500/30">
              {play.net.code}
            </span>
          )}
        </div>
        <ClassicStrike
          key={play.run}
          mode={play.mode}
          net={play.net}
          playerName={myName}
          initialTeam={team}
          onOver={onOver}
          onScore={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c0a09] text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button type="button" onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-lg">🔫</span>
        <span className="font-bold">Classic Strike</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <div className="rounded-3xl p-5" style={{ background: "linear-gradient(135deg,#365314,#1c1917 55%,#7c2d12)" }}>
            <div className="font-mono text-3xl font-black tracking-tight">CLASSIC STRIKE</div>
            <p className="mt-1 max-w-lg text-sm text-white/85">
              CS 1.6-style bomb defuse — buy menu, economy, sites. Solo vs bots, or online with friends on the same dust-style map.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white/70">Your team</span>
              <button
                type="button"
                onClick={() => setTeam("T")}
                className={cn("rounded-full px-3 py-1 text-xs font-black", team === "T" ? "bg-amber-500 text-black" : "bg-white/10")}
              >
                Terrorist
              </button>
              <button
                type="button"
                onClick={() => setTeam("CT")}
                className={cn("rounded-full px-3 py-1 text-xs font-black", team === "CT" ? "bg-sky-500 text-black" : "bg-white/10")}
              >
                Counter-Terrorist
              </button>
            </div>
            <p className="mt-3 text-[10px] text-white/50">Fan homage — not affiliated with Valve or Counter-Strike.</p>
          </div>

          {result && (
            <div className="rounded-2xl bg-white/10 p-4 text-center">
              <div className="text-xs font-bold tracking-widest text-white/60 uppercase">Match score</div>
              <div className="font-mono text-5xl font-black">{result.score.toLocaleString()}</div>
              {result.score > result.best && <div className="font-bold text-[#fbbf24]">New personal best!</div>}
            </div>
          )}

          <button
            type="button"
            onClick={() => start("solo")}
            className="flex w-full items-start gap-3 rounded-2xl bg-white/[.06] p-4 text-left transition hover:bg-white/10 active:scale-[.98]"
          >
            <span className="text-3xl">🤖</span>
            <span>
              <span className="block font-bold">Solo vs bots</span>
              <span className="block text-sm text-white/65">Classic offline match — fill both sides with bots, 8 rounds.</span>
            </span>
          </button>

          <div className="rounded-2xl bg-white/[.06] p-4">
            <div className="mb-1 flex items-center gap-2 font-bold">
              <Users className="size-5 text-lime-400" /> Multiplayer
            </div>
            <p className="mb-3 text-sm text-white/70">
              Same map, live peers — shoot, plant, defuse together. Empty slots fill with bots. Share the 6-letter code.
            </p>
            {room ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl bg-black/40 px-4 py-2 font-mono text-3xl font-black tracking-[.3em]">{room}</div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(roomLink(room, "classicstrike"));
                      toast("Invite link copied", "success");
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold"
                  >
                    <Copy className="size-4" /> Copy link
                  </button>
                  <button type="button" onClick={() => setInviteOpen(true)} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold">
                    <Send className="size-4" /> Invite friends
                  </button>
                </div>
                <button type="button" onClick={() => start("online", room)} className="w-full rounded-full bg-lime-400 py-3 font-black text-black">
                  Enter server
                </button>
                <button type="button" onClick={() => setRoom(null)} className="w-full text-sm text-white/60">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setRoom(newCode())} className="rounded-full bg-lime-400 px-5 py-2.5 font-black text-black">
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
                  <button type="submit" className="rounded-full bg-white/15 px-5 font-bold">
                    Join
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white/[.06] p-4">
            <div className="mb-2 flex items-center gap-2 font-bold">
              <Trophy className="size-4 text-[#fbbf24]" /> Leaderboard
            </div>
            {rows.length === 0 && <p className="text-sm text-white/50">No scores yet — be the first.</p>}
            {rows.slice(0, 10).map((r, i) => (
              <div key={r.user_id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", r.user_id === me && "bg-white/10")}>
                <span className="w-6 text-center text-sm font-bold text-white/60">{i + 1}</span>
                <Avatar userId={r.user_id} size={24} plain />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <NameTag userId={r.user_id} badges={false} />
                </span>
                <span className="text-sm font-semibold tabular-nums">{r.best.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="pb-4 text-center text-xs text-white/40">WASD · click lock mouse · B buy · G plant · E defuse · R reload · T/C team</p>
        </div>
      </div>
      {inviteOpen && room && <InviteSheet code={room} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function InviteSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const ids = friendIds();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const invite = async (uid: string) => {
    const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: uid });
    if (error) return toast(errorText(error), "error");
    const link = roomLink(code, "classicstrike");
    await sendMessage(data as string, `🎮 Join me in Classic Strike! Room code: ${code}\n${link}`);
    void sendGameInvites("classicstrike", code, [uid]);
    setSent((s) => ({ ...s, [uid]: true }));
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 sm:place-items-center" onClick={onClose}>
      <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-[#14110e] p-4 pb-safe-4 text-white sm:max-w-sm sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-lg font-bold">Invite friends</div>
        {ids.length === 0 && <p className="text-sm text-white/60">Add friends first — or copy the link and send it anywhere.</p>}
        {ids.map((id) => (
          <div key={id} className="flex items-center gap-3 py-1.5">
            <Avatar userId={id} size={36} />
            <span className="min-w-0 flex-1 truncate">
              <NameTag userId={id} badges={false} />
            </span>
            <button
              type="button"
              disabled={sent[id]}
              onClick={() => void invite(id)}
              className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold", sent[id] ? "bg-white/10 text-white/60" : "bg-lime-400 text-black")}
            >
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
