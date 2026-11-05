import { create } from "zustand";
import { persist } from "zustand/middleware";

// Device-level user preferences (accessibility, chat behaviour, time format, sounds, advanced).

export type Prefs = {
  // accessibility
  reduceMotion: boolean;
  highContrast: boolean;
  underlineLinks: boolean;
  saturation: number; // 40–100 %
  chatEffects: boolean; // fireworks / confetti etc.
  othersProfileFx: boolean; // animated effects on other people's profiles
  bigTargets: boolean;
  // chat
  enterToSend: boolean;
  clock: "auto" | "12" | "24";
  dateFormat: "auto" | "dmy" | "mdy" | "ymd";
  jumboEmoji: boolean;
  spoilersAutoReveal: boolean;
  // sounds
  uiSounds: boolean;
  uiVolume: number; // 0–1
  ringtone: boolean;
  /** Soft click FX when tapping buttons / links */
  buttonFx: boolean;
  /** Discord-style welcome splash + chime on launch */
  welcomeSplash: boolean;
  // advanced
  devMode: boolean;
};

export const PREF_DEFAULTS: Prefs = {
  reduceMotion: false,
  highContrast: false,
  underlineLinks: false,
  saturation: 100,
  chatEffects: true,
  othersProfileFx: true,
  bigTargets: false,
  enterToSend: true,
  clock: "auto",
  dateFormat: "auto",
  jumboEmoji: true,
  spoilersAutoReveal: false,
  uiSounds: true,
  uiVolume: 1,
  ringtone: true,
  buttonFx: true,
  welcomeSplash: true,
  devMode: false,
};

export const usePrefs = create<Prefs>()(
  persist(() => ({ ...PREF_DEFAULTS }), {
    name: "nexus.prefs",
    version: 3,
    migrate: (persisted) => ({ ...PREF_DEFAULTS, ...((persisted as object) ?? {}) }),
  }),
);
export const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => usePrefs.setState({ [k]: v } as Partial<Prefs>);
export const prefs = () => usePrefs.getState();

/** mirror accessibility prefs onto <html> so plain CSS can react */
function apply(p: Prefs) {
  if (typeof document === "undefined") return;
  const h = document.documentElement;
  h.classList.toggle("reduce-motion", p.reduceMotion);
  h.classList.toggle("hc", p.highContrast);
  h.classList.toggle("ul-links", p.underlineLinks);
  h.classList.toggle("big-targets", p.bigTargets);
  h.style.setProperty("--sat", String(p.saturation / 100));
  h.classList.toggle("desat", p.saturation < 100);
}
if (typeof window !== "undefined") {
  apply(usePrefs.getState());
  usePrefs.subscribe(apply);
}

/** time like 14:05 / 2:05 PM per the user's clock setting */
export function fmtClock(d: Date) {
  const c = prefs().clock;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(c === "auto" ? {} : { hour12: c === "12" }) });
}
export function fmtDateShort(d: Date) {
  const f = prefs().dateFormat;
  const dd = String(d.getDate()).padStart(2, "0"),
    mm = String(d.getMonth() + 1).padStart(2, "0"),
    yy = String(d.getFullYear()).slice(2);
  if (f === "dmy") return `${dd}/${mm}/${yy}`;
  if (f === "mdy") return `${mm}/${dd}/${yy}`;
  if (f === "ymd") return `${d.getFullYear()}-${mm}-${dd}`;
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}
