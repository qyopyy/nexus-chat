"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Copy, Download, ExternalLink, FileArchive, Link2, Loader2, Play, RefreshCw, Search, Send, TriangleAlert, X } from "lucide-react";
import { toast, useApp } from "@/store/app";
import { STATUS_INFO, approveAndSend, decideRelease, distFileBlob, distFileUrl, getRelease, listReleases, markReleaseDelivered, tunearo, type SendProgress } from "@/lib/dist";
import { latestChecks, type AudioCheck } from "@/lib/audio";
import { makeZip, saveBlob } from "@/lib/zipStore";
import { cn } from "@/lib/utils";
import NameTag from "@/components/ui/NameTag";
import Avatar from "@/components/ui/Avatar";
import { CheckPill } from "@/components/music/AudioBits";
import type { DistRelease, DistStatus, DistTrack } from "@/lib/types";

/* ───────────────────────── helpers ───────────────────────── */

export const STORE_FIELDS: [string, string][] = [
  ["spotify", "Spotify"],
  ["apple_music", "Apple Music"],
  ["youtube_music", "YouTube Music"],
  ["youtube", "YouTube"],
  ["deezer", "Deezer"],
  ["amazon_music", "Amazon Music"],
  ["tidal", "TIDAL"],
  ["tiktok", "TikTok"],
  ["soundcloud", "SoundCloud"],
  ["smart_link", "Smart link / pre-save"],
];
const storeLabel = (k: string) => STORE_FIELDS.find((s) => s[0] === k)?.[1] ?? k.replace(/_/g, " ");

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
const ext = (p: string | null | undefined, fallback: string) => (p?.split(".").pop() || fallback).toLowerCase();
const fmtDur = (s: number | null | undefined) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—");
const fmtBytes = (b: number | null | undefined) => (b ? (b > 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`) : "");

function copy(text: string, what = "Copied") {
  void navigator.clipboard.writeText(text).then(
    () => toast(what, "success"),
    () => toast("Couldn't copy", "error"),
  );
}

/** everything a distributor form asks for, as plain text */
export function metadataText(r: DistRelease, tracks: DistTrack[], owner?: string) {
  const L: string[] = [];
  const kv = (k: string, v: unknown) => v != null && v !== "" && L.push(`${k}: ${v}`);
  L.push(`RELEASE`);
  kv("Title", r.title);
  kv("Primary artist", r.primary_artist_name);
  kv("Release type", r.release_type);
  kv("Primary genre", r.primary_genre);
  kv("Secondary genre", r.secondary_genre);
  kv("Release date", r.release_date);
  kv("Label", r.label_name);
  kv("Language", r.language);
  kv("Explicit", r.explicit ? "Yes" : "No");
  kv("℗ line", `${r.copyright_year ?? ""} ${r.copyright_holder ?? ""}`.trim());
  kv("© line", `${r.copyright_year ?? ""} ${r.copyright_holder ?? ""}`.trim());
  kv("Territories", `${r.territories_include}${r.territories_exclude ? ` (excluding ${r.territories_exclude})` : ""}`);
  kv("UPC", r.upc || "(assign)");
  kv("Submitted by", owner);
  for (const [k, v] of Object.entries(r.store_links ?? {})) kv(storeLabel(k), v);
  tracks.forEach((t, i) => {
    L.push("", `TRACK ${i + 1}`);
    kv("Title", t.title);
    kv("Primary artist", t.primary_artist_name || r.primary_artist_name);
    kv("Featured artists", t.featured_artist_names);
    kv("ISRC", t.isrc || "(assign)");
    kv("Explicit", t.explicit ? "Yes" : "No");
    kv("Language", t.language || r.language);
    kv("Duration", fmtDur(t.duration));
    kv("BPM", t.bpm);
    kv("Key", t.musical_key);
    kv("Songwriter", t.songwriter);
    kv("Composer", t.composer);
    kv("Lyricist", t.lyricist);
    kv("Producer", t.producer);
    kv("Mixer", t.mixer);
    kv("Mastering engineer", t.mastering_engineer);
    kv("Publisher", t.publisher);
    kv("Remixer", t.remixer);
    if (t.splits?.length) kv("Splits", t.splits.map((s) => `${s.name} (${s.role}) ${s.share}%`).join("; "));
    kv("Audio file", t.audio_name);
    if (t.lyrics) L.push("Lyrics:", t.lyrics);
  });
  return L.join("\n");
}

function metadataCsv(r: DistRelease, tracks: DistTrack[]) {
  const cols = ["release_title", "primary_artist", "release_type", "genre", "secondary_genre", "release_date", "label", "language", "upc", "copyright", "track_no", "track_title", "track_artist", "featured", "isrc", "explicit", "duration", "bpm", "key", "songwriter", "composer", "lyricist", "producer", "publisher", "audio_file"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = (tracks.length ? tracks : [null]).map((t, i) =>
    [r.title, r.primary_artist_name, r.release_type, r.primary_genre, r.secondary_genre, r.release_date, r.label_name, r.language, r.upc, `${r.copyright_year ?? ""} ${r.copyright_holder ?? ""}`.trim(), t ? i + 1 : "", t?.title, t?.primary_artist_name || r.primary_artist_name, t?.featured_artist_names, t?.isrc, t ? (t.explicit ? "yes" : "no") : "", t ? fmtDur(t.duration) : "", t?.bpm, t?.musical_key, t?.songwriter, t?.composer, t?.lyricist, t?.producer, t?.publisher, t?.audio_name]
      .map(esc)
      .join(","),
  );
  return [cols.join(","), ...rows].join("\r\n");
}

function useCover(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) void distFileUrl(path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}

function Cover({ path, className }: { path: string | null; className?: string }) {
  const url = useCover(path);
  return (
    <div className={cn("aspect-square shrink-0 overflow-hidden rounded-lg bg-black/30", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="grid size-full place-items-center text-xs text-faint">{path ? "…" : "No art"}</div>
      )}
    </div>
  );
}

function Status({ s }: { s: DistStatus }) {
  const i = STATUS_INFO[s];
  return (
    <span className="text-[12px] font-bold" style={{ color: i?.color }}>
      {i?.label ?? s}
    </span>
  );
}

/* ───────────────────────── Manage releases (admin list) ───────────────────────── */

type Filter = "review" | "delivering" | "live" | "changes" | "rejected" | "draft" | "all";
const FILTERS: [Filter, string, DistStatus[] | null][] = [
  ["review", "Needs review", ["in_review", "error", "sending"]],
  ["delivering", "Delivering", ["pending", "approved"]],
  ["live", "Live", ["live"]],
  ["changes", "Changes needed", ["changes_requested"]],
  ["rejected", "Rejected", ["rejected", "takedown_requested", "taken_down"]],
  ["draft", "Drafts", ["draft"]],
  ["all", "All", null],
];
type Sort = "latest" | "oldest" | "title" | "date";

export function ManageReleases() {
  const [rows, setRows] = useState<DistRelease[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("review");
  const [sort, setSort] = useState<Sort>("latest");
  const [open, setOpen] = useState<string | null>(null);
  const profiles = useApp((s) => s.profiles);
  const load = useCallback(() => void listReleases(true).then(setRows), []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [f, , st] of FILTERS) c[f] = (rows ?? []).filter((r) => !st || st.includes(r.status)).length;
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const st = FILTERS.find((f) => f[0] === filter)?.[2];
    const needle = q.trim().toLowerCase();
    let l = (rows ?? []).filter((r) => !st || st.includes(r.status));
    if (needle)
      l = l.filter((r) =>
        [r.title, r.primary_artist_name, r.upc, r.label_name, r.distributor_ref, profiles[r.owner_id]?.username, profiles[r.owner_id]?.display_name].some((v) => v && String(v).toLowerCase().includes(needle)),
      );
    const t = (r: DistRelease) => Date.parse(r.submitted_at ?? r.updated_at ?? r.created_at);
    return [...l].sort((a, b) => (sort === "latest" ? t(b) - t(a) : sort === "oldest" ? t(a) - t(b) : sort === "title" ? a.title.localeCompare(b.title) : Date.parse(a.release_date) - Date.parse(b.release_date)));
  }, [rows, filter, q, sort, profiles]);

  if (open) return <ReleaseSheet id={open} onBack={() => setOpen(null)} onChanged={load} />;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-2xl font-black">Manage releases</h2>
        <button
          onClick={async () => {
            try {
              await tunearo("sync");
              toast("Statuses refreshed", "success");
            } catch {
              /* Tunearo not connected — fine for manual delivery */
            }
            load();
          }}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active"
          title="Refresh"
        >
          <RefreshCw className="size-3.5" /> Refresh
        </button>
      </div>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-side px-3 ring-1 ring-line/60">
          <Search className="size-4 shrink-0 text-sub" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, artist, UPC, user…" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search">
              <X className="size-4 text-sub" />
            </button>
          )}
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-11 rounded-xl bg-side px-3 text-sm font-semibold ring-1 ring-line/60 outline-none">
          <option value="latest">⇅ Latest</option>
          <option value="oldest">⇅ Oldest</option>
          <option value="title">⇅ Title A–Z</option>
          <option value="date">⇅ Release date</option>
        </select>
      </div>
      <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", filter === f ? "bg-accent text-white" : "bg-side text-sub ring-1 ring-line/60 hover:text-txt")}>
            {label} <span className="opacity-70">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="mb-2 text-xs text-sub">
        {list.length} release{list.length === 1 ? "" : "s"}
      </div>
      {rows === null ? (
        <p className="text-sub">Loading…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-side py-12 text-center text-sub ring-1 ring-line/60">{filter === "review" ? "Nothing waiting for review 🎉" : "No releases here."}</div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const warn = (r.artwork_path ? 0 : 1) + (r.status === "in_review" && Date.parse(r.release_date) < Date.now() ? 1 : 0) + (r.last_error ? 1 : 0);
            return (
              <button key={r.id} onClick={() => setOpen(r.id)} className="flex w-full items-center gap-3 rounded-2xl bg-side p-2.5 text-left ring-1 ring-line/60 transition hover:bg-white/[.04]">
                <Cover path={r.artwork_path} className="w-14 sm:w-16" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{r.title}</div>
                  <div className="truncate text-[13px] text-sub">
                    {r.primary_artist_name} · {r.release_type} · {new Date(r.release_date).toLocaleDateString([], { dateStyle: "medium" })}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Status s={r.status} />
                    <span className="truncate text-[11px] text-faint">
                      · <NameTag userId={r.owner_id} badges={false} />
                      {r.upc ? ` · UPC ${r.upc}` : ""}
                    </span>
                  </div>
                </div>
                {warn > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-idle/15 px-1.5 py-0.5 text-[11px] font-bold text-idle" title="Missing artwork, past release date or a send error">
                    <TriangleAlert className="size-3" /> {warn}
                  </span>
                )}
                <ChevronRight className="size-5 shrink-0 text-sub" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Release sheet (everything you need to re-release it) ───────────────────────── */

function Field({ k, v, mono }: { k: string; v: string | number | null | undefined; mono?: boolean }) {
  const val = v == null || v === "" ? "" : String(v);
  return (
    <div className="flex items-center gap-2 border-b border-line/40 py-1.5 last:border-0">
      <span className="w-32 shrink-0 text-[12px] text-sub">{k}</span>
      <span className={cn("min-w-0 flex-1 truncate text-sm", mono && "font-mono", !val && "text-faint")}>{val || "—"}</span>
      {val && (
        <button onClick={() => copy(val, `${k} copied`)} className="rounded-md p-1 text-sub hover:bg-hover hover:text-txt" aria-label={`Copy ${k}`}>
          <Copy className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const panel = "rounded-2xl bg-side p-3 ring-1 ring-line/60 sm:p-4";
const inp = "min-w-0 w-full rounded-lg bg-black/25 px-3 py-2 text-sm outline-none ring-1 ring-line/60 focus:ring-accent";

export function ReleaseSheet({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [r, setR] = useState<DistRelease | null>(null);
  const [tracks, setTracks] = useState<DistTrack[]>([]);
  const [checks, setChecks] = useState<Record<string, AudioCheck>>({});
  const [src, setSrc] = useState<Record<string, string>>({});
  const [lyricsOpen, setLyricsOpen] = useState<string | null>(null);
  const [zip, setZip] = useState<string | null>(null);
  const [dims, setDims] = useState<string | null>(null);
  const profiles = useApp((s) => s.profiles);
  const cover = useCover(r?.artwork_path);

  const load = useCallback(async () => {
    const x = await getRelease(id);
    setR(x.release);
    setTracks(x.tracks);
    void latestChecks("track", x.tracks.map((t) => t.id)).then(setChecks);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!r) return <p className="text-sub">Loading…</p>;
  const owner = profiles[r.owner_id];
  const baseName = safeName(`${r.primary_artist_name} - ${r.title}`);

  const downloadCover = async () => {
    const u = await distFileUrl(r.artwork_path, { download: `${baseName} (cover).${ext(r.artwork_path, "jpg")}` });
    if (u) window.location.href = u;
  };
  const downloadTrack = async (t: DistTrack, i: number) => {
    const u = await distFileUrl(t.audio_path, { download: `${String(i + 1).padStart(2, "0")} ${safeName(t.title)}.${ext(t.audio_name ?? t.audio_path, "wav")}` });
    if (u) window.location.href = u;
  };
  const downloadAll = async () => {
    try {
      setZip("Preparing…");
      const entries: { name: string; data: Blob | string }[] = [];
      if (r.artwork_path) {
        setZip("Cover…");
        entries.push({ name: `${baseName}/cover.${ext(r.artwork_path, "jpg")}`, data: await distFileBlob(r.artwork_path) });
      }
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (!t.audio_path) continue;
        setZip(`Audio ${i + 1}/${tracks.length}…`);
        entries.push({ name: `${baseName}/${String(i + 1).padStart(2, "0")} ${safeName(t.title)}.${ext(t.audio_name ?? t.audio_path, "wav")}`, data: await distFileBlob(t.audio_path) });
        if (t.lyrics) entries.push({ name: `${baseName}/lyrics/${String(i + 1).padStart(2, "0")} ${safeName(t.title)}.txt`, data: t.lyrics });
      }
      entries.push({ name: `${baseName}/metadata.txt`, data: metadataText(r, tracks, owner ? `${owner.display_name} (@${owner.username})` : undefined) });
      entries.push({ name: `${baseName}/metadata.csv`, data: metadataCsv(r, tracks) });
      setZip("Zipping…");
      const blob = await makeZip(entries);
      saveBlob(blob, `${baseName}.zip`);
      toast("Release pack downloaded", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setZip(null);
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-sub hover:text-txt">
        <ArrowLeft className="size-4" /> Manage releases
      </button>

      {/* header */}
      <div className={cn(panel, "flex flex-col gap-4 sm:flex-row")}>
        <div className="w-full shrink-0 sm:w-56">
          <div className="aspect-square overflow-hidden rounded-xl bg-black/30">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="Cover" className="size-full object-cover" onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} />
            ) : (
              <div className="grid size-full place-items-center text-sm text-faint">{r.artwork_path ? "Loading…" : "No artwork"}</div>
            )}
          </div>
          {r.artwork_path && (
            <div className="mt-2 flex gap-1.5">
              <button onClick={() => void downloadCover()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white">
                <Download className="size-4" /> Cover
              </button>
              {cover && (
                <a href={cover} target="_blank" rel="noreferrer" className="grid place-items-center rounded-lg bg-hover px-3" aria-label="Open full size">
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          )}
          {dims && <div className={cn("mt-1 text-center text-[11px]", dims.startsWith("3000") ? "text-ok" : "text-idle")}>{dims}px{dims.startsWith("3000") ? " ✓" : " · stores want 3000×3000"}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-black leading-tight">{r.title}</h2>
              <div className="text-sub">
                {r.primary_artist_name} · {r.release_type} · {tracks.length} track{tracks.length === 1 ? "" : "s"}
              </div>
            </div>
            <Status s={r.status} />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-sub">
            <Avatar userId={r.owner_id} size={16} plain /> <NameTag userId={r.owner_id} badges={false} />
            {r.submitted_at && <span>· submitted {new Date(r.submitted_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>}
          </div>
          {(r.staff_note || r.rejection_reason || r.last_error) && (
            <div className="mt-2 rounded-lg bg-idle/10 p-2 text-[13px] text-idle">{r.last_error ?? r.rejection_reason ?? r.staff_note}</div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={!!zip} onClick={() => void downloadAll()} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {zip ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />} {zip ?? "Download everything (.zip)"}
            </button>
            <button onClick={() => copy(metadataText(r, tracks, owner ? `${owner.display_name} (@${owner.username})` : undefined), "All metadata copied")} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
              <Copy className="size-4" /> Copy all metadata
            </button>
          </div>
          <p className="mt-2 text-[11px] text-faint">The zip has the cover, every audio file, lyrics, metadata.txt and metadata.csv — everything to create it in Too Lost.</p>
        </div>
      </div>

      {/* release metadata */}
      <div className={panel}>
        <div className="mb-1 text-xs font-bold tracking-wide text-sub uppercase">Release</div>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <div>
            <Field k="Title" v={r.title} />
            <Field k="Primary artist" v={r.primary_artist_name} />
            <Field k="Release type" v={r.release_type} />
            <Field k="Primary genre" v={r.primary_genre} />
            <Field k="Secondary genre" v={r.secondary_genre} />
            <Field k="Release date" v={r.release_date} />
            <Field k="Label" v={r.label_name} />
          </div>
          <div>
            <Field k="Language" v={r.language} />
            <Field k="Explicit" v={r.explicit ? "Yes" : "No"} />
            <Field k="℗ / © line" v={`${r.copyright_year ?? ""} ${r.copyright_holder ?? ""}`.trim()} />
            <Field k="Territories" v={`${r.territories_include}${r.territories_exclude ? ` (not ${r.territories_exclude})` : ""}`} />
            <Field k="UPC" v={r.upc} mono />
            <Field k="Distributor" v={r.distributor ? `${r.distributor}${r.distributor_ref ? ` · ${r.distributor_ref}` : ""}` : ""} />
            <Field k="Nexus ID" v={r.id} mono />
          </div>
        </div>
        {Object.keys(r.store_links ?? {}).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(r.store_links ?? {}).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold hover:bg-black/40">
                <ExternalLink className="size-3" /> {storeLabel(k)}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* tracks */}
      <div className={panel}>
        <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Tracks</div>
        <div className="space-y-3">
          {tracks.map((t, i) => (
            <div key={t.id} className="rounded-xl bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-black/30 text-xs font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{t.title}</span>
                {t.explicit && <span className="rounded bg-white/15 px-1 text-[10px] font-black">E</span>}
                {checks[t.id] ? <CheckPill c={checks[t.id]} /> : <span className="text-[11px] text-faint">not copyright-checked</span>}
              </div>
              <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                <div>
                  <Field k="Artist" v={t.primary_artist_name || r.primary_artist_name} />
                  <Field k="Featured" v={t.featured_artist_names} />
                  <Field k="ISRC" v={t.isrc} mono />
                  <Field k="Duration" v={fmtDur(t.duration)} />
                  <Field k="BPM · key" v={[t.bpm, t.musical_key].filter(Boolean).join(" · ")} />
                  <Field k="Language" v={t.language || r.language} />
                </div>
                <div>
                  <Field k="Songwriter" v={t.songwriter} />
                  <Field k="Composer" v={t.composer} />
                  <Field k="Lyricist" v={t.lyricist} />
                  <Field k="Producer" v={t.producer} />
                  <Field k="Mix · master" v={[t.mixer, t.mastering_engineer].filter(Boolean).join(" · ")} />
                  <Field k="Publisher" v={t.publisher} />
                </div>
              </div>
              {t.splits?.length ? <div className="mt-1 text-[12px] text-sub">Splits: {t.splits.map((s) => `${s.name} (${s.role}) ${s.share}%`).join(" · ")}</div> : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-auto min-w-0 truncate text-[12px] text-sub">
                  {t.audio_name ?? "No audio"} {fmtBytes(t.audio_bytes)}
                </span>
                {t.audio_path && (
                  <>
                    <button onClick={async () => setSrc({ ...src, [t.id]: (await distFileUrl(t.audio_path)) ?? "" })} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold">
                      <Play className="size-3.5" /> Listen
                    </button>
                    <button
                      onClick={async () => {
                        const u = await distFileUrl(t.audio_path, { days: 7 });
                        if (u) copy(u, "Song link copied (valid 7 days)");
                      }}
                      className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold"
                    >
                      <Link2 className="size-3.5" /> Copy song link
                    </button>
                    <button onClick={() => void downloadTrack(t, i)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white">
                      <Download className="size-3.5" /> Download
                    </button>
                  </>
                )}
              </div>
              {src[t.id] && <audio src={src[t.id]} controls autoPlay className="mt-2 w-full" />}
              {t.lyrics && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setLyricsOpen(lyricsOpen === t.id ? null : t.id)} className="text-xs font-semibold text-accent">
                      {lyricsOpen === t.id ? "Hide lyrics" : "Show lyrics"}
                    </button>
                    <button onClick={() => copy(t.lyrics!, "Lyrics copied")} className="text-xs font-semibold text-sub hover:text-txt">
                      Copy lyrics
                    </button>
                  </div>
                  {lyricsOpen === t.id && <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-black/30 p-2 text-[13px] whitespace-pre-wrap">{t.lyrics}</pre>}
                </div>
              )}
            </div>
          ))}
          {tracks.length === 0 && <p className="text-sm text-sub">No tracks.</p>}
        </div>
      </div>

      <ReviewActions r={r} tracks={tracks} onDone={() => void load().then(onChanged)} />
    </div>
  );
}

/* ───────────────────────── approve (mark released) / reject ───────────────────────── */

function ReviewActions({ r, tracks, onDone }: { r: DistRelease; tracks: DistTrack[]; onDone: () => void }) {
  const [distributor, setDistributor] = useState(r.distributor || "Too Lost");
  const [ref, setRef] = useState(r.distributor_ref ?? "");
  const [upc, setUpc] = useState(r.upc ?? "");
  const [isrcs, setIsrcs] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>(r.store_links ?? {});
  const [status, setStatus] = useState<"pending" | "approved" | "live">(r.status === "live" ? "live" : "approved");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<SendProgress | null>(null);
  useEffect(() => setIsrcs(Object.fromEntries(tracks.map((t) => [t.id, t.isrc ?? ""]))), [tracks]);

  const save = async () => {
    setBusy(true);
    const ok = await markReleaseDelivered(r.id, { status, distributor, ref, upc: upc.replace(/\D/g, ""), isrcs, links });
    setBusy(false);
    if (ok) onDone();
  };
  const decide = async (d: "reject" | "changes") => {
    setBusy(true);
    const ok = await decideRelease(r.id, d, note);
    setBusy(false);
    if (ok) {
      setNote("");
      onDone();
    }
  };

  return (
    <>
      <div className={panel}>
        <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-sub uppercase">
          <Check className="size-4 text-ok" /> Approve — released in your distributor
        </div>
        <p className="mb-3 text-[12px] text-sub">Create it in Too Lost with the files above, then paste the UPC, ISRCs and links here. The artist gets a Nexus Bot message with everything.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-sub">
            Distributor
            <select value={["Too Lost", "Tunearo", "Believe", "FUGA", "ONErpm"].includes(distributor) ? distributor : "Other"} onChange={(e) => setDistributor(e.target.value === "Other" ? "" : e.target.value)} className={cn(inp, "mt-0.5")}>
              {["Too Lost", "Tunearo", "Believe", "FUGA", "ONErpm", "Other"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-sub">
            Distributor release ID
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="optional" className={cn(inp, "mt-0.5")} />
          </label>
          <label className="text-[11px] text-sub">
            UPC
            <input value={upc} onChange={(e) => setUpc(e.target.value.replace(/[^\d]/g, "").slice(0, 14))} placeholder="12–14 digits" inputMode="numeric" className={cn(inp, "mt-0.5 font-mono")} />
          </label>
        </div>
        {!["Too Lost", "Tunearo", "Believe", "FUGA", "ONErpm"].includes(distributor) && (
          <input value={distributor} onChange={(e) => setDistributor(e.target.value.slice(0, 40))} placeholder="Distributor name" className={cn(inp, "mt-2")} />
        )}
        {tracks.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-bold text-sub uppercase">ISRCs</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {tracks.map((t, i) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right text-sub">{i + 1}</span>
                  <span className="w-28 truncate text-sub">{t.title}</span>
                  <input value={isrcs[t.id] ?? ""} onChange={(e) => setIsrcs({ ...isrcs, [t.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 15) })} placeholder="CC-XXX-YY-NNNNN" className={cn(inp, "font-mono")} />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-bold text-sub uppercase">Store links</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {STORE_FIELDS.map(([k, label]) => (
              <input key={k} value={links[k] ?? ""} onChange={(e) => setLinks({ ...links, [k]: e.target.value.trim() })} placeholder={`${label} — https://…`} className={inp} />
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["pending", "Sent · distributor review"],
              ["approved", "Approved · delivering"],
              ["live", "Live in stores"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", status === v ? "bg-ok text-white" : "bg-black/25 text-sub")}>
              {l}
            </button>
          ))}
        </div>
        <button disabled={busy} onClick={() => void save()} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-ok py-3 font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save & notify artist
        </button>
      </div>

      <div className={panel}>
        <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Reject or request changes</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1500))} placeholder="Reason the artist will see (e.g. cover has a URL, audio clips at 0:42, wrong genre)…" className={cn(inp, "min-h-20")} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={busy || !note.trim()} onClick={() => void decide("changes")} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active disabled:opacity-40">
            Request changes
          </button>
          <button disabled={busy || !note.trim()} onClick={() => void decide("reject")} className="rounded-full bg-dnd px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            Reject
          </button>
          {["in_review", "error"].includes(r.status) && (
            <button
              disabled={busy || !!prog}
              onClick={async () => {
                if (!confirm(`Send "${r.title}" automatically through Tunearo instead?`)) return;
                try {
                  const res = await approveAndSend(r.id, setProg, r.status === "error");
                  toast(`Sent! Tunearo status: ${res.status}`, "success");
                } catch (e) {
                  toast((e as Error).message, "error");
                }
                setProg(null);
                onDone();
              }}
              className="ml-auto flex items-center gap-1.5 rounded-full bg-black/25 px-4 py-2 text-sm font-semibold text-sub hover:text-txt"
            >
              <Send className="size-4" /> {prog ? prog.step : "Auto-send via Tunearo"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** artist-side: store links + identifiers once an admin records them */
export function StoreLinksCard({ r }: { r: DistRelease }) {
  const links = Object.entries(r.store_links ?? {});
  if (!links.length && !r.upc) return null;
  return (
    <div className={panel}>
      <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Out in stores</div>
      {r.upc && <Field k="UPC" v={r.upc} mono />}
      {r.distributor && <Field k="Distributor" v={r.distributor} />}
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {links.map(([k, v]) => (
            <a key={k} href={v} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-black/25 px-3 py-1.5 text-xs font-semibold hover:bg-black/40">
              <ExternalLink className="size-3" /> {storeLabel(k)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
