"use client";

export type LyricCue = { t: number; line: string };

export function asLyricCues(value: unknown): LyricCue[] | null {
  if (!Array.isArray(value)) return null;
  const cues: LyricCue[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const t = Number((row as { t?: unknown }).t);
    const line = String((row as { line?: unknown }).line ?? "").trim();
    if (!Number.isInteger(t) || t < 0 || t > 7_200_000 || !line) continue;
    cues.push({ t, line: line.slice(0, 200) });
    if (cues.length >= 400) break;
  }
  return cues.length ? cues.sort((a, b) => a.t - b.t) : null;
}

export function parseLyricCues(text: string): LyricCue[] | null {
  const cues: LyricCue[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.+)$/);
    if (!match) continue;
    const fraction = match[3] ? Number(match[3].padEnd(3, "0").slice(0, 3)) : 0;
    const t = Number(match[1]) * 60_000 + Number(match[2]) * 1000 + fraction;
    const line = match[4].trim().slice(0, 200);
    if (!line || t > 7_200_000) continue;
    cues.push({ t, line });
    if (cues.length >= 400) break;
  }
  return cues.length ? cues.sort((a, b) => a.t - b.t) : null;
}

export function formatLyricCues(cues: LyricCue[] | null | undefined) {
  if (!cues?.length) return "";
  return cues
    .map((cue) => {
      const minute = Math.floor(cue.t / 60_000);
      const second = Math.floor((cue.t % 60_000) / 1000);
      const cent = Math.floor((cue.t % 1000) / 10);
      return `[${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(cent).padStart(2, "0")}] ${cue.line}`;
    })
    .join("\n");
}

export function activeLyricIndex(cues: LyricCue[], seconds: number) {
  const ms = seconds * 1000;
  let index = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].t <= ms) index = i;
    else break;
  }
  return index;
}
