"use client";

import { useMemo, useState } from "react";
import { Copy, Download, Piano } from "lucide-react";
import { toast } from "@/store/app";
import { sanitizeDownloadName } from "@/lib/fileSafety";
import AppFrame from "./AppFrame";

const FL_SHORTCUTS = [
  { keys: "F9", tip: "Mixer" },
  { keys: "F6", tip: "Channel rack" },
  { keys: "F5", tip: "Playlist" },
  { keys: "F7", tip: "Piano roll" },
  { keys: "Ctrl+T", tip: "Add audio track (playlist)" },
  { keys: "Ctrl+Shift+H", tip: "Select all → dump score to piano roll" },
  { keys: "Alt+C", tip: "Color selected clips" },
  { keys: "Ctrl+L", tip: "Route channel → free mixer track" },
  { keys: "Ctrl+Enter", tip: "Pattern → playlist" },
  { keys: "Space", tip: "Play / stop" },
  { keys: "Ctrl+B", tip: "Clone pattern / clip" },
  { keys: "Alt+G", tip: "Ungroup clips" },
];

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function midiOf(note: string, octave: number) {
  const i = NOTES.indexOf(note as (typeof NOTES)[number]);
  return (octave + 1) * 12 + i;
}

/** Minimal Type 0 MIDI file for a monophonic melody (FL / any DAW). */
function buildMidi(notes: { midi: number; start: number; dur: number }[], bpm: number): Uint8Array {
  const ticks = 480;
  const usPerBeat = Math.round(60_000_000 / bpm);
  const track: number[] = [];
  const writeVar = (v: number) => {
    const bytes: number[] = [];
    let val = v & 0x7f;
    while ((v >>= 7)) {
      bytes.unshift(val);
      val = (v & 0x7f) | 0x80;
      if (bytes.length > 3) break;
    }
    bytes.unshift(val);
    track.push(...bytes);
  };
  // tempo meta
  writeVar(0);
  track.push(0xff, 0x51, 0x03, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255);
  let last = 0;
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  for (const n of sorted) {
    const onTick = Math.round(n.start * ticks);
    writeVar(Math.max(0, onTick - last));
    track.push(0x90, n.midi & 127, 100);
    last = onTick;
    const offTick = Math.round((n.start + n.dur) * ticks);
    writeVar(Math.max(0, offTick - last));
    track.push(0x80, n.midi & 127, 0);
    last = offTick;
  }
  writeVar(0);
  track.push(0xff, 0x2f, 0x00);
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ticks >> 8) & 255, ticks & 255, // MThd
  ];
  const th = [0x4d, 0x54, 0x72, 0x6b, (track.length >> 24) & 255, (track.length >> 16) & 255, (track.length >> 8) & 255, track.length & 255];
  return Uint8Array.from([...header, ...th, ...track]);
}

export default function FlStudioLab({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [tab, setTab] = useState<"keys" | "scale" | "midi" | "mixer">("keys");
  const [root, setRoot] = useState("C");
  const [kind, setKind] = useState<"major" | "minor" | "pentatonic">("minor");
  const [bpm, setBpm] = useState(140);
  const [octave, setOctave] = useState(4);
  const [steps, setSteps] = useState(() => Array.from({ length: 16 }, (_, i) => i % 4 === 0));
  const [mixerNotes, setMixerNotes] = useState("Kick → Insert 1\nSnare → Insert 2\nHats → Insert 3\nBass → Insert 4\nLead → Insert 5");

  const scale = useMemo(() => {
    const intervals = kind === "major" ? [0, 2, 4, 5, 7, 9, 11] : kind === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 3, 5, 7, 10];
    const base = NOTES.indexOf(root as (typeof NOTES)[number]);
    return intervals.map((iv) => NOTES[(base + iv) % 12]!);
  }, [root, kind]);

  const flpHint = useMemo(() => {
    return [
      `Project BPM: ${bpm}`,
      `Key: ${root} ${kind}`,
      `Scale: ${scale.join(" ")}`,
      "",
      "FL tips",
      "- Drop MIDI into Channel rack or Playlist",
      "- Piano roll → Tools → Dump score to playlist",
      "- Mixer: Ctrl+L routes selected channel to free insert",
    ].join("\n");
  }, [bpm, root, kind, scale]);

  function toggleStep(i: number) {
    setSteps((s) => s.map((on, idx) => (idx === i ? !on : on)));
  }

  function exportMidi() {
    const notes = steps
      .map((on, i) => (on ? { midi: midiOf(scale[i % scale.length]!, octave), start: i * 0.25, dur: 0.2 } : null))
      .filter(Boolean) as { midi: number; start: number; dur: number }[];
    if (!notes.length) {
      toast("Toggle some steps first", "error");
      return;
    }
    const bytes = buildMidi(notes, bpm);
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "audio/midi" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeDownloadName(`${root}-${kind}-${bpm}`, "fl-pattern")}.mid`;
    a.click();
    toast("MIDI ready for FL Studio", "success");
  }

  return (
    <AppFrame title="FL Studio lab" Icon={Piano} iconClass="text-[#ff4b8b]" mobile={mobile} onBack={onBack} wide>
      <p className="text-sm text-sub">Shortcuts, scale helper, 16-step → MIDI export, and mixer routing notes — made for FL producers in Nexus.</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["keys", "Shortcuts"],
            ["scale", "Scales"],
            ["midi", "Pattern → MIDI"],
            ["mixer", "Mixer map"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${tab === id ? "bg-accent text-white" : "bg-hover text-sub"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {FL_SHORTCUTS.map((row) => (
            <li key={row.keys} className="flex items-center justify-between rounded-xl border border-line bg-side/50 px-3 py-2 text-sm">
              <span className="font-mono text-xs font-bold text-accent">{row.keys}</span>
              <span className="text-sub">{row.tip}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "scale" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select value={root} onChange={(e) => setRoot(e.target.value)} className="rounded-xl border border-line bg-input px-3 py-2 text-sm">
              {NOTES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded-xl border border-line bg-input px-3 py-2 text-sm">
              <option value="minor">Natural minor</option>
              <option value="major">Major</option>
              <option value="pentatonic">Minor pentatonic</option>
            </select>
            <input type="number" min={60} max={200} value={bpm} onChange={(e) => setBpm(Math.max(60, Math.min(200, Number(e.target.value) || 140)))} className="w-24 rounded-xl border border-line bg-input px-3 py-2 text-sm" />
            <span className="self-center text-xs text-sub">BPM</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {scale.map((n) => (
              <span key={n} className="rounded-full bg-accent/20 px-3 py-1 text-sm font-bold">
                {n}
              </span>
            ))}
          </div>
          <pre className="overflow-auto rounded-2xl border border-line bg-rail/70 p-3 text-xs whitespace-pre-wrap text-sub">{flpHint}</pre>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold"
            onClick={() => void navigator.clipboard.writeText(flpHint).then(() => toast("Copied", "success"))}
          >
            <Copy className="size-3.5" /> Copy project notes
          </button>
        </div>
      )}

      {tab === "midi" && (
        <div className="space-y-3">
          <p className="text-sm text-sub">Tap a 16-step grid (uses your scale). Export a .mid you can drag into FL Channel rack / Playlist.</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              Octave
              <input type="number" min={1} max={7} value={octave} onChange={(e) => setOctave(Math.max(1, Math.min(7, Number(e.target.value) || 4)))} className="w-16 rounded-lg border border-line bg-input px-2 py-1" />
            </label>
            <span className="text-xs text-sub">
              {root} {kind} · {bpm} BPM
            </span>
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {steps.map((on, i) => (
              <button key={i} type="button" onClick={() => toggleStep(i)} className={`aspect-square rounded-lg text-[10px] font-bold ${on ? "bg-accent text-white" : "bg-hover text-faint"}`}>
                {i + 1}
              </button>
            ))}
          </div>
          <button type="button" onClick={exportMidi} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
            <Download className="size-4" /> Export MIDI for FL
          </button>
        </div>
      )}

      {tab === "mixer" && (
        <div className="space-y-3">
          <p className="text-sm text-sub">Sketch insert routing before you open the project — copy into your session notes.</p>
          <textarea value={mixerNotes} onChange={(e) => setMixerNotes(e.target.value.slice(0, 2000))} rows={8} className="w-full rounded-2xl border border-line bg-input px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold"
            onClick={() => void navigator.clipboard.writeText(mixerNotes).then(() => toast("Mixer map copied", "success"))}
          >
            <Copy className="size-3.5" /> Copy
          </button>
        </div>
      )}
    </AppFrame>
  );
}
