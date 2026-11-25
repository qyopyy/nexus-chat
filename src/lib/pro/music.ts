/** Pure helpers behind the Nexus Pro music tools (no DOM, no network). */

const SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb (major)
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"];

export type Mode = "major" | "minor";

export function noteName(pc: number, flats = false) {
  const i = ((pc % 12) + 12) % 12;
  return (flats ? FLAT : SHARP)[i];
}

/** Parse a Roman numeral like "bVII", "V7", "vi", "vii°" and spell the chord. */
export function chordFromNumeral(keyPc: number, mode: Mode, numeral: string): string | null {
  const m = /^([b#♭♯]?)([ivIV]{1,3})(°|o|dim)?(maj7|m7|7|sus2|sus4)?$/.exec(numeral.trim());
  if (!m) return null;
  const degree = ROMAN.indexOf(m[2].toLowerCase());
  if (degree < 0) return null;
  // An explicit b/# is always measured against the major scale (bVI, bVII, #IV…);
  // a bare numeral follows the key's own scale.
  const shift = m[1] === "b" || m[1] === "♭" ? -1 : m[1] ? 1 : 0;
  const scale = m[1] || mode === "major" ? MAJOR : MINOR;
  const root = (keyPc + scale[degree] + shift + 120) % 12;
  const flats = mode === "major" ? FLAT_KEYS.has(keyPc) : FLAT_KEYS.has((keyPc + 3) % 12);
  const lower = m[2] === m[2].toLowerCase();
  let q = lower ? "m" : "";
  if (m[3]) q = "dim";
  const ext = m[4] ?? "";
  if (ext === "m7") q = "m7";
  else if (ext === "maj7") q = (lower ? "m" : "") + "maj7";
  else if (ext === "7") q += "7";
  else if (ext) q += ext;
  return noteName(root, flats) + q;
}

export function progression(keyPc: number, mode: Mode, numerals: string[]) {
  return numerals.map((n) => ({ numeral: n, chord: chordFromNumeral(keyPc, mode, n) }));
}

export const POPULAR_PROGRESSIONS: { name: string; mode: Mode; numerals: string[] }[] = [
  { name: "Pop anthem", mode: "major", numerals: ["I", "V", "vi", "IV"] },
  { name: "Sensitive", mode: "major", numerals: ["vi", "IV", "I", "V"] },
  { name: "50s doo-wop", mode: "major", numerals: ["I", "vi", "IV", "V"] },
  { name: "Jazz turnaround", mode: "major", numerals: ["ii7", "V7", "Imaj7"] },
  { name: "Epic minor", mode: "minor", numerals: ["i", "bVI", "bIII", "bVII"] },
  { name: "Andalusian", mode: "minor", numerals: ["i", "bVII", "bVI", "V"] },
  { name: "Trap dark", mode: "minor", numerals: ["i", "bVI", "iv", "V"] },
];

/** Milliseconds for each note length at a tempo (delay / reverb pre-delay sync). */
export function noteValueMs(bpm: number) {
  if (!(bpm > 0)) return [];
  const beat = 60000 / bpm;
  const rows: { name: string; straight: number; dotted: number; triplet: number }[] = [];
  for (const [name, f] of [
    ["1/1", 4],
    ["1/2", 2],
    ["1/4", 1],
    ["1/8", 0.5],
    ["1/16", 0.25],
    ["1/32", 0.125],
  ] as [string, number][]) {
    rows.push({ name, straight: beat * f, dotted: beat * f * 1.5, triplet: (beat * f * 2) / 3 });
  }
  return rows;
}

export const DEFAULT_RATES: Record<string, number> = {
  Spotify: 0.004,
  "Apple Music": 0.008,
  "YouTube Music": 0.002,
  Tidal: 0.0125,
  Deezer: 0.0064,
  "Amazon Music": 0.004,
};

/** Rough payout estimate; rates are per-stream and fully user-editable. */
export function royaltyEstimate(streams: Record<string, number>, rates: Record<string, number>) {
  const rows = Object.keys(streams).map((k) => ({ platform: k, streams: streams[k] || 0, pay: (streams[k] || 0) * (rates[k] || 0) }));
  return { rows, total: rows.reduce((a, r) => a + r.pay, 0), streams: rows.reduce((a, r) => a + r.streams, 0) };
}

/* Camelot wheel */
const CAM_MAJOR_PC = [11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4]; // 1B..12B
const CAM_MINOR_PC = [8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1]; // 1A..12A

export function keyToCamelot(pc: number, mode: Mode) {
  const arr = mode === "major" ? CAM_MAJOR_PC : CAM_MINOR_PC;
  const i = arr.indexOf(((pc % 12) + 12) % 12);
  return `${i + 1}${mode === "major" ? "B" : "A"}`;
}

export function camelotToKey(code: string): { pc: number; mode: Mode; label: string } | null {
  const m = /^(\d{1,2})([AB])$/i.exec(code.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 12) return null;
  const mode: Mode = m[2].toUpperCase() === "B" ? "major" : "minor";
  const pc = (mode === "major" ? CAM_MAJOR_PC : CAM_MINOR_PC)[n - 1];
  return { pc, mode, label: `${noteName(pc, FLAT_KEYS.has(mode === "major" ? pc : (pc + 3) % 12))}${mode === "minor" ? "m" : ""}` };
}

export function camelotCompatible(code: string) {
  const m = /^(\d{1,2})([AB])$/i.exec(code.trim());
  if (!m) return [];
  const n = Number(m[1]);
  const l = m[2].toUpperCase();
  const wrap = (x: number) => ((x - 1 + 12) % 12) + 1;
  return [
    { code: `${n}${l}`, why: "Same key" },
    { code: `${wrap(n + 1)}${l}`, why: "Energy up (+1)" },
    { code: `${wrap(n - 1)}${l}`, why: "Energy down (−1)" },
    { code: `${n}${l === "A" ? "B" : "A"}`, why: "Relative major/minor" },
  ];
}

export const LOUDNESS_TARGETS: { platform: string; lufs: number; note: string }[] = [
  { platform: "Spotify", lufs: -14, note: "Normalises loud masters down" },
  { platform: "Apple Music", lufs: -16, note: "Sound Check" },
  { platform: "YouTube", lufs: -14, note: "Loudness normalised" },
  { platform: "Tidal", lufs: -14, note: "Album normalisation" },
  { platform: "Amazon Music", lufs: -14, note: "Normalised" },
  { platform: "Club / DJ", lufs: -8, note: "Loud, limited by true-peak" },
];

export function gainToTarget(measuredLufs: number, targetLufs: number) {
  return Math.round((targetLufs - measuredLufs) * 10) / 10;
}

export function audioFileBytes(sampleRate: number, bitDepth: number, channels: number, seconds: number) {
  return Math.max(0, Math.round((sampleRate * bitDepth * channels * seconds) / 8));
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) {
    n /= 1000;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

export type SetItem = { title: string; seconds: number; bpm?: number };
export function setlistStats(items: SetItem[]) {
  const total = items.reduce((a, s) => a + (s.seconds || 0), 0);
  const bpms = items.map((s) => s.bpm).filter((b): b is number => !!b && b > 0);
  const jumps: number[] = [];
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1].bpm;
    const b = items[i].bpm;
    if (a && b && Math.abs(a - b) >= 20) jumps.push(i);
  }
  return { total, count: items.length, avgBpm: bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : 0, bigJumps: jumps };
}

export function parseDuration(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  if (t.includes(":")) {
    const [m, sec] = t.split(":");
    return (Number(m) || 0) * 60 + (Number(sec) || 0);
  }
  return Number(t) || 0;
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function countSyllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = stripped.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function lineSyllables(line: string) {
  return (line.match(/[A-Za-z']+/g) ?? []).reduce((a, w) => a + countSyllables(w), 0);
}

export function lastWordKey(line: string) {
  const words = line.toLowerCase().match(/[a-z']+/g);
  if (!words) return "";
  const w = words[words.length - 1].replace(/'/g, "");
  const m = /[aeiouy]+[^aeiouy]*$/.exec(w);
  return m ? m[0] : w;
}

/** Group lines by ending sound to show an A/B/C rhyme scheme. */
export function rhymeScheme(lines: string[]) {
  const seen = new Map<string, string>();
  return lines.map((l) => {
    const k = lastWordKey(l);
    if (!k) return "";
    if (!seen.has(k)) seen.set(k, String.fromCharCode(65 + (seen.size % 26)));
    return seen.get(k) as string;
  });
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ROLLOUT_STEPS: { offset: number; title: string; detail: string }[] = [
  { offset: -42, title: "Lock masters & artwork", detail: "Final masters, cover art, credits and metadata." },
  { offset: -35, title: "Submit to distributor", detail: "Upload to your distributor so editors have time to review." },
  { offset: -28, title: "Pitch to playlists", detail: "Send the editorial pitch before the 4-week window closes." },
  { offset: -21, title: "Announce + pre-save", detail: "Post the cover reveal and open the pre-save link." },
  { offset: -14, title: "Teaser clip #1", detail: "15–30s hook clip for Reels / Shorts / TikTok." },
  { offset: -7, title: "Teaser clip #2 + countdown", detail: "Behind-the-scenes content and a 7-day countdown." },
  { offset: -1, title: "Final reminder", detail: "Story/post reminder, DM your core fans." },
  { offset: 0, title: "Release day", detail: "Post the link everywhere, pin it, go live with fans." },
  { offset: 3, title: "Thank-you + stats post", detail: "Share early numbers and thank listeners." },
  { offset: 14, title: "Visualizer / lyric video", detail: "Second wave of content to keep it moving." },
];

export function rolloutPlan(releaseIso: string) {
  return ROLLOUT_STEPS.map((s) => ({ ...s, date: addDays(releaseIso, s.offset) }));
}

export function parseIsrc(input: string) {
  const s = input.replace(/[\s-]/g, "").toUpperCase();
  const ok = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/.test(s);
  return {
    valid: ok,
    normalized: ok ? `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5, 7)}-${s.slice(7)}` : s,
    country: ok ? s.slice(0, 2) : "",
    registrant: ok ? s.slice(2, 5) : "",
    year: ok ? s.slice(5, 7) : "",
    designation: ok ? s.slice(7) : "",
  };
}
