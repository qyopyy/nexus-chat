"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import type { DistArtist, DistRelease, DistStatus, DistTrack } from "./types";

export const GENRES = [
  "Hip-Hop/Rap",
  "R&B/Soul",
  "Pop",
  "Electronic",
  "Dance",
  "House",
  "Techno",
  "Drum & Bass",
  "Phonk",
  "Trap",
  "Drill",
  "Afrobeats",
  "Amapiano",
  "Latin",
  "Reggaeton",
  "Brazilian Funk",
  "Rock",
  "Alternative",
  "Indie",
  "Metal",
  "Country",
  "Jazz",
  "Blues",
  "Classical",
  "Soundtrack",
  "Lo-Fi",
  "Ambient",
  "Reggae",
  "Dancehall",
  "K-Pop",
  "World",
  "Gospel",
  "Children's Music",
  "Comedy",
  "Spoken Word",
];

export const LANGUAGES = ["English", "Hungarian", "Spanish", "Portuguese", "French", "German", "Italian", "Russian", "Arabic", "Hindi", "Japanese", "Korean", "Chinese", "Turkish", "Polish", "Romanian", "Instrumental"];

export const STATUS_INFO: Record<DistStatus, { label: string; color: string; hint: string }> = {
  draft: { label: "Draft", color: "#80848e", hint: "Only you can see it" },
  in_review: { label: "In review", color: "#f0b232", hint: "Waiting for an admin to check it" },
  changes_requested: { label: "Changes needed", color: "#f0b232", hint: "An admin asked for fixes" },
  sending: { label: "Sending", color: "#5865f2", hint: "Uploading to the distributor" },
  pending: { label: "Distributor review", color: "#5865f2", hint: "Tunearo is reviewing it" },
  approved: { label: "Approved", color: "#2aabee", hint: "Delivering to stores" },
  rejected: { label: "Rejected", color: "#ed4245", hint: "Fix the issues and resubmit" },
  live: { label: "Live", color: "#23a55a", hint: "Out on Spotify, Apple Music & more" },
  takedown_requested: { label: "Takedown requested", color: "#f0b232", hint: "Being removed from stores" },
  taken_down: { label: "Taken down", color: "#80848e", hint: "Removed from all stores" },
  error: { label: "Send failed", color: "#ed4245", hint: "An admin needs to retry" },
};

export const editable = (r: Pick<DistRelease, "status">) => ["draft", "changes_requested", "rejected"].includes(r.status);

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>, ok?: string): Promise<T | null> {
  const { data, error } = await p;
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  if (ok) toast(ok, "success");
  return data;
}

// ------------------------------------------------------------------ releases
export async function listReleases(all = false): Promise<DistRelease[]> {
  const me = useApp.getState().userId;
  let query = supabase.from("dist_releases").select("*").order("updated_at", { ascending: false }).limit(500);
  if (!all) query = query.eq("owner_id", me);
  const data = (await q(query)) as DistRelease[] | null;
  void loadProfiles([...new Set((data ?? []).map((r) => r.owner_id))]);
  return data ?? [];
}

export async function getRelease(id: string) {
  const [{ data: r }, { data: t }] = await Promise.all([
    supabase.from("dist_releases").select("*").eq("id", id).maybeSingle(),
    supabase.from("dist_tracks").select("*").eq("release_id", id).order("position"),
  ]);
  return { release: (r as DistRelease) ?? null, tracks: (t ?? []) as DistTrack[] };
}

export async function createRelease(init: Partial<DistRelease>) {
  const me = useApp.getState().userId!;
  const p = useApp.getState().profiles[me];
  return (await q(
    supabase
      .from("dist_releases")
      .insert({
        owner_id: me,
        title: init.title || "Untitled release",
        primary_artist_name: init.primary_artist_name || p?.display_name || "Artist",
        release_type: init.release_type ?? "Single",
        copyright_year: new Date().getFullYear(),
        copyright_holder: init.copyright_holder ?? "Audia Music Recordings",
        ...init,
      })
      .select()
      .single(),
  )) as DistRelease | null;
}

export async function saveRelease(id: string, patch: Partial<DistRelease>) {
  return (await q(supabase.from("dist_releases").update(patch).eq("id", id).select().single())) as DistRelease | null;
}

export async function deleteRelease(id: string) {
  return !!(await q(supabase.from("dist_releases").delete().eq("id", id).select(), "Release deleted"));
}

export async function submitRelease(id: string) {
  return (await q(supabase.rpc("submit_release", { p_release: id }), "Sent for review — you'll see the status here")) !== null;
}
export async function withdrawRelease(id: string) {
  return (await q(supabase.rpc("withdraw_release", { p_release: id }), "Withdrawn")) !== null;
}
export async function requestChanges(id: string, note: string) {
  return (await q(supabase.rpc("review_release", { p_release: id, p_note: note }), "Sent back to the artist")) !== null;
}

/** admin: released in your own distributor portal (e.g. Too Lost) → record identifiers + links, DM the artist */
export async function markReleaseDelivered(
  id: string,
  o: { status: "pending" | "approved" | "live"; distributor: string; ref?: string; upc?: string; isrcs?: Record<string, string>; links?: Record<string, string> },
) {
  return (
    (await q(
      supabase.rpc("admin_mark_release_delivered", {
        p_release: id,
        p_status: o.status,
        p_distributor: o.distributor,
        p_ref: o.ref || null,
        p_upc: o.upc || null,
        p_isrcs: o.isrcs ?? {},
        p_links: o.links ?? {},
      }),
      o.status === "live" ? "Marked live — the artist got a message" : "Approved — the artist got a message",
    )) !== null
  );
}
/** admin: reject or request changes with a reason (artist gets a Nexus Bot DM) */
export async function decideRelease(id: string, decision: "reject" | "changes", note: string) {
  return (await q(supabase.rpc("admin_decide_release", { p_release: id, p_decision: decision, p_note: note }), decision === "reject" ? "Rejected — the artist got a message" : "Sent back with your notes")) !== null;
}

// ------------------------------------------------------------------ tracks
export async function addTrack(releaseId: string, position: number, title: string) {
  return (await q(supabase.from("dist_tracks").insert({ release_id: releaseId, position, title }).select().single())) as DistTrack | null;
}
export async function saveTrack(id: string, patch: Partial<DistTrack>) {
  return (await q(supabase.from("dist_tracks").update(patch).eq("id", id).select().single())) as DistTrack | null;
}
export async function deleteTrack(id: string) {
  return !!(await q(supabase.from("dist_tracks").delete().eq("id", id).select()));
}

// ------------------------------------------------------------------ artists
export async function listArtists(): Promise<DistArtist[]> {
  const me = useApp.getState().userId;
  return ((await q(supabase.from("dist_artists").select("*").eq("owner_id", me).order("name"))) as DistArtist[] | null) ?? [];
}
export async function createArtist(a: Partial<DistArtist>) {
  const me = useApp.getState().userId!;
  return (await q(supabase.from("dist_artists").insert({ owner_id: me, name: a.name, spotify_id: a.spotify_id || null, apple_id: a.apple_id || null, bio: a.bio || null }).select().single(), "Artist added")) as DistArtist | null;
}

// ------------------------------------------------------------------ files (private bucket dist-files/<owner>/<release>/...)
export async function uploadDistFile(releaseId: string, file: File, kind: "artwork" | "audio", onProgress?: (p: number) => void) {
  const me = useApp.getState().userId!;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const path = `${me}/${releaseId}/${kind}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const ct = kind === "artwork" ? (ext === "png" ? "image/png" : "image/jpeg") : ext === "flac" ? "audio/flac" : "audio/wav";
  const { data: s } = await supabase.auth.getSession();
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/dist-files/${path}`;
  const ok = await xhrPut(url, file, { Authorization: `Bearer ${s.session?.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "Content-Type": ct, "x-upsert": "true" }, onProgress, "POST");
  if (!ok.ok) {
    toast(`Upload failed: ${ok.error}`, "error");
    return null;
  }
  return path;
}

export async function distFileUrl(path: string | null | undefined, opts?: { download?: string; days?: number }) {
  if (!path) return null;
  const ttl = opts?.days ? Math.min(7, opts.days) * 86_400 : 3600;
  const { data } = await supabase.storage.from("dist-files").createSignedUrl(path, ttl, opts?.download ? { download: opts.download } : undefined);
  return data?.signedUrl ?? null;
}
export async function distFileBlob(path: string) {
  const { data, error } = await supabase.storage.from("dist-files").download(path);
  if (error || !data) throw new Error(errorText(error) || "Download failed");
  return data;
}

/** XHR so we get upload progress (fetch can't report it) */
function xhrPut(url: string, body: Blob, headers: Record<string, string>, onProgress?: (p: number) => void, method = "PUT"): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => resolve(x.status < 300 ? { ok: true } : { ok: false, error: `${x.status} ${x.responseText.slice(0, 160)}` });
    x.onerror = () => resolve({ ok: false, error: "network error" });
    x.send(body);
  });
}

// ------------------------------------------------------------------ Tunearo bridge
export async function tunearo<T = any>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("tunearo", { body: { action, ...args } });
  if (error) {
    let msg = errorText(error);
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return data as T;
}

export type SendProgress = { step: string; done: number; total: number };

/**
 * Admin approves → push to Tunearo:
 *   prepare (server creates artist/release/tracks, returns pre-signed URLs)
 *   → this browser streams artwork + audio from our private bucket to Tunearo's storage
 *   → finalize (server saves artwork path and submits the release)
 */
export async function approveAndSend(releaseId: string, onProgress: (p: SendProgress) => void, resendAudio = false) {
  onProgress({ step: "Creating release on Tunearo…", done: 0, total: 1 });
  const prep = await tunearo<{
    tunearo_id: string;
    artwork: { source: string; upload_url: string; content_type: string; path: string };
    uploads: { track_id: string; title: string; source: string; upload_url: string; content_type: string; path: string }[];
  }>("prepare", { release_id: releaseId, resend_audio: resendAudio });

  const jobs = [{ name: "Cover artwork", ...prep.artwork, track_id: null as string | null }, ...prep.uploads.map((u) => ({ name: u.title, ...u }))];
  const sent: string[] = [];
  try {
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      onProgress({ step: `Downloading ${j.name}…`, done: i, total: jobs.length });
      const blob = await fetch(j.source).then((r) => {
        if (!r.ok) throw new Error(`Couldn't read ${j.name} (${r.status})`);
        return r.blob();
      });
      if (j.track_id) {
        onProgress({ step: `Shield check: ${j.name}…`, done: i, total: jobs.length });
        const { shieldCheck } = await import("./shield");
        const owner = (await supabase.from("dist_releases").select("owner_id").eq("id", releaseId).maybeSingle()).data?.owner_id as string | undefined;
        const hit = await shieldCheck(new File([blob], j.name, { type: j.content_type }), "release", owner);
        if (hit) throw new Error(`“${j.name}” matches “${hit.title}”, a song protected by Nexus Shield. It can't be distributed until its owner unlocks it.`);
      }
      const res = await xhrPut(j.upload_url, blob, { "Content-Type": j.content_type, "x-upsert": "true" }, (p) =>
        onProgress({ step: `Uploading ${j.name} — ${Math.round(p * 100)}%`, done: i + p, total: jobs.length }),
      );
      if (!res.ok) throw new Error(`${j.name}: ${res.error}`);
      if (j.track_id) sent.push(j.track_id);
    }
  } catch (e) {
    await tunearo("fail", { release_id: releaseId, message: (e as Error).message }).catch(() => null);
    throw e;
  }
  onProgress({ step: "Submitting to Tunearo…", done: jobs.length, total: jobs.length });
  return tunearo<{ status: string }>("finalize", { release_id: releaseId, artwork_path: prep.artwork.path, sent_tracks: sent });
}

// ------------------------------------------------------------------ ISRC helper (your registrant prefix)
/** CC-XXX-YY-NNNNN → e.g. QT6HV + 26 + 00042 */
export function makeIsrc(prefix: string, year: number, n: number) {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return `${p}${String(year % 100).padStart(2, "0")}${String(n).padStart(5, "0")}`;
}
export const isrcValid = (s: string) => /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(s);

/** read WAV/FLAC length locally (for display) */
export function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    const url = URL.createObjectURL(file);
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? a.duration : null);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    a.src = url;
  });
}

/** check cover art: square, ≥ 1400px (3000×3000 recommended) */
export function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ w: 0, h: 0 });
    };
    img.src = url;
  });
}
