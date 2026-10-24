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
export type VaultFile = { id: string; owner_id: string; path: string; name: string; mime: string | null; bytes: number; folder: string; note: string | null; created_at: string };
export type VaultShare = { id: string; file_id: string; token: string; expires_at: string | null; max_downloads: number | null; downloads: number; views: number; pass_hash: string | null; allow_download: boolean; revoked: boolean; last_at: string | null; created_at: string };

export async function vaultUsage() {
  const { data } = await supabase.rpc("vault_usage");
  return (data ?? { used: 0, limit: 1073741824, files: 0 }) as { used: number; limit: number; files: number };
}
export async function listVault() {
  const { data } = await supabase.from("vault_files").select("*").eq("owner_id", me()).order("created_at", { ascending: false }).limit(2000);
  return (data ?? []) as VaultFile[];
}
export async function uploadVault(file: File, folder: string, onProgress?: (p: number) => void) {
  const id = crypto.randomUUID();
  const safe = file.name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";
  const path = `${me()}/${id}/${safe}`;
  // register first so the quota is checked before any bytes move
  const { data: row, error } = await supabase.from("vault_files").insert({ id, owner_id: me(), path, name: file.name.slice(0, 300), mime: file.type || null, bytes: file.size, folder: folder.trim().slice(0, 100) }).select().single();
  if (error) throw new Error(errorText(error));
  try {
    const { data: s } = await supabase.auth.getSession();
    await new Promise<void>((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/user-vault/${path.split("/").map(encodeURIComponent).join("/")}`);
      x.setRequestHeader("Authorization", `Bearer ${s.session?.access_token}`);
      x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
      x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      x.setRequestHeader("x-upsert", "true");
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => (x.status < 300 ? res() : rej(new Error(`Upload failed (${x.status})`)));
      x.onerror = () => rej(new Error("Network error while uploading"));
      x.send(file);
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
export async function updateVault(id: string, patch: Partial<Pick<VaultFile, "name" | "folder" | "note">>) {
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
export type Watch = { id: string; owner_id: string; spotify_id: string; name: string | null; image: string | null; known: string[]; alerts_on: boolean; last_scan: string | null; created_at: string };
export type DefAlert = { id: number; watch_id: string; kind: "new_release" | "name" | "image" | "removed"; item: { id?: string; name?: string; image?: string; url?: string; release_date?: string; type?: string; artists?: string; from?: string; to?: string }; status: "new" | "mine" | "not_mine" | "reported"; created_at: string };
export type DefRelease = { id: string; name: string; image: string | null; url: string; release_date: string; type: string; artists: string };

export async function listWatches() {
  const { data } = await supabase.from("defender_watch").select("id, owner_id, spotify_id, name, image, known, alerts_on, last_scan, created_at").eq("owner_id", me()).order("created_at");
  return (data ?? []) as Watch[];
}
export async function listAlerts() {
  const { data } = await supabase.from("defender_alerts").select("*").eq("owner_id", me()).order("created_at", { ascending: false }).limit(300);
  return (data ?? []) as DefAlert[];
}
export const addWatch = (url: string) => fnCall<{ ok: boolean; watch: Watch; baseline: number; releases: DefRelease[] }>("defender", { action: "add", url });
export const scanWatch = (id: string) => fnCall<{ ok: boolean; alerts: number }>("defender", { action: "scan", id });
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
