// Nexus Snap Social · pure helpers (no DOM, no network, no imports): counts, search text, messages,
// the daily reminder + streak rules, and the how-to-capture tips for every mode.

// ------------------------------------------------------------------ small text helpers
/** 999 · 1.2K · 15K · 3.4M */
export function fmtCount(n: unknown): string {
  const v = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (v < 1000) return String(v);
  if (v < 10_000) return `${(Math.floor(v / 100) / 10).toFixed(1).replace(/\.0$/, "")}K`;
  if (v < 1_000_000) return `${Math.floor(v / 1000)}K`;
  if (v < 10_000_000) return `${(Math.floor(v / 100_000) / 10).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.floor(v / 1_000_000)}M`;
}

export const countWord = (n: number, one: string, many = `${one}s`) => `${fmtCount(n)} ${n === 1 ? one : many}`;

/** Safe text for a name/username search (keeps it usable inside a PostgREST filter). */
export const cleanSearch = (q: string) => q.replace(/^@+/, "").replace(/[^\p{L}\p{N}_. -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 32);

export const MESSAGE_MAX = 1000;
export const cleanMessage = (t: string) => t.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MESSAGE_MAX);

export const cleanBio = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

// ------------------------------------------------------------------ days and streaks
const p2 = (n: number) => String(n).padStart(2, "0");
/** Local calendar day, "2026-11-28". */
export const dayKey = (d: Date = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

const dayNumber = (key: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000) : NaN;
};
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

export type Streak = { count: number; best: number; last: string; total: number };
export const EMPTY_STREAK: Streak = { count: 0, best: 0, last: "", total: 0 };

/** Record a Snap taken on `today`. Same day: only the total grows. Next day: streak +1. A gap restarts at 1. */
export function bumpStreak(s: Streak, today: string): Streak {
  const total = s.total + 1;
  if (s.last === today) return { ...s, total };
  const gap = s.last ? daysBetween(s.last, today) : NaN;
  const count = gap === 1 ? s.count + 1 : 1;
  return { count, best: Math.max(s.best, count), last: today, total };
}

/** What to show today: a streak that missed yesterday is already broken, but it only shows 0 once the day is over. */
export function liveStreak(s: Streak, today: string): { count: number; doneToday: boolean; atRisk: boolean } {
  if (!s.last) return { count: 0, doneToday: false, atRisk: false };
  const gap = daysBetween(s.last, today);
  if (gap === 0) return { count: s.count, doneToday: true, atRisk: false };
  if (gap === 1) return { count: s.count, doneToday: false, atRisk: s.count > 0 };
  return { count: 0, doneToday: false, atRisk: false };
}

// ------------------------------------------------------------------ the daily reminder
export type Reminder = { on: boolean; hour: number; minute: number };
export const DEFAULT_REMINDER: Reminder = { on: false, hour: 18, minute: 0 };

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
export function parseReminder(o: unknown): Reminder {
  const r = o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  return { on: r.on === true, hour: int(r.hour, 0, 23, DEFAULT_REMINDER.hour), minute: int(r.minute, 0, 59, DEFAULT_REMINDER.minute) };
}

export const timeText = (hour: number, minute: number) => `${p2(hour)}:${p2(minute)}`;
export function parseTime(v: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hour = +m[1];
  const minute = +m[2];
  return hour > 23 || minute > 59 ? null : { hour, minute };
}

/** The next moment the reminder should go off (today if it is still ahead, otherwise tomorrow). */
export function nextFire(now: Date, hour: number, minute: number): Date {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t;
}

export const REMINDER_LINES: { title: string; body: string }[] = [
  { title: "Your daily Snap 📸", body: "One photo is all it takes. Open Nexus Snap and keep the streak going." },
  { title: "Golden hour check ✨", body: "Look around you. Something nearby makes a great shot right now." },
  { title: "Try a new look today 🎨", body: "Open Effects and pick a look you haven't used yet." },
  { title: "Say hi with a Snap 👋", body: "Send a friend a picture. They'll love it." },
  { title: "Quick challenge 🎯", body: "Shoot something blue. Go!" },
  { title: "Selfie time 🤳", body: "Switch to the front camera and pick a frame." },
  { title: "Record a moment 🎬", body: "Hold the shutter in Video mode for a short clip." },
  { title: "Tip: steady shots 🧘", body: "Tap the Grid tool and line up the horizon on a third." },
];
export const STREAK_LINE = (n: number) => ({ title: `🔥 ${n}-day streak at risk`, body: "One quick Snap today and it keeps going." });

/** Same line for the same day, a different one each day. Streak at risk wins when `risk` is set. */
export function reminderLine(day: string, risk = 0): { title: string; body: string } {
  if (risk >= 2) return STREAK_LINE(risk);
  const n = dayNumber(day);
  const i = Number.isFinite(n) ? ((n % REMINDER_LINES.length) + REMINDER_LINES.length) % REMINDER_LINES.length : 0;
  return REMINDER_LINES[i];
}

// ------------------------------------------------------------------ saved on this device
export type Social = { reminder: Reminder; streak: Streak; tipsSeen: string[]; askedReminder: boolean; nudgeDay: string };
export const SOCIAL_KEY = "snap.social.v1";
export const DEFAULT_SOCIAL: Social = { reminder: DEFAULT_REMINDER, streak: EMPTY_STREAK, tipsSeen: [], askedReminder: false, nudgeDay: "" };

const nat = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
export function parseSocial(raw: unknown): Social {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && !Array.isArray(j)) o = j as Record<string, unknown>;
    } catch {
      /* damaged: defaults */
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) o = raw as Record<string, unknown>;
  const s = (o.streak && typeof o.streak === "object" ? o.streak : {}) as Record<string, unknown>;
  const last = typeof s.last === "string" && Number.isFinite(dayNumber(s.last)) ? s.last : "";
  const count = nat(s.count);
  return {
    reminder: parseReminder(o.reminder),
    streak: { count, best: Math.max(count, nat(s.best)), last, total: nat(s.total) },
    tipsSeen: Array.isArray(o.tipsSeen) ? (o.tipsSeen.filter((x) => typeof x === "string" && TIP_KEYS.includes(x)) as string[]).slice(0, 40) : [],
    askedReminder: o.askedReminder === true,
    nudgeDay: typeof o.nudgeDay === "string" ? o.nudgeDay.slice(0, 10) : "",
  };
}

// ------------------------------------------------------------------ how to capture, for every mode
export type Tip = { key: string; icon: string; title: string; lead: string; steps: string[]; pro?: string };

export const TIPS: Tip[] = [
  {
    key: "photo",
    icon: "📷",
    title: "Photo",
    lead: "The classic shot. Fast, sharp, saved to your Nexus Drive.",
    steps: ["Tap the screen where your subject is to focus.", "Drag the sun slider up or down to fix a dark or bright shot.", "Press the big round button, or any volume or space key.", "Not happy? Tap the bin and shoot again."],
    pro: "Hold your phone with both hands and breathe out as you press. It stops the blur.",
  },
  {
    key: "video",
    icon: "🎬",
    title: "Video",
    lead: "Short clips with sound, up to the length you set in Settings.",
    steps: ["Switch to Video above the shutter.", "Tap the round button to start, tap again to stop.", "Allow the microphone once and the clip records sound.", "Use the flash tool as a torch for dark scenes."],
    pro: "Move slowly. Walk heel to toe and the clip stays smooth.",
  },
  {
    key: "selfie",
    icon: "🤳",
    title: "Selfie",
    lead: "Front camera, mirrored the way you see yourself.",
    steps: ["Tap the flip button at the top right, or double tap the picture.", "Face a window. Soft light from the front beats any filter.", "Raise the camera slightly above your eyes.", "Screen flash lights your face in the dark."],
    pro: "Pick a Frame in Caption and frames to make it ready to post.",
  },
  {
    key: "zoom",
    icon: "🔍",
    title: "Zoom and lenses",
    lead: "Get closer without losing detail.",
    steps: ["Pinch the picture, or drag the zoom dial.", "Use the lens chips for 0.5x, 1x and longer lenses when your phone has them.", "Zoom enhance sharpens the picture after the shot.", "Stay under 3x in dim light to keep it clean."],
    pro: "Walking closer always beats digital zoom.",
  },
  {
    key: "timer",
    icon: "⏱️",
    title: "Timer",
    lead: "Hands free group shots and steady tripod photos.",
    steps: ["Tap the Timer tool to pick 3, 5 or 10 seconds.", "Lean your phone on something steady.", "Press the shutter, then step into the frame.", "Beeps count you down. Turn them off in Settings."],
    pro: "A timer also removes the shake from pressing the button.",
  },
  {
    key: "night",
    icon: "🌙",
    title: "Flash and low light",
    lead: "Get a usable picture when it is dark.",
    steps: ["Tap the Flash tool before the shot. In Video it stays on as a torch.", "Hold still for a full second after pressing.", "Raise exposure a little with the sun slider.", "Try the Noir or Neon looks. They hide grain."],
    pro: "Lean on a wall. Steady beats bright.",
  },
  {
    key: "grid",
    icon: "🧭",
    title: "Grid and level",
    lead: "Straight horizons and balanced pictures.",
    steps: ["Tap Grid and choose Thirds, Center, Golden or Diagonal in Settings.", "Put your subject where two lines cross.", "Turn on the level guide so the horizon is straight.", "Leave empty space in front of anything that moves."],
    pro: "Rule of thirds: horizon on the top or bottom line, never in the middle.",
  },
  {
    key: "looks",
    icon: "🎨",
    title: "Looks",
    lead: "24 looks you can see live before you shoot.",
    steps: ["Open Effects (the sparkle button).", "Tap a look and the camera changes at once.", "Surprise me picks one for you.", "Your recent looks are kept at the top."],
    pro: "Pick the look first, then frame the shot. It changes how the picture feels.",
  },
  {
    key: "frames",
    icon: "🖼️",
    title: "Captions, stickers and frames",
    lead: "Burned into the picture, so they stay when you share it.",
    steps: ["Open Caption and frames (the Aa tool).", "Type a caption, then choose a style and where it sits.", "Pick a sticker pack, then its size and corner.", "Choose a frame and a colour. The preview shows exactly what gets saved."],
    pro: "Keep captions short. Three to five words reads best.",
  },
  {
    key: "avatar",
    icon: "🧍",
    title: "Full-body avatar",
    lead: "Take a picture of your own avatar with a background.",
    steps: ["Tap the person icon to switch the camera to your avatar.", "Open the shirt icon to change the outfit and the scene.", "Add your own background picture if you like.", "Press the shutter. It is saved like a normal photo."],
    pro: "Change the scene first. Outfit colours look best on dark backgrounds.",
  },
  {
    key: "voice",
    icon: "🎙️",
    title: "Voice messages",
    lead: "Record, check the waveform, send.",
    steps: ["Tap the microphone tool.", "Press and hold to record, release to stop.", "Play it back before you send.", "Pick a person first and it goes to their chat."],
    pro: "Hold the phone near your chin, not in front of your mouth.",
  },
  {
    key: "drop",
    icon: "📡",
    title: "Nexus Drop",
    lead: "Send a picture to someone's phone, even across the room.",
    steps: ["Take your Snap and tap Share.", "Choose Drop and pick a person, or turn on Nearby.", "They get a card on their screen to accept.", "Nearby switches itself off after a few minutes."],
    pro: "Ask them to open Nexus Snap first. Drops land instantly.",
  },
  {
    key: "people",
    icon: "👥",
    title: "People",
    lead: "Follow friends, send messages, keep your space tidy.",
    steps: ["Tap the search icon and type a username.", "Open a profile to Follow or Message.", "Your counts show followers and following.", "Block anyone from their profile. They can't message you."],
    pro: "Set a profile picture so people know it's you.",
  },
];

export const TIP_KEYS = TIPS.map((t) => t.key);
export const tipByKey = (k: string | null | undefined) => TIPS.find((t) => t.key === k) ?? TIPS[0];

/** Which tip belongs with the camera as it is right now. */
export function tipForMode(opts: { mode: "photo" | "video"; facing?: "user" | "environment"; avatar?: boolean; timer?: number; flash?: boolean }): Tip {
  if (opts.avatar) return tipByKey("avatar");
  if (opts.mode === "video") return tipByKey("video");
  if (opts.timer && opts.timer > 0) return tipByKey("timer");
  if (opts.flash) return tipByKey("night");
  if (opts.facing === "user") return tipByKey("selfie");
  return tipByKey("photo");
}

/** A different tip each day for the home card. */
export function tipOfDay(day: string): Tip {
  const n = dayNumber(day);
  const i = Number.isFinite(n) ? ((n % TIPS.length) + TIPS.length) % TIPS.length : 0;
  return TIPS[i];
}

/** The next tip this person hasn't seen yet (null when they have seen them all). */
export const nextUnseen = (seen: readonly string[]): Tip | null => TIPS.find((t) => !seen.includes(t.key)) ?? null;
