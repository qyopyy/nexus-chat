"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Award, ExternalLink, Eye, Gavel, Heart, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { useApp, openModal, toast } from "@/store/app";
import { openDM } from "@/lib/data";
import { startCall } from "@/lib/call";
import { supabase } from "@/lib/supabase";
import { isBanned, isMuted, myRank } from "@/lib/admin";
import { linkLabel, platformById, spotifyEmbed } from "@/lib/links";
import type { ProfileLink } from "@/lib/types";
import { BadgeToggles, ModerationControls } from "@/components/admin/ModTools";
import { ROLE_INFO, roleRank, type SiteRole } from "@/lib/theme";
import Avatar, { statusLabel } from "./Avatar";
import NameTag, { VerifiedCheck } from "./NameTag";
import Sheet from "./Sheet";
import { useIsMobile } from "@/lib/useMobile";
import { cn } from "@/lib/utils";
import { BorderRing, EffectCanvas, themeBg } from "@/components/profile/ProfileFx";

const EMPTY: string[] = [];

/** Discord-style user popout — opened via openProfileCard(userId, mouseEvent) */
export default function ProfileCard() {
  const card = useApp((s) => s.profileCard);
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();

  useEffect(() => {
    if (!card || mobile) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && useApp.setState({ profileCard: null });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && useApp.setState({ profileCard: null });
    const t = setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [card, mobile]);

  if (mobile) {
    return (
      <Sheet open={!!card} onClose={() => useApp.setState({ profileCard: null })} className="bg-menu">
        {card && (
          <div className="-mx-3 -mt-1">
            <CardBody userId={card.userId} />
          </div>
        )}
      </Sheet>
    );
  }
  if (!card || typeof document === "undefined") return null;
  const W = 340;
  const left = Math.min(Math.max(8, card.x + 12), window.innerWidth - W - 8);
  const top = Math.max(12, Math.min(card.y - 60, window.innerHeight - 640));
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
  const [modOpen, setModOpen] = useState(false);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const badges = useMemo(() => ids.map((id) => catalog[id]).filter(Boolean).sort((a, b) => b.priority - a.priority), [ids, catalog]);
  // all-time profile views (one per visitor per day) + likes
  useEffect(() => {
    if (!me) return;
    if (userId !== me)
      void supabase.rpc("record_profile_view", { p_profile: userId }).then(({ data }) => {
        if (typeof data === "number") useApp.setState((s) => (s.profiles[userId] ? { profiles: { ...s.profiles, [userId]: { ...s.profiles[userId], view_count: data } } } : s));
      });
    void supabase
      .from("profile_likes")
      .select("active")
      .eq("profile_id", userId)
      .eq("user_id", me)
      .maybeSingle()
      .then(({ data }) => setLiked(!!data?.active));
  }, [userId, me]);
  if (!p) return null;

  const role = ROLE_INFO[(p.site_role ?? "member") as SiteRole];
  const rank = myRank();
  const canModerate = userId !== me && rank >= 2 && roleRank(p.site_role) < rank;
  const canBadge = rank >= 3;
  const banner = p.banner_color || p.avatar_color;
  const close = () => useApp.setState({ profileCard: null });
  const embed = spotifyEmbed(p.profile_song);
  const links = (p.links ?? []).filter((l) => l && l.url);
  const np = p.now_playing && Date.now() - new Date(p.now_playing.at).getTime() < 6 * 3600_000 ? p.now_playing : null;

  async function call() {
    const { data } = await supabase.rpc("get_or_create_dm", { p_user: userId });
    close();
    if (data) {
      await openDM(userId);
      void startCall(data as string);
    }
  }

  const like = async () => {
    const { data, error } = await supabase.rpc("toggle_profile_like", { p_profile: userId });
    if (error) return toast(error.message, "error");
    const r = data as { liked: boolean; count: number };
    setLiked(r.liked);
    useApp.setState((s) => (s.profiles[userId] ? { profiles: { ...s.profiles, [userId]: { ...s.profiles[userId], like_count: r.count } } } : s));
  };
  const theme = themeBg(p.profile_theme);
  const bordered = !!p.profile_border && p.profile_border !== "none";

  return (
    <div className={cn("relative rounded-2xl shadow-2xl", bordered && "p-[2px]")}>
      <BorderRing border={p.profile_border} />
      <div className={cn("relative overflow-hidden rounded-2xl ring-1 ring-white/5", !theme && "bg-menu")} style={theme ? { background: theme } : undefined}>
        <EffectCanvas effect={p.profile_effect} accent={p.avatar_color} seed={userId} />
    <div className="relative z-10 max-h-[min(86dvh,720px)] overflow-y-auto overscroll-contain md:max-h-[calc(100dvh-24px)]">
      <div
        className="relative h-28 bg-cover bg-center"
        style={
          p.banner_url
            ? { backgroundImage: `url("${p.banner_url}")` }
            : { background: banner.startsWith("linear") ? banner : `linear-gradient(135deg, ${banner}, ${banner}66)` }
        }
      >
        {p.member_no != null && (
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(String(p.member_no));
              toast(`Copied UID ${p.member_no}`, "success");
            }}
            className="absolute top-2 right-2 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[11px] font-semibold text-white backdrop-blur"
            title="Unique ID — order this account registered in"
          >
            UID #{p.member_no}
          </button>
        )}
      </div>
      <div className="-mt-11 px-4">
        <Avatar userId={userId} size={84} showStatus ringClass="ring-menu" className="rounded-full ring-[6px] ring-menu" />
      </div>
      <div className="m-3 rounded-xl bg-side/60 p-3 backdrop-blur-[2px]">
        <NameTag userId={userId} className="max-w-full text-xl font-bold" badgeSize="md" />
        <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-sub">
          <span>@{p.username}</span>
          {p.member_no != null && <span className="font-mono text-xs opacity-80">· UID {p.member_no}</span>}
          {p.forum_name && <span className="text-xs">· forum: {p.forum_name}</span>}
        </div>
        {p.custom_status && <div className="mt-1 text-sm">{p.custom_status}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1" title="All-time profile views">
            <Eye className="size-4 text-sub" /> <b className="tabular-nums">{(p.view_count ?? 0).toLocaleString()}</b> <span className="text-sub">views</span>
          </span>
          <button
            disabled={userId === me}
            onClick={() => void like()}
            className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 transition active:scale-95", liked ? "bg-dnd/20 text-dnd" : "bg-black/25 hover:bg-black/40", userId === me && "cursor-default")}
            title={userId === me ? "Likes on your profile" : liked ? "Unlike" : "Like this profile"}
          >
            <Heart className={cn("size-4", liked && "fill-current")} /> <b className="tabular-nums">{(p.like_count ?? 0).toLocaleString()}</b>
          </button>
        </div>
        {isBanned(p) && <div className="mt-2 rounded-md bg-dnd/20 px-2 py-1 text-xs text-dnd">Suspended{p.ban_reason ? `: ${p.ban_reason}` : ""}</div>}
        {isMuted(p) && rank >= 2 && <div className="mt-2 rounded-md bg-idle/15 px-2 py-1 text-xs text-idle">Messaging blocked{p.mute_reason ? `: ${p.mute_reason}` : ""}</div>}

        {np && (
          <a href={np.url ?? undefined} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2.5 rounded-lg bg-[#1DB954]/12 p-2 ring-1 ring-[#1DB954]/25">
            {np.image ? <img src={np.image} alt="" className="size-10 rounded-md object-cover" /> : <span className="grid size-10 place-items-center rounded-md bg-[#1DB954] text-lg">♫</span>}
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold tracking-wide text-[#1DB954] uppercase">Listening on Spotify</span>
              <span className="block truncate text-sm font-semibold">{np.title}</span>
              <span className="block truncate text-xs text-sub">{np.artist}</span>
            </span>
            <span className="eq-on flex h-4 shrink-0 items-end gap-0.5 text-[#1DB954]">
              <span className="eq" />
              <span className="eq" />
              <span className="eq" />
            </span>
          </a>
        )}

        <div className="my-3 h-px bg-line" />
        {p.bio && (
          <>
            <div className="text-xs font-bold tracking-wide text-sub uppercase">About me</div>
            <p className="mt-1 mb-3 text-sm break-words whitespace-pre-wrap">{p.bio}</p>
          </>
        )}

        {links.length > 0 && (
          <div className="mb-3 space-y-1">
            {links.map((l, i) => (
              <LinkRow key={i} link={l} />
            ))}
          </div>
        )}

        {embed && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Profile song</div>
            <iframe
              src={embed}
              title="Spotify"
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              className="h-[80px] w-full rounded-xl border-0"
            />
          </div>
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
                  {b.key === "verified" ? <VerifiedCheck size={12} /> : b.icon} <span style={{ color: b.key === "verified" ? "#fff" : b.color }}>{b.name}</span>
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
              className="flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-2 active:scale-[.98]"
            >
              <MessageCircle className="size-4" /> Message
            </button>
            <button onClick={() => void call()} className="flex items-center justify-center gap-1.5 rounded-lg bg-hover py-2.5 text-sm font-semibold hover:bg-active active:scale-[.98]">
              <Phone className="size-4" /> Call
            </button>
          </div>
        )}

        {canBadge && (
          <div className="mt-3 rounded-lg border border-white/10 p-2">
            <button onClick={() => setBadgeOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-xs font-bold tracking-wide text-sub uppercase">
              <Award className="size-3.5" /> Badges <span className="ml-auto font-normal normal-case">{badgeOpen ? "Done" : "Edit"}</span>
            </button>
            {badgeOpen && (
              <div className="mt-2">
                <BadgeToggles userId={userId} />
              </div>
            )}
          </div>
        )}

        {canModerate && (
          <div className="mt-2 rounded-lg border border-dnd/30 p-2">
            <button onClick={() => setModOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-xs font-bold tracking-wide text-dnd uppercase">
              <Gavel className="size-3.5" /> Moderation <span className="ml-auto font-normal text-sub normal-case">{modOpen ? "Hide" : "Open"}</span>
            </button>
            {modOpen && (
              <div className="mt-2">
                <ModerationControls userId={userId} />
                <button
                  onClick={() => {
                    close();
                    openModal("settings", `admin:${userId}`);
                  }}
                  className="mt-2 flex items-center gap-1 text-xs text-sub hover:text-txt"
                >
                  <ShieldCheck className="size-3.5" /> Open in admin panel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
      </div>
    </div>
  );
}

export function LinkRow({ link }: { link: ProfileLink }) {
  const plat = platformById(link.type);
  return (
    <a href={link.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-white/5 active:bg-white/10">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: plat.color }}>
        {plat.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{linkLabel(link)}</span>
        <span className="block text-[11px] text-sub">{plat.label}</span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-sub" />
    </a>
  );
}
