/** Pure helpers behind the Nexus Pro phone tools. */

export function storageFit(freeGB: number, perItemMB: number) {
  if (!(perItemMB > 0)) return 0;
  return Math.floor((Math.max(0, freeGB) * 1000) / perItemMB);
}

export const DATA_PROFILES: { name: string; mbPerHour: number }[] = [
  { name: "Music streaming (normal)", mbPerHour: 72 },
  { name: "Music streaming (high)", mbPerHour: 144 },
  { name: "Video 480p", mbPerHour: 700 },
  { name: "Video 1080p", mbPerHour: 3000 },
  { name: "Video 4K", mbPerHour: 7000 },
  { name: "Video call", mbPerHour: 540 },
  { name: "Social scrolling", mbPerHour: 150 },
  { name: "Web browsing", mbPerHour: 60 },
];

export function monthlyData(profiles: { mbPerHour: number; hoursPerDay: number }[], days = 30) {
  return profiles.reduce((a, p) => a + p.mbPerHour * (p.hoursPerDay || 0) * days, 0) / 1000; // GB
}

export function humanDuration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function downloadSeconds(sizeMB: number, mbps: number) {
  return mbps > 0 ? (sizeMB * 8) / mbps : NaN;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(n: number, rng?: () => number) {
  if (rng) return Math.floor(rng() * n);
  const buf = new Uint32Array(1);
  const lim = Math.floor(4294967296 / n) * n;
  do crypto.getRandomValues(buf);
  while (buf[0] >= lim);
  return buf[0] % n;
}

export type PwOpts = { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean; avoidAmbiguous: boolean };
export function generatePassword(o: PwOpts, rng?: () => number) {
  const amb = o.avoidAmbiguous ? /[O0oIl1|]/g : /$^/g;
  const sets = [
    o.lower && "abcdefghijklmnopqrstuvwxyz",
    o.upper && "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    o.digits && "0123456789",
    o.symbols && "!@#$%^&*()-_=+[]{};:,.?",
  ]
    .filter(Boolean)
    .map((s) => (s as string).replace(amb, ""));
  if (!sets.length) return "";
  const len = Math.max(sets.length, Math.min(128, Math.floor(o.length)));
  const all = sets.join("");
  const chars = sets.map((s) => s[randInt(s.length, rng)]); // guarantee one of each class
  while (chars.length < len) chars.push(all[randInt(all.length, rng)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rng);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function passphrase(words: string[], count: number, sep = "-", rng?: () => number) {
  const n = Math.max(2, Math.min(12, Math.floor(count)));
  return Array.from({ length: n }, () => words[randInt(words.length, rng)]).join(sep);
}

export const WORDS =
  "amber anchor apple arrow aspen atlas autumn badge bamboo beacon birch bison blaze bloom breeze bronze cactus candle canyon cedar chalk cherry cliff cloud clover cobalt comet coral cosmos crater crystal dawn delta desert dolphin dragon dune eagle ember falcon fern fjord flint forest frost galaxy garden gecko glacier granite harbor hazel horizon indigo island ivory jade jaguar jungle kayak lagoon lantern lemon lilac lotus lunar maple marble meadow meteor mist mocha nebula nectar oasis ocean olive onyx orchid otter pearl pebble pepper phoenix pine planet plum prairie quartz quill raven reef ridge river robin sable saffron sage sierra silver solar spruce storm summit sunset thistle thunder tiger topaz tundra velvet violet walnut willow winter yarrow zephyr".split(" ");

export function passwordStrength(pw: string) {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  let bits = pw.length * Math.log2(Math.max(pool, 1));
  if (/^(.)\1+$/.test(pw)) bits = Math.min(bits, 8);
  if (/(password|qwerty|123456|letmein|admin|welcome)/i.test(pw)) bits = Math.min(bits, 20);
  const label = bits < 28 ? "Very weak" : bits < 40 ? "Weak" : bits < 60 ? "Fair" : bits < 80 ? "Strong" : "Excellent";
  return { bits: Math.round(bits), label, score: Math.min(4, Math.floor(bits / 25)) };
}

const wifiEsc = (s: string) => s.replace(/([\;,:"])/g, "\\$1");
export function wifiPayload(ssid: string, password: string, security: "WPA" | "WEP" | "nopass", hidden: boolean) {
  const t = security === "nopass" ? "nopass" : security;
  return `WIFI:T:${t};S:${wifiEsc(ssid)};${security === "nopass" ? "" : `P:${wifiEsc(password)};`}${hidden ? "H:true;" : ""};`;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}
export function aspectRatio(w: number, h: number) {
  if (!(w > 0 && h > 0)) return "—";
  const g = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w) / g}:${Math.round(h) / g}`;
}
export function ppi(w: number, h: number, diagonalIn: number) {
  return diagonalIn > 0 ? Math.round(Math.sqrt(w * w + h * h) / diagonalIn) : 0;
}

export type Checklist = { id: string; title: string; items: string[] };
export const PHONE_CHECKLISTS: Checklist[] = [
  {
    id: "new",
    title: "New phone setup",
    items: ["Back up the old phone", "Sign in to Apple/Google account", "Enable Face/Touch ID", "Turn on Find My / Find My Device", "Set a 6-digit passcode", "Restore messages & photos", "Re-install 2FA apps first", "Update the OS", "Set up eSIM / SIM PIN", "Install Nexus & sign in"],
  },
  {
    id: "lost",
    title: "Lost or stolen phone",
    items: ["Ring it from Find My / Find My Device", "Turn on Lost Mode", "Lock and show a contact number", "Change Apple/Google password", "Change passwords of key accounts", "Tell your carrier to suspend the SIM", "Report to local police if stolen", "Erase remotely only as last resort"],
  },
  {
    id: "trip",
    title: "Before a trip",
    items: ["Download offline maps", "Charge power bank", "Check roaming or buy eSIM", "Save tickets & bookings offline", "Share live location with a friend", "Back up photos", "Pack cables & adapter"],
  },
  {
    id: "privacy",
    title: "Privacy tune-up",
    items: ["Review app permissions", "Turn off ad tracking", "Enable auto-lock (30s)", "Hide notification previews", "Audit connected devices", "Remove unused apps", "Turn on leaked-password alerts"],
  },
];

export function pinOrder<T extends { pinned?: boolean; ts: number }>(items: T[]) {
  return items.slice().sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.ts - a.ts);
}
