"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Music2, Search } from "lucide-react";
import { useApp } from "@/store/app";
import { getSounds, searchPeople, type Person } from "@/lib/snapSoundsNet";
import { cleanPeopleQuery, type Sound } from "@/lib/snapSounds";
import type { SnapUser } from "@/lib/snapShare";
import SnapFace from "./SnapFace";
import { Sheet } from "./SnapUi";

/** Find Nexus people by username. Pick one and your next Snap goes to them (Nexus Drop, with a Drive link as backup). */
export default function SnapPeople({ onClose, onPick, current }: { onClose: () => void; onPick: (u: SnapUser) => void; current: SnapUser | null }) {
  const me = useApp((s) => s.userId);
  const [q, setQ] = useState("");
  const [list, setList] = useState<Person[]>([]);
  const [sounds, setSounds] = useState<Record<string, Sound>>({});
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const s = cleanPeopleQuery(q);
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
      void searchPeople(s)
        .then(async (r) => {
          if (my !== seq.current) return;
          const people = r.filter((x) => x.id !== me);
          setList(people);
          setEmpty(people.length === 0);
          const snd = await getSounds(people.map((x) => x.id));
          if (my === seq.current) setSounds(snd);
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
            placeholder="Search by username"
            aria-label="Search by username"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={33}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40"
          />
          {busy && <Loader2 className="size-4 animate-spin text-white/50" />}
        </label>
        {current && (
          <p className="px-1 text-xs text-white/55">
            Your next Snap goes to <b className="text-white">@{current.username}</b>. Pick someone else to change it.
          </p>
        )}
        {empty && !busy && <p className="px-1 text-sm text-white/55">Nobody with that username.</p>}
        <ul className="space-y-1">
          {list.map((p) => {
            const s = sounds[p.id];
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-white/5">
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
    </Sheet>
  );
}
