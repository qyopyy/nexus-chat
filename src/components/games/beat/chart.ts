// Beat Battle — chart loading + gameplay rules.
// Reads Psych Engine chart JSON 1:1 (sections, mustHitSection, 8-lane note layout, sustains, BPM changes)
// so mod charts play with the same timing as in the original engine.

export type Note = {
  t: number; // ms
  lane: number; // 0 left · 1 down · 2 up · 3 right
  player: boolean;
  sus: number; // sustain length, ms
  kind: string; // note type ("" = normal, "Hurt Note", "No Animation", …)
  hit: boolean;
  missed: boolean;
  /** sustain currently being held / finished */
  holding: boolean;
  holdDone: boolean;
};
export type Section = { start: number; end: number; player: boolean; bpm: number; alt: boolean };
export type Chart = { title: string; bpm: number; speed: number; notes: Note[]; sections: Section[]; length: number; bpmAt: (t: number) => { bpm: number; t0: number; beat0: number } };

type PsychSection = { sectionNotes?: (number | string)[][]; mustHitSection?: boolean; sectionBeats?: number; lengthInSteps?: number; bpm?: number; changeBPM?: boolean; altAnim?: boolean };
type PsychSong = { song: string; bpm: number; speed?: number; notes: PsychSection[] };

export function parseChart(json: unknown, fallbackTitle = "Song"): Chart {
  const root = json as { song?: PsychSong | string } & PsychSong;
  const song: PsychSong = typeof root.song === "object" && root.song ? (root.song as PsychSong) : (root as PsychSong);
  if (!song || !Array.isArray(song.notes)) throw new Error("That doesn't look like a chart file (missing notes)");
  const notes: Note[] = [];
  const sections: Section[] = [];
  let bpm = Number(song.bpm) || 120;
  let t = 0;
  let beat = 0;
  const changes: { t: number; bpm: number; beat: number }[] = [{ t: 0, bpm, beat: 0 }];
  for (const sec of song.notes) {
    if (sec.changeBPM && sec.bpm && sec.bpm !== bpm) {
      bpm = sec.bpm;
      changes.push({ t, bpm, beat });
    }
    const beats = sec.sectionBeats ?? (sec.lengthInSteps ? sec.lengthInSteps / 4 : 4);
    const len = (60000 / bpm) * beats;
    const player = !!sec.mustHitSection;
    sections.push({ start: t, end: t + len, player, bpm, alt: !!sec.altAnim });
    for (const n of sec.sectionNotes ?? []) {
      const time = Number(n[0]);
      const raw = Number(n[1]);
      if (!Number.isFinite(time) || !Number.isFinite(raw) || raw < 0) continue; // events (-1) live elsewhere
      let mine = player;
      if (raw > 3) mine = !mine;
      notes.push({ t: time, lane: raw % 4, player: mine, sus: Math.max(0, Number(n[2]) || 0), kind: typeof n[3] === "string" ? n[3] : "", hit: false, missed: false, holding: false, holdDone: false });
    }
    t += len;
    beat += beats;
  }
  notes.sort((a, b) => a.t - b.t);
  // de-duplicate stacked notes (same side, lane, time) like Psych does
  const out: Note[] = [];
  for (const n of notes) {
    const prev = out[out.length - 1];
    if (prev && prev.player === n.player && prev.lane === n.lane && Math.abs(prev.t - n.t) < 2) continue;
    out.push(n);
  }
  const bpmAt = (time: number) => {
    let c = changes[0];
    for (const x of changes) if (x.t <= time) c = x;
    return { bpm: c.bpm, t0: c.t, beat0: c.beat };
  };
  return { title: song.song || fallbackTitle, bpm: Number(song.bpm) || 120, speed: Number(song.speed) || 1, notes: out, sections, length: t, bpmAt };
}

/** song position (ms) → beat number (fractional), BPM-change aware */
export function beatAt(c: Chart, ms: number) {
  const b = c.bpmAt(ms);
  return b.beat0 + (ms - b.t0) / (60000 / b.bpm);
}

// ── judgement (Psych Engine defaults) ──
export const SAFE_MS = 166; // 10 safe frames
export const JUDGE = [
  { name: "PERFECT", ms: 45, score: 350, acc: 1, color: "#7dfcff" },
  { name: "GREAT", ms: 90, score: 200, acc: 0.67, color: "#8bff8b" },
  { name: "GOOD", ms: 135, score: 100, acc: 0.34, color: "#ffd166" },
  { name: "BAD", ms: SAFE_MS, score: 50, acc: 0, color: "#ff8a5c" },
] as const;
export const judge = (diff: number) => JUDGE.find((j) => Math.abs(diff) <= j.ms) ?? JUDGE[3];

export const HEALTH_GAIN = 0.023;
export const HEALTH_MISS = 0.0475;

export type Stats = { score: number; combo: number; maxCombo: number; misses: number; hits: number; accSum: number; counts: number[]; health: number };
export const newStats = (): Stats => ({ score: 0, combo: 0, maxCombo: 0, misses: 0, hits: 0, accSum: 0, counts: [0, 0, 0, 0], health: 1 });

export function accuracy(s: Stats) {
  const total = s.hits + s.misses;
  return total ? (s.accSum / total) * 100 : 100;
}
export function grade(acc: number) {
  return acc >= 99 ? "S+" : acc >= 95 ? "S" : acc >= 90 ? "A" : acc >= 80 ? "B" : acc >= 70 ? "C" : acc >= 60 ? "D" : "F";
}
/** full-combo label, same tiers Psych uses */
export function fcLabel(s: Stats) {
  if (s.misses === 0) {
    if (s.counts[1] + s.counts[2] + s.counts[3] === 0 && s.counts[0] > 0) return "PFC";
    if (s.counts[2] + s.counts[3] === 0) return "GFC";
    return "FC";
  }
  return s.misses < 10 ? "SDCB" : "Clear";
}
