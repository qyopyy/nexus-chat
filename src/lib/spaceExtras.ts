"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadSpace, refreshSpaces } from "./data";
import type { SpaceInvite, SpaceRole } from "./types";

const ok = (error: { message: string } | null) => {
  if (error) toast(errorText(error as never), "error");
  return !error;
};

export async function uploadSpaceImage(spaceId: string, file: File, kind: "icon" | "banner" | "background") {
  const me = useApp.getState().userId;
  if (!me) return null;
  const max = kind === "icon" ? 4 : 8;
  if (file.size > max * 1024 * 1024) {
    toast(`${kind} must be under ${max} MB`, "error");
    return null;
  }
  const { compressImage } = await import("./compressMedia");
  const size = kind === "icon" ? 512 : kind === "banner" ? 1600 : 1920;
  const { blob } = await compressImage(file, size, 0.86);
  const path = `${me}/space-${spaceId}-${kind}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const patch =
    kind === "icon"
      ? { p_icon_url: data.publicUrl }
      : kind === "banner"
        ? { p_banner_url: data.publicUrl }
        : { p_background_url: data.publicUrl };
  const { error: e2 } = await supabase.rpc("space_set_appearance", { p_space: spaceId, ...patch });
  if (ok(e2)) {
    await refreshSpaces();
    toast("Updated", "success");
    return data.publicUrl;
  }
  return null;
}

export async function clearSpaceMedia(spaceId: string, which: "icon" | "banner" | "background") {
  const { error } = await supabase.rpc("space_clear_media", { p_space: spaceId, p_which: which });
  if (ok(error)) await refreshSpaces();
}

export async function setSpaceAppearance(
  spaceId: string,
  patch: { name?: string; description?: string; icon_color?: string },
) {
  const { error } = await supabase.rpc("space_set_appearance", {
    p_space: spaceId,
    p_name: patch.name ?? null,
    p_description: patch.description ?? null,
    p_icon_color: patch.icon_color ?? null,
  });
  if (ok(error)) {
    await refreshSpaces();
    toast("Saved", "success");
  }
  return !error;
}

export async function setVanity(spaceId: string, code: string) {
  const { error } = await supabase.rpc("space_set_vanity", { p_space: spaceId, p_code: code });
  if (ok(error)) {
    await refreshSpaces();
    toast(code.trim() ? "Vanity invite saved" : "Vanity cleared", "success");
  }
  return !error;
}

export async function listInvites(spaceId: string) {
  const { data } = await supabase
    .from("space_invites")
    .select("*")
    .eq("space_id", spaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as SpaceInvite[];
}

export async function createInvite(
  spaceId: string,
  opts: { label?: string; maxUses?: number | null; expiresHours?: number | null; code?: string } = {},
) {
  const { data, error } = await supabase.rpc("space_create_invite", {
    p_space: spaceId,
    p_label: opts.label ?? null,
    p_max_uses: opts.maxUses ?? null,
    p_expires_hours: opts.expiresHours ?? null,
    p_code: opts.code ?? null,
  });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as SpaceInvite;
}

export async function revokeInvite(id: string) {
  const { error } = await supabase.rpc("space_revoke_invite", { p_invite: id });
  return ok(error);
}

export async function listRoles(spaceId: string) {
  const { data } = await supabase.from("space_roles").select("*").eq("space_id", spaceId).order("position", { ascending: false });
  return (data ?? []) as SpaceRole[];
}

export async function listMemberRoles(spaceId: string) {
  const { data } = await supabase.from("space_member_roles").select("user_id,role_id").eq("space_id", spaceId);
  return (data ?? []) as { user_id: string; role_id: string }[];
}

export async function createRole(spaceId: string, name: string, color: string, perms: Record<string, boolean> = {}) {
  const { data, error } = await supabase.rpc("space_create_role", {
    p_space: spaceId,
    p_name: name,
    p_color: color,
    p_perms: perms,
  });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as SpaceRole;
}

export async function deleteRole(roleId: string) {
  return ok((await supabase.rpc("space_delete_role", { p_role: roleId })).error);
}

export async function assignRole(spaceId: string, userId: string, roleId: string, on: boolean) {
  const { error } = await supabase.rpc("space_assign_role", {
    p_space: spaceId,
    p_user: userId,
    p_role: roleId,
    p_on: on,
  });
  return ok(error);
}

export async function unlockChannel(convId: string, password: string) {
  const { error } = await supabase.rpc("unlock_channel", { p_conv: convId, p_password: password });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  return true;
}

export async function myUnlocks(spaceId: string) {
  const channels = useApp.getState().channels[spaceId] ?? [];
  const ids = channels.map((c) => c.id);
  if (!ids.length) return new Set<string>();
  const me = useApp.getState().userId;
  const { data } = await supabase.from("space_channel_unlocks").select("conversation_id").eq("user_id", me!).in("conversation_id", ids);
  return new Set((data ?? []).map((r: { conversation_id: string }) => r.conversation_id));
}

export async function setChannel(
  convId: string,
  spaceId: string,
  patch: {
    name?: string;
    topic?: string;
    nsfw?: boolean;
    is_private?: boolean;
    password?: string;
    clearPassword?: boolean;
  },
) {
  const { error } = await supabase.rpc("space_set_channel", {
    p_conv: convId,
    p_name: patch.name ?? null,
    p_topic: patch.topic ?? null,
    p_nsfw: patch.nsfw ?? null,
    p_private: patch.is_private ?? null,
    p_password: patch.password ?? null,
    p_clear_password: !!patch.clearPassword,
  });
  if (ok(error)) await loadSpace(spaceId);
  return !error;
}

export async function deleteChannel(convId: string, spaceId: string) {
  const { error } = await supabase.rpc("space_delete_channel", { p_conv: convId });
  if (ok(error)) {
    if (useApp.getState().conversationId === convId) useApp.setState({ conversationId: null, mobileSidebar: true });
    await loadSpace(spaceId);
  }
  return !error;
}

export function inviteLink(code: string) {
  if (typeof window === "undefined") return code;
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}

export const ROLE_PERMS: { key: string; label: string }[] = [
  { key: "manage_channels", label: "Manage channels" },
  { key: "manage_roles", label: "Manage roles" },
  { key: "manage_invites", label: "Create invites" },
  { key: "kick_members", label: "Kick members" },
  { key: "mention_everyone", label: "Mention @everyone" },
  { key: "priority_speaker", label: "Priority speaker" },
];
