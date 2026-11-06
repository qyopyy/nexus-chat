"use client";

// Protection suite: My Vault (+ share links), Content ID claims, Profile Defender, release ↔ Shield 360.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { registerWork, removeWork, type ShieldWork } from "./shield";
import type { DistRelease, DistTrack } from "./types";

const me = () => useApp.getState().userId!;
export const fmtBytes = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(n >= 10737418240 ? 0 : 1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function fnCall<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
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

// ================================================================ My Vault
export type VaultKind = "file" | "master" | "stem" | "demo" | "mix" | "artwork" | "contract" | "video";
export type VaultFile = {
  id: string;
  owner_id: string;
  path: string;
  name: string;
  mime: string | null;
  bytes: number;
  folder: string;
  note: string | null;
  kind?: VaultKind | null;
  duration_ms?: number | null;
  artist?: string | null;
  title?: string | null;
  created_at: string;
  updated_at?: string | null;
};
export type VaultShare = { id: string; file_id: string; token: string; expires_at: string | null; max_downloads: number | null; downloads: number; views: number; pass_hash: string | null; allow_download: boolean; revoked: boolean; last_at: string | null; created_at: string };

export const VAULT_KINDS: { id: VaultKind; label: string; emoji: string }[] = [
  { id: "master", label: "Master", emoji: "💎" },
  { id: "stem", label: "Stem", emoji: "🎚️" },
  { id: "mix", label: "Mix / bounce", emoji: "🎛️" },
  { id: "demo", label: "Demo", emoji: "🎤" },
  { id: "artwork", label: "Artwork", emoji: "🖼️" },
  { id: "contract", label: "Contract / docs", emoji: "📄" },
  { id: "video", label: "Video", emoji: "🎬" },
  { id: "file", label: "Other file", emoji: "📦" },
];

export function guessVaultKind(file: File): VaultKind {
  const m = file.type || "";
  const n = file.name.toLowerCase();
  if (m.startsWith("audio/") || /\.(mp3|wav|flac|aiff?|m4a|ogg|aac)$/i.test(n)) {
    if (/stem|drum|bass|vocal|guitar|synth/i.test(n)) return "stem";
    if (/demo|rough|sketch/i.test(n)) return "demo";
    if (/mix|bounce|instrumental/i.test(n)) return "mix";
    return "master";
  }
  if (m.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(n)) return "video";
  if (m.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(n)) return "artwork";
  if (m.includes("pdf") || /\.(pdf|docx?|txt)$/i.test(n)) return "contract";
  return "file";
}

/** Probe audio/video duration in the browser before/after upload */
export function probeMediaDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    el.preload = "metadata";
    const done = (ms: number | null) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

export function fmtDuration(ms?: number | null) {
  if (!ms || ms < 0) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Sentinel used by vault_limit() for “unlimited” (100 TiB). */
export const VAULT_UNLIMITED_BYTES = 109951162777600;

export async function vaultUsage() {
  const { data } = await supabase.rpc("vault_usage");
  return (data ?? { used: 0, limit: VAULT_UNLIMITED_BYTES, files: 0 }) as { used: number; limit: number; files: number };
}

export function vaultLimitLabel(limit: number) {
  if (limit >= VAULT_UNLIMITED_BYTES * 0.5) return "Unlimited";
  return fmtBytes(limit);
}

export function vaultIsUnlimited(limit: number) {
  return limit >= VAULT_UNLIMITED_BYTES * 0.5;
}
export async function listVault() {
  const { data } = await supabase.from("vault_files").select("*").eq("owner_id", me()).order("created_at", { ascending: false }).limit(2000);
  return (data ?? []) as VaultFile[];
}
export async function uploadVault(
  file: File,
  folder: string,
  onProgress?: (p: number) => void,
  meta?: { kind?: VaultKind; artist?: string; title?: string; note?: string; duration_ms?: number | null },
) {
  const id = crypto.randomUUID();
  let upload: Blob = file;
  let uploadName = file.name;
  let uploadMime = file.type || "application/octet-stream";
  // Media: compress to Full HD 60fps (video) / high-quality image before vault store
  try {
    if (file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) {
      onProgress?.(0.02);
      const { compressVideo, FULL_HD_60 } = await import("./compressMedia");
      const out = await compressVideo(file, { ...FULL_HD_60 });
      upload = out.blob;
      uploadMime = out.mime || "video/mp4";
      uploadName = file.name.replace(/\.[^.]+$/, "") + "." + (out.ext || "mp4");
    } else if (file.type.startsWith("image/") && !/gif$/i.test(file.name)) {
      const { compressImage } = await import("./compressMedia");
      const { blob } = await compressImage(file, 1920, 0.9);
      upload = blob;
      uploadMime = blob.type || "image/jpeg";
      if (!/\.jpe?g$/i.test(uploadName) && uploadMime.includes("jpeg")) uploadName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    }
  } catch {
    upload = file;
    uploadName = file.name;
    uploadMime = file.type || "application/octet-stream";
  }
  const safe = uploadName.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";
  const path = `${me()}/${id}/${safe}`;
  let duration_ms = meta?.duration_ms ?? null;
  if (duration_ms == null && (uploadMime.startsWith("audio/") || uploadMime.startsWith("video/") || file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
    duration_ms = await probeMediaDuration(upload);
  }
  const kind = meta?.kind ?? guessVaultKind(file);
  // register first so the quota is checked before any bytes move
  const { data: row, error } = await supabase
    .from("vault_files")
    .insert({
      id,
      owner_id: me(),
      path,
      name: uploadName.slice(0, 300),
      mime: uploadMime || null,
      bytes: upload.size,
      folder: folder.trim().slice(0, 100),
      kind,
      duration_ms,
      artist: meta?.artist?.trim().slice(0, 120) || null,
      title: meta?.title?.trim().slice(0, 200) || null,
      note: meta?.note?.trim().slice(0, 500) || null,
    })
    .select()
    .single();
  if (error) throw new Error(errorText(error));
  try {
    const { data: s } = await supabase.auth.getSession();
    await new Promise<void>((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/user-vault/${path.split("/").map(encodeURIComponent).join("/")}`);
      x.setRequestHeader("Authorization", `Bearer ${s.session?.access_token}`);
      x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
      x.setRequestHeader("Content-Type", uploadMime);
      x.setRequestHeader("x-upsert", "true");
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(0.05 + e.loaded / e.total * 0.95);
      x.onload = () => (x.status < 300 ? res() : rej(new Error(`Upload failed (${x.status})`)));
      x.onerror = () => rej(new Error("Network error while uploading"));
      x.send(upload);
    });
  } catch (e) {
    await supabase.from("vault_files").delete().eq("id", id);
    throw e;
  }
  return row as VaultFile;
}
export async function vaultUrl(f: VaultFile, download = false) {
  const { data } = await supabase.storage.from("user-vault").createSignedUrl(f.path, 600, download ? { download: f.name } : undefined);
  return data?.signedUrl ?? null;
}
export async function updateVault(
  id: string,
  patch: Partial<Pick<VaultFile, "name" | "folder" | "note" | "kind" | "artist" | "title" | "duration_ms">>,
) {
  const { error } = await supabase.from("vault_files").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function removeVault(f: VaultFile) {
  await supabase.storage.from("user-vault").remove([f.path]);
  const { error } = await supabase.from("vault_files").delete().eq("id", f.id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function removeVaultMany(files: VaultFile[]) {
  if (!files.length) return true;
  await supabase.storage.from("user-vault").remove(files.map((f) => f.path));
  const { error } = await supabase.from("vault_files").delete().in("id", files.map((f) => f.id));
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function listShares(fileIds?: string[]) {
  let q = supabase.from("vault_shares").select("*").eq("owner_id", me()).order("created_at", { ascending: false }).limit(1000);
  if (fileIds) q = q.in("file_id", fileIds);
  const { data } = await q;
  return (data ?? []) as VaultShare[];
}
export async function createShare(fileId: string, o: { expiresInHours: number | null; maxDownloads: number | null; password: string; download: boolean }) {
  const { data, error } = await supabase.rpc("vault_share_create", {
    p_file: fileId,
    p_expires: o.expiresInHours ? new Date(Date.now() + o.expiresInHours * 3600_000).toISOString() : null,
    p_max: o.maxDownloads || null,
    p_password: o.password || null,
    p_download: o.download,
  });
  if (error) throw new Error(errorText(error));
  return data as VaultShare;
}
export async function revokeShare(id: string) {
  const { error } = await supabase.from("vault_shares").update({ revoked: true }).eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export const shareLink = (s: Pick<VaultShare, "token">) => `${window.location.origin}/s/${s.token}`;

// ================================================================ Content ID
export type Claim = { id: number; work_id: string; owner_id: string; uploader_id: string | null; context: string; score: number; status: "open" | "released" | "disputed" | "upheld"; dispute_note: string | null; created_at: string; updated_at: string };
export async function myClaims() {
  const { data } = await supabase.from("content_claims").select("*").eq("owner_id", me()).order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as Claim[];
}
export async function claimsAgainstMe() {
  const { data } = await supabase.from("content_claims").select("*").eq("uploader_id", me()).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as Claim[];
}
export async function setClaim(id: number, status: "released" | "upheld" | "open") {
  const { error } = await supabase.rpc("claim_set", { p_claim: id, p_status: status });
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function disputeClaim(id: number, note: string) {
  const { error } = await supabase.rpc("claim_dispute", { p_claim: id, p_note: note });
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function setWorkPolicy(id: string, patch: { policy?: "block" | "track"; content_id?: boolean }) {
  const { data, error } = await supabase.from("shield_works").update(patch).eq("id", id).select().single();
  if (error) toast(errorText(error), "error");
  return (data ?? null) as (ShieldWork & { policy: "block" | "track"; content_id: boolean }) | null;
}

// ================================================================ Profile Defender
export type Watch = { id: string; owner_id: string; spotify_id: string; name: string | null; image: string | null; known: string[]; alerts_on: boolean; last_scan: string | null; created_at: string; snapshot?: { history?: { t: string; n: number }[]; lookalikes?: string[] } };
export type DefAlert = { id: number; watch_id: string; kind: "new_release" | "name" | "image" | "removed" | "listeners" | "lookalike"; item: { id?: string; name?: string; image?: string; url?: string; release_date?: string; type?: string; artists?: string; from?: string; to?: string | number; change?: number }; status: "new" | "mine" | "not_mine" | "reported"; created_at: string };
export type DefRelease = { id: string; name: string; image: string | null; url: string; release_date: string; type: string; artists: string };

export async function listWatches() {
  const { data } = await supabase.from("defender_watch").select("id, owner_id, spotify_id, name, image, known, alerts_on, last_scan, created_at, snapshot").eq("owner_id", me()).order("created_at");
  return (data ?? []) as Watch[];
}
export async function listAlerts() {
  const { data } = await supabase.from("defender_alerts").select("*").eq("owner_id", me()).order("created_at", { ascending: false }).limit(300);
  return (data ?? []) as DefAlert[];
}
export const addWatch = (url: string) => fnCall<{ ok: boolean; watch: Watch; baseline: number; releases: DefRelease[] }>("defender", { action: "add", url });
export const scanWatch = (id: string) => fnCall<{ ok: boolean; alerts: number }>("defender", { action: "scan", id });
export type SpotifyProfile = { id: string; name: string; image: string | null; genres: string[]; url: string; listeners: number | null; fans: number | null; releases: number; appears_on: number; latest: DefRelease | null; lookalikes: { id: string; name: string; image: string | null; url: string }[] };
export const spotifyProfile = (url: string) => fnCall<SpotifyProfile>("defender", { action: "profile", url });
export const fmtNum = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));
export const watchCatalog = (id: string) => fnCall<{ releases: DefRelease[] }>("defender", { action: "catalog", id });
export async function setAlert(id: number, status: DefAlert["status"]) {
  const { error } = await supabase.from("defender_alerts").update({ status }).eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function updateWatch(id: string, patch: Partial<Pick<Watch, "alerts_on">>) {
  const { error } = await supabase.from("defender_watch").update(patch).eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function removeWatch(id: string) {
  const { error } = await supabase.from("defender_watch").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}

// ================================================================ releases ↔ Shield 360
export const releaseLink = (r: Pick<DistRelease, "link_code">) => `${window.location.origin}/release/${r.link_code}`;

export async function releaseByCode(code: string) {
  const { data } = await supabase.rpc("release_by_code", { p_code: code });
  return (data as string | null) ?? null;
}

/** fingerprint a release track into Shield 360 (locked until release day, then Content ID tracking) */
export async function protectTrack(file: File, t: DistTrack, r: DistRelease, onStep?: (s: string) => void) {
  if (t.shield_work) {
    const { data: old } = await supabase.from("shield_works").select("*").eq("id", t.shield_work).maybeSingle();
    if (old) await removeWork(old as ShieldWork);
  }
  const day = r.release_date ? new Date(`${r.release_date}T00:00:00Z`) : null;
  const w = await registerWork(
    file,
    { title: t.title || r.title, artist: t.primary_artist_name || r.primary_artist_name, isrc: t.isrc || undefined, upc: r.upc || undefined, unlock_at: day && day > new Date() ? day.toISOString() : null, keepFile: false },
    (s) => onStep?.(s.step),
  );
  const { data } = await supabase.from("dist_tracks").update({ shield_work: w.id }).eq("id", t.id).select().single();
  return (data ?? { ...t, shield_work: w.id }) as DistTrack;
}
