"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { loadProfiles } from "@/lib/data";
import { useApp } from "@/store/app";
import Avatar from "@/components/ui/Avatar";

type Mutuals = { friends: string[]; friend_count: number; servers: { id: string; name: string; icon_url: string | null; icon_color: string | null }[] };
type Upcoming = { title: string; artist: string | null; release_date: string; type: string | null; link: string | null } | null;

function useCountdown(date: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!date) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [date]);
  if (!date) return null;
  const ms = new Date(`${date}T00:00:00`).getTime() - now;
  if (ms <= 0) return "Out now";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}

/** Upcoming release with a live countdown (+ pre-save link when there's a smart link). */
export function ReleaseCountdown({ userId }: { userId: string }) {
  const [rel, setRel] = useState<Upcoming>(null);
  useEffect(() => {
    setRel(null);
    void supabase.rpc("upcoming_release", { p_user: userId }).then(({ data }) => setRel((data as Upcoming) ?? null));
  }, [userId]);
  const left = useCountdown(rel?.release_date ?? null);
  if (!rel) return null;
  const inner = (
    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#8b5cff]/35 to-[#ff2bd6]/25 p-3 ring-1 ring-white/10">
      <CalendarClock className="size-8 shrink-0 text-white/90" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold tracking-wide text-white/70 uppercase">New {rel.type?.toLowerCase() === "album" ? "album" : rel.type?.toLowerCase() === "ep" ? "EP" : "release"} · {new Date(`${rel.release_date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
        <div className="truncate font-bold">{rel.title}</div>
        <div className="font-mono text-sm tabular-nums">{left}</div>
      </div>
      {rel.link && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
          Pre-save <ExternalLink className="size-3" />
        </span>
      )}
    </div>
  );
  return (
    <div className="mb-3">
      {rel.link ? (
        <a href={`/l/${rel.link}`} target="_blank" rel="noreferrer" className="block transition hover:brightness-110">
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

/** Friends and servers you have in common with this person. */
export function ProfileMutuals({ userId }: { userId: string }) {
  const me = useApp((s) => s.userId);
  const [m, setM] = useState<Mutuals | null>(null);
  useEffect(() => {
    setM(null);
    if (!me || me === userId) return;
    void supabase.rpc("profile_mutuals", { p_user: userId }).then(({ data }) => {
      const r = (data as Mutuals) ?? null;
      setM(r);
      if (r?.friends.length) void loadProfiles(r.friends);
    });
  }, [userId, me]);
  if (!m || (!m.friend_count && !m.servers.length)) return null;
  return (
    <div className="mb-3 space-y-2">
      {m.servers.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">{m.servers.length} mutual server{m.servers.length > 1 ? "s" : ""}</div>
          <div className="flex flex-wrap gap-1.5">
            {m.servers.map((s) => (
              <button
                key={s.id}
                onClick={() => useApp.setState({ profileCard: null, spaceId: s.id })}
                className="flex items-center gap-1.5 rounded-full bg-black/25 py-0.5 pr-2.5 pl-0.5 text-xs hover:bg-black/40"
                title={s.name}
              >
                {s.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.icon_url} alt="" className="size-5 rounded-full object-cover" />
                ) : (
                  <span className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: s.icon_color ?? "#5865F2" }}>
                    {s.name[0]}
                  </span>
                )}
                <span className="max-w-[120px] truncate">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {m.friend_count > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">{m.friend_count} mutual friend{m.friend_count > 1 ? "s" : ""}</div>
          <div className="flex -space-x-2">
            {m.friends.map((f) => (
              <button key={f} onClick={(e) => useApp.setState({ profileCard: { userId: f, x: e.clientX, y: e.clientY } })} className="rounded-full ring-2 ring-menu" title="Open profile">
                <Avatar userId={f} size={28} plain />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
