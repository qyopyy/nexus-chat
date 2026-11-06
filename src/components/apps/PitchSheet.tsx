"use client";

import { useMemo, useState } from "react";
import { Copy, FilePen, Download } from "lucide-react";
import { toast } from "@/store/app";
import { sanitizeDownloadName } from "@/lib/fileSafety";
import AppFrame from "./AppFrame";

const DSPS = ["Spotify", "Apple Music", "YouTube Music", "Amazon Music", "TikTok", "Instagram", "Beatport"];

export default function PitchSheet({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [blurb, setBlurb] = useState("");
  const [targets, setTargets] = useState<string[]>(["Spotify", "Apple Music"]);
  const [contact, setContact] = useState("");

  const sheet = useMemo(() => {
    const lines = [
      "NEXUS ARTIST PITCH",
      "==================",
      `Title: ${title || "—"}`,
      `Artist: ${artist || "—"}`,
      `Genre: ${genre || "—"}`,
      `Mood: ${mood || "—"}`,
      "",
      "Pitch",
      "-----",
      blurb || "—",
      "",
      `Targets: ${targets.join(", ") || "—"}`,
      contact ? `Contact: ${contact}` : "",
      "",
      "Generated with Nexus Apps",
    ].filter(Boolean);
    return lines.join("\n");
  }, [title, artist, genre, mood, blurb, targets, contact]);

  function toggle(dsp: string) {
    setTargets((t) => (t.includes(dsp) ? t.filter((x) => x !== dsp) : [...t, dsp]));
  }

  function copy() {
    void navigator.clipboard.writeText(sheet).then(() => toast("Pitch copied", "success"));
  }

  function download() {
    const blob = new Blob([sheet], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeDownloadName(title || artist || "pitch", "pitch")}.txt`;
    a.click();
  }

  return (
    <AppFrame
      title="Pitch one-sheet"
      Icon={FilePen}
      iconClass="text-[#a855f7]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <div className="flex gap-1.5">
          <button type="button" onClick={copy} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold">
            <Copy className="size-3.5" /> Copy
          </button>
          <button type="button" onClick={download} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            <Download className="size-3.5" /> TXT
          </button>
        </div>
      }
    >
      <p className="text-sm text-sub">Quick one-sheet for playlists, blogs, and DSP pitches — stays on device until you copy or download.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Artist" value={artist} onChange={setArtist} />
        <Field label="Genre" value={genre} onChange={setGenre} placeholder="Alt R&B, Drill…" />
        <Field label="Mood" value={mood} onChange={setMood} placeholder="Night drive, hype…" />
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-xs font-semibold text-sub">Short pitch</span>
        <textarea value={blurb} onChange={(e) => setBlurb(e.target.value.slice(0, 800))} rows={4} className="w-full resize-y rounded-xl border border-line bg-input px-3 py-2 outline-none focus:border-accent" placeholder="2–4 sentences about the record…" />
      </label>
      <div>
        <div className="mb-2 text-xs font-semibold text-sub">Targets</div>
        <div className="flex flex-wrap gap-2">
          {DSPS.map((d) => (
            <button key={d} type="button" onClick={() => toggle(d)} className={`rounded-full px-3 py-1 text-xs font-bold ${targets.includes(d) ? "bg-accent text-white" : "bg-hover text-sub"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <Field label="Contact / link" value={contact} onChange={setContact} placeholder="email or Nexus Link" />
      <pre className="overflow-auto rounded-2xl border border-line bg-rail/80 p-4 text-xs leading-relaxed whitespace-pre-wrap text-sub">{sheet}</pre>
    </AppFrame>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-xs font-semibold text-sub">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-line bg-input px-3 py-2 outline-none focus:border-accent" />
    </label>
  );
}
