"use client";

import { supabase, errorText } from "./supabase";
import { xhrStorageUpload } from "./storageUpload";
import { scanUpload } from "./malwareGuard";
import { useApp } from "@/store/app";
import { thisDeviceId } from "./handset";

export type NexusDrop = {
  id: string;
  from_user: string;
  to_user: string;
  from_device: string | null;
  name: string;
  path: string;
  mime: string | null;
  bytes: number;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
};

const MAX = 100 * 1024 * 1024;

export async function sendDrop(file: File, toUsername?: string) {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in required");
  if (file.size <= 0 || file.size > MAX) throw new Error("Drops are limited to 100 MB");
  const scan = await scanUpload(file, { fileName: file.name, context: "any" });
  if (!scan.ok) throw new Error(scan.reason);
  let to = me;
  const name = toUsername?.trim().replace(/^@/, "");
  if (name) {
    const { data, error } = await supabase.from("profiles").select("id").eq("username", name).maybeSingle();
    if (error || !data) throw new Error("No Nexus user with that name");
    to = data.id as string;
  }
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "drop";
  const path = `${me}/${crypto.randomUUID()}-${safe}`;
  await xhrStorageUpload({ bucket: "nexus-drops", path, blob: file, contentType: file.type || "application/octet-stream" });
  const { error } = await supabase.from("nexus_drops").insert({
    from_user: me,
    to_user: to,
    from_device: thisDeviceId(),
    name: safe,
    path,
    mime: file.type || null,
    bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("nexus-drops").remove([path]);
    throw new Error(errorText(error));
  }
}

export async function incomingDrops() {
  const me = useApp.getState().userId;
  if (!me) return [] as NexusDrop[];
  const { data } = await supabase
    .from("nexus_drops")
    .select("*")
    .eq("to_user", me)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as NexusDrop[]).filter((row) => row.from_device !== thisDeviceId());
}

export async function openDrop(row: NexusDrop) {
  const { data, error } = await supabase.storage.from("nexus-drops").createSignedUrl(row.path, 120, { download: row.name });
  if (error || !data?.signedUrl) throw new Error(errorText(error) || "Couldn't open that drop");
  return data.signedUrl;
}

/** Mark a drop taken only after the browser actually opened it. */
export async function claimDrop(id: string) {
  const { error } = await supabase.from("nexus_drops").update({ claimed_at: new Date().toISOString() }).eq("id", id).is("claimed_at", null);
  if (error) throw new Error(errorText(error));
}

export async function openAndClaimDrop(row: NexusDrop) {
  const url = await openDrop(row);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) throw new Error("Allow pop-ups to open this drop. It is still in your inbox.");
  await claimDrop(row.id);
  return url;
}
