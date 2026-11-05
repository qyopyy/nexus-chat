"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion, Plus, Printer, Trash2, TriangleAlert } from "lucide-react";
import { PLATFORMS, fmtTime, type AudioCheck, type AudioReport } from "@/lib/audio";
import { cn } from "@/lib/utils";
import type { Split } from "@/lib/types";

// ------------------------------------------------------------------ analysis
export function Chips({ bpm, keyName, lufs, truePeak, className }: { bpm?: number | null; keyName?: string | null; lufs?: number | null; truePeak?: number | null; className?: string }) {
  const items = [
    bpm ? `${Math.round(bpm)} BPM` : null,
    keyName,
    lufs != null ? `${lufs} LUFS` : null,
    truePeak != null ? `${truePeak} dBTP` : null,
  ].filter(Boolean) as string[];
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((t) => (
        <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
          {t}
        </span>
      ))}
    </div>
  );
}

function Stat({ k, v, sub, warn }: { k: string; v: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="text-[11px] font-bold tracking-wide text-sub uppercase">{k}</div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums", warn && "text-idle")}>{v}</div>
      {sub && <div className="text-xs text-sub">{sub}</div>}
    </div>
  );
}

export function ReportView({ r }: { r: AudioReport }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Tempo" v={r.bpm ? `${Math.round(r.bpm)} BPM` : "—"} sub={r.bpm ? `half ${Math.round(r.bpm / 2)} · double ${Math.round(r.bpm * 2)}` : undefined} />
        <Stat k="Key" v={r.key ?? "—"} sub={r.camelot ? `Camelot ${r.camelot}${r.keyConfidence < 0.35 ? " · unsure" : ""}` : undefined} />
        <Stat k="Loudness" v={r.lufs != null ? `${r.lufs} LUFS` : "—"} sub="integrated" warn={r.lufs != null && r.lufs > -7} />
        <Stat k="True peak" v={r.truePeak != null ? `${r.truePeak} dBTP` : "—"} sub={`sample peak ${r.samplePeak} dBFS`} warn={r.truePeak != null && r.truePeak > -1} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Length" v={fmtTime(r.duration)} />
        <Stat k="Format" v={r.format} sub={`${(r.sampleRate / 1000).toFixed(1)} kHz${r.bitDepth ? ` · ${r.bitDepth}-bit` : ""} · ${r.channels === 1 ? "mono" : r.channels === 2 ? "stereo" : `${r.channels} ch`}`} />
        <Stat k="Stereo" v={r.correlation == null ? "mono" : r.correlation.toFixed(2)} sub="phase correlation" warn={r.correlation != null && r.correlation < 0} />
        <Stat k="Clipping" v={String(r.clippedSamples)} sub="clipped spots" warn={r.clippedSamples > 0} />
      </div>

      {r.lufs != null && (
        <div className="rounded-xl bg-black/20 p-3">
          <div className="mb-2 text-[11px] font-bold tracking-wide text-sub uppercase">What streaming services do with it</div>
          <div className="grid gap-1 text-sm sm:grid-cols-2">
            {PLATFORMS.map((p) => {
              let d = p.target - (r.lufs as number);
              if (p.upOnly && d > 0) d = 0;
              if (d > 0 && r.truePeak != null) d = Math.min(d, Math.max(0, -1 - r.truePeak)); // limited by headroom
              const t = Math.abs(d) < 0.5 ? "plays as is" : d < 0 ? `turned down ${Math.abs(d).toFixed(1)} dB` : `turned up ${d.toFixed(1)} dB`;
              return (
                <div key={p.name} className="flex justify-between gap-2">
                  <span className="text-sub">
                    {p.name} <span className="text-faint">({p.target} LUFS)</span>
                  </span>
                  <span className="font-medium">{t}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {r.warnings.length ? (
        <div className="space-y-1.5 rounded-xl bg-idle/10 p-3 ring-1 ring-idle/25">
          {r.warnings.map((w) => (
            <div key={w} className="flex gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-idle" /> {w}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-ok/10 p-3 text-sm ring-1 ring-ok/25">
          <ShieldCheck className="size-4 text-ok" /> Ready for stores — no technical problems found.
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ copyright
export const CHECK_INFO = {
  clean: { label: "No copyright matches", cls: "text-ok bg-ok/10 ring-ok/25" },
  own: { label: "Matches your own music", cls: "text-accent bg-accent/10 ring-accent/25" },
  match: { label: "Copyrighted music found", cls: "text-dnd bg-dnd/10 ring-dnd/30" },
  blocked: { label: "Blocked by YouTube Content ID", cls: "text-dnd bg-dnd/15 ring-dnd/40" },
  error: { label: "Check couldn't finish", cls: "text-idle bg-idle/10 ring-idle/25" },
} as const;

export function CheckPill({ c, running }: { c?: AudioCheck | null; running?: boolean }) {
  if (running) return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-sub">Checking copyright…</span>;
  if (!c) return null;
  const i = CHECK_INFO[c.status] ?? CHECK_INFO.error;
  const Icon = c.status === "match" || c.status === "blocked" ? ShieldAlert : c.status === "error" ? ShieldQuestion : ShieldCheck;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", i.cls)}>
      <Icon className="size-3" /> {i.label}
    </span>
  );
}

export function CheckView({ c }: { c: AudioCheck }) {
  const i = CHECK_INFO[c.status] ?? CHECK_INFO.error;
  return (
    <div className={cn("rounded-xl p-3 ring-1", i.cls)}>
      <div className="flex items-center gap-2 font-semibold">
        {c.status === "match" || c.status === "blocked" ? <ShieldAlert className="size-5" /> : c.status === "error" ? <ShieldQuestion className="size-5" /> : <ShieldCheck className="size-5" />}
        {i.label}
        <span className="ml-auto text-[11px] font-normal text-sub">{new Date(c.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      {c.status === "clean" && <p className="mt-1 text-sm text-txt/80">The audio fingerprint didn&apos;t match any released recording.</p>}
      {c.status === "error" && <p className="mt-1 text-sm text-txt/80">{c.note ?? "Try again in a moment."}</p>}
      {c.status === "own" && <p className="mt-1 text-sm text-txt/80">It matched a recording under your own artist name — that&apos;s fine.</p>}
      {c.status === "blocked" && <p className="mt-1 text-sm text-txt/80">{c.note ?? "Global YouTube Content ID is on — this upload was blocked because it matches a commercial / YouTube catalog recording."}</p>}
      {c.matches.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {c.matches.map((m, k) => (
            <div key={k} className="rounded-lg bg-black/25 p-2 text-sm text-txt">
              <div className="font-semibold">
                {m.title} — {m.artists.join(", ")}
              </div>
              <div className="text-xs text-sub">
                {[m.album, m.label, m.release_date?.slice(0, 4), m.isrc && `ISRC ${m.isrc}`, m.score != null && `${m.score}% match`, m.offset_s != null && `at ${fmtTime(m.offset_s)} in the original`]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {(m.spotify_id || m.youtube_id) && (
                <div className="mt-1 flex gap-3 text-xs">
                  {m.spotify_id && (
                    <a href={`https://open.spotify.com/track/${m.spotify_id}`} target="_blank" rel="noreferrer" className="text-[#1DB954] hover:underline">
                      Open on Spotify
                    </a>
                  )}
                  {m.youtube_id && (
                    <a href={`https://www.youtube.com/watch?v=${m.youtube_id}`} target="_blank" rel="noreferrer" className="text-dnd hover:underline">
                      Open on YouTube
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
          {c.status === "match" && <p className="text-xs text-txt/70">Only distribute or publish this if you own it or have a licence (samples need clearance too).</p>}
          {c.status === "blocked" && <p className="text-xs text-txt/70">Staff turned on the global YouTube Content ID block. Turn it off in Studio → Content ID to allow matching uploads again.</p>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ split sheet
export const SPLIT_ROLES = ["Songwriter", "Composer", "Lyricist", "Producer", "Artist", "Featured artist", "Publisher", "Engineer", "Other"];

export function SplitEditor({ splits, onChange, disabled }: { splits: Split[]; onChange: (s: Split[]) => void; disabled?: boolean }) {
  const total = Math.round(splits.reduce((a, s) => a + (Number(s.share) || 0), 0) * 100) / 100;
  const set = (i: number, patch: Partial<Split>) => onChange(splits.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2">
      {splits.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 sm:grid-cols-[1.4fr_1fr_1fr_90px_auto]">
          <input disabled={disabled} value={s.name} onChange={(e) => set(i, { name: e.target.value.slice(0, 100) })} placeholder="Legal name" className="min-w-0 rounded-lg border border-line bg-transparent px-2.5 py-2 text-sm outline-none focus:border-accent" />
          <select disabled={disabled} value={s.role} onChange={(e) => set(i, { role: e.target.value })} className="hidden rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none sm:block">
            {SPLIT_ROLES.map((r) => (
              <option key={r} value={r} className="bg-side">
                {r}
              </option>
            ))}
          </select>
          <input disabled={disabled} value={s.email ?? ""} onChange={(e) => set(i, { email: e.target.value.slice(0, 120) })} placeholder="Email / PRO" className="hidden min-w-0 rounded-lg border border-line bg-transparent px-2.5 py-2 text-sm outline-none focus:border-accent sm:block" />
          <label className="flex items-center rounded-lg border border-line px-2 focus-within:border-accent">
            <input
              disabled={disabled}
              inputMode="decimal"
              value={Number.isFinite(s.share) ? String(s.share) : ""}
              onChange={(e) => set(i, { share: Math.max(0, Math.min(100, Number(e.target.value.replace(",", ".")) || 0)) })}
              className="w-12 bg-transparent py-2 text-right text-sm tabular-nums outline-none"
            />
            <span className="text-sm text-sub">%</span>
          </label>
          {!disabled && (
            <button onClick={() => onChange(splits.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-lg text-sub hover:text-dnd" aria-label="Remove">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {!disabled && (
          <button
            onClick={() => onChange([...splits, { name: "", role: "Songwriter", share: Math.max(0, Math.round((100 - total) * 100) / 100) }])}
            className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-sm font-semibold hover:bg-active"
          >
            <Plus className="size-4" /> Add person
          </button>
        )}
        {!disabled && splits.length > 1 && (
          <button
            onClick={() => {
              const each = Math.floor((100 / splits.length) * 100) / 100;
              onChange(splits.map((s, i) => ({ ...s, share: i === 0 ? Math.round((100 - each * (splits.length - 1)) * 100) / 100 : each })));
            }}
            className="rounded-full bg-hover px-3 py-1.5 text-sm font-semibold hover:bg-active"
          >
            Split evenly
          </button>
        )}
        <span className={cn("ml-auto text-sm font-semibold tabular-nums", splits.length && total !== 100 ? "text-idle" : "text-ok")}>
          {splits.length ? `Total ${total}%${total !== 100 ? " — must be 100%" : " ✓"}` : "No splits yet"}
        </span>
      </div>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** printable split sheet (save as PDF from the print dialog) */
export function printSplitSheet(info: { title: string; artist: string; isrc?: string | null; release?: string; date?: string | null; label?: string | null }, splits: Split[]) {
  const rows = splits
    .map((s) => `<tr><td>${esc(s.name || "—")}</td><td>${esc(s.role)}</td><td>${esc(s.email ?? "")}</td><td class="n">${s.share}%</td><td class="sig"></td><td class="sig d"></td></tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Split sheet — ${esc(info.title)}</title>
<style>body{font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:40px}h1{font-size:26px;margin:0 0 4px}.m{color:#555;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #bbb;padding:9px 8px;text-align:left;vertical-align:bottom}th{background:#f2f2f2;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.n{text-align:right;white-space:nowrap}.sig{width:22%;height:34px}.d{width:12%}.f{margin-top:28px;font-size:12px;color:#555}@media print{body{margin:18mm}}</style></head><body>
<h1>Song split sheet</h1><div class="m">Agreement of ownership shares for the composition below.</div>
<table><tr><th>Song title</th><td>${esc(info.title)}</td><th>Artist</th><td>${esc(info.artist)}</td></tr>
<tr><th>Release</th><td>${esc(info.release ?? "")}</td><th>ISRC</th><td>${esc(info.isrc ?? "")}</td></tr>
<tr><th>Label</th><td>${esc(info.label ?? "")}</td><th>Date</th><td>${esc(info.date ?? new Date().toISOString().slice(0, 10))}</td></tr></table>
<table><tr><th>Name</th><th>Role</th><th>Email / PRO / IPI</th><th class="n">Share</th><th>Signature</th><th>Date</th></tr>${rows}
<tr><th colspan="3">Total</th><th class="n">${Math.round(splits.reduce((a, s) => a + s.share, 0) * 100) / 100}%</th><td colspan="2"></td></tr></table>
<p class="f">By signing, each writer confirms the shares above for the composition (publishing). Master ownership is agreed separately.</p>
<script>onload=()=>setTimeout(()=>print(),300)</script></body></html>`;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `split-sheet-${info.title.replace(/[^\w-]+/g, "-")}.html`;
    a.click();
  }
}

export const PrintIcon = Printer;
