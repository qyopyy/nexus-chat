"use client";

import { supabase, errorText } from "./supabase";
import { xhrStorageUpload } from "./storageUpload";
import { scanUpload } from "./malwareGuard";
import { useApp } from "@/store/app";
import { myTier } from "./premium";

export type CloudKind = "photo" | "file" | "voice";
export type CloudFile = {
  id: string;
  owner_id: string;
  kind: CloudKind;
  name: string;
  path: string;
  mime: string | null;
  bytes: number;
  created_at: string;
};

const DB = "nexus-cloud";
const STORE = "pending";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueCloudFile(file: Blob, name: string, kind: CloudKind) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: crypto.randomUUID(), name, kind, mime: file.type || "application/octet-stream", blob: file });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function pendingFiles(): Promise<{ id: string; name: string; kind: CloudKind; mime: string; blob: Blob }[]> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function dropPending(id: string) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function cloudUnlocked() {
  return myTier() >= 2;
}

export async function listCloud(): Promise<CloudFile[]> {
  const me = useApp.getState().userId;
  if (!me) return [];
  const { data, error } = await supabase.from("nexus_cloud_files").select("*").eq("owner_id", me).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(errorText(error));
  return (data ?? []) as CloudFile[];
}

async function putFile(file: Blob, name: string, kind: CloudKind) {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in required");
  if (!cloudUnlocked()) throw new Error("Nexus Cloud is part of Premium");
  const scan = await scanUpload(file, { fileName: name, context: kind === "photo" ? "image" : kind === "voice" ? "audio" : "any" });
  if (!scan.ok) throw new Error(scan.reason);
  const safe = name.replace(/[^\w.\- ]+/g, "_").slice(0, 140) || kind;
  const path = `${me}/${kind}/${crypto.randomUUID()}-${safe}`;
  await xhrStorageUpload({ bucket: "nexus-cloud", path, blob: file, contentType: file.type || "application/octet-stream" });
  const { error } = await supabase.from("nexus_cloud_files").insert({
    owner_id: me,
    kind,
    name: safe,
    path,
    mime: file.type || null,
    bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("nexus-cloud").remove([path]);
    throw new Error(errorText(error));
  }
}

export async function addCloudFiles(files: File[], kind: CloudKind) {
  for (const file of files) await queueCloudFile(file, file.name, kind);
  await syncCloudNow();
}

export async function addVoiceMemo(blob: Blob) {
  const name = `memo-${new Date().toISOString().slice(0, 16)}.webm`;
  await queueCloudFile(blob, name, "voice");
  await syncCloudNow();
}

/** Upload anything still only on this device, then stamp the daily sync. */
export async function syncCloudNow() {
  if (!cloudUnlocked()) return;
  const queued = await pendingFiles();
  for (const item of queued) {
    await putFile(item.blob, item.name, item.kind);
    await dropPending(item.id);
  }
  await supabase.rpc("nexus_cloud_sync_mark");
}

export async function syncCloudIfDue() {
  if (!cloudUnlocked()) return false;
  const { data, error } = await supabase.rpc("nexus_cloud_sync_due");
  if (error || !data) return false;
  await syncCloudNow();
  return true;
}

export async function cloudUrl(row: CloudFile) {
  const { data, error } = await supabase.storage.from("nexus-cloud").createSignedUrl(row.path, 600, { download: row.name });
  if (error || !data?.signedUrl) throw new Error(errorText(error) || "Couldn't open that file");
  return data.signedUrl;
}

export async function sendCloudToPhones(row: CloudFile) {
  if (row.bytes > 100 * 1024 * 1024) throw new Error("Phone drops are limited to 100 MB");
  const url = await cloudUrl(row);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't read that Cloud file");
  const blob = await res.blob();
  const file = new File([blob], row.name, { type: row.mime || blob.type || "application/octet-stream" });
  const { sendDrop } = await import("./nexusDrop");
  await sendDrop(file);
}

export async function deleteCloud(row: CloudFile) {
  await supabase.storage.from("nexus-cloud").remove([row.path]);
  const { error } = await supabase.from("nexus_cloud_files").delete().eq("id", row.id);
  if (error) throw new Error(errorText(error));
}

export type CloudAlbum = { id: string; owner_id: string; title: string; created_at: string };
export type CloudMember = { album_id: string; user_id: string; created_at: string };

export async function listAlbums() {
  const me = useApp.getState().userId;
  if (!me) return [] as CloudAlbum[];
  const { data, error } = await supabase.from("nexus_cloud_albums").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(errorText(error));
  return (data ?? []) as CloudAlbum[];
}

export async function createAlbum(title: string) {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in required");
  if (!cloudUnlocked()) throw new Error("Nexus Cloud is part of Premium");
  const { data, error } = await supabase
    .from("nexus_cloud_albums")
    .insert({ owner_id: me, title: title.trim().slice(0, 80) || "Shared album" })
    .select("*")
    .single();
  if (error) throw new Error(errorText(error));
  return data as CloudAlbum;
}

export async function deleteAlbum(id: string) {
  const { error } = await supabase.from("nexus_cloud_albums").delete().eq("id", id);
  if (error) throw new Error(errorText(error));
}

export async function inviteToAlbum(albumId: string, username: string) {
  const { error } = await supabase.rpc("nexus_cloud_album_invite", { p_album: albumId, p_username: username.trim().replace(/^@/, "") });
  if (error) throw new Error(errorText(error));
}

export async function leaveAlbum(albumId: string) {
  const me = useApp.getState().userId;
  if (!me) return;
  const { error } = await supabase.from("nexus_cloud_album_members").delete().eq("album_id", albumId).eq("user_id", me);
  if (error) throw new Error(errorText(error));
}

export async function albumFiles(albumId: string) {
  const { data: items, error } = await supabase.from("nexus_cloud_album_items").select("file_id, position").eq("album_id", albumId).order("position");
  if (error) throw new Error(errorText(error));
  const ids = (items ?? []).map((row) => row.file_id as string);
  if (!ids.length) return [] as CloudFile[];
  const { data: files, error: fileError } = await supabase.from("nexus_cloud_files").select("*").in("id", ids);
  if (fileError) throw new Error(errorText(fileError));
  const map = new Map(((files ?? []) as CloudFile[]).map((file) => [file.id, file]));
  return ids.map((id) => map.get(id)).filter((file): file is CloudFile => !!file);
}

export async function addFileToAlbum(albumId: string, fileId: string) {
  const { count } = await supabase.from("nexus_cloud_album_items").select("file_id", { count: "exact", head: true }).eq("album_id", albumId);
  const { error } = await supabase.from("nexus_cloud_album_items").insert({ album_id: albumId, file_id: fileId, position: (count ?? 0) + 1 });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(errorText(error));
}

export async function removeFileFromAlbum(albumId: string, fileId: string) {
  const { error } = await supabase.from("nexus_cloud_album_items").delete().eq("album_id", albumId).eq("file_id", fileId);
  if (error) throw new Error(errorText(error));
}
