"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert, ArrowDown, ArrowLeft, ArrowUp, CircleCheck, Disc3, FileAudio, ImagePlus, Plus, RefreshCw, Send, Trash2, Upload, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useStudio } from "@/store/studio";
import {
  addTrack,
  approveAndSend,
  audioDuration,
  createArtist,
  createRelease,
  deleteRelease,
  deleteTrack,
  distFileUrl,
  editable,
  GENRES,
  getRelease,
  imageSize,
  isrcValid,
  LANGUAGES,
  listArtists,
  listReleases,
  makeIsrc,
  requestChanges,
  saveRelease,
  saveTrack,
  STATUS_INFO,
  submitRelease,
  tunearo,
  uploadDistFile,
  withdrawRelease,
  type SendProgress,
} from "@/lib/dist";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { Card, H, StatusPill } from "./Studio";
import type { DistArtist, DistRelease, DistTrack } from "@/lib/types";

// ------------------------------------------------------------------ list
export function Releases() {
  const releaseId = useStudio((s) => s.releaseId);
  if (releaseId) return <ReleaseEditor id={releaseId} />;
  return <ReleaseList />;
}

function Artwork({ path, className }: { path: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void distFileUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <div className={cn("grid aspect-square shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30", className)}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Disc3 className="size-1/3 text-sub" />}
    </div>
  );
}

function ReleaseList() {
  const [rows, setRows] = useState<DistRelease[] | null>(null);
  useEffect(() => {
    void listReleases().then(setRows);
    void tunearo("sync").catch(() => null).then(() => listReleases().then(setRows));
  }, []);
  return (
    <>
      <H
        right={
          <button onClick={() => useStudio.setState({ releaseId: "new" })} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
            <Plus className="size-4" /> New release
          </button>
        }
      >
        Music releases
      </H>
      <p className="-mt-3 mb-5 text-sm text-sub">Distribute to Spotify, Apple Music, TikTok, YouTube Music, Amazon, Deezer and 150+ stores via Tunearo. An admin reviews every release before it&apos;s sent.</p>
      {rows === null ? (
        <p className="text-sub">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Disc3 className="size-12 text-sub" />
          <div className="font-semibold">No releases yet</div>
          <button onClick={() => useStudio.setState({ releaseId: "new" })} className="rounded-full bg-accent px-5 py-2 font-semibold text-white">
            Create your first release
          </button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <button key={r.id} onClick={() => useStudio.setState({ releaseId: r.id })} className="flex gap-3 rounded-2xl border border-line/70 bg-side p-3 text-left transition hover:border-sub">
              <Artwork path={r.artwork_path} className="w-20" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.title}</div>
                <div className="truncate text-sm text-sub">{r.primary_artist_name}</div>
                <div className="mt-0.5 text-xs text-sub">
                  {r.release_type} · {new Date(r.release_date).toLocaleDateString([], { dateStyle: "medium" })}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusPill status={r.status} />
                  {r.upc && <span className="font-mono text-[11px] text-sub">UPC {r.upc}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ editor
function ReleaseEditor({ id }: { id: string }) {
  const me = useApp((s) => s.userId)!;
  const [r, setR] = useState<DistRelease | null>(null);
  const [tracks, setTracks] = useState<DistTrack[]>([]);
  const [artists, setArtists] = useState<DistArtist[]>([]);
  const [busy, setBusy] = useState(false);
  const [artProgress, setArtProgress] = useState<number | null>(null);
  const [artInfo, setArtInfo] = useState<string | null>(null);
  const artRef = useRef<HTMLInputElement>(null);
  const creating = useRef(false);

  const load = useCallback(async (rid: string) => {
    const { release, tracks } = await getRelease(rid);
    setR(release);
    setTracks(tracks);
  }, []);

  useEffect(() => {
    void listArtists().then(setArtists);
    if (id === "new") {
      if (creating.current) return;
      creating.current = true;
      void createRelease({}).then((x) => {
        if (x) useStudio.setState({ releaseId: x.id });
      });
    } else void load(id);
  }, [id, load]);

  if (!r) return <p className="text-sub">Loading…</p>;
  const canEdit = r.owner_id === me && editable(r);
  const set = (patch: Partial<DistRelease>) => setR({ ...r, ...patch });
  const persist = async (patch: Partial<DistRelease>) => {
    if (!canEdit) return;
    const x = await saveRelease(r.id, patch);
    if (x) setR(x);
  };
  const info = STATUS_INFO[r.status];
  const today = new Date().toISOString().slice(0, 10);

  const missing: string[] = [];
  if (!r.artwork_path) missing.push("Cover artwork");
  if (!tracks.length) missing.push("At least one track");
  if (tracks.some((t) => !t.audio_path)) missing.push("Audio for every track");
  if (r.release_type === "Single" && tracks.length > 3) missing.push("Singles have up to 3 tracks");
  if (r.release_date < today) missing.push("Release date in the future");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => useStudio.setState({ releaseId: null })} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to releases">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{r.title}</h1>
        <StatusPill status={r.status} />
      </div>

      {(r.staff_note && r.status === "changes_requested") || (r.rejection_reason && r.status === "rejected") || (r.last_error && r.status === "error") ? (
        <div className="flex gap-3 rounded-xl bg-idle/10 p-3 text-sm ring-1 ring-idle/30">
          <TriangleAlert className="size-5 shrink-0 text-idle" />
          <div>
            <div className="font-semibold text-idle">{r.status === "rejected" ? "Rejected by the distributor" : r.status === "error" ? "Sending failed" : "Changes requested by an admin"}</div>
            <div className="whitespace-pre-wrap">{r.status === "rejected" ? r.rejection_reason : r.status === "error" ? r.last_error : r.staff_note}</div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-sub">
          {info.label}: {info.hint}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* artwork */}
        <Card title="Cover artwork">
          <button disabled={!canEdit} onClick={() => artRef.current?.click()} className="relative block w-full">
            <Artwork path={r.artwork_path} className="w-full rounded-xl" />
            {canEdit && (
              <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/0 text-sm font-semibold text-white opacity-0 transition hover:bg-black/50 hover:opacity-100">
                <span className="flex items-center gap-1.5">
                  <ImagePlus className="size-4" /> {r.artwork_path ? "Replace" : "Upload"}
                </span>
              </span>
            )}
            {artProgress !== null && (
              <span className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-black/60">
                <span className="block h-full bg-accent" style={{ width: `${artProgress * 100}%` }} />
              </span>
            )}
          </button>
          <input
            ref={artRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const { w, h } = await imageSize(f);
              if (w !== h) return toast(`Artwork must be square (yours is ${w}×${h})`, "error");
              if (w < 1400) return toast(`Artwork must be at least 1400×1400 (yours is ${w}×${h}); 3000×3000 is best`, "error");
              setArtInfo(`${w}×${h} ${f.type === "image/png" ? "PNG" : "JPG"}`);
              setArtProgress(0);
              const path = await uploadDistFile(r.id, f, "artwork", setArtProgress);
              setArtProgress(null);
              if (path) await persist({ artwork_path: path });
            }}
          />
          <p className="mt-2 text-xs text-sub">{artInfo ?? "3000×3000 px JPG or PNG, no logos, URLs or blurry images."}</p>
        </Card>

        {/* info */}
        <Card title="Release info">
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
            <In label="Release title" value={r.title} onChange={(v) => set({ title: v })} onBlur={() => void persist({ title: r.title.trim() || "Untitled release" })} />
            <In label="Primary artist" value={r.primary_artist_name} onChange={(v) => set({ primary_artist_name: v })} onBlur={() => void persist({ primary_artist_name: r.primary_artist_name.trim() || "Artist" })} />
            <Sel label="Release type" value={r.release_type} options={["Single", "EP", "Album"]} onChange={(v) => void persist({ release_type: v as DistRelease["release_type"] })} />
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Release date</span>
              <input type="date" value={r.release_date} min={today} onChange={(e) => void persist({ release_date: e.target.value })} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none [color-scheme:dark] focus:border-accent" />
            </label>
            <Sel label="Primary genre" value={r.primary_genre} options={GENRES} onChange={(v) => void persist({ primary_genre: v })} />
            <Sel label="Secondary genre" value={r.secondary_genre ?? ""} options={["", ...GENRES]} onChange={(v) => void persist({ secondary_genre: v || null })} />
            <Sel label="Language" value={r.language ?? "English"} options={LANGUAGES} onChange={(v) => void persist({ language: v })} />
            <In label="Label" value={r.label_name} onChange={(v) => set({ label_name: v })} onBlur={() => void persist({ label_name: r.label_name.trim() || "Self-released" })} />
            <In label="℗ / © year" value={String(r.copyright_year ?? "")} onChange={(v) => set({ copyright_year: Number(v.replace(/\D/g, "").slice(0, 4)) || null })} onBlur={() => void persist({ copyright_year: r.copyright_year })} />
            <In label="℗ / © holder" value={r.copyright_holder ?? ""} onChange={(v) => set({ copyright_holder: v })} onBlur={() => void persist({ copyright_holder: r.copyright_holder?.trim() || null })} />
            <In label="UPC (optional)" value={r.upc ?? ""} placeholder="Leave empty to get one assigned" onChange={(v) => set({ upc: v.replace(/\D/g, "").slice(0, 14) })} onBlur={() => void persist({ upc: r.upc || null })} />
            <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 sm:mt-5">
              <span className="text-sm">Explicit content</span>
              <input type="checkbox" checked={r.explicit} onChange={(e) => void persist({ explicit: e.target.checked })} className="size-4" />
            </label>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs text-sub">Territories</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void persist({ territories_include: "WORLD", territories_exclude: null })} className={cn("rounded-full px-3 py-1.5 text-sm", r.territories_include === "WORLD" && !r.territories_exclude ? "bg-accent text-white" : "bg-black/25")}>
                  Worldwide
                </button>
                <input
                  value={r.territories_exclude ?? ""}
                  onChange={(e) => set({ territories_exclude: e.target.value.toUpperCase().replace(/[^A-Z|]/g, "") })}
                  onBlur={() => void persist({ territories_exclude: r.territories_exclude || null })}
                  placeholder="Exclude e.g. CN|RU"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
          </fieldset>
          <ArtistsPicker r={r} artists={artists} canEdit={canEdit} onArtists={setArtists} onChange={(ids) => void persist({ artist_ids: ids })} />
        </Card>
      </div>

      <Tracks r={r} tracks={tracks} setTracks={setTracks} canEdit={canEdit} />

      {/* actions */}
      <Card>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              {missing.length ? (
                <span className="text-idle">Missing: {missing.join(" · ")}</span>
              ) : (
                <span className="flex items-center gap-1.5 text-ok">
                  <CircleCheck className="size-4" /> Ready to submit
                </span>
              )}
            </div>
            {r.status !== "rejected" && (
              <button
                onClick={async () => {
                  if (confirm("Delete this release draft?") && (await deleteRelease(r.id))) useStudio.setState({ releaseId: null });
                }}
                className="rounded-full px-4 py-2 text-sm font-semibold text-dnd hover:bg-dnd/10"
              >
                Delete
              </button>
            )}
            <button
              disabled={busy || missing.length > 0}
              onClick={async () => {
                setBusy(true);
                if (await submitRelease(r.id)) await load(r.id);
                setBusy(false);
              }}
              className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              <Send className="size-4" /> Submit for review
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 text-sub">
              {r.status === "in_review" ? "Waiting for an admin to review and send it." : r.status === "live" ? `Live${r.upc ? ` · UPC ${r.upc}` : ""}` : info.hint}
            </span>
            {r.owner_id === me && r.status === "in_review" && (
              <button onClick={async () => (await withdrawRelease(r.id)) && void load(r.id)} className="rounded-full bg-hover px-4 py-2 font-semibold hover:bg-active">
                Withdraw
              </button>
            )}
            {r.tunearo_id && (
              <button onClick={async () => (await tunearo("sync", { release_id: r.id }).catch((e: Error) => toast(e.message, "error")), void load(r.id))} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 font-semibold hover:bg-active">
                <RefreshCw className="size-4" /> Refresh status
              </button>
            )}
            {r.status === "live" && (r.owner_id === me || myRank() >= 3) && (
              <button
                onClick={async () => {
                  const reason = prompt("Why should this release be taken down from all stores?");
                  if (!reason) return;
                  try {
                    await tunearo("takedown", { release_id: r.id, reason });
                    toast("Takedown requested", "success");
                    void load(r.id);
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
                className="rounded-full px-4 py-2 font-semibold text-dnd hover:bg-dnd/10"
              >
                Request takedown
              </button>
            )}
          </div>
        )}
      </Card>
      {r.status === "live" && <ReleaseRoyalties id={r.id} />}
    </div>
  );
}

function ArtistsPicker({ r, artists, canEdit, onArtists, onChange }: { r: DistRelease; artists: DistArtist[]; canEdit: boolean; onArtists: (a: DistArtist[]) => void; onChange: (ids: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [spotify, setSpotify] = useState("");
  const [apple, setApple] = useState("");
  const selected = r.artist_ids ?? [];
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-1 text-xs text-sub">Artist profiles on stores (links your Spotify / Apple Music artist pages)</div>
      <div className="flex flex-wrap gap-2">
        {artists.map((a) => {
          const on = selected.includes(a.id);
          return (
            <button
              key={a.id}
              disabled={!canEdit}
              onClick={() => onChange(on ? selected.filter((x) => x !== a.id) : [...selected, a.id])}
              className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-accent bg-accent/15 text-accent" : "border-line text-sub")}
            >
              {on ? "✓ " : ""}
              {a.name}
              {selected[0] === a.id && <span className="ml-1 text-[10px] uppercase">main</span>}
            </button>
          );
        })}
        {canEdit && (
          <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-sm text-sub hover:text-txt">
            <Plus className="size-3.5" /> New artist
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 grid gap-2 rounded-xl bg-black/20 p-3 sm:grid-cols-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artist name" className="rounded-lg bg-black/25 px-3 py-2 text-sm outline-none" />
          <input value={spotify} onChange={(e) => setSpotify(e.target.value)} placeholder="Spotify artist ID or link (optional)" className="rounded-lg bg-black/25 px-3 py-2 text-sm outline-none" />
          <input value={apple} onChange={(e) => setApple(e.target.value)} placeholder="Apple Music ID (optional)" className="rounded-lg bg-black/25 px-3 py-2 text-sm outline-none" />
          <button
            disabled={!name.trim()}
            onClick={async () => {
              const sid = spotify.match(/artist\/([A-Za-z0-9]+)/)?.[1] ?? spotify.trim();
              const aid = apple.match(/(\d{5,})/)?.[1] ?? apple.trim();
              const a = await createArtist({ name: name.trim(), spotify_id: sid || null, apple_id: aid || null });
              if (a) {
                onArtists([...artists, a]);
                onChange([...selected, a.id]);
                setName("");
                setSpotify("");
                setApple("");
                setAdding(false);
              }
            }}
            className="rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-3"
          >
            Add artist
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tracks
const CREDIT_FIELDS: [keyof DistTrack, string][] = [
  ["songwriter", "Songwriter"],
  ["composer", "Composer"],
  ["lyricist", "Lyricist"],
  ["producer", "Producer"],
  ["mixer", "Mixing engineer"],
  ["mastering_engineer", "Mastering engineer"],
  ["publisher", "Publisher"],
  ["remixer", "Remixer"],
];

function Tracks({ r, tracks, setTracks, canEdit }: { r: DistRelease; tracks: DistTrack[]; setTracks: (t: DistTrack[]) => void; canEdit: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const staff = myRank() >= 3;
  const move = async (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= tracks.length) return;
    const a = tracks[i];
    const b = tracks[j];
    const next = [...tracks];
    next[i] = { ...b, position: a.position };
    next[j] = { ...a, position: b.position };
    setTracks(next);
    await saveTrack(a.id, { position: b.position });
    await saveTrack(b.id, { position: a.position });
  };
  return (
    <Card title={`Tracks (${tracks.length})`}>
      <div className="space-y-2">
        {tracks.map((t, i) => (
          <TrackRow
            key={t.id}
            t={t}
            r={r}
            n={i + 1}
            canEdit={canEdit}
            staff={staff}
            open={open === t.id}
            onToggle={() => setOpen(open === t.id ? null : t.id)}
            onChange={(x) => setTracks(tracks.map((y) => (y.id === x.id ? x : y)))}
            onDelete={async () => (await deleteTrack(t.id)) && setTracks(tracks.filter((y) => y.id !== t.id))}
            onUp={i > 0 ? () => void move(i, -1) : undefined}
            onDown={i < tracks.length - 1 ? () => void move(i, 1) : undefined}
          />
        ))}
        {tracks.length === 0 && <p className="text-sm text-sub">Add your songs — WAV or FLAC (16/24-bit, 44.1 kHz or higher).</p>}
      </div>
      {canEdit && (
        <button
          onClick={async () => {
            const t = await addTrack(r.id, (tracks.at(-1)?.position ?? 0) + 1, tracks.length ? `Track ${tracks.length + 1}` : r.title);
            if (t) {
              setTracks([...tracks, t]);
              setOpen(t.id);
            }
          }}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active"
        >
          <Plus className="size-4" /> Add track
        </button>
      )}
    </Card>
  );
}

function TrackRow(props: {
  t: DistTrack;
  r: DistRelease;
  n: number;
  canEdit: boolean;
  staff: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (t: DistTrack) => void;
  onDelete: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { t, r, n, canEdit, staff, open, onToggle, onChange, onDelete, onUp, onDown } = props;
  const [local, setLocal] = useState(t);
  const [progress, setProgress] = useState<number | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setLocal(t), [t]);
  const persist = async (patch: Partial<DistTrack>) => {
    if (!canEdit) return;
    const x = await saveTrack(t.id, patch);
    if (x) onChange(x);
  };
  const field = (k: keyof DistTrack) => ({
    value: (local[k] as string | null) ?? "",
    onChange: (v: string) => setLocal({ ...local, [k]: v }),
    onBlur: () => void persist({ [k]: ((local[k] as string | null) ?? "").trim() || null } as Partial<DistTrack>),
  });

  return (
    <div className="rounded-xl border border-line/70">
      <div className="flex items-center gap-2 p-2.5">
        <span className="w-6 text-center text-sm text-sub tabular-nums">{n}</span>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="truncate font-semibold">{t.title}</div>
          <div className="truncate text-xs text-sub">
            {t.audio_name ? (
              <>
                <FileAudio className="mr-1 inline size-3" />
                {t.audio_name}
                {t.duration ? ` · ${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, "0")}` : ""}
              </>
            ) : (
              <span className="text-idle">No audio yet</span>
            )}
            {t.isrc && <span className="ml-2 font-mono">ISRC {t.isrc}</span>}
            {t.explicit && <span className="ml-2 rounded bg-white/15 px-1 text-[10px]">E</span>}
          </div>
        </button>
        {canEdit && (
          <div className="flex items-center">
            <button onClick={onUp} disabled={!onUp} className="grid size-7 place-items-center rounded text-sub hover:text-txt disabled:opacity-25" aria-label="Move up">
              <ArrowUp className="size-4" />
            </button>
            <button onClick={onDown} disabled={!onDown} className="grid size-7 place-items-center rounded text-sub hover:text-txt disabled:opacity-25" aria-label="Move down">
              <ArrowDown className="size-4" />
            </button>
            <button onClick={() => confirm("Remove this track?") && onDelete()} className="grid size-7 place-items-center rounded text-sub hover:text-dnd" aria-label="Remove track">
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>
      {progress !== null && (
        <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-black/40">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {open && (
        <div className="space-y-3 border-t border-line/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".wav,.flac,audio/wav,audio/x-wav,audio/flac"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (!/\.(wav|flac)$/i.test(f.name)) return toast("Use a WAV or FLAC file (stores don't accept MP3)", "error");
                    const dur = await audioDuration(f);
                    setProgress(0);
                    const path = await uploadDistFile(r.id, f, "audio", setProgress);
                    setProgress(null);
                    if (path) await persist({ audio_path: path, audio_name: f.name.slice(0, 300), audio_bytes: f.size, duration: dur, audio_sent: false });
                  }}
                />
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
                  <Upload className="size-4" /> {t.audio_path ? "Replace audio" : "Upload WAV / FLAC"}
                </button>
              </>
            )}
            {t.audio_path && (
              <button onClick={async () => setSrc(await distFileUrl(t.audio_path))} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
                ▶ Listen
              </button>
            )}
          </div>
          {src && <audio src={src} controls autoPlay className="w-full" />}
          <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
            <In label="Track title" {...field("title")} onBlur={() => void persist({ title: local.title.trim() || "Untitled" })} />
            <In label="Primary artist (if different)" placeholder={r.primary_artist_name} {...field("primary_artist_name")} />
            <In label="Featured artists" placeholder="feat. Artist A, Artist B" {...field("featured_artist_names")} />
            <div>
              <In label="ISRC (optional)" placeholder="Leave empty to get one assigned" {...field("isrc")} onChange={(v) => setLocal({ ...local, isrc: v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })} onBlur={() => {
                const v = (local.isrc ?? "").trim();
                if (v && !isrcValid(v)) return toast("ISRC looks like CC-XXX-YY-NNNNN (12 characters)", "error");
                void persist({ isrc: v || null });
              }} />
              {staff && canEdit && !local.isrc && <IsrcGen onPick={(v) => (setLocal({ ...local, isrc: v }), void persist({ isrc: v }))} />}
            </div>
            <Sel label="Language" value={local.language ?? r.language ?? "English"} options={LANGUAGES} onChange={(v) => void persist({ language: v })} />
            <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 sm:mt-5">
              <span className="text-sm">Explicit</span>
              <input type="checkbox" checked={t.explicit} onChange={(e) => void persist({ explicit: e.target.checked })} className="size-4" />
            </label>
            {CREDIT_FIELDS.map(([k, l]) => (
              <In key={k} label={l} {...field(k)} />
            ))}
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-sub">Lyrics (optional)</span>
              <textarea
                value={local.lyrics ?? ""}
                onChange={(e) => setLocal({ ...local, lyrics: e.target.value })}
                onBlur={() => void persist({ lyrics: local.lyrics?.trim() || null })}
                rows={4}
                className="w-full resize-y rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </fieldset>
        </div>
      )}
    </div>
  );
}

/** admins: next code from your own registrant prefix (kept in this browser) */
function IsrcGen({ onPick }: { onPick: (isrc: string) => void }) {
  const KEY = "nexus:isrc";
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "null") as { prefix: string; next: number } | null;
    } catch {
      return null;
    }
  };
  return (
    <button
      type="button"
      onClick={() => {
        let s = read();
        if (!s) {
          const prefix = prompt("Your ISRC registrant prefix (country + registrant, 5 characters):", "QT6HV");
          if (!prefix) return;
          const start = Number(prompt("Next designation number to use this year (5 digits, must not be used before):", "1"));
          if (!start) return;
          s = { prefix: prefix.toUpperCase(), next: start };
        }
        const code = makeIsrc(s.prefix, new Date().getFullYear(), s.next);
        if (!confirm(`Assign ${code}? Make sure it hasn't been used on another recording.`)) return;
        try {
          localStorage.setItem(KEY, JSON.stringify({ ...s, next: s.next + 1 }));
        } catch {
          /* storage unavailable */
        }
        onPick(code);
      }}
      className="mt-1 text-xs font-semibold text-accent"
    >
      Generate from my prefix
    </button>
  );
}

// ------------------------------------------------------------------ small inputs
function In({ label, value, onChange, onBlur, placeholder }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-sub">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent disabled:opacity-60" />
    </label>
  );
}
function Sel({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-sub">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-line bg-panel px-3 py-2 outline-none focus:border-accent disabled:opacity-60">
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}

// ------------------------------------------------------------------ review queue (admins)
export function ReviewQueue() {
  const [rows, setRows] = useState<DistRelease[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => void listReleases(true).then((l) => setRows(l)), []);
  useEffect(load, [load]);
  const queue = (rows ?? []).filter((r) => ["in_review", "error", "sending"].includes(r.status));
  const sent = (rows ?? []).filter((r) => ["pending", "approved", "live", "rejected", "takedown_requested", "taken_down"].includes(r.status)).slice(0, 30);
  return (
    <>
      <H
        right={
          <button
            onClick={async () => {
              try {
                await tunearo("sync");
                toast("Statuses refreshed", "success");
                load();
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
            className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active"
          >
            <RefreshCw className="size-4" /> Sync with Tunearo
          </button>
        }
      >
        Review queue
      </H>
      {rows === null ? (
        <p className="text-sub">Loading…</p>
      ) : queue.length === 0 ? (
        <Card className="py-10 text-center text-sub">Nothing waiting for review 🎉</Card>
      ) : (
        <div className="space-y-3">
          {queue.map((r) => (
            <ReviewItem key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onDone={load} />
          ))}
        </div>
      )}
      {sent.length > 0 && (
        <Card title="Recently sent" className="mt-6">
          <div className="space-y-1">
            {sent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg p-1.5">
                <Artwork path={r.artwork_path} className="w-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.title}</div>
                  <div className="truncate text-xs text-sub">
                    {r.primary_artist_name} · by <NameTag userId={r.owner_id} badges={false} />
                  </div>
                </div>
                {r.upc && <span className="hidden font-mono text-xs text-sub sm:block">{r.upc}</span>}
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function ReviewItem({ r, open, onToggle, onDone }: { r: DistRelease; open: boolean; onToggle: () => void; onDone: () => void }) {
  const [tracks, setTracks] = useState<DistTrack[]>([]);
  const [note, setNote] = useState("");
  const [prog, setProg] = useState<SendProgress | null>(null);
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) void getRelease(r.id).then((x) => setTracks(x.tracks));
  }, [open, r.id]);

  const send = async () => {
    if (!confirm(`Approve "${r.title}" and send it to Tunearo for distribution?`)) return;
    try {
      const res = await approveAndSend(r.id, setProg, r.status === "error");
      toast(`Sent! Tunearo status: ${res.status}`, "success");
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
      onDone();
    }
    setProg(null);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line/70 bg-side">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/[.03]">
        <Artwork path={r.artwork_path} className="w-16" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{r.title}</div>
          <div className="truncate text-sm text-sub">
            {r.primary_artist_name} · {r.release_type} · {r.primary_genre} · {new Date(r.release_date).toLocaleDateString([], { dateStyle: "medium" })}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-sub">
            <Avatar userId={r.owner_id} size={16} plain /> <NameTag userId={r.owner_id} badges={false} />
            {r.submitted_at && <span>· submitted {new Date(r.submitted_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>}
          </div>
        </div>
        <StatusPill status={r.status} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line/60 p-3">
          {r.last_error && <div className="rounded-lg bg-dnd/10 p-2.5 text-sm text-dnd">{r.last_error}</div>}
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <KV k="Label" v={r.label_name} />
            <KV k="Language" v={r.language ?? "—"} />
            <KV k="℗ / ©" v={`${r.copyright_year ?? ""} ${r.copyright_holder ?? ""}`} />
            <KV k="Explicit" v={r.explicit ? "Yes" : "No"} />
            <KV k="Territories" v={`${r.territories_include}${r.territories_exclude ? ` (not ${r.territories_exclude})` : ""}`} />
            <KV k="UPC" v={r.upc ?? "assign"} />
          </div>
          <div className="space-y-1.5">
            {tracks.map((t, i) => (
              <div key={t.id} className="rounded-lg bg-black/20 p-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-sub">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.title}</span>
                  {t.isrc && <span className="font-mono text-xs text-sub">{t.isrc}</span>}
                  <button onClick={async () => setSrcs({ ...srcs, [t.id]: (await distFileUrl(t.audio_path)) ?? "" })} className="text-xs font-semibold text-accent">
                    ▶ Listen
                  </button>
                </div>
                {srcs[t.id] && <audio src={srcs[t.id]} controls className="mt-1.5 w-full" />}
                <div className="mt-0.5 truncate pl-7 text-xs text-sub">
                  {[t.featured_artist_names, t.songwriter && `songwriter ${t.songwriter}`, t.producer && `prod. ${t.producer}`].filter(Boolean).join(" · ") || "No credits"} · {t.audio_name}
                </div>
              </div>
            ))}
          </div>
          {prog ? (
            <div className="rounded-xl bg-accent/10 p-3">
              <div className="mb-1.5 text-sm font-semibold">{prog.step}</div>
              <div className="h-2 overflow-hidden rounded-full bg-black/40">
                <div className="h-full bg-accent transition-all" style={{ width: `${(prog.done / Math.max(prog.total, 1)) * 100}%` }} />
              </div>
              <div className="mt-1 text-xs text-sub">Keep this tab open until it finishes.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the artist fix? (for Request changes)" className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
              <button
                disabled={!note.trim() || r.status === "sending"}
                onClick={async () => (await requestChanges(r.id, note)) && onDone()}
                className="rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active disabled:opacity-40"
              >
                Request changes
              </button>
              <button onClick={() => void send()} className="flex items-center justify-center gap-1.5 rounded-full bg-ok px-5 py-2 text-sm font-semibold text-white hover:bg-ok/85">
                <Send className="size-4" /> {r.status === "error" ? "Retry sending" : "Approve & send"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-sub">{k}</span>
      <span className="min-w-0 truncate">{v}</span>
    </div>
  );
}

// ------------------------------------------------------------------ royalties
type Roy = {
  currency: string;
  lifetime_earnings: number;
  this_month_earnings: number;
  available_balance?: number | null;
  transaction_count?: number;
  by_source?: { source: string; amount: number }[];
  by_territory?: { territory: string; amount: number }[];
  by_track?: { track_id: string; title: string; amount: number }[];
};
const money = (n: number | null | undefined, c = "GBP") => (n ?? 0).toLocaleString([], { style: "currency", currency: c, maximumFractionDigits: 2 });

export function Royalties() {
  const staff = myRank() >= 3;
  const [account, setAccount] = useState<Roy | null>(null);
  const [rows, setRows] = useState<DistRelease[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void listReleases().then((l) => setRows(l.filter((r) => r.tunearo_id)));
    if (staff)
      void tunearo<Roy>("royalties")
        .then(setAccount)
        .catch((e: Error) => setErr(e.message));
  }, [staff]);
  return (
    <>
      <H>Royalties</H>
      {staff && (
        <Card title="Label account (all releases)" className="mb-4">
          {err ? (
            <p className="text-sm text-sub">{err}</p>
          ) : !account ? (
            <p className="text-sm text-sub">Loading…</p>
          ) : (
            <RoyaltyBody r={account} />
          )}
        </Card>
      )}
      {rows.length === 0 ? (
        <Card className="py-10 text-center text-sub">Royalties show up here once a release is live and stores report streams.</Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <details key={r.id} className="group rounded-2xl border border-line/70 bg-side">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                <Artwork path={r.artwork_path} className="w-12" />
                <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                <StatusPill status={r.status} />
              </summary>
              <div className="border-t border-line/60 p-3">
                <ReleaseRoyalties id={r.id} bare />
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-sub">Figures are what stores reported to the distributor (GBP), not necessarily paid out yet.</p>
    </>
  );
}

function ReleaseRoyalties({ id, bare }: { id: string; bare?: boolean }) {
  const [r, setR] = useState<Roy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void tunearo<Roy>("royalties", { release_id: id })
      .then(setR)
      .catch((e: Error) => setErr(e.message));
  }, [id]);
  const body = err ? <p className="text-sm text-sub">{err}</p> : !r ? <p className="text-sm text-sub">Loading…</p> : <RoyaltyBody r={r} />;
  return bare ? body : <Card title="Royalties">{body}</Card>;
}

function RoyaltyBody({ r }: { r: Roy }) {
  const c = r.currency || "GBP";
  const top = useMemo(() => [...(r.by_source ?? [])].sort((a, b) => b.amount - a.amount), [r]);
  const max = Math.max(0.0001, ...top.map((s) => s.amount));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat k="Lifetime" v={money(r.lifetime_earnings, c)} />
        <Stat k="This month" v={money(r.this_month_earnings, c)} />
        {r.available_balance != null && <Stat k="Available" v={money(r.available_balance, c)} />}
      </div>
      {top.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-sub">By store</div>
          {top.map((s) => (
            <div key={s.source} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate">{s.source}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/30">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(s.amount / max) * 100}%` }} />
              </span>
              <span className="w-20 text-right tabular-nums">{money(s.amount, c)}</span>
            </div>
          ))}
        </div>
      )}
      {!!r.by_track?.length && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-sub">By track</div>
          {r.by_track.map((t) => (
            <div key={t.track_id} className="flex justify-between text-sm">
              <span className="truncate">{t.title}</span>
              <span className="tabular-nums">{money(t.amount, c)}</span>
            </div>
          ))}
        </div>
      )}
      {!!r.by_territory?.length && (
        <div className="text-xs text-sub">
          Top countries:{" "}
          {[...r.by_territory]
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 6)
            .map((t) => `${t.territory} ${money(t.amount, c)}`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="text-xs text-sub">{k}</div>
      <div className="text-xl font-bold tabular-nums">{v}</div>
    </div>
  );
}

// ------------------------------------------------------------------ settings (admins)
export function DistSettings() {
  const [st, setSt] = useState<{ configured: boolean; webhook: boolean } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => void tunearo<{ configured: boolean; webhook: boolean }>("status").then(setSt).catch(() => setSt({ configured: false, webhook: false })), []);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, "success");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <>
      <H>Distribution settings</H>
      <div className="space-y-4">
        <Card title="Tunearo connection">
          <div className="mb-3 flex items-center gap-2 text-sm">
            {st?.configured ? <CircleCheck className="size-5 text-ok" /> : <X className="size-5 text-dnd" />}
            {st === null ? "Checking…" : st.configured ? "Connected with your API key" : "Not connected"}
          </div>
          <p className="mb-2 text-sm text-sub">Paste your key from Tunearo → Admin → Users → API. It's stored on the server only — never in the app or shown again.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => tunearo("set_key", { key }), "Tunearo connected").then(() => setKey(""));
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="tn_live_…" className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
            <button disabled={busy || !key.trim()} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {st?.configured ? "Replace key" : "Connect"}
            </button>
          </form>
        </Card>
        <Card title="Live status updates (webhook)">
          <div className="mb-3 flex items-center gap-2 text-sm">
            {st?.webhook ? <CircleCheck className="size-5 text-ok" /> : <X className="size-5 text-sub" />}
            {st?.webhook ? "Tunearo notifies Nexus when releases are approved, rejected or go live" : "Not registered — statuses update when you press Sync"}
          </div>
          <button disabled={busy || !st?.configured} onClick={() => void run(() => tunearo("register_webhook"), "Webhook registered")} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active disabled:opacity-40">
            {st?.webhook ? "Re-register webhook" : "Register webhook"}
          </button>
        </Card>
        <Card title="Sync">
          <button disabled={busy || !st?.configured} onClick={() => void run(() => tunearo("sync"), "All release statuses refreshed")} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active disabled:opacity-40">
            <RefreshCw className="size-4" /> Sync all releases now
          </button>
        </Card>
      </div>
    </>
  );
}
