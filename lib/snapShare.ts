import { supabase } from "@/lib/supabase";
import { refreshChatList, sendMessage } from "@/lib/data";
import { createShare, shareLink, vaultUrl, type VaultFile } from "@/lib/protect";
import { isMissingRpc, isVideoMime, parseRecipient, snapShareText } from "@/lib/snap";
import { searchUsers } from "@/lib/music";
import { useApp } from "@/store/app";
import { sendText } from "@/lib/snapPrefs";
import { getLastGeo, getPrefs } from "@/lib/snapPrefsStore";

export type SnapUser = { id: string; username: string; display_name: string | null };

/** A fresh share link for a vault file (`expiresInHours` null = never expires). */
export async function snapLink(file: VaultFile, expiresInHours: number | null): Promise<string> {
  const pr = getPrefs();
  const s = await createShare(file.id, { expiresInHours, maxDownloads: pr.maxDownloads || null, password: "", download: pr.linkDownload });
  return shareLink(s);
}

/** Username (exact) or email → a Nexus user. Email goes through the `snap_find_user` database function (signed-in users only). */
export async function findSnapUser(input: string): Promise<SnapUser> {
  const r = parseRecipient(input);
  if (!r) throw new Error("Type a Nexus username or an email address.");
  if (r.kind === "username") {
    const hits = await searchUsers(r.value);
    const hit = hits.find((u) => u.username.toLowerCase() === r.value);
    if (!hit) throw new Error(`No Nexus user called @${r.value}.`);
    return { id: hit.id, username: hit.username, display_name: hit.display_name ?? null };
  }
  const { data, error } = await supabase.rpc("snap_find_user", { p_email: r.value });
  if (error) {
    if (isMissingRpc(error)) throw new Error("Email lookup isn't switched on yet. Share by username for now.");
    throw new Error(error.message || "Couldn't look that email up.");
  }
  const row = (Array.isArray(data) ? data[0] : data) as SnapUser | null | undefined;
  if (!row?.id) throw new Error("No Nexus account uses that email.");
  return row;
}

/** The vault copy of a Snap as a real File, ready to attach to a chat message. Null if it can't be fetched. */
export async function snapAsFile(file: VaultFile): Promise<File | null> {
  try {
    const url = await vaultUrl(file);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return new File([blob], file.name, { type: file.mime || blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

/**
 * Sends a Snap into a chat as normal attached content (it plays and opens in the chat, no web link).
 * `have` is the File you already hold (right after capture); otherwise it's fetched from the vault.
 * Only if that can't be done does it fall back to a Drive link.
 */
export async function sendSnapToChat(convId: string, file: VaultFile, expiresInHours: number | null, have?: File | null): Promise<"attached" | "link"> {
  const pr = getPrefs();
  const att = have ?? (await snapAsFile(file));
  if (att) {
    await sendMessage(convId, sendText("", getLastGeo(), pr.locationInSend).trim(), att);
    return "attached";
  }
  const link = await snapLink(file, expiresInHours);
  await sendMessage(convId, sendText(snapShareText(link, isVideoMime(file.mime) ? "video" : "image"), getLastGeo(), pr.locationInSend));
  return "link";
}

/** Shares `file` with a Nexus user: opens your DM with them and puts the photo or video in it as an attachment. */
export async function sendSnapToUser(user: SnapUser, file: VaultFile, expiresInHours: number | null, have?: File | null): Promise<{ convId: string; how: "attached" | "link" }> {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in first.");
  if (user.id === me) throw new Error("That's you. Your snaps are already in your vault.");
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: user.id });
  if (error || !data) throw new Error(error?.message || "Couldn't open a chat with them.");
  const convId = data as string;
  const how = await sendSnapToChat(convId, file, expiresInHours, have);
  void refreshChatList();
  return { convId, how };
}
