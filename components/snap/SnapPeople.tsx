"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Music2, Search, UserCheck, UserPlus } from "lucide-react";
import { useApp } from "@/store/app";
import { getSounds } from "@/lib/snapSoundsNet";
import type { Sound } from "@/lib/snapSounds";
import { cleanSearch } from "@/lib/snapSocial";
import { followUser, loadBlocks, myFollowing, searchUsers, type SocialPerson } from "@/lib/snapSocialNet";
import type { SnapUser } from "@/lib/snapShare";
import SnapFace from "./SnapFace";
import SnapPerson from "./SnapSocial";
import { Sheet } from "./SnapUi";

/** Find Nexus people by username. Pick one and your next Snap goes to them (Nexus Drop, with a normal chat attachment as backup). */
export default function SnapPeople({ onClose, onPick, current }: { onClose: () => void; onPick: (u: SnapUser) => void; current: SnapUser | null }) {
  const me = useApp((s) => s.userId);
  const [q, setQ] = useState("");
  const [list, setList] = useState<SocialPerson[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [sounds, setSounds] = useState<Record<string, Sound>>({});
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const seq = useRef(0);

  useEffect(() => void loadBlocks(), []);

  const toggle = async (id: string) => {
    const on = !following.has(id);
    setFollowing((f) => {
      const n = new Set(f);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
    if (!(await followUser(id, on)))
      setFollowing((f) => {
        const n = new Set(f);
        if (on) n.delete(id);
        else n.add(id);
        return n;
      });
  };

  useEffect(() => {
    const s = cleanSearch(q);
    const my = ++seq.current;
    if (!s) {
      setList([]);
      setSounds({});
      setEmpty(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      void searchUsers(s)
        .then(async (r) => {
          if (my !== seq.current) return;
          const people = r.filter((x) => x.id !== me);
          setList(people);
          setEmpty(people.length === 0);
          const [snd, fol] = await Promise.all([getSounds(people.map((x) => x.id)), myFollowing(people.map((x) => x.id))]);
          if (my === seq.current) {
            setSounds(snd);
            setFollowing(fol);
          }
        })
        .finally(() => my === seq.current && setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, me]);

  return (
    <Sheet title="Find people" onClose={onClose} z="z-[60]">
      <div className="space-y-3 px-4 pb-4">
        <label className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5">
          <Search className="size-4 shrink-0 text-white/50" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or username"
            aria-label="Search name or username"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={40}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40"
          />
          {busy && <Loader2 className="size-4 animate-spin text-white/50" />}
        </label>
        {current && (
          <p className="px-1 text-xs text-white/55">
            Your next Snap goes to <b className="text-white">@{current.username}</b>. Pick someone else to change it.
          </p>
        )}
        {empty && !busy && <p className="px-1 text-sm text-white/55">Nobody found. Try another name or username.</p>}
        <ul className="space-y-1">
          {list.map((p) => {
            const s = sounds[p.id];
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-white/5">
                <button type="button" onClick={() => setOpen(p.username)} aria-label={`Open @${p.username}`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <SnapFace url={p.avatar_url} name={p.display_name || p.username} color={p.avatar_color} size={44} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{p.display_name || p.username}</b>
                  <span className="block truncate text-xs text-white/55">@{p.username}</span>
                  {s && (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-emerald-300">
                      <Music2 className="size-3 shrink-0" />
                      <span className="truncate">
                        {s.title}
                        {s.artist ? ` · ${s.artist}` : ""}
                      </span>
                    </span>
                  )}
                </div>
                </button>
                <button
                  type="button"
                  onClick={() => void toggle(p.id)}
                  aria-label={following.has(p.id) ? `Unfollow @${p.username}` : `Follow @${p.username}`}
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${following.has(p.id) ? "bg-white/10 text-white" : "bg-white/20 text-white"}`}
                >
                  {following.has(p.id) ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => onPick({ id: p.id, username: p.username, display_name: p.display_name })}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${current?.id === p.id ? "bg-emerald-400 text-black" : "bg-white text-black"}`}
                >
                  {current?.id === p.id ? "Selected" : "Snap to"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {open && <SnapPerson username={open} onClose={() => setOpen(null)} onSnapTo={onPick} />}
    </Sheet>
  );
}
