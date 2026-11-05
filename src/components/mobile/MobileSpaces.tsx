"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellOff, CheckCheck, ChevronLeft, ChevronRight, Copy, Hash, Link2, Plus, Search, Star, Volume2 } from "lucide-react";
import { useApp, openModal, toast } from "@/store/app";
import { loadSpace, markSpaceRead } from "@/lib/data";
import { haptic } from "@/lib/haptics";
import { cn, initials } from "@/lib/utils";
import {
  isFavoriteSpace,
  isSpaceMuted,
  sortSpaces,
  toggleFavoriteSpace,
  toggleMuteSpace,
  useSpacePrefs,
} from "@/lib/spacePrefs";
import SpaceSidebar from "@/components/layout/SpaceSidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import LargeTitle from "./LargeTitle";

export default function MobileSpaces() {
  const spaceId = useApp((s) => s.spaceId);
  return (
    <ErrorBoundary label="My Servers" onReset={() => useApp.setState({ spaceId: null })}>
      {spaceId ? <SpaceDetail spaceId={spaceId} /> : <SpaceList />}
    </ErrorBoundary>
  );
}

function SpaceList() {
  const spaces = useApp((s) => s.spaces);
  const channels = useApp((s) => s.channels);
  const members = useApp((s) => s.spaceMembers);
  const unread = useApp((s) => s.unread);
  const presence = useApp((s) => s.presence);
  const favorites = useSpacePrefs((s) => s.favorites);
  const muted = useSpacePrefs((s) => s.muted);
  const scroller = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");

  // prefetch channel lists so we can show counts + unread dots
  useEffect(() => {
    for (const sp of spaces) if (!channels[sp.id]) void loadSpace(sp.id);
  }, [spaces]); // eslint-disable-line react-hooks/exhaustive-deps

  const voiceCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of Object.values(presence)) if (p.voice) m[p.voice] = (m[p.voice] ?? 0) + 1;
    return m;
  }, [presence]);

  const liveAcross = useMemo(() => {
    let n = 0;
    for (const sp of spaces) {
      const voice = (channels[sp.id] ?? []).filter((c) => c.kind === "voice");
      n += voice.reduce((sum, c) => sum + (voiceCount[c.id] ?? 0), 0);
    }
    return n;
  }, [spaces, channels, voiceCount]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? spaces.filter((sp) => sp.name.toLowerCase().includes(needle) || (sp.description ?? "").toLowerCase().includes(needle))
      : spaces;
    return sortSpaces(base);
  }, [spaces, q, favorites]); // favorites in deps so re-sort after starring

  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain">
      <LargeTitle
        title="My Servers"
        scroller={scroller}
        right={
          <button onClick={() => openModal("createSpace")} className="grid size-10 place-items-center rounded-full text-accent active:bg-white/10" aria-label="Create or join a server">
            <Plus className="size-6" />
          </button>
        }
      />

      {spaces.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl bg-chat px-3 py-2.5">
            <Search className="size-4 shrink-0 text-sub" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search servers"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            />
          </div>
          {liveAcross > 0 && (
            <p className="mt-2 px-1 text-[12px] font-semibold text-ok">● {liveAcross} in voice across your servers</p>
          )}
        </div>
      )}

      <div className="grid gap-3 px-4 pb-6">
        {spaces.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
            <div className="mb-2 text-5xl">🪐</div>
            <div className="text-lg font-bold">Your own corner of the internet</div>
            <p className="mt-1 text-sm text-sub">Servers have text channels, voice rooms and screen sharing.</p>
            <button onClick={() => openModal("createSpace")} className="mt-4 rounded-xl bg-accent px-5 py-2.5 font-semibold text-white active:scale-95">
              Create or join
            </button>
          </div>
        )}
        {filtered.map((sp) => {
          const ch = channels[sp.id] ?? [];
          const text = ch.filter((c) => c.kind === "text").length;
          const voice = ch.filter((c) => c.kind === "voice");
          const live = voice.reduce((n, c) => n + (voiceCount[c.id] ?? 0), 0);
          const unreadN = ch.reduce((n, c) => n + (unread[c.id] ?? 0), 0);
          const fav = favorites.includes(sp.id) || isFavoriteSpace(sp.id);
          const quiet = muted.includes(sp.id) || isSpaceMuted(sp.id);
          return (
            <div key={sp.id} className="relative">
              <button
                onClick={() => {
                  haptic.light();
                  useApp.setState({ spaceId: sp.id });
                  void loadSpace(sp.id);
                }}
                className="group relative w-full overflow-hidden rounded-3xl p-4 text-left active:scale-[.98]"
                style={
                  sp.banner_url || sp.background_url
                    ? {
                        backgroundImage: `linear-gradient(120deg, rgba(10,10,14,.75), rgba(10,10,14,.45)), url(${sp.banner_url || sp.background_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { background: `linear-gradient(135deg, ${sp.icon_color}55, ${sp.icon_color}14 60%), var(--color-side)` }
                }
              >
                <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full opacity-40 blur-2xl" style={{ background: sp.icon_color }} />
                <div className="relative flex items-center gap-3.5">
                  <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl text-lg font-bold text-white shadow-lg" style={{ background: sp.icon_color }}>
                    {sp.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sp.icon_url} alt="" className="size-full object-cover" />
                    ) : (
                      initials(sp.name)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[17px] font-bold">{sp.name}</span>
                      {fav && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                      {quiet && <BellOff className="size-3.5 shrink-0 text-sub" />}
                      {unreadN > 0 && !quiet && (
                        <span className="ml-auto shrink-0 rounded-full bg-dnd px-1.5 text-[11px] font-bold text-white">{unreadN > 99 ? "99+" : unreadN}</span>
                      )}
                      {unreadN > 0 && quiet && <span className="ml-auto size-2.5 shrink-0 rounded-full bg-sub" />}
                    </div>
                    {sp.description && <div className="mt-0.5 line-clamp-1 text-[12px] text-sub">{sp.description}</div>}
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
              <div className="absolute top-2 right-2 z-10 flex gap-1">
                <IconBtn
                  label={fav ? "Unfavorite" : "Favorite"}
                  onClick={() => {
                    toggleFavoriteSpace(sp.id);
                    haptic.light();
                  }}
                >
                  <Star className={cn("size-3.5", fav && "fill-amber-400 text-amber-400")} />
                </IconBtn>
                <IconBtn
                  label="Copy invite"
                  onClick={async () => {
                    const code = sp.vanity_code || sp.invite_code;
                    try {
                      const { inviteLink } = await import("@/lib/spaceExtras");
                      await navigator.clipboard.writeText(inviteLink(code));
                      toast("Invite link copied", "success");
                    } catch {
                      toast(code, "info");
                    }
                    haptic.light();
                  }}
                >
                  <Copy className="size-3.5" />
                </IconBtn>
                {unreadN > 0 && (
                  <IconBtn
                    label="Mark read"
                    onClick={() => {
                      void markSpaceRead(sp.id);
                      haptic.light();
                    }}
                  >
                    <CheckCheck className="size-3.5" />
                  </IconBtn>
                )}
                <IconBtn
                  label={quiet ? "Unmute" : "Mute"}
                  onClick={() => {
                    toggleMuteSpace(sp.id);
                    toast(quiet ? "Server unmuted" : "Server muted", "info");
                    haptic.light();
                  }}
                >
                  <BellOff className={cn("size-3.5", quiet && "text-dnd")} />
                </IconBtn>
              </div>
            </div>
          );
        })}
        {spaces.length > 0 && filtered.length === 0 && <p className="py-8 text-center text-sm text-sub">No servers match “{q}”.</p>}
        {spaces.length > 0 && (
          <button onClick={() => openModal("createSpace")} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3.5 text-sm font-semibold text-sub active:scale-[.98]">
            <Link2 className="size-4" /> Create or join with invite code
          </button>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md active:scale-90"
    >
      {children}
    </button>
  );
}

function SpaceDetail({ spaceId }: { spaceId: string }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-1">
        <button onClick={() => useApp.setState({ spaceId: null })} className="flex items-center text-[17px] text-accent active:opacity-60">
          <ChevronLeft className="size-7" />
          Servers
        </button>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-hidden rounded-t-3xl bg-side")}>
        {space ? (
          <ErrorBoundary label="Server" onReset={() => useApp.setState({ spaceId: null })}>
            <SpaceSidebar spaceId={spaceId} />
          </ErrorBoundary>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="text-sm text-sub">This server isn&apos;t available anymore.</p>
              <button onClick={() => useApp.setState({ spaceId: null })} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">
                Back to My Servers
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
