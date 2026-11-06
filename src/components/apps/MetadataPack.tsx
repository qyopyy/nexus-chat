"use client";

import { useMemo, useState } from "react";
import { Braces, Copy, Download } from "lucide-react";
import { toast } from "@/store/app";
import { sanitizeDownloadName } from "@/lib/fileSafety";
import AppFrame from "./AppFrame";

type Row = { title: string; isrc: string; upc: string; duration: string; writers: string };

const empty = (): Row => ({ title: "", isrc: "", upc: "", duration: "", writers: "" });

export default function MetadataPack({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [album, setAlbum] = useState("");
  const [artist, setArtist] = useState("");
  const [rows, setRows] = useState<Row[]>([empty(), empty()]);

  const csv = useMemo(() => {
    const head = ["track_no", "title", "artist", "album", "isrc", "upc", "duration", "writers"];
    const lines = rows
      .filter((r) => r.title.trim())
      .map((r, i) =>
        [String(i + 1), r.title, artist, album, r.isrc, r.upc, r.duration, r.writers]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      );
    return [head.join(","), ...lines].join("\n");
  }, [rows, album, artist]);

  const json = useMemo(
    () =>
      JSON.stringify(
        {
          album,
          artist,
          tracks: rows
            .filter((r) => r.title.trim())
            .map((r, i) => ({
              track: i + 1,
              title: r.title,
              isrc: r.isrc || null,
              upc: r.upc || null,
              duration: r.duration || null,
              writers: r.writers
                .split(",")
                .map((w) => w.trim())
                .filter(Boolean),
            })),
        },
        null,
        2,
      ),
    [rows, album, artist],
  );

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function download(kind: "csv" | "json") {
    const blob = new Blob([kind === "csv" ? csv : json], { type: kind === "csv" ? "text/csv" : "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeDownloadName(album || artist || "metadata", "meta")}.${kind}`;
    a.click();
  }

  return (
    <AppFrame
      title="Metadata pack"
      Icon={Braces}
      iconClass="text-[#38bdf8]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <div className="flex gap-1.5">
          <button type="button" onClick={() => void navigator.clipboard.writeText(csv).then(() => toast("CSV copied", "success"))} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold">
            <Copy className="size-3.5" /> CSV
          </button>
          <button type="button" onClick={() => download("json")} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            <Download className="size-3.5" /> JSON
          </button>
        </div>
      }
    >
      <p className="text-sm text-sub">Build a DistroKid / Tunearo-style tracklist → CSV or JSON. Pair with the UPC generator for codes.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold text-sub">Album / release</span>
          <input value={album} onChange={(e) => setAlbum(e.target.value)} className="w-full rounded-xl border border-line bg-input px-3 py-2 outline-none focus:border-accent" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold text-sub">Primary artist</span>
          <input value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full rounded-xl border border-line bg-input px-3 py-2 outline-none focus:border-accent" />
        </label>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-2xl border border-line bg-side/50 p-3">
            <div className="mb-2 text-xs font-bold text-faint">Track {i + 1}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input placeholder="Title" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} className="rounded-lg border border-line bg-input px-2 py-1.5 text-sm outline-none focus:border-accent" />
              <input placeholder="Duration (3:24)" value={r.duration} onChange={(e) => setRow(i, { duration: e.target.value })} className="rounded-lg border border-line bg-input px-2 py-1.5 text-sm outline-none focus:border-accent" />
              <input placeholder="ISRC" value={r.isrc} onChange={(e) => setRow(i, { isrc: e.target.value })} className="rounded-lg border border-line bg-input px-2 py-1.5 font-mono text-sm outline-none focus:border-accent" />
              <input placeholder="UPC" value={r.upc} onChange={(e) => setRow(i, { upc: e.target.value })} className="rounded-lg border border-line bg-input px-2 py-1.5 font-mono text-sm outline-none focus:border-accent" />
              <input placeholder="Writers (comma-separated)" value={r.writers} onChange={(e) => setRow(i, { writers: e.target.value })} className="sm:col-span-2 rounded-lg border border-line bg-input px-2 py-1.5 text-sm outline-none focus:border-accent" />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setRows((r) => [...r, empty()])} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold">
          + Add track
        </button>
        <button type="button" onClick={() => download("csv")} className="ml-2 rounded-full bg-hover px-4 py-2 text-sm font-semibold">
          Download CSV
        </button>
      </div>
    </AppFrame>
  );
}
