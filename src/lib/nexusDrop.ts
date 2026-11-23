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
  const { data, error } = await supabase
    .from("nexus_drops")
    .select("*")
    .eq("to_user", me)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(errorText(error));
  return ((data ?? []) as NexusDrop[]).filter((row) => row.from_device !== thisDeviceId());
}

export async function openDrop(row: NexusDrop) {
  const { data, error } = await supabase.storage.from("nexus-drops").createSignedUrl(row.path, 120, { download: row.name });
  if (error) throw new Error(errorText(error));
  if (!data?.signedUrl) throw new Error("Couldn't open that drop");
  return data.signedUrl;
}

/** Mark a drop taken after its download tab has been navigated successfully. */
export async function claimDrop(id: string) {
  const { error } = await supabase.from("nexus_drops").update({ claimed_at: new Date().toISOString() }).eq("id", id).is("claimed_at", null);
  if (error) throw new Error(errorText(error));
}

export async function openAndClaimDrop(row: NexusDrop) {
  // Reserve the tab while this call still has the click's user activation.
  // The `noopener` window feature always returns null in modern browsers, so
  // detach the blank tab's opener ourselves before requesting the signed URL.
  const opened = window.open("about:blank", "_blank");
  if (!opened) throw new Error("Allow pop-ups to open this drop. It is still in your inbox.");
  let url: string;
  try {
    opened.opener = null;
    url = await openDrop(row);
    if (opened.closed) throw new Error("The download tab was closed. This drop is still in your inbox.");
    opened.location.replace(url);
  } catch (error) {
    try { opened.close(); } catch { /* A detached tab must not hide the original error. */ }
    throw error;
  }
  try {
    await claimDrop(row.id);
  } catch (error) {
    // A claim failure must not close the download or pretend it never opened.
    throw new Error(`The download opened, but we couldn't update your inbox: ${errorText(error)}`);
  }
  return url;
}
