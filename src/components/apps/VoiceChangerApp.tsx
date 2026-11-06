"use client";

import { useRef, useState } from "react";
import { AudioLines, Download, Trash2, Upload } from "lucide-react";
import { toast } from "@/store/app";
import { attachVoiceModelZip, clearVoiceModel, cycleVoiceFx, updateSettings, useCall } from "@/lib/call";
import { VOICE_FX, exampleModelJson, type VoiceFxId } from "@/lib/voiceChanger";
import AppFrame from "./AppFrame";

export default function VoiceChangerApp({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const fx = useCall((s) => s.settings.voiceFx);
  const model = useCall((s) => s.voiceModel);
  const inCall = useCall((s) => s.status !== "idle");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onZip(file: File) {
    if (!/\.zip$/i.test(file.name)) {
      toast("Attach a .zip AI voice model pack", "error");
      return;
    }
    setBusy(true);
    try {
      const pack = await attachVoiceModelZip(file);
      toast(`Loaded AI model “${pack.name}”`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read model zip", "error");
    } finally {
      setBusy(false);
    }
  }

  function downloadExample() {
    const blob = new Blob([exampleModelJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-voice.json";
    a.click();
    toast("Put this JSON in a zip as nexus-voice.json, then attach the zip", "info");
  }

  return (
    <AppFrame title="Voice changer" Icon={AudioLines} iconClass="text-[#a855f7]" mobile={mobile} onBack={onBack}>
      <p className="text-sm text-sub">
        Built-in pitch / formant FX for calls, plus AI model packs as a <code className="text-txt">.zip</code> containing{" "}
        <code className="text-txt">nexus-voice.json</code>. Effects apply live when you&apos;re in a call (shortcut <kbd className="rounded bg-hover px-1">F</kbd>).
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {VOICE_FX.filter((p) => p.id !== "custom").map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void updateSettings({ voiceFx: p.id })}
            className={`rounded-2xl border px-3 py-3 text-left transition ${fx === p.id ? "border-accent bg-accent/15" : "border-line bg-side/50 hover:bg-hover"}`}
          >
            <div className="font-bold">{p.label}</div>
            <div className="text-xs text-sub">ratio {p.ratio.toFixed(2)} · wet {Math.round(p.wet * 100)}%</div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => void updateSettings({ voiceFx: "custom" as VoiceFxId })}
          disabled={!model}
          className={`rounded-2xl border px-3 py-3 text-left transition sm:col-span-2 ${fx === "custom" ? "border-accent bg-accent/15" : "border-line bg-side/50 hover:bg-hover"} disabled:opacity-40`}
        >
          <div className="font-bold">AI model {model ? `· ${model.name}` : "(attach zip)"}</div>
          <div className="text-xs text-sub">{model ? `Loaded ${new Date(model.loadedAt).toLocaleString()}` : "Needs a nexus-voice.json pack"}</div>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Upload className="size-4" /> Attach model zip
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onZip(f);
          }}
        />
        <button type="button" onClick={downloadExample} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold">
          <Download className="size-4" /> Example JSON
        </button>
        {model && (
          <button type="button" onClick={() => void clearVoiceModel()} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold text-dnd">
            <Trash2 className="size-4" /> Remove model
          </button>
        )}
        {inCall && (
          <button type="button" onClick={() => void cycleVoiceFx()} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold">
            Cycle FX now
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-rail/60 p-4 text-xs leading-relaxed text-sub">
        <div className="mb-1 font-bold text-txt">Zip pack format</div>
        Include <code className="text-txt">nexus-voice.json</code> with fields: <code>name</code>, <code>ratio</code>, <code>wet</code>, optional{" "}
        <code>robot</code>, <code>formantHz</code>, <code>formantGain</code>, <code>highpass</code>, <code>lowpass</code>. Extra{" "}
        <code>weights.bin</code> / <code>model.wasm</code> files are accepted for future WASM models.
      </div>
    </AppFrame>
  );
}
