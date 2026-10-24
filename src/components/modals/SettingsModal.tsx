"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Camera, Crown, LogOut, Mic, Palette, Shield, Upload, User, X } from "lucide-react";
import { useApp, closeModal, openModal, toast } from "@/store/app";
import { detectPush, disablePush, enablePush, usePush } from "@/lib/push";
import { isNativeApp } from "@/lib/useMobile";
import { useCall, leaveCall, updateSettings, type ScreenQuality } from "@/lib/call";
import { updateMyProfile, uploadAvatar } from "@/lib/data";
import { DECORATIONS, roleRank } from "@/lib/theme";
import AppearanceSection from "./AppearanceSection";
import AdminPanel from "./AdminPanel";
import ProfileExtras from "./ProfileExtras";
import NameTag from "@/components/ui/NameTag";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

type Section = "account" | "appearance" | "voice" | "notifications" | "admin";

export default function SettingsModal({ initial }: { initial: string | null }) {
  const [section, setSection] = useState<Section>(() => {
    const base = (initial ?? "voice").split(":")[0];
    return (["account", "appearance", "voice", "notifications", "admin"] as const).includes(base as Section) ? (base as Section) : "voice";
  });
  const focusUser = initial?.startsWith("admin:") ? initial.slice(6) : null;
  const isStaff = useApp((s) => roleRank(s.userId ? s.profiles[s.userId]?.site_role : null) >= 2);

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
          {nav("appearance", "Appearance", <Palette className="size-4" />)}
          {nav("voice", "Voice & Video", <Mic className="size-4" />)}
          {nav("notifications", "Notifications", <Bell className="size-4" />)}
          <button onClick={() => openModal("premium")} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-semibold text-[#f0b232] transition hover:bg-hover">
            <Crown className="size-4" />
            Nexus Premium
          </button>
          {isStaff && (
            <>
              <p className="px-2.5 pt-4 pb-1 text-xs font-bold tracking-wide text-sub uppercase">Staff</p>
              {nav("admin", "Admin Panel", <Shield className="size-4 text-dnd" />)}
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
        <div className="no-scrollbar sticky top-0 z-10 flex items-center gap-2 overflow-x-auto border-b border-line bg-chat/95 p-3 pt-safe-3 backdrop-blur sm:hidden">
          <button onClick={closeModal} className="grid size-8 shrink-0 place-items-center rounded-full bg-hover text-sub" aria-label="Close settings">
            <X className="size-4" />
          </button>
          {(["account", "appearance", "voice", "notifications", ...(isStaff ? ["admin"] : [])] as Section[]).map((s) => (
            <button key={s} onClick={() => setSection(s)} className={cn("shrink-0 rounded-md px-3 py-1 text-sm capitalize", section === s ? "bg-active" : "text-sub")}>
              {s}
            </button>
          ))}
        </div>
        <div className="max-w-[740px] px-4 py-6 pb-safe-2 sm:px-10 sm:py-14">
          {section === "account" && <AccountSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "admin" && isStaff && <AdminPanel focusUser={focusUser} />}
          {section === "voice" && <VoiceSection />}
          {section === "notifications" && <NotificationSection />}
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

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-5 text-xl font-bold">{children}</h2>;
const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">{children}</div>;

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
  const [bio, setBio] = useState(me?.bio ?? "");
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!me) return null;
  const dirty = name !== me.display_name || status !== (me.custom_status ?? "") || bio !== (me.bio ?? "");
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
              if (f.size > 10 * 1024 * 1024) return alert("Avatars can be up to 10 MB.");
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
          <div>
            <Label>Display name</Label>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className="w-full rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60" />
          </div>
          <div>
            <Label>Custom status</Label>
            <input value={status} maxLength={80} onChange={(e) => setStatus(e.target.value)} placeholder="🎧 cooking beats" className="w-full rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60" />
          </div>
          <div>
            <Label>About me</Label>
            <textarea value={bio} maxLength={190} rows={3} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself" className="w-full resize-none rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60" />
            <div className="text-right text-xs text-faint">{bio.length}/190</div>
          </div>
          <div className="flex justify-end">
            <button
              disabled={!dirty || !name.trim()}
              onClick={() => void updateMyProfile({ display_name: name.trim(), custom_status: status.trim() || null, bio: bio.trim() || null })}
              className="rounded-md bg-ok px-4 py-2 text-sm font-semibold text-white hover:bg-ok/85 disabled:opacity-40"
            >
              Save Changes
            </button>
          </div>

          <ProfileExtras />

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

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full cursor-pointer rounded-md bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/60">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-line/60 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-sub">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-ok" : "bg-faint")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

function Slider({ value, max, onChange, format }: { value: number; max: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={max}
        step={max / 200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vol flex-1"
        style={{ ["--fill" as string]: `${(value / max) * 100}%` }}
      />
      <span className="w-12 text-right text-sm text-sub tabular-nums">{format(value)}</span>
    </div>
  );
}

function VoiceSection() {
  const s = useCall((st) => st.settings);
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
            deviceId: s.inputDeviceId !== "default" ? { exact: s.inputDeviceId } : undefined,
            noiseSuppression: s.noiseSuppression,
            echoCancellation: s.echoCancellation,
            autoGainControl: s.autoGainControl,
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
  }, [testing, inCall, s.inputDeviceId, s.inputVolume, s.noiseSuppression, s.echoCancellation, s.autoGainControl, reloadDevices]);

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
      <Label>Voice processing</Label>
      <Toggle label="Noise suppression" hint="Filters background noise like keyboards and fans." checked={s.noiseSuppression} onChange={(v) => void updateSettings({ noiseSuppression: v })} />
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
          <Label>Screen share quality</Label>
          <Select
            value={s.screenQuality}
            onChange={(v) => void updateSettings({ screenQuality: v as ScreenQuality })}
            options={[
              { value: "720p30", label: "720p · 30fps" },
              { value: "1080p30", label: "1080p · 30fps" },
              { value: "1080p60", label: "1080p · 60fps" },
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
            {state === "native-local" && <span className="text-xs text-sub">Shows while the app runs in the background.</span>}
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
    </>
  );
}
