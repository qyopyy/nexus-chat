"use client";

import { useRef } from "react";
import { AppWindow, Bell, ChevronRight, Copy, Crown, Gamepad2, Headphones, LayoutDashboard, LogOut, MapPin, Megaphone, Mic, Moon, Palette, Radio, Shield, Sparkles, Tv, UserPen, Users, Vault, Volume2, VolumeX } from "lucide-react";
import { useApp, openModal, toast } from "@/store/app";
import { useStudio } from "@/store/studio";
import { openUntitled } from "@/lib/untitled";
import { openRadio } from "@/lib/radio";
import { openLiveHub } from "@/lib/live";
import { openPulse } from "@/lib/pulse";
import { openBump } from "@/lib/bump";
import { openStaffDesk } from "@/lib/privileges";
import { leaveCall } from "@/lib/call";
import { supabase } from "@/lib/supabase";
import { roleRank } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { setPref, usePrefs } from "@/lib/prefs";
import Avatar from "@/components/ui/Avatar";
import NameTag, { Badges } from "@/components/ui/NameTag";
import LargeTitle from "./LargeTitle";
import NexusShareFooter from "@/components/ui/NexusCredit";
import MenuMusic from "@/components/layout/MenuMusic";
import type { UserStatus } from "@/lib/types";

const STATUSES: { id: UserStatus; label: string; dot: string }[] = [
  { id: "online", label: "Online", dot: "bg-ok" },
  { id: "idle", label: "Idle", dot: "bg-idle" },
  { id: "dnd", label: "Busy", dot: "bg-dnd" },
  { id: "invisible", label: "Invisible", dot: "bg-faint" },
];

export default function MobileMe() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const myStatus = useApp((s) => s.myStatus);
  const friends = useApp((s) => s.friendships.filter((f) => f.status === "accepted").length);
  const spaces = useApp((s) => s.spaces.length);
  const chats = useApp((s) => s.chatList.length);
  const pending = useApp((s) => s.friendships.filter((f) => f.status === "pending" && f.addressee_id === s.userId).length);
  const buttonFx = usePrefs((s) => s.buttonFx !== false);
  const scroller = useRef<HTMLDivElement>(null);
  if (!me) return null;
  const staff = roleRank(me.site_role) >= 2;
  const vipPlus = roleRank(me.site_role) >= 1;
  const banner = me.banner_color || me.avatar_color;

  const row = (icon: React.ReactNode, tint: string, label: string, onClick: () => void, right?: React.ReactNode) => (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3 text-left active:bg-white/[.06]">
      <span className="grid size-8 place-items-center rounded-[9px] text-white" style={{ background: tint }}>
        {icon}
      </span>
      <span className="flex-1 text-[16px]">{label}</span>
      {right}
      <ChevronRight className="size-5 text-sub/70" />
    </button>
  );

  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain">
      <LargeTitle title="You" scroller={scroller} />

      {/* profile hero */}
      <div className="mx-4 overflow-hidden rounded-3xl bg-side">
        <div className="relative h-28" style={{ background: banner.startsWith("linear") ? banner : `linear-gradient(135deg, ${banner}, ${banner}55)` }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,.25),transparent_50%)]" />
        </div>
        <div className="-mt-12 flex items-end gap-3 px-4">
          <button onClick={() => openModal("settings", "account")} className="rounded-full active:scale-95">
            <Avatar userId={me.id} size={92} showStatus ringClass="ring-side" className="rounded-full ring-[5px] ring-side" />
          </button>
          <div className="flex flex-1 justify-end gap-2 pb-2">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(me.username);
                haptic.success();
                toast("Username copied — send it to a friend", "success");
              }}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold active:scale-95"
            >
              <Copy className="size-3.5" /> @{me.username}
            </button>
          </div>
        </div>
        <div className="px-4 pt-2 pb-4">
          <div className="text-[22px] font-extrabold">
            <NameTag userId={me.id} badges={false} />
          </div>
          <Badges userId={me.id} size="md" max={12} className="mt-1.5" />
          {me.custom_status && <div className="mt-2 text-[15px]">{me.custom_status}</div>}
          {me.bio && <p className="mt-1.5 text-[14px] whitespace-pre-wrap text-sub">{me.bio}</p>}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              [friends, "Friends"],
              [chats, "Chats"],
              [spaces, "Spaces"],
            ].map(([n, l]) => (
              <div key={l as string} className="rounded-2xl bg-white/[.05] py-2.5">
                <div className="text-lg font-bold tabular-nums">{n}</div>
                <div className="text-[12px] text-sub">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* status segmented control */}
      <div className="mx-4 mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-side p-1">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              haptic.select();
              useApp.setState({ myStatus: s.id });
            }}
            className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition", myStatus === s.id ? "bg-white/[.12] text-txt" : "text-sub")}
          >
            <span className={cn("size-2 rounded-full", s.dot)} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-side [&>button+button]:border-t [&>button+button]:border-white/[.05]">
        {row(<Users className="size-[18px]" />, "#2aabee", "Friends", () => useApp.setState({ mobileTab: "friends" }), pending > 0 ? <span className="rounded-full bg-dnd px-2 text-xs font-bold text-white">{pending}</span> : undefined)}
        {row(<LayoutDashboard className="size-[18px]" />, "#eb459e", "Studio — videos & music releases", () => useApp.setState({ hub: "studio" }))}
        {row(<Tv className="size-[18px]" />, "#9146ff", "Nexus Live — HD & 4K streams", () => openLiveHub())}
        {row(<Megaphone className="size-[18px]" />, "#1d9bf0", "Pulse — Twitter-style posts", () => openPulse())}
        {row(<Radio className="size-[18px]" />, "#ff2bd6", "Nexus Radio — listen & jam together", () => void openRadio())}
        {row(<Headphones className="size-[18px]" />, "#c4a574", "Cutroom — WIP music projects", () => openUntitled())}
        {row(<Gamepad2 className="size-[18px]" />, "#ff2bd6", "Games", () => useApp.setState({ mobileTab: "games" }))}
        {row(<AppWindow className="size-[18px]" />, "#00a8fc", "Apps — Bump, image studio & docs", () => useApp.setState({ mobileTab: "apps", hub: "apps", appsTool: null }))}
        {row(<MapPin className="size-[18px]" />, "#22c55a", "Bump — in Apps · nearby & profiles", () => openBump())}
        {row(<Vault className="size-[18px]" />, "#5865f2", "My Vault — private files & share links", () => {
          useStudio.setState({ section: "vault", releaseId: null });
          useApp.setState({ hub: "studio" });
        })}
        {row(<Crown className="size-[18px]" />, "#f0b232", "Nexus Premium ⚡", () => openModal("premium"))}
      </div>

      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-side [&>button+button]:border-t [&>button+button]:border-white/[.05]">
        {row(<UserPen className="size-[18px]" />, "#5865f2", "Edit profile", () => openModal("settings", "account"))}
        {row(<Sparkles className="size-[18px]" />, "#eb459e", "Avatar & decorations", () => openModal("settings", "account"))}
        {row(<Palette className="size-[18px]" />, "#9b59b6", "Themes & appearance", () => openModal("settings", "appearance"))}
      </div>

      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-side p-2">
        <MenuMusic />
      </div>

      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-side [&>button+button]:border-t [&>button+button]:border-white/[.05]">
        {row(<Mic className="size-[18px]" />, "#23a55a", "Voice & video", () => openModal("settings", "voice"))}
        {row(<Bell className="size-[18px]" />, "#f23f43", "Notifications", () => openModal("settings", "notifications"))}
        {row(
          buttonFx ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px]" />,
          "#5865f2",
          `Button FX ${buttonFx ? "on" : "off"}`,
          () => {
            haptic.select();
            setPref("buttonFx", !buttonFx);
          },
          (
            <span className={cn("relative mr-1 h-[30px] w-[50px] rounded-full transition", buttonFx ? "bg-ok" : "bg-white/15")}>
              <span className={cn("absolute top-[2px] size-[26px] rounded-full bg-white shadow transition-all", buttonFx ? "left-[22px]" : "left-[2px]")} />
            </span>
          ),
        )}
        {row(<Moon className="size-[18px]" />, "#f0a020", "Do Not Disturb", () => useApp.setState({ myStatus: myStatus === "dnd" ? "online" : "dnd" }), (
          <span className={cn("relative mr-1 h-[30px] w-[50px] rounded-full transition", myStatus === "dnd" ? "bg-ok" : "bg-white/15")}>
            <span className={cn("absolute top-[2px] size-[26px] rounded-full bg-white shadow transition-all", myStatus === "dnd" ? "left-[22px]" : "left-[2px]")} />
          </span>
        ))}
      </div>

      {vipPlus && (
        <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-side [&>button+button]:border-t [&>button+button]:border-white/[.05]">
          {row(<Crown className="size-[18px]" />, "#eb459e", "Staff Desk — VIP & staff perks", () => openStaffDesk())}
          {staff && row(<Shield className="size-[18px]" />, "#ed4245", "Admin Panel", () => openModal("settings", "admin"))}
        </div>
      )}

      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-side">
        <button
          onClick={async () => {
            await leaveCall();
            await supabase.auth.signOut();
          }}
          className="flex w-full items-center justify-center gap-2 py-3.5 text-[16px] font-semibold text-[#ff6b6b] active:bg-white/[.06]"
        >
          <LogOut className="size-[18px]" /> Log out
        </button>
      </div>

      <div className="mx-4 mt-4 mb-10">
        <NexusShareFooter />
      </div>
    </div>
  );
}
