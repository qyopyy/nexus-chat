"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Hash, Link2, Plus, Volume2 } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { loadSpace } from "@/lib/data";
import { haptic } from "@/lib/haptics";
import { cn, initials } from "@/lib/utils";
import SpaceSidebar from "@/components/layout/SpaceSidebar";
import LargeTitle from "./LargeTitle";

export default function MobileSpaces() {
  const spaceId = useApp((s) => s.spaceId);
  return spaceId ? <SpaceDetail spaceId={spaceId} /> : <SpaceList />;
}

function SpaceList() {
  const spaces = useApp((s) => s.spaces);
  const channels = useApp((s) => s.channels);
  const members = useApp((s) => s.spaceMembers);
  const unread = useApp((s) => s.unread);
  const presence = useApp((s) => s.presence);
  const scroller = useRef<HTMLDivElement>(null);

  // prefetch channel lists so we can show counts + unread dots
  useEffect(() => {
    for (const sp of spaces) if (!channels[sp.id]) void loadSpace(sp.id);
  }, [spaces]); // eslint-disable-line react-hooks/exhaustive-deps

  const voiceCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of Object.values(presence)) if (p.voice) m[p.voice] = (m[p.voice] ?? 0) + 1;
    return m;
  }, [presence]);

  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain">
      <LargeTitle
        title="Spaces"
        scroller={scroller}
        right={
          <button onClick={() => openModal("createSpace")} className="grid size-10 place-items-center rounded-full text-accent active:bg-white/10" aria-label="Create or join a space">
            <Plus className="size-6" />
          </button>
        }
      />
      <div className="grid gap-3 px-4 pb-6">
        {spaces.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
            <div className="mb-2 text-5xl">🪐</div>
            <div className="text-lg font-bold">Your own corner of the internet</div>
            <p className="mt-1 text-sm text-sub">Spaces have text channels, voice rooms and screen sharing — like a Discord server.</p>
            <button onClick={() => openModal("createSpace")} className="mt-4 rounded-xl bg-accent px-5 py-2.5 font-semibold text-white active:scale-95">
              Create or join
            </button>
          </div>
        )}
        {spaces.map((sp) => {
          const ch = channels[sp.id] ?? [];
          const text = ch.filter((c) => c.kind === "text").length;
          const voice = ch.filter((c) => c.kind === "voice");
          const live = voice.reduce((n, c) => n + (voiceCount[c.id] ?? 0), 0);
          const hasUnread = ch.some((c) => (unread[c.id] ?? 0) > 0);
          return (
            <button
              key={sp.id}
              onClick={() => {
                haptic.light();
                useApp.setState({ spaceId: sp.id });
                void loadSpace(sp.id);
              }}
              className="group relative overflow-hidden rounded-3xl p-4 text-left active:scale-[.98]"
              style={{ background: `linear-gradient(135deg, ${sp.icon_color}55, ${sp.icon_color}14 60%), var(--color-side)` }}
            >
              <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full opacity-40 blur-2xl" style={{ background: sp.icon_color }} />
              <div className="relative flex items-center gap-3.5">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-bold text-white shadow-lg" style={{ background: sp.icon_color }}>
                  {initials(sp.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[17px] font-bold">{sp.name}</span>
                    {hasUnread && <span className="size-2.5 shrink-0 rounded-full bg-dnd" />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-sub">
                    <span className="flex items-center gap-1">
                      <Hash className="size-3.5" />
                      {text}
                    </span>
                    <span className="flex items-center gap-1">
                      <Volume2 className="size-3.5" />
                      {voice.length}
                    </span>
                    {members[sp.id] && <span>{members[sp.id].length} members</span>}
                    {live > 0 && <span className="flex items-center gap-1 font-semibold text-ok">● {live} in voice</span>}
                  </div>
                </div>
                <ChevronRight className="size-5 text-sub" />
              </div>
            </button>
          );
        })}
        {spaces.length > 0 && (
          <button onClick={() => openModal("createSpace")} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3.5 text-sm font-semibold text-sub active:scale-[.98]">
            <Link2 className="size-4" /> Create or join with invite code
          </button>
        )}
      </div>
    </div>
  );
}

function SpaceDetail({ spaceId }: { spaceId: string }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-1">
        <button onClick={() => useApp.setState({ spaceId: null })} className="flex items-center text-[17px] text-accent active:opacity-60">
          <ChevronLeft className="size-7" />
          Spaces
        </button>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-hidden rounded-t-3xl bg-side")}>{space ? <SpaceSidebar spaceId={spaceId} /> : null}</div>
    </div>
  );
}
