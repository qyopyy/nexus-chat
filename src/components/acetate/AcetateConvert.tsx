"use client";

import { useEffect, useState } from "react";
import { choiceLabel, convertLimitMessage, convertOwnedAudio, deliverConvertedFile, m4aEncoderAvailable, type ConvertChoice } from "@/lib/acetateConvert";
import { featureFlags, loadFeatureFlags } from "@/lib/featureFlags";

const CHOICES: ConvertChoice[] = [
  { format: "mp3", kbps: 128 },
  { format: "mp3", kbps: 192 },
  { format: "mp3", kbps: 320 },
  { format: "wav", bits: 16 },
  { format: "wav", bits: 24 },
  { format: "m4a", kbps: 256 },
];

function keyOf(choice: ConvertChoice) {
  if (choice.format === "mp3") return `mp3-${choice.kbps}`;
  if (choice.format === "wav") return `wav-${choice.bits}`;
  return "m4a-256";
}

export default function AcetateConvert(props: {
  source: File | null;
  sourceLabel?: string;
  onFile?: (file: File) => void;
  onSave?: (file: File, label: string) => Promise<void>;
  saveLabel?: string;
}) {
  const [enabled, setEnabled] = useState(featureFlags().format_convert);
  const [choice, setChoice] = useState<ConvertChoice>(CHOICES[2]);
  const [m4a, setM4a] = useState(true);
  const [busy, setBusy] = useState<"down" | "save" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void loadFeatureFlags().then((flags) => setEnabled(flags.format_convert));
    setM4a(m4aEncoderAvailable());
  }, []);

  if (!enabled) return <p className="text-sm" style={{ color: "var(--ac-muted, #a3988c)" }}>Format conversion is turned off.</p>;

  async function go(mode: "down" | "save") {
    if (!props.source) {
      setNote("Choose an audio file you own.");
      return;
    }
    setBusy(mode);
    setNote(null);
    try {
      const file = await convertOwnedAudio(props.source, props.sourceLabel || props.source.name, choice);
      const label = choiceLabel(choice);
      if (mode === "save" && props.onSave) await props.onSave(file, label);
      else await deliverConvertedFile(file);
      setNote(mode === "save" ? `Saved ${label}. The original is still there.` : `Ready: ${file.name}. The original was not changed.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't convert that file");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-3xl p-4" style={{ background: "var(--ac-card, #1a1612)", color: "var(--ac-text, #f3eadf)" }}>
      <p className="text-xs font-bold tracking-[0.16em] uppercase" style={{ color: "var(--ac-accent, #e4a15a)" }}>Convert</p>
      <p className="mt-1 text-sm" style={{ color: "var(--ac-muted, #a3988c)" }}>{convertLimitMessage()}</p>
      {props.onFile && (
        <label className="mt-3 block text-sm">
          Audio file you own
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.aiff,.aif,.ogg"
            className="mt-1 block w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) props.onFile?.(file);
            }}
          />
        </label>
      )}
      {props.source && <p className="mt-2 truncate text-sm">{props.sourceLabel || props.source.name}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {CHOICES.map((option) => {
          const blocked = option.format === "m4a" && !m4a;
          const active = keyOf(option) === keyOf(choice);
          return (
            <button
              key={keyOf(option)}
              type="button"
              disabled={blocked || !!busy}
              title={blocked ? "This browser can't encode M4A. Use MP3 or WAV." : undefined}
              aria-pressed={active}
              onClick={() => setChoice(option)}
              className="rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
              style={{ background: active ? "var(--ac-accent, #e4a15a)" : "transparent", color: active ? "var(--ac-accent-text, #100e0c)" : "inherit", boxShadow: "inset 0 0 0 1px var(--ac-line, #3c342c)" }}
            >
              {choiceLabel(option)}
            </button>
          );
        })}
      </div>
      {!m4a && <p className="mt-2 text-xs" style={{ color: "var(--ac-muted, #a3988c)" }}>This browser can't encode M4A. MP3 and WAV still work.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!props.source || !!busy} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: "var(--ac-accent, #e4a15a)", color: "var(--ac-accent-text, #100e0c)" }} onClick={() => void go("down")}>
          {busy === "down" ? "Converting…" : "Download converted"}
        </button>
        {props.onSave && (
          <button type="button" disabled={!props.source || !!busy} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ boxShadow: "inset 0 0 0 1px var(--ac-line, #3c342c)" }} onClick={() => void go("save")}>
            {busy === "save" ? "Saving…" : props.saveLabel || "Save a new version"}
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-sm">{note}</p>}
    </div>
  );
}
