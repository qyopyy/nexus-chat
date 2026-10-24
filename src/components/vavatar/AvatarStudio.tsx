"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Dices, RotateCcw, Save, Sparkles } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { updateMyProfile } from "@/lib/data";
import { setAvatarLook, useCall } from "@/lib/call";
import { DEFAULT_AVATAR, OPTIONS, SWATCH, normalizeAvatar, randomAvatar, startAvatar, type AvatarEngine, type VAvatar } from "@/lib/vavatar";
import { cn } from "@/lib/utils";

/** your saved look (or the default one) */
export function useMyAvatar(): VAvatar {
  const raw = useApp((s) => (s.userId ? s.profiles[s.userId]?.vavatar : null));
  return useMemo(() => (raw ? normalizeAvatar(raw) : DEFAULT_AVATAR), [raw]);
}

const LABEL: Record<string, string> = {
  round: "Round",
  oval: "Oval",
  sharp: "Sharp",
  gentle: "Gentle",
  sleepy: "Sleepy",
  soft: "Soft",
  bold: "Bold",
  angry: "Fierce",
  smile: "Smile",
  cat: "Cat :3",
  neutral: "Calm",
  fang: "Fang",
  none: "None",
  freckles: "Freckles",
  bandage: "Band-aid",
  whiskers: "Whiskers",
  star: "Star",
  short: "Short",
  spiky: "Spiky",
  messy: "Messy",
  long: "Long",
  wavy: "Wavy",
  bob: "Bob",
  twintails: "Twin tails",
  ponytail: "Ponytail",
  tee: "T-shirt",
  hoodie: "Hoodie",
  uniform: "Sailor",
  jacket: "Jacket",
  sweater: "Turtleneck",
  suit: "Suit & tie",
  glasses: "Glasses",
  catEars: "Cat ears",
  headphones: "Headphones",
  halo: "Halo",
  horns: "Horns",
  bow: "Bow",
  galaxy: "Galaxy",
  sunset: "Sunset",
  sakura: "Sakura",
  neon: "Neon grid",
  mint: "Mint",
  room: "Room",
  solid: "Color",
  green: "Green screen",
};

type Tab = "face" | "eyes" | "hair" | "outfit" | "extras" | "scene";
const TABS: [Tab, string][] = [
  ["face", "Face"],
  ["eyes", "Eyes"],
  ["hair", "Hair"],
  ["outfit", "Outfit"],
  ["extras", "Extras"],
  ["scene", "Scene"],
];

/** the V-Avatar maker: live preview (optionally face-tracked) + every part editable */
export default function AvatarStudio() {
  const saved = useMyAvatar();
  const avatarOn = useCall((s) => s.avatarOn);
  const [cfg, setCfg] = useState<VAvatar>(saved);
  const [tab, setTab] = useState<Tab>("face");
  const [cam, setCam] = useState(false);
  const [mode, setMode] = useState<"loading" | "face" | "voice">("voice");
  const [saving, setSaving] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const engine = useRef<AvatarEngine | null>(null);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);

  // (re)start the preview engine when the camera toggle changes
  useEffect(() => {
    const e = startAvatar({ cfg, width: 720, height: 540, camera: cam, onMode: setMode });
    engine.current = e;
    e.canvas.className = "h-full w-full object-cover";
    holder.current?.replaceChildren(e.canvas);
    return () => {
      e.stop();
      engine.current = null;
    };
  }, [cam]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    engine.current?.setLook(cfg);
    if (avatarOn) setAvatarLook(cfg); // people in your call see edits live
  }, [cfg, avatarOn]);

  const set = <K extends keyof VAvatar>(k: K, v: VAvatar[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const save = async () => {
    setSaving(true);
    await updateMyProfile({ vavatar: cfg as unknown as Record<string, unknown> }, true);
    setSaving(false);
    toast("V-Avatar saved — use it in any call with the ✨ button", "success");
  };

  const choice = <K extends keyof typeof OPTIONS & keyof VAvatar>(k: K, title: string) => (
    <Field title={title}>
      <div className="flex flex-wrap gap-1.5">
        {(OPTIONS[k] as readonly string[]).map((o) => (
          <button key={o} onClick={() => set(k, o as VAvatar[K])} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", cfg[k] === o ? "bg-accent text-white" : "bg-hover hover:bg-active")}>
            {LABEL[o] ?? o}
          </button>
        ))}
      </div>
    </Field>
  );
  const color = (k: keyof VAvatar, title: string, list: string[], allowNone?: boolean) => (
    <Field title={title}>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowNone && (
          <button onClick={() => set(k, null as never)} className={cn("h-8 rounded-full px-3 text-xs font-semibold", cfg[k] === null ? "bg-accent text-white" : "bg-hover")}>
            None
          </button>
        )}
        {list.map((c) => (
          <button key={c} onClick={() => set(k, c as never)} className={cn("size-8 rounded-full ring-offset-2 ring-offset-chat", cfg[k] === c && "ring-2 ring-accent")} style={{ background: c }} aria-label={c} />
        ))}
        <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Custom colour">
          <input type="color" value={(cfg[k] as string | null) ?? "#ffffff"} onChange={(e) => set(k, e.target.value as never)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
    </Field>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black shadow-xl ring-1 ring-white/10">
          <div ref={holder} className="h-full w-full" />
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <span className={cn("size-2 rounded-full", mode === "face" ? "bg-ok" : mode === "loading" ? "animate-pulse bg-[#f0b232]" : "bg-white/60")} />
            {mode === "face" ? "Face tracking" : mode === "loading" ? "Loading face tracking…" : cam ? "No face found — voice mode" : "Preview"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setCam(!cam)} className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold", cam ? "bg-ok text-white" : "bg-hover hover:bg-active")}>
            {cam ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
            {cam ? "Stop camera" : "Try with my face"}
          </button>
          <button onClick={() => setCfg(randomAvatar())} className="flex items-center gap-1.5 rounded-full bg-hover px-3.5 py-2 text-sm font-semibold hover:bg-active">
            <Dices className="size-4" /> Randomize
          </button>
          <button onClick={() => setCfg(saved)} disabled={!dirty} className="flex items-center gap-1.5 rounded-full bg-hover px-3.5 py-2 text-sm font-semibold hover:bg-active disabled:opacity-40">
            <RotateCcw className="size-4" /> Undo
          </button>
          <button onClick={() => void save()} disabled={saving || !dirty} className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            <Save className="size-4" /> {saving ? "Saving…" : dirty ? "Save avatar" : "Saved"}
          </button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-sub">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          Your camera only drives the avatar on your device — nobody sees the real video. Without a camera it lip-syncs to your voice.
        </p>
      </div>

      <div className="min-w-0">
        <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold", tab === k ? "bg-white text-black" : "bg-hover text-sub hover:text-txt")}>
              {l}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {tab === "face" && (
            <>
              {color("skin", "Skin tone", SWATCH.skin)}
              {choice("face", "Face shape")}
              {choice("mouth", "Mouth")}
              {choice("brows", "Eyebrows")}
              <Field title={`Blush · ${Math.round(cfg.blush * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={cfg.blush} onChange={(e) => set("blush", Number(e.target.value))} className="vol w-full" style={{ ["--fill" as string]: `${cfg.blush * 100}%` }} />
              </Field>
              {choice("marks", "Face details")}
            </>
          )}
          {tab === "eyes" && (
            <>
              {choice("eyes", "Eye shape")}
              {color("eyeColor", "Eye color", SWATCH.eyes)}
              {color("eyeColor2", "Second eye (heterochromia)", SWATCH.eyes, true)}
            </>
          )}
          {tab === "hair" && (
            <>
              {choice("hair", "Hairstyle")}
              {color("hairColor", "Hair color", SWATCH.hair)}
              {color("hairTip", "Dyed tips", SWATCH.hair, true)}
            </>
          )}
          {tab === "outfit" && (
            <>
              {choice("shirt", "Outfit")}
              {color("shirtColor", "Main color", SWATCH.cloth)}
              {color("accentColor", "Accent (collar, strings, tie…)", SWATCH.cloth)}
            </>
          )}
          {tab === "extras" && (
            <>
              {choice("extra", "Accessory")}
              {color("extraColor", "Accessory color", SWATCH.cloth)}
            </>
          )}
          {tab === "scene" && (
            <>
              {choice("bg", "Background")}
              {cfg.bg === "solid" && color("bgColor", "Background color", SWATCH.cloth)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold tracking-wide text-sub uppercase">{title}</div>
      {children}
    </div>
  );
}
