"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Accessibility, Bell, Camera, ChevronLeft, ChevronRight, Construction, Crown, Database, Keyboard, Link2, MapPin, MonitorSmartphone, ShieldCheck, LogOut, Mic, Palette, Shield, Smile, Sparkles, Upload, User, Wifi, X } from "lucide-react";
import { LIVE_STYLES, TYPING_STYLES, setChatFx, useChatFx } from "@/lib/chatFx";
import { LiveText, TypingAnim } from "@/components/chat/TypingBubbles";
import { useApp, closeModal, openModal, toast } from "@/store/app";
import { detectPush, disablePush, enablePush, usePush } from "@/lib/push";
import { isNativeApp } from "@/lib/useMobile";
import { CAMERA_QUALITY_OPTIONS, effectiveCameraQuality, pickCameraQuality, useCall, leaveCall, micConstraints, updateSettings, type NoiseMode, type ScreenQuality, type VoiceQuality } from "@/lib/call";
import AvatarStudio from "@/components/vavatar/AvatarStudio";
import DevelopmentModePanel from "@/components/admin/DevelopmentModePanel";
import { updateMyProfile, uploadAvatar } from "@/lib/data";
import { DECORATIONS, roleRank } from "@/lib/theme";
import AppearanceSection from "./AppearanceSection";
import { ArtistAlertsBlock, NotificationPrefsBlock } from "./ExtraSettings";
import AdminPanel from "./AdminPanel";
import ProfileExtras from "./ProfileExtras";
import NameTag from "@/components/ui/NameTag";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import { H, Label, Select, Slider, Toggle } from "./settingsUi";
import NetworkSection from "./NetworkSection";
import { AccessibilitySection, AdvancedSection, ChatPrefsBlock, ConnectionsSection, PrivacySection, UsernamesField } from "./MoreSettings";
import TwoFactorSection from "./TwoFactorSection";
import EmojiManager from "@/components/space/EmojiManager";

type Section = "account" | "connections" | "emojis" | "privacy" | "network" | "appearance" | "accessibility" | "chat" | "voice" | "vavatar" | "notifications" | "advanced" | "admin" | "devmode";
const ALL: Section[] = ["account", "connections", "emojis", "privacy", "network", "appearance", "accessibility", "chat", "voice", "vavatar", "notifications", "advanced", "admin", "devmode"];
const MOBILE_LABEL: Partial<Record<Section, string>> = { network: "Network", vavatar: "V-Avatar", chat: "Chat", privacy: "Privacy", advanced: "Data", devmode: "Dev mode" };

const MOBILE_GROUPS: { title: string; items: [Section, string, React.ReactNode, string][] }[] = [
  {
    title: "Your account",
    items: [
      ["account", "My Account", <User key="a" className="size-[18px]" />, "#5865f2"],
      ["connections", "Connections", <Link2 key="c" className="size-[18px]" />, "#1DB954"],
      ["privacy", "Privacy & Safety", <ShieldCheck key="p" className="size-[18px]" />, "#23a55a"],
      ["network", "Network & Ad blocking", <Wifi key="n" className="size-[18px]" />, "#00a8fc"],
    ],
  },
  {
    title: "App",
    items: [
      ["appearance", "Appearance & fonts", <Palette key="ap" className="size-[18px]" />, "#9b59b6"],
      ["accessibility", "Accessibility", <Accessibility key="ac" className="size-[18px]" />, "#f0b232"],
      ["chat", "Chat & Typing", <Keyboard key="ch" className="size-[18px]" />, "#eb459e"],
      ["emojis", "Custom emojis", <Smile key="em" className="size-[18px]" />, "#f0b232"],
      ["voice", "Voice & Video", <Mic key="v" className="size-[18px]" />, "#23a55a"],
      ["vavatar", "V-Avatar", <Sparkles key="va" className="size-[18px]" />, "#ff73fa"],
      ["notifications", "Notifications & release alerts", <Bell key="no" className="size-[18px]" />, "#f23f43"],
      ["advanced", "Data & Advanced", <Database key="d" className="size-[18px]" />, "#4e5058"],
    ],
  },
];

/** phone settings home: every page in an iOS-style list */
function MobileSettingsHome({ isStaff, isAdmin, onPick }: { isStaff: boolean; isAdmin: boolean; onPick: (s: Section) => void }) {
  const groups = isStaff
    ? [...MOBILE_GROUPS, { title: "Staff", items: [["admin", "Admin Panel", <Shield key="ad" className="size-[18px]" />, "#ed4245"], ...(isAdmin ? [["devmode", "Dev / updating", <Construction key="dv" className="size-[18px]" />, "#f0a020"]] : [])] as [Section, string, React.ReactNode, string][] }]
    : MOBILE_GROUPS;
  return (
    <div className="pb-safe-4 sm:hidden">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-chat/95 px-4 pt-safe-3 pb-2 backdrop-blur">
        <h1 className="flex-1 text-[28px] font-bold tracking-tight">Settings</h1>
        <button onClick={closeModal} className="grid size-9 place-items-center rounded-full bg-hover text-sub" aria-label="Close settings">
          <X className="size-5" />
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.title} className="mt-3 px-4">
          <div className="mb-1.5 px-1 text-xs font-bold tracking-wide text-sub uppercase">{g.title}</div>
          <div className="overflow-hidden rounded-2xl bg-side">
            {g.items.map(([id, label, icon, color], i) => (
              <button key={id} onClick={() => onPick(id)} className={cn("flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left active:bg-white/[.06]", i > 0 && "border-t border-white/[.05]")}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: color }}>
                  {icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px]">{label}</span>
                <ChevronRight className="size-4 text-sub" />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-4 px-4 space-y-2">
        <a href="/locator" className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-side px-3.5 text-left font-semibold active:bg-white/[.06]">
          <MapPin className="size-5" /> Locator
        </a>
        <a href="/phone" className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-side px-3.5 text-left font-semibold active:bg-white/[.06]">
          <MonitorSmartphone className="size-5" /> Phone Link
        </a>
        <button onClick={() => openModal("premium")} className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-side px-3.5 text-left font-semibold text-[#f0b232] active:bg-white/[.06]">
          <Crown className="size-5" /> Nexus Premium
        </button>
      </div>
      <div className="mt-4 px-4">
        <button
          onClick={async () => {
            closeModal();
            await leaveCall();
            await supabase.auth.signOut();
          }}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-side font-semibold text-[#ff6b6b] active:bg-white/[.06]"
        >
          <LogOut className="size-[18px]" /> Log out
        </button>
      </div>
    </div>
  );
}

export default function SettingsModal({ initial }: { initial: string | null }) {
  const [section, setSection] = useState<Section>(() => {
    const base = (initial ?? "account").split(":")[0];
    return ALL.includes(base as Section) ? (base as Section) : "account";
  });
  // phones: a list of every settings page first (openModal("settings") or "home"), then the page
  const [home, setHome] = useState(() => !initial || initial === "home");
  const go = (s: Section) => {
    setSection(s);
    setHome(false);
  };
  const focusUser = initial?.startsWith("admin:") ? initial.slice(6) : null;
  const isStaff = useApp((s) => roleRank(s.userId ? s.profiles[s.userId]?.site_role : null) >= 2);
  const isAdmin = useApp((s) => roleRank(s.userId ? s.profiles[s.userId]?.site_role : null) >= 3);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const nav = (id: Section, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setSection(id)}
      className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition", section === id ? "bg-active text-white" : "text-sub hover:bg-hover hover:text-txt")}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex animate-fade bg-chat">
      <aside className="hidden w-[260px] shrink-0 justify-end bg-side py-14 pr-2 sm:flex">
        <div className="w-[200px] space-y-0.5 text-[15px]">
          <p className="px-2.5 pb-1 text-xs font-bold tracking-wide text-sub uppercase">User Settings</p>
          {nav("account", "My Account", <User className="size-4" />)}
          {nav("connections", "Connections", <Link2 className="size-4" />)}
          {nav("privacy", "Privacy & Safety", <ShieldCheck className="size-4" />)}
          {nav("network", "Network & Ad blocking", <Wifi className="size-4" />)}
          <p className="px-2.5 pt-4 pb-1 text-xs font-bold tracking-wide text-sub uppercase">App Settings</p>
          {nav("appearance", "Appearance", <Palette className="size-4" />)}
          {nav("accessibility", "Accessibility", <Accessibility className="size-4" />)}
          {nav("chat", "Chat & Typing", <Keyboard className="size-4" />)}
          {nav("emojis", "Custom emojis", <Smile className="size-4" />)}
          {nav("voice", "Voice & Video", <Mic className="size-4" />)}
          {nav("vavatar", "V-Avatar", <Sparkles className="size-4" />)}
          {nav("notifications", "Notifications", <Bell className="size-4" />)}
          {nav("advanced", "Data & Advanced", <Database className="size-4" />)}
          <a href="/locator" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sub transition hover:bg-hover hover:text-txt">
            <MapPin className="size-4" /> Locator
          </a>
          <a href="/phone" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sub transition hover:bg-hover hover:text-txt">
            <MonitorSmartphone className="size-4" /> Phone Link
          </a>
          <button onClick={() => openModal("premium")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-semibold text-[#f0b232] transition hover:bg-hover">
            <Crown className="size-4" />
            Nexus Premium
          </button>
          {isStaff && (
            <>
              <p className="px-2.5 pt-4 pb-1 text-xs font-bold tracking-wide text-sub uppercase">Staff</p>
              {nav("admin", "Admin Panel", <Shield className="size-4 text-dnd" />)}
              {isAdmin && nav("devmode", "Dev / updating", <Construction className="size-4 text-amber-400" />)}
            </>
          )}
          <div className="my-2 h-px bg-line" />
          <button
            onClick={async () => {
              closeModal();
              await leaveCall();
              await supabase.auth.signOut();
            }}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-dnd hover:bg-hover"
          >
            Log Out <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {home && <MobileSettingsHome isStaff={isStaff} isAdmin={isAdmin} onPick={go} />}
        <div className={cn("no-scrollbar sticky top-0 z-10 items-center gap-2 overflow-x-auto border-b border-line bg-chat/95 p-3 pt-safe-3 backdrop-blur sm:hidden", home ? "hidden" : "flex")}>
          <button onClick={() => setHome(true)} className="flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-hover pr-3 pl-1.5 text-sm font-semibold" aria-label="All settings">
            <ChevronLeft className="size-4" /> Settings
          </button>
          <button onClick={closeModal} className="grid size-8 shrink-0 place-items-center rounded-full bg-hover text-sub" aria-label="Close settings">
            <X className="size-4" />
          </button>
          {ALL.filter((x) => (x !== "admin" || isStaff) && (x !== "devmode" || isAdmin)).map((s) => (
            <button key={s} onClick={() => setSection(s)} className={cn("shrink-0 rounded-md px-3 py-1 text-sm capitalize", section === s ? "bg-active" : "text-sub")}>
              {MOBILE_LABEL[s] ?? s}
            </button>
          ))}
        </div>
        <div className={cn("px-4 py-6 pb-safe-2 sm:block sm:px-10 sm:py-14", home && "hidden", section === "vavatar" ? "max-w-[1040px]" : "max-w-[740px]")}>
          {section === "account" && <AccountSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "admin" && isStaff && <AdminPanel focusUser={focusUser} />}
          {section === "devmode" && isAdmin && (
            <>
              <H>Development / updating mode</H>
              <p className="-mt-3 mb-5 text-sm text-sub">Admins only. Toggle this on while Nexus is updating — members see “we&apos;ll be back soon.”</p>
              <DevelopmentModePanel variant="settings" />
            </>
          )}
          {section === "chat" && <ChatSection />}
          {section === "emojis" && (
            <>
              <h2 className="mb-4 text-xl font-bold">Custom emojis</h2>
              <EmojiManager spaceId={null} canEdit />
              <p className="mt-4 text-[12px] text-sub">Server owners and admins can add server emojis in Server hub → Emojis. Type :name: in any chat or pick them from the emoji picker.</p>
            </>
          )}
          {section === "voice" && <VoiceSection />}
          {section === "vavatar" && (
            <>
              <H>V-Avatar</H>
              <p className="-mt-3 mb-5 text-sm text-sub">Build your anime self. In a call, tap ✨ to show it instead of your camera — it copies your head, eyes and mouth live.</p>
              <AvatarStudio />
            </>
          )}
          {section === "notifications" && <NotificationSection />}
          {section === "connections" && <ConnectionsSection />}
          {section === "privacy" && <PrivacySection />}
          {section === "network" && <NetworkSection />}
          {section === "accessibility" && <AccessibilitySection />}
          {section === "advanced" && <AdvancedSection />}
        </div>
      </div>
      <div className="absolute top-14 right-10 hidden flex-col items-center gap-1 sm:flex">
        <button onClick={closeModal} className="grid size-9 place-items-center rounded-full border-2 border-sub text-sub hover:border-txt hover:text-txt" aria-label="Close settings">
          <X className="size-5" />
        </button>
        <span className="text-xs font-semibold text-sub">ESC</span>
      </div>
    </div>
  );
}

const COLORS = ["#5865F2", "#2AABEE", "#3BA55D", "#FAA61A", "#ED4245", "#EB459E", "#9B59B6", "#1ABC9C", "#E67E22", "#607D8B"];

const BANNERS = [
  "",
  "linear-gradient(135deg,#2aabee,#5865f2)",
  "linear-gradient(135deg,#eb459e,#ff8a5b)",
  "linear-gradient(135deg,#0f2027,#2c5364)",
  "linear-gradient(135deg,#7f00ff,#e100ff)",
  "linear-gradient(135deg,#f0b232,#ed4245)",
  "linear-gradient(135deg,#11998e,#38ef7d)",
  "linear-gradient(135deg,#000000,#434343)",
];

function AccountSection() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const [name, setName] = useState(me?.display_name ?? "");
  const [status, setStatus] = useState(me?.custom_status ?? "");
  const [clearAfter, setClearAfter] = useState("keep");
  const [bio, setBio] = useState(me?.bio ?? "");
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!me) return null;
  const dirty = name !== me.display_name || status !== (me.custom_status ?? "") || bio !== (me.bio ?? "") || clearAfter !== "keep";
  const untilFor = (v: string): string | null | undefined => {
    if (v === "keep") return undefined;
    if (v === "never") return null;
    const d = new Date();
    if (v === "today") d.setHours(23, 59, 0, 0);
    else if (v === "week") d.setDate(d.getDate() + 7);
    else d.setMinutes(d.getMinutes() + Number(v));
    return d.toISOString();
  };
  const banner = me.banner_color || me.avatar_color;
  const animated = !!me.avatar_url && /\.(gif|webp|apng)(\?|$)/i.test(me.avatar_url);

  return (
    <>
      <H>My Account</H>
      <div className="overflow-hidden rounded-xl bg-rail">
        <div
          className="h-28 bg-cover bg-center"
          style={me.banner_url ? { backgroundImage: `url("${me.banner_url}")` } : { background: banner.startsWith("linear") ? banner : `linear-gradient(135deg, ${banner}, ${banner}66)` }}
        />
        <div className="flex flex-wrap items-end gap-4 px-4 pb-4">
          <div className="-mt-12">
            <Avatar userId={me.id} size={96} className="rounded-full ring-[6px] ring-rail" />
          </div>
          <div className="min-w-0 flex-1 basis-40 pb-1">
            <div className="truncate text-xl font-bold">
              <NameTag userId={me.id} badgeSize="md" />
            </div>
            <div className="text-sm text-sub">
              @{me.username}
              {me.member_no != null && <span className="ml-2 rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">UID #{me.member_no}</span>}
            </div>
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/apng"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 1024 * 1024 * 1024) return alert("Avatars can be up to 1 GB.");
              setUploading(true);
              await uploadAvatar(f);
              setUploading(false);
            }}
          />
          <button onClick={() => file.current?.click()} disabled={uploading} className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-50 sm:w-auto">
            <Upload className="size-4" /> {uploading ? "Uploading…" : "Change avatar"}
          </button>
        </div>
        <div className="space-y-6 bg-side p-4">
          <p className="-mt-1 text-xs text-sub">
            Animated avatars supported — upload a <b className="text-txt">GIF</b> or animated <b className="text-txt">WebP</b> (up to 10 MB).
            {animated && <span className="ml-1 rounded bg-accent/20 px-1.5 py-0.5 font-semibold text-accent">Animated ✓</span>}
          </p>
          <UsernamesField />
          <div>
            <Label>Display name</Label>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className="w-full rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60" />
          </div>
          <div>
            <Label>Custom status</Label>
            <div className="flex gap-2">
              <input value={status} maxLength={80} onChange={(e) => setStatus(e.target.value)} placeholder="🎧 cooking beats" className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60" />
              <select value={clearAfter} onChange={(e) => setClearAfter(e.target.value)} className="rounded-md bg-rail px-2 py-2 text-sm outline-none" aria-label="Clear status after">
                <option value="keep">{me.status_until ? `Clears ${new Date(me.status_until).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "Don't clear"}</option>
                <option value="30">Clear in 30 min</option>
                <option value="60">Clear in 1 hour</option>
                <option value="240">Clear in 4 hours</option>
                <option value="today">Clear tonight</option>
                <option value="week">Clear in a week</option>
                {me.status_until && <option value="never">Don&apos;t clear</option>}
              </select>
            </div>
          </div>
          <div>
            <Label>About me</Label>
            <textarea value={bio} maxLength={190} rows={3} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself" className="w-full resize-none rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60" />
            <div className="text-right text-xs text-faint">{bio.length}/190</div>
          </div>
          <div className="flex justify-end">
            <button
              disabled={!dirty || !name.trim()}
              onClick={() => {
                const until = untilFor(clearAfter);
                void updateMyProfile({ display_name: name.trim(), custom_status: status.trim() || null, bio: bio.trim() || null, ...(until !== undefined || !status.trim() ? { status_until: status.trim() ? (until ?? null) : null } : {}) });
                setClearAfter("keep");
              }}
              className="rounded-md bg-ok px-4 py-2 text-sm font-semibold text-white hover:bg-ok/85 disabled:opacity-40"
            >
              Save Changes
            </button>
          </div>

          <ProfileExtras />

          <div>
            <Label>Account security</Label>
            <TwoFactorSection />
          </div>

          <div>
            <Label>Avatar decoration</Label>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {DECORATIONS.map((d) => {
                const active = (me.avatar_decoration ?? "") === d.id;
                return (
                  <button
                    key={d.id || "none"}
                    onClick={() => void updateMyProfile({ avatar_decoration: d.id || null })}
                    className={cn("flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition", active ? "border-accent bg-accent/10" : "border-line hover:border-sub")}
                  >
                    <Avatar userId={me.id} size={48} decoration={d.id} />
                    <span className="text-xs">{d.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Banner color</Label>
            <div className="flex flex-wrap gap-2">
              {BANNERS.map((b) => (
                <button
                  key={b || "default"}
                  onClick={() => void updateMyProfile({ banner_color: b || null })}
                  className={cn("h-9 w-16 rounded-lg transition hover:scale-105", (me.banner_color ?? "") === b && "ring-2 ring-white ring-offset-2 ring-offset-side")}
                  style={{ background: b || me.avatar_color }}
                  aria-label={b || "Default banner"}
                />
              ))}
              <label className="relative h-9 w-16 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-sub" title="Custom color">
                <input type="color" value={me.banner_color?.startsWith("#") ? me.banner_color : "#5865f2"} onChange={(e) => void updateMyProfile({ banner_color: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
                <span className="grid size-full place-items-center text-sm text-sub">+</span>
              </label>
            </div>
          </div>

          <div>
            <Label>Avatar color (when no image)</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => void updateMyProfile({ avatar_color: c })}
                  className={cn("size-9 rounded-full transition hover:scale-110", me.avatar_color.toLowerCase() === c.toLowerCase() && "ring-2 ring-white ring-offset-2 ring-offset-side")}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              {me.avatar_url && (
                <button onClick={() => void updateMyProfile({ avatar_url: null })} className="rounded-md px-3 text-sm text-dnd hover:underline">
                  Remove avatar image
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const reload = useCallback(() => {
    void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    navigator.mediaDevices?.addEventListener("devicechange", reload);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", reload);
  }, [reload]);
  return [devices, reload] as const;
}

function VoiceSection() {
  const s = useCall((st) => st.settings);
  const clearActive = useCall((st) => st.clearActive);
  const inCall = useCall((st) => st.status !== "idle");
  const callLevel = useCall((st) => st.inputLevel);
  const [devices, reloadDevices] = useDevices();
  const [testing, setTesting] = useState(false);
  const [testLevel, setTestLevel] = useState(0);
  const [recordingKey, setRecordingKey] = useState(false);
  const [camPreview, setCamPreview] = useState<MediaStream | null>(null);
  const camRef = useRef<HTMLVideoElement>(null);

  const inputs = devices.filter((d) => d.kind === "audioinput");
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  const cams = devices.filter((d) => d.kind === "videoinput");
  const opts = (list: MediaDeviceInfo[], fallback: string) => [
    { value: "default", label: "Default" },
    ...list.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => ({ value: d.deviceId, label: d.label || `${fallback} ${i + 1}` })),
  ];

  // mic test (outside calls)
  useEffect(() => {
    if (!testing || inCall) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...micConstraints(s),
            deviceId: s.inputDeviceId !== "default" ? { exact: s.inputDeviceId } : undefined,
          },
        });
        reloadDevices();
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = s.inputVolume;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(gain).connect(an);
        const buf = new Float32Array(512);
        const loop = () => {
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          setTestLevel(Math.sqrt(sum / buf.length));
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setTesting(false);
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setTestLevel(0);
    };
  }, [testing, inCall, s.inputDeviceId, s.inputVolume, s.noiseMode, s.echoCancellation, s.autoGainControl, reloadDevices]); // eslint-disable-line react-hooks/exhaustive-deps

  // keybind capture
  useEffect(() => {
    if (!recordingKey) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") void updateSettings({ pttKey: e.code });
      setRecordingKey(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [recordingKey]);

  // camera preview
  useEffect(() => {
    if (camRef.current) camRef.current.srcObject = camPreview;
    return () => camPreview?.getTracks().forEach((t) => t.stop());
  }, [camPreview]);

  const level = inCall ? callLevel : testLevel;
  const levelPct = Math.min(100, (level / 0.2) * 100);
  const thresholdPct = (s.vadThreshold / 0.2) * 100;

  return (
    <>
      <H>Voice Settings</H>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label>Input device</Label>
          <Select value={s.inputDeviceId} onChange={(v) => void updateSettings({ inputDeviceId: v })} options={opts(inputs, "Microphone")} />
        </div>
        <div>
          <Label>Output device</Label>
          <Select value={s.outputDeviceId} onChange={(v) => void updateSettings({ outputDeviceId: v })} options={opts(outputs, "Speaker")} />
        </div>
        <div>
          <Label>Input volume</Label>
          <Slider value={s.inputVolume} max={2} onChange={(v) => void updateSettings({ inputVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
        <div>
          <Label>Output volume</Label>
          <Slider value={s.outputVolume} max={2} onChange={(v) => void updateSettings({ outputVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </div>

      <div className="mt-6">
        <Label>Mic test</Label>
        <p className="mb-3 text-sm text-sub">Having mic issues? Start a test and say something — the bar should light up.</p>
        <div className="flex items-center gap-3">
          {!inCall && (
            <button onClick={() => setTesting((v) => !v)} className={cn("rounded-md px-4 py-2 text-sm font-semibold text-white", testing ? "bg-dnd" : "bg-accent hover:bg-accent-2")}>
              {testing ? "Stop Testing" : "Let's Check"}
            </button>
          )}
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-rail">
            <div className={cn("h-full rounded-full transition-[width] duration-75", level >= s.vadThreshold ? "bg-ok" : "bg-idle")} style={{ width: `${levelPct}%` }} />
          </div>
        </div>
      </div>

      <div className="my-8 h-px bg-line" />

      <Label>Input mode</Label>
      <div className="space-y-2">
        {(["vad", "ptt"] as const).map((m) => (
          <label key={m} className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5", s.mode === m ? "bg-active" : "bg-side hover:bg-hover")}>
            <input type="radio" checked={s.mode === m} onChange={() => void updateSettings({ mode: m })} className="size-4 accent-accent" />
            {m === "vad" ? "Voice Activity" : "Push to Talk"}
          </label>
        ))}
      </div>

      {s.mode === "ptt" ? (
        <div className="mt-5">
          <Label>Shortcut</Label>
          <div className="flex items-center gap-3">
            <kbd className="min-w-28 rounded-md border border-line bg-rail px-3 py-2 text-center font-mono">{recordingKey ? "Press a key…" : s.pttKey.replace(/^Key|^Digit/, "")}</kbd>
            <button onClick={() => setRecordingKey(true)} className="rounded-md bg-side px-4 py-2 text-sm font-semibold hover:bg-hover">
              {recordingKey ? "Recording…" : "Edit Keybind"}
            </button>
          </div>
          <p className="mt-2 text-xs text-sub">Hold the key while the app is focused to talk. (Browsers can&apos;t capture keys when the tab is in the background.)</p>
        </div>
      ) : (
        <div className="mt-5">
          <Label>Input sensitivity</Label>
          <div className="relative">
            <div className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ok/40" style={{ width: `${levelPct}%` }} />
            <Slider value={s.vadThreshold} max={0.2} onChange={(v) => void updateSettings({ vadThreshold: Math.max(0.002, v) })} format={() => `${Math.round(thresholdPct)}`} />
          </div>
          <p className="mt-1 text-xs text-sub">Your mic opens when the green bar passes the slider.</p>
        </div>
      )}

      <div className="my-8 h-px bg-line" />
      <Label>Noise cancellation</Label>
      <div className="grid gap-2 sm:grid-cols-3">
        {(
          [
            ["ai", "Nexus Clear ✨", "AI removes keyboards, fans, dogs, traffic — only your voice gets through."],
            ["standard", "Standard", "The browser's built-in filter. Lighter on old devices."],
            ["off", "Off", "Raw mic — for studio mics and music."],
          ] as [NoiseMode, string, string][]
        ).map(([id, label, hint]) => (
          <button key={id} onClick={() => void updateSettings({ noiseMode: id })} className={cn("rounded-xl p-3 text-left ring-2 transition", s.noiseMode === id ? "bg-accent/15 ring-accent" : "bg-side ring-transparent hover:bg-hover")}>
            <span className="block font-semibold">{label}</span>
            <span className="mt-0.5 block text-xs text-sub">{hint}</span>
          </button>
        ))}
      </div>
      {s.noiseMode === "ai" && clearActive === false && <p className="mt-2 text-xs text-[#f0b232]">Nexus Clear isn&apos;t supported on this device/browser — using standard filtering instead.</p>}

      <div className="mt-6">
        <Label>Voice quality</Label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [64, "Standard", "64 kbps · saves data"],
              [128, "High", "128 kbps"],
              [320, "Studio", "320 kbps stereo"],
              [510, "Ultra studio", "510 kbps · near Opus max"],
            ] as [VoiceQuality, string, string][]
          ).map(([q, label, hint]) => (
            <button key={q} onClick={() => void updateSettings({ voiceQuality: q, qualityV: 3 })} className={cn("rounded-xl p-3 text-left ring-2 transition", s.voiceQuality === q ? "bg-accent/15 ring-accent" : "bg-side ring-transparent hover:bg-hover")}>
              <span className="block font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs text-sub">{hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-sub">Fullband 48 kHz Opus with FEC + no DTX. Ultra studio targets ~510 kbps stereo — best for music / production calls.</p>
      </div>

      <div className="mt-6">
        <Label>Soundboard volume</Label>
        <Slider value={s.soundboardVolume} max={1} onChange={(v) => void updateSettings({ soundboardVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </div>

      <div className="my-8 h-px bg-line" />
      <Label>Voice processing</Label>
      <Toggle label="Stereo studio capture" hint="Capture 2 channels when quality is Studio or Ultra (music calls)." checked={!!s.stereoStudio} onChange={(v) => void updateSettings({ stereoStudio: v })} />
      <Toggle label="Whisper mode" hint="Send at ~28% gain without hard-muting — soft asides in calls." checked={!!s.whisper} onChange={(v) => void updateSettings({ whisper: v })} />
      <Toggle label="Echo cancellation" hint="Stops others hearing themselves through your speakers." checked={s.echoCancellation} onChange={(v) => void updateSettings({ echoCancellation: v })} />
      <Toggle label="Automatic gain control" hint="Keeps your volume consistent." checked={s.autoGainControl} onChange={(v) => void updateSettings({ autoGainControl: v })} />

      <div className="my-8 h-px bg-line" />
      <H>Video Settings</H>
      <div className="mb-4 grid aspect-video max-w-md place-items-center overflow-hidden rounded-xl bg-rail">
        {camPreview ? (
          <video ref={camRef} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
        ) : (
          <button
            onClick={async () => {
              try {
                const st = await navigator.mediaDevices.getUserMedia({
                  video: s.cameraDeviceId !== "default" ? { deviceId: { exact: s.cameraDeviceId } } : true,
                });
                setCamPreview(st);
                reloadDevices();
              } catch {
                /* denied */
              }
            }}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-2"
          >
            <Camera className="size-4" /> Test Video
          </button>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label>Camera</Label>
          <Select
            value={s.cameraDeviceId}
            onChange={(v) => {
              setCamPreview(null);
              void updateSettings({ cameraDeviceId: v });
            }}
            options={opts(cams, "Camera")}
          />
        </div>
        <div>
          <Label>Camera quality</Label>
          <Select value={s.cameraQuality ?? "auto"} onChange={pickCameraQuality} options={CAMERA_QUALITY_OPTIONS} />
          <p className="mt-1 text-xs text-sub">Sending {effectiveCameraQuality().replace("p", "p · ").replace(/(\d+)$/, "$1fps")} · 1080p &amp; 60fps need ⚡ Lighting</p>
        </div>
        <div>
          <Label>Screen share quality</Label>
          <Select
            value={s.screenQuality}
            onChange={(v) => void updateSettings({ screenQuality: v as ScreenQuality })}
            options={[
              { value: "720p30", label: "720p · 30fps" },
              { value: "1080p30", label: "1080p · 30fps" },
              { value: "1080p60", label: "1080p · 60fps" },
              { value: "1440p30", label: "1440p · 30fps" },
              { value: "2160p30", label: "4K · 30fps" },
              { value: "source", label: "Source resolution" },
            ]}
          />
        </div>
      </div>
    </>
  );
}

function NotificationSection() {
  const { state, busy } = usePush();
  const isOwner = useApp((s) => roleRank(s.userId ? s.profiles[s.userId]?.site_role : null) >= 4);
  const [status, setStatus] = useState<{ web: boolean; fcm: boolean; devices: number } | null>(null);
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const loadStatus = useCallback(() => {
    void supabase.rpc("push_status").then(({ data }) => data && setStatus(data as { web: boolean; fcm: boolean; devices: number }));
  }, []);
  useEffect(() => {
    void detectPush().then((st) => usePush.setState({ state: st }));
    loadStatus();
  }, [loadStatus, state]);

  const on = state === "on" || state === "native-push" || state === "native-local";
  return (
    <>
      <H>Notifications</H>
      <div className="rounded-xl bg-side p-4">
        <div className="font-medium">Push notifications on this device</div>
        <p className="mt-1 mb-3 text-sm text-sub">
          Get a notification for new messages and incoming calls — even when Nexus is closed. Muted chats and Do Not Disturb stay quiet; in spaces you only get @mentions.
        </p>
        {on ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-ok">On ✓</span>
            {state === "native-local" && (
              <span className="text-xs text-sub">
                Banners show on this phone while Nexus is open or backgrounded. The app icon badge counts unread messages like Telegram.
              </span>
            )}
            {state === "on" && (
              <button onClick={() => void disablePush()} className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15">
                Turn off
              </button>
            )}
          </div>
        ) : state === "ios-install" ? (
          <div className="space-y-2 text-sm">
            <div className="font-semibold">On iPhone, add Nexus to your Home Screen first:</div>
            <ol className="list-decimal space-y-1 pl-5 text-sub">
              <li>Open this site in Safari</li>
              <li>Tap Share → Add to Home Screen</li>
              <li>Open Nexus from the new icon, sign in, and come back here</li>
            </ol>
          </div>
        ) : state === "denied" ? (
          <span className="text-sm text-dnd">Blocked — allow notifications for Nexus in your {isNativeApp() ? "phone settings" : "browser / phone settings"}, then reopen.</span>
        ) : state === "unsupported" ? (
          <span className="text-sm text-sub">Not supported here. Use Chrome, Edge, Firefox or Safari (on iPhone: the Home Screen app).</span>
        ) : (
          <button disabled={busy} onClick={() => void enablePush()} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-60">
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        )}
        {status && <div className="mt-3 text-xs text-sub">Devices receiving your notifications: {status.devices}</div>}
      </div>
      <NotificationPrefsBlock />
      <ArtistAlertsBlock />

      {isOwner && (
        <div className="mt-4 rounded-xl bg-side p-4">
          <div className="font-medium">Android app push (Firebase)</div>
          <p className="mt-1 mb-3 text-sm text-sub">
            Web push is {status?.web ? "ready ✓" : "not set up"}. For notifications in the Android APK while it's fully closed, paste a Firebase service-account key (Firebase console →
            Project settings → Service accounts → Generate new private key). Status: {status?.fcm ? <b className="text-ok">connected ✓</b> : "not connected"}
          </p>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={4}
            placeholder='{"type": "service_account", ...}'
            className="w-full rounded-md bg-black/30 p-2 font-mono text-xs outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              disabled={saving || !json.trim()}
              onClick={async () => {
                setSaving(true);
                const { error } = await supabase.rpc("set_fcm_service_account", { p_json: json.trim() });
                setSaving(false);
                if (error) toast(error.message, "error");
                else {
                  setJson("");
                  toast("Firebase connected", "success");
                  loadStatus();
                }
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save
            </button>
            {status?.fcm && (
              <button
                onClick={async () => {
                  await supabase.rpc("set_fcm_service_account", { p_json: "" });
                  loadStatus();
                }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-semibold"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
      {isOwner && <ApnsBlock />}
    </>
  );
}

/** Owner: APNs auth key so iPhone apps (Nexus / Wump IPAs) get notifications while closed. */
function ApnsBlock() {
  const [st, setSt] = useState<{ key_id: string | null; team_id: string | null; has_key: boolean; sandbox: boolean; ios_devices: number } | null>(null);
  const [keyId, setKeyId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [p8, setP8] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void supabase.rpc("admin_apns_status").then(({ data }) => {
      if (!data) return;
      const d = data as NonNullable<typeof st>;
      setSt(d);
      setKeyId(d.key_id ?? "");
      setTeamId(d.team_id ?? "");
      setSandbox(d.sandbox);
    });
  }, []);
  return (
    <div className="mt-4 rounded-xl bg-side p-4">
      <div className="font-medium">iPhone app push (APNs)</div>
      <p className="mt-1 mb-3 text-sm text-sub">
        For notifications in the Nexus and Wump iPhone apps while they're closed: developer.apple.com → Keys → + → Apple Push Notifications service → download the .p8 once. Also turn on
        Push Notifications for both App IDs and regenerate their App Store profiles. Status:{" "}
        {st?.has_key ? <b className="text-ok">key saved ✓ · {st.ios_devices} iPhone{st.ios_devices === 1 ? "" : "s"} registered</b> : "not set up"}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={keyId} onChange={(e) => setKeyId(e.target.value.toUpperCase().slice(0, 10))} placeholder="Key ID (10 chars)" autoComplete="off" className="rounded-md bg-black/30 px-2 py-2 font-mono text-sm outline-none" />
        <input value={teamId} onChange={(e) => setTeamId(e.target.value.toUpperCase().slice(0, 10))} placeholder="Team ID (10 chars)" autoComplete="off" className="rounded-md bg-black/30 px-2 py-2 font-mono text-sm outline-none" />
      </div>
      <textarea
        value={p8}
        onChange={(e) => setP8(e.target.value)}
        rows={3}
        placeholder={st?.has_key ? "Key saved — paste a new .p8 to replace" : "-----BEGIN PRIVATE KEY----- …"}
        autoComplete="off"
        spellCheck={false}
        className="mt-2 w-full rounded-md bg-black/30 p-2 font-mono text-xs outline-none"
      />
      <label className="mt-2 flex items-center gap-2 text-xs text-sub">
        <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} /> Sandbox (Xcode debug builds only — leave off for TestFlight / App Store)
      </label>
      <button
        disabled={saving || keyId.length !== 10 || teamId.length !== 10 || (!st?.has_key && !p8.trim())}
        onClick={async () => {
          setSaving(true);
          const { data, error } = await supabase.rpc("admin_set_apns", { p_key_id: keyId, p_team_id: teamId, p_key_p8: p8.trim() || null, p_sandbox: sandbox });
          setSaving(false);
          if (error) toast(error.message, "error");
          else {
            setP8("");
            setSt(data as NonNullable<typeof st>);
            toast("APNs saved", "success");
          }
        }}
        className="mt-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}

function ChatSection() {
  const fx = useChatFx();
  const [demo, setDemo] = useState("");
  useEffect(() => {
    const full = "this is how my live typing looks ✨";
    let i = 0;
    const id = setInterval(() => {
      i = i > full.length + 12 ? 0 : i + 1;
      setDemo(full.slice(0, Math.min(i, full.length)));
    }, 110);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <H>Chat &amp; Typing</H>
      <Label>Privacy</Label>
      <Toggle label="Show when I'm typing" hint="Others see a typing animation while you write. Turn off to type invisibly." checked={fx.showTyping} onChange={(v) => setChatFx({ showTyping: v })} />
      <Toggle
        label="Live typing (share my words as I type)"
        hint="Your friends see your message appear letter by letter before you send it — only in the chat you're typing in. Off by default."
        checked={fx.liveTyping && fx.showTyping}
        onChange={(v) => setChatFx({ liveTyping: v, ...(v ? { showTyping: true } : {}) })}
      />

      <div className="my-8 h-px bg-line" />
      <Label>Typing animation</Label>
      <p className="mb-3 text-sm text-sub">How other people&apos;s typing looks to you.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TYPING_STYLES.map(([id, name]) => (
          <button key={id} onClick={() => setChatFx({ style: id })} className={cn("flex flex-col items-center gap-2 rounded-xl p-3 ring-2 transition", fx.style === id ? "bg-accent/15 ring-accent" : "bg-side ring-transparent hover:bg-hover")}>
            <span className="grid h-8 place-items-center text-sub">
              <TypingAnim style={id} />
            </span>
            <span className="text-sm font-semibold">{name}</span>
          </button>
        ))}
      </div>

      <div className="my-8 h-px bg-line" />
      <Label>Live typing animation</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {LIVE_STYLES.map(([id, name]) => (
          <button key={id} onClick={() => setChatFx({ liveStyle: id })} className={cn("rounded-xl p-3 text-left ring-2 transition", fx.liveStyle === id ? "bg-accent/15 ring-accent" : "bg-side ring-transparent hover:bg-hover")}>
            <div className="text-xs font-bold tracking-wide text-sub uppercase">{name}</div>
            <div className="mt-1 min-h-6 text-[15px]">
              <LiveText text={demo} style={id} />
            </div>
          </button>
        ))}
      </div>
      <ChatPrefsBlock />
    </>
  );
}
