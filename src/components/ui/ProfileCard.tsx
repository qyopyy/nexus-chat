"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Gavel, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { openDM } from "@/lib/data";
import { startCall } from "@/lib/call";
import { supabase } from "@/lib/supabase";
import { banUser, isBanned, myRank } from "@/lib/admin";
import { ROLE_INFO, roleRank, type SiteRole } from "@/lib/theme";
import Avatar, { statusLabel } from "./Avatar";
import NameTag from "./NameTag";

const EMPTY: string[] = [];

/** Discord-style user popout — opened via openProfileCard(userId, mouseEvent) */
export default function ProfileCard() {
  const card = useApp((s) => s.profileCard);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!card) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && useApp.setState({ profileCard: null });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && useApp.setState({ profileCard: null });
    const t = setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [card]);

  if (!card || typeof document === "undefined") return null;
  const W = 320;
  const left = Math.min(Math.max(8, card.x + 12), window.innerWidth - W - 8);
  const top = Math.min(Math.max(8, card.y - 60), window.innerHeight - 470);
  return createPortal(
    <div ref={ref} className="fixed z-[75] animate-pop" style={{ left, top, width: W }}>
      <CardBody userId={card.userId} />
    </div>,
    document.body,
  );
}

export function CardBody({ userId }: { userId: string }) {
  const p = useApp((s) => s.profiles[userId]);
  const me = useApp((s) => s.userId);
  const status = useApp((s) => s.presence[userId]?.status);
  const ids = useApp((s) => s.userBadges[userId] ?? EMPTY);
  const catalog = useApp((s) => s.badges);
  const badges = useMemo(() => ids.map((id) => catalog[id]).filter(Boolean).sort((a, b) => b.priority - a.priority), [ids, catalog]);
  if (!p) return null;

  const role = ROLE_INFO[(p.site_role ?? "member") as SiteRole];
  const canModerate = userId !== me && myRank() >= 2 && roleRank(p.site_role) < myRank();
  const banner = p.banner_color || p.avatar_color;
  const close = () => useApp.setState({ profileCard: null });

  async function call() {
    const { data } = await supabase.rpc("get_or_create_dm", { p_user: userId });
    close();
    if (data) {
      await openDM(userId);
      void startCall(data as string);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-menu shadow-2xl ring-1 ring-white/5">
      <div className="h-24" style={{ background: banner.startsWith("linear") ? banner : `linear-gradient(135deg, ${banner}, ${banner}66)` }} />
      <div className="-mt-11 px-4">
        <Avatar userId={userId} size={84} showStatus ringClass="ring-menu" className="rounded-full ring-[6px] ring-menu" />
      </div>
      <div className="m-3 rounded-xl bg-side/70 p-3">
        <NameTag userId={userId} className="text-xl font-bold" badgeSize="md" />
        <div className="text-sm text-sub">@{p.username}</div>
        {p.custom_status && <div className="mt-1 text-sm">{p.custom_status}</div>}
        {isBanned(p) && <div className="mt-2 rounded-md bg-dnd/20 px-2 py-1 text-xs text-dnd">Suspended{p.ban_reason ? `: ${p.ban_reason}` : ""}</div>}

        <div className="my-3 h-px bg-line" />
        {p.bio && (
          <>
            <div className="text-xs font-bold tracking-wide text-sub uppercase">About me</div>
            <p className="mt-1 mb-3 text-sm whitespace-pre-wrap">{p.bio}</p>
          </>
        )}
        {(role.rank > 0 || badges.length > 0) && (
          <>
            <div className="text-xs font-bold tracking-wide text-sub uppercase">Roles & badges</div>
            <div className="mt-1.5 mb-3 flex flex-wrap gap-1">
              {role.rank > 0 && (
                <span className="flex items-center gap-1 rounded-md bg-black/30 px-2 py-0.5 text-xs" style={{ color: role.color }}>
                  {role.icon} {role.label}
                </span>
              )}
              {badges.map((b) => (
                <span key={b.id} className="flex items-center gap-1 rounded-md bg-black/30 px-2 py-0.5 text-xs" title={b.description ?? undefined}>
                  {b.icon} <span style={{ color: b.color }}>{b.name}</span>
                </span>
              ))}
            </div>
          </>
        )}
        <div className="text-xs font-bold tracking-wide text-sub uppercase">Member since</div>
        <div className="mt-1 text-sm">{new Date(p.created_at).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}</div>
        <div className="mt-1 text-xs text-sub">{statusLabel(status)}</div>

        {userId !== me && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                close();
                void openDM(userId);
              }}
              className="flex items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-2"
            >
              <MessageCircle className="size-4" /> Message
            </button>
            <button onClick={() => void call()} className="flex items-center justify-center gap-1.5 rounded-md bg-hover py-2 text-sm font-semibold hover:bg-active">
              <Phone className="size-4" /> Call
            </button>
          </div>
        )}

        {canModerate && (
          <div className="mt-3 rounded-lg border border-dnd/30 p-2">
            <div className="mb-1.5 flex items-center gap-1 text-xs font-bold tracking-wide text-dnd uppercase">
              <Gavel className="size-3.5" /> Moderation
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                ["10m", 10],
                ["1h", 60],
                ["1d", 1440],
              ].map(([l, m]) => (
                <button key={l} onClick={() => void banUser(userId, m as number, "Timeout")} className="rounded bg-hover px-2 py-1 hover:bg-active">
                  Timeout {l}
                </button>
              ))}
              <button
                onClick={() => {
                  const reason = prompt(`Ban ${p.display_name}? Reason:`);
                  if (reason !== null) void banUser(userId, null, reason);
                }}
                className="rounded bg-dnd/80 px-2 py-1 text-white hover:bg-dnd"
              >
                Ban
              </button>
              <button
                onClick={() => {
                  close();
                  openModal("settings", `admin:${userId}`);
                }}
                className="flex items-center gap-1 rounded bg-hover px-2 py-1 hover:bg-active"
              >
                <ShieldCheck className="size-3.5" /> Manage
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
