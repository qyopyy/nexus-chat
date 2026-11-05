"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Fingerprint, ShieldCheck, Trash2 } from "lucide-react";
import { checkStatus, clipFromFile, copyrightCheck, type AudioCheck } from "@/lib/audio";
import { shieldCheck, type ShieldHit } from "@/lib/shield";
import { cn } from "@/lib/utils";

type Result = {
  name: string;
  shield: ShieldHit | null;
  acr: AudioCheck | null;
  acrError: string | null;
  acrConfigured: boolean;
};

export default function MusicCheck({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  async function run(file: File) {
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/") && !/\.(wav|flac|mp3|m4a|aac|ogg|aiff?|mp4|mov|webm)$/i.test(file.name)) {
      setError("Pick an audio or video file.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const status = await checkStatus();
      const shield = await shieldCheck(file, "tool");
      let acr: AudioCheck | null = null;
      let acrError: string | null = null;
      if (status.configured) {
        try {
          acr = await copyrightCheck(await clipFromFile(file), { kind: "tool" });
        } catch (e) {
          acrError = (e as Error).message;
        }
      }
      setResult({ name: file.name, shield, acr, acrError, acrConfigured: status.configured });
    } catch (e) {
      setError((e as Error).message || "Couldn't analyse that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <Fingerprint className="size-5 text-[#faa61a]" />
        <span className={cn("font-bold", mobile ? "text-2xl tracking-tight" : "text-base")}>Music ID check</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-5">
          <p className="text-sm text-sub">
            Drop a track to see if it matches your Shield 360 catalogue (Nexus fingerprint) and, when connected, ACRCloud Content ID. The file stays on this device except a short clip sent for ACRCloud
            matching.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void run(f);
            }}
            onClick={() => !busy && pick.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition",
              dragOver ? "border-accent bg-accent/10" : "border-line hover:border-accent/60",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <ShieldCheck className="size-8 text-sub" />
            <div className="font-semibold">{busy ? "Listening…" : "Drop audio or video here"}</div>
            <div className="text-xs text-sub">WAV, FLAC, MP3, M4A, MP4…</div>
            <input
              ref={pick}
              type="file"
              accept="audio/*,video/*,.wav,.flac,.mp3,.m4a,.aiff,.mp4,.mov,.webm"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void run(f);
              }}
            />
          </div>
          {error && <p className="rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">{error}</p>}
          {result && (
            <div className="space-y-3 rounded-2xl border border-line/70 bg-side p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 truncate text-sm font-semibold">{result.name}</div>
                <button
                  onClick={() => setResult(null)}
                  className="grid size-8 place-items-center rounded-full hover:bg-hover"
                  aria-label="Clear"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="rounded-xl bg-black/25 p-3 text-sm">
                <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Shield 360</div>
                {result.shield ? (
                  <p>
                    Match: “{result.shield.title}”
                    {result.shield.artist ? ` by ${result.shield.artist}` : ""} · confidence {Math.min(100, Math.round(result.shield.score / 3))}%
                  </p>
                ) : (
                  <p className="text-sub">No protected Nexus song matched.</p>
                )}
              </div>
              <div className="rounded-xl bg-black/25 p-3 text-sm">
                <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">ACRCloud / Content ID</div>
                {!result.acrConfigured ? (
                  <p className="text-sub">ACRCloud isn&apos;t connected on this server yet.</p>
                ) : result.acrError ? (
                  <p className="text-[#ff8a8c]">{result.acrError}</p>
                ) : result.acr?.status === "match" && result.acr.matches[0] ? (
                  <div className="space-y-1">
                    {result.acr.matches.slice(0, 3).map((m, i) => (
                      <p key={i}>
                        “{m.title}” — {m.artists.join(", ") || "unknown artist"}
                        {m.isrc ? ` · ISRC ${m.isrc}` : ""}
                        {m.score != null ? ` · score ${m.score}` : ""}
                      </p>
                    ))}
                  </div>
                ) : result.acr?.status === "own" ? (
                  <p>Matched a song in your ACRCloud shield bucket.</p>
                ) : (
                  <p className="text-sub">No ACRCloud match.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
