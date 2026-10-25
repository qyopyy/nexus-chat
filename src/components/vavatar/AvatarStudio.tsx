"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Dices, RotateCcw, Save, Sparkles } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { updateMyProfile } from "@/lib/data";
import { setAvatarLook, useCall } from "@/lib/call";
import { DEFAULT_AVATAR, OPTIONS, SWATCH, cleanShirtText, normalizeAvatar, randomAvatar, startAvatar, isMobileDevice, type AvatarEngine, type VAvatar } from "@/lib/vavatar";
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
  masc: "Male",
  fem: "Female",
  sidepart: "Side part",
  slick: "Slicked back",
  buzz: "Buzz cut",
  undercut: "Undercut",
  mohawk: "Mohawk",
  curly: "Curly",
  afro: "Afro",
  dreads: "Dreads",
  hime: "Hime cut",
  bun: "Top bun",
  braids: "Braids",
  zipup: "Zip hoodie",
  tank: "Tank top",
  jersey: "Jersey",
  polo: "Polo",
  puffer: "Puffer",
  varsity: "Varsity",
  script: "Script",
  gothic: "Old English",
  graffiti: "Graffiti",
  mono: "Typewriter",
  shades: "Shades",
  cap: "Cap",
  beanie: "Beanie",
  iced: "Iced out 💎",
  gold: "Gold",
  silver: "Silver",
  rose: "Rose gold",
  stud: "Diamond studs",
  bigStud: "Big diamonds",
  hoop: "Hoops",
  dangle: "Drops",
  pearl: "Pearls",
  cubanIced: "Cuban — diamond",
  cuban: "Cuban link",
  rope: "Rope",
  tennis: "Tennis",
  figaro: "Figaro",
  pearls: "Pearl strand",
  layered: "Layered",
  diamond: "Diamond",
  heart: "Heart",
  letter: "Initial",
  cross: "Cross",
  shortlocs: "Short locs",
  rasta: "Rasta locs",
  twists: "Twists",
  cornrows: "Cornrows",
  waves: "360 waves",
  wolfcut: "Wolf cut",
  mullet: "Mullet",
  emo: "Emo fringe",
  acidtee: "Acid-wash tee",
  flannel: "Flannel",
  denim: "Distressed denim",
  bomber: "Bomber",
  track: "Track jacket",
  brokenHeart: "Broken heart",
  butterfly: "Butterfly",
  skull: "Skull",
  lightning: "Lightning",
  flames: "Flames",
  stars: "Stars",
  crown: "Crown",
  flowerCrown: "Flower crown",
  butterflies: "Butterflies ✨",
  wings: "Wings",
  mask: "Face mask",
  backcap: "Backwards cap",
  bucket: "Bucket hat",
  durag: "Durag",
  bandana: "Bandana",
  tam: "Rasta tam",
  headband: "Headband",
  rimless: "Rimless",
  visor: "Cyber visor",
  noseRing: "Nose ring",
  noseStud: "Nose stud",
  septum: "Septum",
  lipRing: "Lip ring",
  eyebrow: "Eyebrow",
  teardrop: "Teardrop",
  stitches: "Stitches",
  lock: "Padlock",
};

/** one-tap looks (original styles — no real people, brands or logos) */
const PRESETS: { name: string; look: Partial<VAvatar> }[] = [
  {
    name: "Emo-rap 💔",
    look: { body: "masc", hair: "shortlocs", hairColor: "#1b1b2a", hairTip: "#36d39a", shirt: "acidtee", shirtColor: "#2b2d52", accentColor: "#ff4d6d", graphic: "brokenHeart", textColor: "#ffffff", metal: "iced", chain: "cubanIced", pendant: "butterfly", earrings: "stud", grillz: "none", hat: "none", eyewear: "none", extra: "none", piercing: "none", tattoo: "none", bg: "neon" },
  },
  {
    name: "Distressed denim",
    look: { hair: "waves", hairColor: "#1b1b2a", hairTip: null, shirt: "denim", shirtColor: "#3d5f8c", accentColor: "#f4f4f8", graphic: "none", hat: "bucket", hatColor: "#111318", metal: "iced", chain: "tennis", pendant: "cross", earrings: "bigStud", grillz: "iced", eyewear: "rimless", eyewearColor: "#c9d1dc", extra: "none", bg: "room" },
  },
  {
    name: "Rasta",
    look: { hair: "rasta", hairColor: "#2a1a10", hairTip: "#a8693c", hat: "tam", shirt: "tee", shirtColor: "#2fa84f", accentColor: "#f5c400", graphic: "stars", metal: "gold", chain: "rope", pendant: "none", eyewear: "round", eyewearColor: "#111318", extra: "none", bg: "sunset" },
  },
  {
    name: "Trap star",
    look: { hair: "twists", hairColor: "#111318", hairTip: "#ff4d6d", shirt: "puffer", shirtColor: "#111318", accentColor: "#ff4d6d", hat: "durag", hatColor: "#8b5cff", metal: "iced", chain: "layered", pendant: "letter", earrings: "bigStud", grillz: "iced", eyewear: "shades", eyewearColor: "#111318", tattoo: "teardrop", extra: "none", bg: "galaxy" },
  },
  {
    name: "Anime idol",
    look: { body: "fem", hair: "twintails", hairColor: "#ff7ab8", hairTip: "#ffffff", shirt: "uniform", shirtColor: "#f4f4f8", accentColor: "#5865f2", extra: "flowerCrown", extraColor: "#ff7ab8", earrings: "pearl", chain: "none", pendant: "none", hat: "none", eyewear: "none", bg: "sakura" },
  },
  {
    name: "Gamer",
    look: { hair: "messy", shirt: "hoodie", shirtColor: "#1f1b3a", extra: "headphones", extraColor: "#00c2ff", eyewear: "visor", eyewearColor: "#00e0ff", hat: "none", chain: "none", bg: "neon" },
  },
];

type Tab = "styles" | "face" | "eyes" | "hair" | "headwear" | "outfit" | "jewelry" | "extras" | "scene";
const TABS: [Tab, string][] = [
  ["styles", "Styles"],
  ["face", "Body & face"],
  ["eyes", "Eyes"],
  ["hair", "Hair"],
  ["headwear", "Hats & glasses"],
  ["outfit", "Outfit"],
  ["jewelry", "Jewelry"],
  ["extras", "Extras"],
  ["scene", "Scene"],
];

/** the V-Avatar maker: live preview (optionally face-tracked) + every part editable */
export default function AvatarStudio() {
  const saved = useMyAvatar();
  const myName = useApp((s) => (s.userId ? s.profiles[s.userId]?.username : "") ?? "");
  const avatarOn = useCall((s) => s.avatarOn);
  const [cfg, setCfg] = useState<VAvatar>(saved);
  const [tab, setTab] = useState<Tab>("styles");
  const [cam, setCam] = useState(false);
  const [mode, setMode] = useState<"loading" | "face" | "voice">("voice");
  const [saving, setSaving] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const engine = useRef<AvatarEngine | null>(null);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);

  // (re)start the preview engine when the camera toggle changes
  useEffect(() => {
    const small = isMobileDevice();
    const e = startAvatar({ cfg, width: small ? 480 : 720, height: small ? 360 : 540, camera: cam, onMode: setMode });
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
          <button onClick={() => setCfg((c) => ({ ...randomAvatar(), shirtText: c.shirtText }))} className="flex items-center gap-1.5 rounded-full bg-hover px-3.5 py-2 text-sm font-semibold hover:bg-active">
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
        <div className="mb-3 flex flex-wrap gap-1">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold", tab === k ? "bg-white text-black" : "bg-hover text-sub hover:text-txt")}>
              {l}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {tab === "face" && (
            <>
              {choice("body", "Body")}
              {color("skin", "Skin tone", SWATCH.skin)}
              {choice("face", "Face shape")}
              {choice("mouth", "Mouth")}
              {choice("brows", "Eyebrows")}
              <Field title={`Blush · ${Math.round(cfg.blush * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={cfg.blush} onChange={(e) => set("blush", Number(e.target.value))} className="vol w-full" style={{ ["--fill" as string]: `${cfg.blush * 100}%` }} />
              </Field>
              {choice("marks", "Face details")}
              {choice("tattoo", "Face tattoo")}
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
          {tab === "styles" && (
            <Field title="Quick styles — tap one, then tweak anything">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PRESETS.map((p) => (
                  <button key={p.name} onClick={() => setCfg((c) => ({ ...c, ...p.look }))} className="rounded-xl bg-hover px-3 py-3 text-left text-sm font-bold hover:bg-active">
                    {p.name}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {tab === "headwear" && (
            <>
              {choice("hat", "Hat")}
              {cfg.hat !== "none" && cfg.hat !== "tam" && color("hatColor", "Hat color", SWATCH.cloth)}
              {choice("eyewear", "Glasses")}
              {cfg.eyewear !== "none" && color("eyewearColor", "Frame / lens color", ["#111318", "#f5b301", "#c9d1dc", ...SWATCH.cloth.slice(3)])}
            </>
          )}
          {tab === "outfit" && (
            <>
              {choice("shirt", "Outfit")}
              {color("shirtColor", "Main color", SWATCH.cloth)}
              {color("accentColor", "Accent (collar, strings, tie…)", SWATCH.cloth)}
              <Field title="Custom print">
                <input
                  value={cfg.shirtText}
                  onChange={(e) => set("shirtText", cleanShirtText(e.target.value))}
                  placeholder="Text on your hoodie / tee…"
                  maxLength={14}
                  className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...new Set(["qyopy", "kicsiden", myName, "NEXUS", "MA BEATS"].filter(Boolean))].map((t) => (
                    <button key={t} onClick={() => set("shirtText", cleanShirtText(t))} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", cfg.shirtText === t ? "bg-accent text-white" : "bg-hover hover:bg-active")}>
                      {t}
                    </button>
                  ))}
                  {cfg.shirtText && (
                    <button onClick={() => set("shirtText", "")} className="rounded-full bg-hover px-3 py-1.5 text-sm text-sub hover:text-txt">
                      Clear
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-sub">Big print on T-shirts, hoodies, tanks, jerseys & turtlenecks · chest logo on zip hoodies, polos, puffers & jackets · varsity & “Initial” pendant use the first letter.</p>
              </Field>
              {choice("graphic", "Graphic")}
              {choice("textStyle", "Print style")}
              {color("textColor", "Print color", ["#ffffff", "#111318", ...SWATCH.cloth.slice(3)])}
            </>
          )}
          {tab === "jewelry" && (
            <>
              {choice("metal", "Metal")}
              {choice("chain", "Chain")}
              {choice("pendant", "Pendant")}
              {choice("earrings", "Earrings")}
              {choice("grillz", "Grillz (shows when you talk)")}
              {choice("piercing", "Piercing")}
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
