"use client";

import { useEffect, useState } from "react";
import { ChartColumn, Check, Lock, Plus, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { supabase } from "@/lib/supabase";
import { loadProfiles } from "@/lib/data";
import { closePoll, createPoll, loadPoll, vote, type Poll, type Vote } from "@/lib/polls";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import Sheet from "@/components/ui/Sheet";

/** the poll card inside a chat message — live results */
export function PollCard({ id, mine }: { id: string; mine: boolean }) {
  const me = useApp((s) => s.userId);
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [rosterOpen, setRosterOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void loadPoll(id).then((r) => {
        if (!alive) return;
        setPoll(r.poll);
        setVotes(r.votes);
        void loadProfiles([...new Set(r.votes.map((v) => v.user_id))]);
      });
    load();
    const ch = supabase
      .channel(`poll-${id}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${id}` }, load)
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [id]);

  if (poll === undefined) return <div className="mt-1 h-24 w-64 animate-pulse rounded-2xl bg-black/20" />;
  if (poll === null) return <div className="mt-1 text-sm opacity-70">Poll unavailable</div>;
  const closed = !!poll.closes_at && new Date(poll.closes_at).getTime() <= now;
  const voters = new Set(votes.map((v) => v.user_id)).size;
  const mineVotes = new Set(votes.filter((v) => v.user_id === me).map((v) => v.option));
  const counts = poll.options.map((_, i) => votes.filter((v) => v.option === i).length);
  const max = Math.max(1, ...counts);
  const showResults = closed || mineVotes.size > 0;

  const toggle = async (i: number) => {
    if (closed) return;
    const on = !mineVotes.has(i);
    // optimistic
    setVotes((v) => {
      let n = poll.multi ? v : v.filter((x) => x.user_id !== me);
      n = on ? [...n, { poll_id: poll.id, user_id: me!, option: i }] : n.filter((x) => !(x.user_id === me && x.option === i));
      return n;
    });
    await vote(poll, i, on);
  };

  const openRoster = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (votes.length) setRosterOpen(true);
  };

  return (
    <div className={cn("mt-1 w-[min(320px,72vw)] rounded-2xl p-3", mine ? "bg-black/15" : "bg-black/20")}>
      <div className="flex items-start gap-2">
        <ChartColumn className="mt-0.5 size-4 shrink-0 opacity-80" />
        <div className="min-w-0 flex-1 font-bold">{poll.question}</div>
      </div>
      <div className="mt-1 text-[11px] opacity-70">
        {poll.multi ? "Pick one or more" : "Pick one"} ·{" "}
        {showResults && voters > 0 ? (
          <button type="button" onClick={openRoster} className="font-semibold underline-offset-2 hover:underline">
            {voters} vote{voters === 1 ? "" : "s"}
          </button>
        ) : (
          <>
            {voters} vote{voters === 1 ? "" : "s"}
          </>
        )}
        {poll.closes_at && (closed ? " · closed" : ` · ends ${new Date(poll.closes_at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`)}
      </div>
      <div className="mt-2 space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = voters ? Math.round((counts[i] / voters) * 100) : 0;
          const lead = showResults && counts[i] === max && counts[i] > 0;
          const optionVotes = votes.filter((v) => v.option === i);
          const who = optionVotes.slice(0, 3);
          return (
            <div
              key={i}
              role={closed ? undefined : "button"}
              tabIndex={closed ? undefined : 0}
              onClick={() => void toggle(i)}
              onKeyDown={(e) => {
                if (closed) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void toggle(i);
                }
              }}
              className={cn("relative block w-full overflow-hidden rounded-xl bg-white/10 px-3 py-2 text-left text-sm", closed ? "cursor-default" : "cursor-pointer")}
            >
              {showResults && <span className={cn("absolute inset-y-0 left-0 transition-all", lead ? "bg-accent/45" : "bg-white/15")} style={{ width: `${pct}%` }} />}
              <span className="relative flex items-center gap-2">
                <span className={cn("grid size-4 shrink-0 place-items-center border-2", poll.multi ? "rounded" : "rounded-full", mineVotes.has(i) ? "border-white bg-white text-black" : "border-white/60")}>
                  {mineVotes.has(i) && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 break-words">{o}</span>
                {showResults && (
                  <>
                    {optionVotes.length > 0 && (
                      <button
                        type="button"
                        onClick={openRoster}
                        className="flex items-center gap-1.5 rounded-md px-0.5 hover:bg-white/10"
                        aria-label={`View ${optionVotes.length} vote${optionVotes.length === 1 ? "" : "s"} for ${o}`}
                      >
                        <span className="flex -space-x-1.5">
                          {who.map((v) => (
                            <Avatar key={v.user_id} userId={v.user_id} size={16} plain />
                          ))}
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums opacity-90">
                          {optionVotes.length} vote{optionVotes.length === 1 ? "" : "s"}
                        </span>
                      </button>
                    )}
                    <span className="w-9 text-right text-xs font-bold tabular-nums">{pct}%</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {poll.author_id === me && !closed && (
        <button onClick={() => void closePoll(poll).then((ok) => ok && setPoll({ ...poll, closes_at: new Date().toISOString() }))} className="mt-2 flex items-center gap-1 text-xs opacity-75 hover:opacity-100">
          <Lock className="size-3" /> End poll
        </button>
      )}
      <Sheet open={rosterOpen} onClose={() => setRosterOpen(false)} title="Votes" className="bg-menu">
        <div className="space-y-4 px-1 pb-2">
          {poll.options.map((o, i) => {
            const optionVotes = votes.filter((v) => v.option === i);
            if (!optionVotes.length) return null;
            return (
              <div key={i}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
                  <div className="min-w-0 truncate text-sm font-semibold">{o}</div>
                  <div className="shrink-0 text-xs text-sub">
                    {optionVotes.length} vote{optionVotes.length === 1 ? "" : "s"}
                  </div>
                </div>
                <ul className="overflow-hidden rounded-2xl bg-white/[.06]">
                  {optionVotes.map((v) => (
                    <li key={`${v.user_id}-${v.option}`} className="flex items-center gap-3 border-t border-white/[.06] px-3 py-2.5 first:border-t-0">
                      <Avatar userId={v.user_id} size={32} plain />
                      <NameTag userId={v.user_id} className="min-w-0 text-sm font-medium" />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!votes.length && <div className="px-2 py-6 text-center text-sm text-sub">No votes yet</div>}
        </div>
      </Sheet>
    </div>
  );
}

/** composer sheet to create a poll */
export function PollCreator({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState<number | null>(24);
  const [busy, setBusy] = useState(false);
  const inp = "w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
  const send = async () => {
    setBusy(true);
    try {
      await createPoll(conversationId, q, opts, multi, hours);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-chat p-5 pb-safe-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <ChartColumn className="mr-2 size-5 text-accent" />
          <span className="flex-1 text-lg font-bold">Create a poll</span>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <input className={inp} value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question…" autoFocus />
        <div className="mt-3 space-y-2">
          {opts.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input className={inp} value={o} maxLength={80} placeholder={`Option ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (i === j ? e.target.value : x)))} />
              {opts.length > 2 && (
                <button onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="grid size-9 shrink-0 place-items-center rounded-full text-sub hover:bg-hover" aria-label="Remove option">
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          {opts.length < 10 && (
            <button onClick={() => setOpts([...opts, ""])} className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Plus className="size-4" /> Add option
            </button>
          )}
        </div>
        <label className="mt-4 flex items-center justify-between text-sm">
          Allow multiple answers
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="size-4 accent-accent" />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-sub">Ends</span>
          {[
            [1, "1 h"],
            [24, "1 day"],
            [168, "1 week"],
            [null, "Never"],
          ].map(([h, l]) => (
            <button key={String(l)} onClick={() => setHours(h as number | null)} className={cn("rounded-full px-3 py-1 font-semibold", hours === h ? "bg-accent text-white" : "bg-hover")}>
              {l}
            </button>
          ))}
        </div>
        <button disabled={busy || !q.trim() || opts.filter((o) => o.trim()).length < 2} onClick={() => void send()} className="mt-5 w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
          {busy ? "Posting…" : "Post poll"}
        </button>
      </div>
    </div>
  );
}
