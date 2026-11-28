"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Square } from "lucide-react";
import { toast } from "@/store/app";
import { studioGo } from "@/store/studio";
import { listWatches, type SpotifyProfile } from "@/lib/protect";
import { linkbioMine, openLinkBio } from "@/lib/linkbio";
import { PHASES, computeJourney, journeySummary, pitchTemplate, pitchWindow, readManual, storeKey, type StepId, type StepState } from "@/lib/spotifyJourney";
import { cn } from "@/lib/utils";

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/** Claim → checkmark → grow checklist with auto-detected steps, remaining count and a pitch planner. */
export default function SpotifyJourney({ profile }: { profile: SpotifyProfile | null }) {
  const key = storeKey(profile?.id ?? "draft");
  const [manual, setManual] = useState<Partial<Record<StepId, boolean>>>({});
  const [hasLink, setHasLink] = useState(false);
  const [watching, setWatching] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ claim: true, badge: true, grow: false });

  useEffect(() => setManual(readManual(lsGet(key))), [key]);
  useEffect(() => {
    let off = false;
    void linkbioMine().then((p) => !off && setHasLink(!!p?.username));
    return () => {
      off = true;
    };
  }, []);
  useEffect(() => {
    let off = false;
    if (!profile) return setWatching(false);
    void listWatches()
      .then((w) => !off && setWatching(w.some((x) => x.spotify_id === profile.id)))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [profile]);

  const j = useMemo(
    () =>
      computeJourney(
        {
          found: !!profile,
          hasImage: !!profile?.image,
          releases: profile?.releases ?? 0,
          latestRelease: profile?.latest?.release_date,
          lookalikes: profile?.lookalikes.length ?? 0,
          hasNexusLink: hasLink,
          defenderWatching: watching,
        },
        manual,
      ),
    [profile, manual, hasLink, watching],
  );

  const toggle = (id: StepId) =>
    setManual((m) => {
      const next = { ...m, [id]: !m[id] };
      if (!next[id]) delete next[id];
      lsSet(key, JSON.stringify(next));
      return next;
    });

  const act = (s: StepState) => {
    const a = s.action;
    if (!a) return null;
    return a.href ? (
      <a href={a.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#1DB954] px-3 py-1 text-xs font-bold text-black">
        <ExternalLink className="size-3" /> {a.label}
      </a>
    ) : (
      <button
        onClick={() => (a.go === "linkbio" ? openLinkBio() : a.go === "defender" ? studioGo("defender") : studioGo("claims"))}
        className="rounded-full bg-hover px-3 py-1 text-xs font-bold hover:bg-active"
      >
        {a.label}
      </button>
    );
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg, "success");
    } catch {
      toast(text, "info");
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-side p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Your checkmark roadmap</div>
            <div className="text-sm text-sub">
              {j.done} of {j.total} done · <b className="text-main">{j.remaining.length} remaining</b>
              {j.claimed ? " · profile claimed ✓" : ""}
            </div>
          </div>
          <div className="text-2xl font-black tabular-nums text-[#1DB954]">{j.pct}%</div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
          <div className="h-full bg-[#1DB954] transition-all" style={{ width: `${j.pct}%` }} />
        </div>
        {j.next && (
          <div className="mt-3 rounded-xl bg-[#1DB954]/10 p-3">
            <div className="text-[11px] font-bold tracking-widest text-[#1DB954] uppercase">Next step</div>
            <div className="font-semibold">{j.next.title}</div>
            <p className="text-xs text-sub">{j.next.why}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {act(j.next)}
              {!j.next.auto_ && (
                <button onClick={() => toggle(j.next!.id)} className="rounded-full bg-hover px-3 py-1 text-xs font-bold hover:bg-active">
                  Mark done
                </button>
              )}
            </div>
          </div>
        )}
        <button onClick={() => copy(journeySummary(profile?.name ?? "My profile", j), "Progress copied")} className="mt-3 flex items-center gap-1.5 text-xs text-sub hover:text-main">
          <Copy className="size-3.5" /> Copy remaining steps
        </button>
      </div>

      {PHASES.map((ph) => {
        const list = j.steps.filter((s) => s.phase === ph.id);
        return (
          <div key={ph.id} className="rounded-2xl bg-side">
            <button onClick={() => setOpen((o) => ({ ...o, [ph.id]: !o[ph.id] }))} className="flex w-full items-center gap-3 p-4 text-left">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{ph.title}</div>
                <div className="text-xs text-sub">{ph.blurb}</div>
              </div>
              <div className="text-sm font-bold tabular-nums text-sub">{j.phasePct[ph.id]}%</div>
            </button>
            {open[ph.id] && (
              <ul className="space-y-2 px-4 pb-4">
                {list.map((s) => (
                  <li key={s.id} className="flex gap-2.5">
                    <button
                      onClick={() => !(s.auto_ && s.done && !manual[s.id]) && toggle(s.id)}
                      disabled={s.auto_ && s.done && !manual[s.id]}
                      aria-label={s.done ? "Done" : "Mark done"}
                      className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", s.done ? "border-[#1DB954] bg-[#1DB954] text-black" : "border-white/30")}
                    >
                      {s.done ? <Check className="size-3.5" /> : <Square className="size-3 opacity-0" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm font-medium", s.done && "text-sub line-through")}>
                        {s.title}
                        {s.auto_ && s.done && !manual[s.id] && <span className="ml-2 rounded-full bg-[#1DB954]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#1DB954] no-underline">auto</span>}
                      </div>
                      {!s.done && <p className="text-xs text-sub">{s.why}</p>}
                      {!s.done && <div className="mt-1">{act(s)}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <PitchPlanner profile={profile} copy={copy} />
    </div>
  );
}

function PitchPlanner({ profile, copy }: { profile: SpotifyProfile | null; copy: (t: string, m: string) => void }) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [story, setStory] = useState("");
  const w = date ? pitchWindow(date) : null;
  const msg = !w
    ? ""
    : w.status === "past"
      ? "That date has passed — you can't pitch a released song."
      : w.status === "late"
        ? "Too late for editorial pitching (needs 7+ days). Still share it and set an Artist Pick."
        : w.status === "ok"
          ? `Pitch by ${w.hardDeadline} (${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"} left). Earlier is better.`
          : `Best pitched by ${w.idealDeadline}; hard deadline ${w.hardDeadline}.`;
  const inputCls = "min-w-0 rounded-xl bg-black/25 px-3 py-2 text-sm outline-none placeholder:text-sub";
  return (
    <div className="rounded-2xl bg-side p-4">
      <div className="font-semibold">🎯 Pitch planner</div>
      <p className="text-xs text-sub">Editors need 7+ days; 4 weeks is ideal. Pitching is only possible for unreleased songs, in Spotify for Artists → Music → Upcoming.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="Release date" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" className={inputCls} />
        <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Genre / mood" className={inputCls} />
        <input value={story} onChange={(e) => setStory(e.target.value)} placeholder="One-line story" className={inputCls} />
      </div>
      {msg && <p className={cn("mt-2 text-sm", w?.status === "late" || w?.status === "past" ? "text-rose-300" : "text-[#1DB954]")}>{msg}</p>}
      <button
        disabled={!title.trim()}
        onClick={() => copy(pitchTemplate({ artist: profile?.name ?? "Artist", title: title.trim(), genre: genre.trim() || undefined, story }), "Pitch text copied")}
        className="mt-2 flex items-center gap-1.5 rounded-full bg-hover px-4 py-1.5 text-sm font-bold hover:bg-active disabled:opacity-40"
      >
        <Copy className="size-4" /> Copy pitch text
      </button>
    </div>
  );
}
