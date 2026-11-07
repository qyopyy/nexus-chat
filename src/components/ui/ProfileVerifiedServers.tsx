"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { joinSpace, selectSpace } from "@/lib/data";
import { profileVerifiedServers, type VerifiedServer } from "@/lib/serverVerify";
import VerifiedServerBadge from "./VerifiedServerBadge";

/** "Verified servers" on a profile — servers this person owns or admins that are verified, labelled by role. */
export default function ProfileVerifiedServers({ userId }: { userId: string }) {
  const [list, setList] = useState<VerifiedServer[]>([]);
  const mySpaces = useApp((s) => s.spaces);
  useEffect(() => {
    let live = true;
    void profileVerifiedServers(userId).then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [userId]);
  if (!list.length) return null;

  const owner = list.some((s) => s.role === "owner");
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1 text-xs font-bold tracking-wide text-sub uppercase">
        <VerifiedServerBadge size={13} /> {owner ? "Verified server owner" : "Verified server admin"}
      </div>
      <div className="space-y-1">
        {list.map((s) => {
          const member = mySpaces.some((x) => x.id === s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                useApp.setState({ profileCard: null });
                void (member ? selectSpace(s.id) : joinSpace(s.invite));
              }}
              className="flex w-full items-center gap-2.5 rounded-xl bg-black/20 px-2.5 py-2 text-left transition hover:bg-black/30"
            >
              <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl text-[11px] font-black text-white" style={{ background: s.icon_color }}>
                {s.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.icon_url} alt="" className="size-full object-cover" />
                ) : (
                  s.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-bold">
                  <span className="truncate">{s.name}</span>
                  <VerifiedServerBadge size={14} />
                </span>
                <span className={s.role === "owner" ? "text-[11px] font-semibold text-[#F0B232]" : "text-[11px] font-semibold text-accent"}>
                  {s.role === "owner" ? "Owner" : "Admin"}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-hover px-2.5 py-1 text-[11px] font-bold">{member ? "Open" : "Join"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
