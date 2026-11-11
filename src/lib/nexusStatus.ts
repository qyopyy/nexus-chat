"use client";

import { supabase, errorText } from "./supabase";
import { scanUpload } from "./malwareGuard";
import { useApp } from "@/store/app";
import { loadProfiles } from "./data";

export type NexusStatus = {
  id: string;
  user_id: string;
  kind: "text" | "photo";
  body: string | null;
  media_path: string | null;
  audience: "friends" | "space";
  space_id: string | null;
  expires_at: string;
  created_at: string;
};

export async function listStatuses() {
  const { data, error } = await supabase
    .from("nexus_statuses")
    .select("id, user_id, kind, body, media_path, audience, space_id, expires_at, created_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return [] as NexusStatus[];
  const rows = (data ?? []) as NexusStatus[];
  await loadProfiles(rows.map((row) => row.user_id));
  return rows;
}

export async function statusPhotoUrl(path: string) {
  const { data, error } = await supabase.storage.from("nexus-status").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

async function shrinkPhoto(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const edge = Math.max(bitmap.width, bitmap.height);
    const scale = edge > 1280 ? 1280 / edge : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    bitmap.close();
    return blob ?? file;
  } catch {
    if (file.size > 3_500_000) throw new Error("That photo is too large. Use a JPEG, PNG, or WebP under 4 MB.");
    return file;
  }
}

export async function postTextStatus(body: string, audience: { kind: "friends" } | { kind: "space"; spaceId: string }) {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in required");
  const text = body.trim().slice(0, 280);
  if (!text) throw new Error("Write a status first");
  const { error } = await supabase.from("nexus_statuses").insert({
    user_id: me,
    kind: "text",
    body: text,
    audience: audience.kind,
    space_id: audience.kind === "space" ? audience.spaceId : null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(errorText(error));
}

export async function postPhotoStatus(file: File, caption: string, audience: { kind: "friends" } | { kind: "space"; spaceId: string }) {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in required");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error("Use a JPEG, PNG, or WebP photo");
  }
  const blob = await shrinkPhoto(file);
  const scan = await scanUpload(blob, { fileName: "status.jpg", context: "image" });
  if (!scan.ok) throw new Error(scan.reason);
  const path = `${me}/${crypto.randomUUID()}.jpg`;
  const uploaded = await supabase.storage.from("nexus-status").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (uploaded.error) throw new Error(errorText(uploaded.error));
  const { error } = await supabase.from("nexus_statuses").insert({
    user_id: me,
    kind: "photo",
    body: caption.trim().slice(0, 280) || null,
    media_path: path,
    audience: audience.kind,
    space_id: audience.kind === "space" ? audience.spaceId : null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    await supabase.storage.from("nexus-status").remove([path]);
    throw new Error(errorText(error));
  }
}

export async function deleteStatus(id: string) {
  const me = useApp.getState().userId;
  if (!me) return;
  const { data } = await supabase.from("nexus_statuses").select("media_path").eq("id", id).eq("user_id", me).maybeSingle();
  const { error } = await supabase.from("nexus_statuses").delete().eq("id", id).eq("user_id", me);
  if (error) throw new Error(errorText(error));
  const path = data?.media_path as string | null | undefined;
  if (path) await supabase.storage.from("nexus-status").remove([path]);
}
