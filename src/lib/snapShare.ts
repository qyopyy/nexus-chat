import { supabase } from "@/lib/supabase";
import { refreshChatList, sendMessage } from "@/lib/data";
import { createShare, shareLink, type VaultFile } from "@/lib/protect";
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

/** Shares `file` with a Nexus user: makes a link and drops it into your DM with them. */
export async function sendSnapToUser(user: SnapUser, file: VaultFile, expiresInHours: number | null): Promise<{ convId: string; link: string }> {
  const me = useApp.getState().userId;
  if (!me) throw new Error("Sign in first.");
  if (user.id === me) throw new Error("That's you. Your snaps are already in your vault.");
  const link = await snapLink(file, expiresInHours);
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: user.id });
  if (error || !data) throw new Error(error?.message || "Couldn't open a chat with them.");
  const convId = data as string;
  await sendMessage(convId, sendText(snapShareText(link, isVideoMime(file.mime) ? "video" : "image"), getLastGeo(), getPrefs().locationInSend));
  void refreshChatList();
  return { convId, link };
}
