"use client";

import { primeSignedUrl, storageRef } from "./storage";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { useChat } from "@/store/chat";
import { effectForText, playEffect, type EffectKind } from "./effects";
import type { ChatListItem, Conversation, Friendship, Message, Profile, Reaction, Space, SpaceMember } from "./types";

const PAGE = 50;
const set = useApp.setState;
const get = useApp.getState;

// ------------------------------------------------------------------ profiles

export async function loadProfiles(ids: (string | null | undefined)[]) {
  const known = get().profiles;
  const missing = [...new Set(ids.filter((x): x is string => !!x && !known[x]))];
  if (missing.length === 0) return;
  const { data } = await supabase.from("profiles").select("*").in("id", missing);
  if (data) mergeProfiles(data as Profile[]);
}

export function mergeProfiles(list: Profile[]) {
  if (!list.length) return;
  set((s) => {
    const profiles = { ...s.profiles };
    for (const p of list) profiles[p.id] = p;
    return { profiles };
  });
}

export async function updateMyProfile(
  patch: Partial<
    Pick<
      Profile,
      | "display_name"
      | "avatar_color"
      | "custom_status"
      | "avatar_url"
      | "avatar_decoration"
      | "banner_color"
      | "bio"
      | "links"
      | "banner_url"
      | "profile_song"
      | "forum_name"
      | "now_playing"
      | "channel_description"
      | "profile_effect"
      | "profile_border"
      | "profile_theme"
      | "vavatar"
    >
  >,
  quiet = false,
) {
  const id = get().userId;
  if (!id) return;
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select().single();
  if (error) return toast(errorText(error), "error");
  mergeProfiles([data as Profile]);
  if (!quiet) toast("Profile updated", "success");
}

/** Banner image (public avatars bucket, under your own folder) */
export async function uploadBanner(file: File) {
  const id = get().userId;
  if (!id) return;
  if (file.size > 8 * 1024 * 1024) return toast("Banner must be under 8 MB", "error");
  const { compressImage } = await import("./compressMedia");
  const { blob } = await compressImage(file, 1920, 0.86);
  const path = `${id}/banner-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) return toast(errorText(error), "error");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  await updateMyProfile({ banner_url: data.publicUrl });
}

export async function uploadAvatar(file: File) {
  const id = get().userId;
  if (!id) return;
  const { compressImage } = await import("./compressMedia");
  const { blob } = await compressImage(file, 720, 0.88);
  const path = `${id}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) return toast(errorText(error), "error");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  await updateMyProfile({ avatar_url: data.publicUrl });
}

// ------------------------------------------------------------------ friends

export async function refreshFriends() {
  const { data } = await supabase.from("friendships").select("*");
  const list = (data ?? []) as Friendship[];
  set({ friendships: list });
  await loadProfiles(list.flatMap((f) => [f.requester_id, f.addressee_id]));
}

export async function sendFriendRequest(username: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("send_friend_request", { p_username: username });
  if (error) return errorText(error);
  await refreshFriends();
  const msg: Record<string, string> = {
    sent: `Friend request sent to ${username}!`,
    accepted: `You and ${username} are now friends!`,
    already_friends: `You're already friends with ${username}.`,
    already_pending: "Request already pending.",
  };
  toast(msg[data as string] ?? "Done", "success");
  return null;
}

export async function respondFriendRequest(id: string, accept: boolean) {
  const { error } = await supabase.rpc("respond_friend_request", { p_id: id, p_accept: accept });
  if (error) toast(errorText(error), "error");
  await refreshFriends();
}

export async function removeFriend(userId: string) {
  const { error } = await supabase.rpc("remove_friend", { p_user: userId });
  if (error) toast(errorText(error), "error");
  await refreshFriends();
}

export function friendIds(): string[] {
  const me = get().userId;
  return get()
    .friendships.filter((f) => f.status === "accepted")
    .map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));
}

// ------------------------------------------------------------------ chats (DMs + groups)

export async function refreshChatList() {
  const { data, error } = await supabase.rpc("get_conversation_list");
  if (error) return;
  const list = (data ?? []) as ChatListItem[];
  set((s) => {
    const convKinds = { ...s.convKinds };
    for (const c of list) convKinds[c.id] = c.kind;
    return { chatList: list, convKinds };
  });
  await loadProfiles(list.flatMap((c) => [c.other_user_id, c.last_author_id]));
}

export async function refreshUnread() {
  const { data } = await supabase.rpc("get_unread_counts");
  const unread: Record<string, number> = {};
  for (const row of (data ?? []) as { conversation_id: string; unread: number }[]) unread[row.conversation_id] = row.unread;
  set({ unread });
  void import("./badge").then(({ syncAppBadge }) => syncAppBadge());
}

export async function loadConvMembers(convId: string) {
  const { data } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", convId);
  const ids = (data ?? []).map((r: { user_id: string }) => r.user_id);
  set((s) => ({ convMembers: { ...s.convMembers, [convId]: ids } }));
  await loadProfiles(ids);
}

export async function openDM(userId: string) {
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: userId });
  if (error) return toast(errorText(error), "error");
  await refreshChatList();
  openConversation(data as string, null);
}

export async function createGroup(name: string, members: string[]) {
  const { data, error } = await supabase.rpc("create_group", { p_name: name, p_members: members });
  if (error) return toast(errorText(error), "error");
  await refreshChatList();
  openConversation(data as string, null);
}

export async function leaveGroup(convId: string) {
  const { error } = await supabase.rpc("leave_conversation", { p_conv: convId });
  if (error) return toast(errorText(error), "error");
  set({ conversationId: null });
  await refreshChatList();
}

export async function renameGroup(convId: string, name: string) {
  const { error } = await supabase.from("conversations").update({ name }).eq("id", convId);
  if (error) return toast(errorText(error), "error");
  await refreshChatList();
}

// ------------------------------------------------------------------ spaces (servers)

export async function refreshSpaces() {
  const { data } = await supabase.from("spaces").select("*").order("created_at");
  set({ spaces: (data ?? []) as Space[] });
}

export async function loadSpace(spaceId: string) {
  const [{ data: ch }, { data: mem }] = await Promise.all([
    supabase.from("conversations").select("*").eq("space_id", spaceId).order("position"),
    supabase.from("space_members").select("*").eq("space_id", spaceId),
  ]);
  const channels = ((ch ?? []) as Conversation[]).map((c) => ({
    ...c,
    // keep a boolean signal without shipping the raw hash to every client store consumer
    password_hash: c.password_hash ? "1" : null,
  }));
  const members = (mem ?? []) as SpaceMember[];
  set((s) => {
    const convKinds = { ...s.convKinds };
    for (const c of channels) convKinds[c.id] = c.kind;
    return {
      channels: { ...s.channels, [spaceId]: channels },
      spaceMembers: { ...s.spaceMembers, [spaceId]: members },
      convKinds,
    };
  });
  await loadProfiles(members.map((m) => m.user_id));
  return channels;
}

export async function createSpace(name: string) {
  const { data, error } = await supabase.rpc("create_space", { p_name: name });
  if (error) return toast(errorText(error), "error");
  await refreshSpaces();
  await selectSpace(data as string);
}

export async function joinSpace(code: string): Promise<string | null> {
  const clean = code.trim().split("/").pop() ?? "";
  const { data, error } = await supabase.rpc("join_space", { p_code: clean });
  if (error) return errorText(error);
  await refreshSpaces();
  await selectSpace(data as string);
  return null;
}

export async function leaveSpace(spaceId: string) {
  const me = get().userId;
  const { error } = await supabase.from("space_members").delete().eq("space_id", spaceId).eq("user_id", me);
  if (error) return toast(errorText(error), "error");
  await refreshSpaces();
  selectHome();
}

export async function deleteSpace(spaceId: string) {
  const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
  if (error) return toast(errorText(error), "error");
  await refreshSpaces();
  selectHome();
}

export async function createChannel(
  spaceId: string,
  name: string,
  kind: "text" | "voice",
  opts: { isPrivate?: boolean; password?: string; topic?: string; nsfw?: boolean } = {},
) {
  const { data, error } = await supabase.rpc("create_channel", {
    p_space: spaceId,
    p_name: name,
    p_kind: kind,
    p_private: !!opts.isPrivate || !!opts.password,
    p_password: opts.password || null,
    p_topic: opts.topic || null,
    p_nsfw: !!opts.nsfw,
  });
  if (error) return toast(errorText(error), "error");
  await loadSpace(spaceId);
  if (kind === "text") openConversation(data as string, spaceId);
}

export function selectHome() {
  set({ spaceId: null, conversationId: null, mobileSidebar: true });
}

export async function selectSpace(spaceId: string) {
  const s = get();
  // Seed stable empty arrays immediately so sidebar selectors never return a fresh `[]` each render (React #185).
  set({
    spaceId,
    conversationId: null,
    mobileSidebar: true,
    hub: null,
    channels: { ...s.channels, [spaceId]: s.channels[spaceId] ?? [] },
    spaceMembers: { ...s.spaceMembers, [spaceId]: s.spaceMembers[spaceId] ?? [] },
  });
  try {
    const channels = s.channels[spaceId] ?? (await loadSpace(spaceId));
    const remembered = get().lastChannel[spaceId];
    const target = channels.find((c) => c.id === remembered) ?? channels.find((c) => c.kind === "text");
    // only set if we're still on this server (user may have clicked away)
    if (get().spaceId === spaceId) set({ conversationId: target?.id ?? null });
    if (!s.channels[spaceId]) return;
    void loadSpace(spaceId); // refresh in background
  } catch (e) {
    console.error("[selectSpace]", e);
    toast("Couldn't open that server — try again", "error");
  }
}

export function openConversation(convId: string | null, spaceId: string | null) {
  set((s) => ({
    spaceId,
    conversationId: convId,
    mobileSidebar: false,
    // clicking a chat/channel (even the one already selected, e.g. #general) leaves Music/Videos
    hub: s.hub === "studio" ? s.hub : null,
    lastChannel: spaceId && convId ? { ...s.lastChannel, [spaceId]: convId } : s.lastChannel,
  }));
}

// ------------------------------------------------------------------ messages

// ------------------------------------------------------------------ bots
/** slash commands (/help, /roll, /isrc …) — the matching bot replies in the chat */
export async function runBotCommand(convId: string, text: string) {
  const { data, error } = await supabase.functions.invoke("bots", { body: { action: "cmd", conversation_id: convId, text } });
  if (error) toast("The bot couldn't answer right now", "error");
  return data as { ok: boolean } | null;
}

// ------------------------------------------------------------------ disappearing messages
export const TTL_OPTIONS: { secs: number | null; label: string; short: string }[] = [
  { secs: null, label: "Off", short: "" },
  { secs: 86400, label: "1 day", short: "1d" },
  { secs: 604800, label: "1 week", short: "1w" },
  { secs: 2592000, label: "1 month", short: "1m" },
  { secs: 31536000, label: "1 year", short: "1y" },
];
export async function loadTtl(convId: string) {
  const { data } = await supabase.from("conversations").select("message_ttl").eq("id", convId).maybeSingle();
  set((s) => ({ convTtl: { ...s.convTtl, [convId]: (data?.message_ttl as number | null | undefined) ?? null } }));
}
export async function setTtl(convId: string, secs: number | null) {
  const { error } = await supabase.rpc("set_message_ttl", { p_conv: convId, p_seconds: secs });
  if (error) return toast(errorText(error), "error");
  set((s) => ({ convTtl: { ...s.convTtl, [convId]: secs } }));
}
/** a message is gone once it's older than the chat's timer (the server removes it within ~15 min) */
export const expired = (m: { created_at: string }, ttl: number | null | undefined, now = Date.now()) => !!ttl && now - new Date(m.created_at).getTime() > ttl * 1000;
export const isTimerNotice = (m: { content: string | null; attachment_url?: string | null }) => !!m.content?.startsWith("⏱ ") && !m.attachment_url;

export async function loadMessages(convId: string) {
  useChat.setState({
    conversationId: convId,
    messages: [],
    reactions: {},
    loading: true,
    hasMore: true,
    replyTo: null,
    editingId: null,
    typing: {},
  });
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (useChat.getState().conversationId !== convId) return;
  const msgs = ((data ?? []) as Message[]).reverse();
  useChat.setState({ messages: msgs, loading: false, hasMore: msgs.length === PAGE });
  void loadTtl(convId);
  await Promise.all([loadReactions(msgs.map((m) => m.id)), loadProfiles(msgs.map((m) => m.author_id)), markRead(convId)]);
}

export async function loadOlder() {
  const st = useChat.getState();
  if (!st.conversationId || st.loading || !st.hasMore || st.messages.length === 0) return;
  const convId = st.conversationId;
  useChat.setState({ loading: true });
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .lt("created_at", st.messages[0].created_at)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (useChat.getState().conversationId !== convId) return;
  const older = ((data ?? []) as Message[]).reverse();
  useChat.setState((s) => ({ messages: [...older, ...s.messages], loading: false, hasMore: older.length === PAGE }));
  await Promise.all([loadReactions(older.map((m) => m.id)), loadProfiles(older.map((m) => m.author_id))]);
}

async function loadReactions(messageIds: string[]) {
  if (!messageIds.length) return;
  const { data } = await supabase.from("message_reactions").select("*").in("message_id", messageIds);
  const map: Record<string, Reaction[]> = {};
  for (const r of (data ?? []) as Reaction[]) (map[r.message_id] ??= []).push(r);
  useChat.setState((s) => ({ reactions: { ...s.reactions, ...map } }));
}

export async function markRead(convId: string) {
  set((s) => ({ unread: { ...s.unread, [convId]: 0 } }));
  await supabase.rpc("mark_read", { p_conv: convId });
  try {
    const { useMessageBanner } = await import("./messageBanner");
    const b = useMessageBanner.getState().banner;
    if (b?.conversationId === convId) useMessageBanner.getState().dismiss();
  } catch {
    /* ignore */
  }
  void import("./badge").then(({ syncAppBadge }) => syncAppBadge());
}

/** Clear unread on every channel in a server. */
export async function markSpaceRead(spaceId: string) {
  const channels = get().channels[spaceId] ?? [];
  await Promise.all(channels.map((c) => markRead(c.id)));
}

export async function sendMessage(convId: string, content: string, file?: File | null, chosenEffect?: EffectKind | null) {
  const me = get().userId;
  if (!me) return;
  const text = content.trim();
  if (!text && !file) return;
  if (file) {
    const { malwareGate } = await import("./malwareGuard");
    if (await malwareGate(file, { fileName: file.name, context: "chat" })) return;
  }
  // Nexus Shield: protected songs can't be sent (audio / video attachments, voice notes)
  if (file && /^(audio|video)\//.test(file.type)) {
    const { shieldGate } = await import("./shield");
    if (await shieldGate(file, "chat")) return;
    const { youtubeCidGate } = await import("./audio");
    if (await youtubeCidGate(file, "chat")) return;
  }
  const effect = chosenEffect ?? (text ? effectForText(text) : null);
  if (effect) playEffect(effect);
  const replyTo = useChat.getState().replyTo;
  const tempId = `temp-${crypto.randomUUID()}`;

  let attachment: Pick<Message, "attachment_url" | "attachment_name" | "attachment_type"> = {
    attachment_url: null,
    attachment_name: null,
    attachment_type: null,
  };
  if (file) {
    attachment = { attachment_url: URL.createObjectURL(file), attachment_name: file.name, attachment_type: file.type };
  }

  const optimistic: Message = {
    id: tempId,
    conversation_id: convId,
    author_id: me,
    content: text,
    reply_to_id: replyTo?.id ?? null,
    ...attachment,
    edited_at: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    effect,
    pending: true,
  };
  useChat.setState((s) => (s.conversationId === convId ? { messages: [...s.messages, optimistic], replyTo: null } : { replyTo: null }));
  void import("./sounds").then(({ sfx }) => sfx.send());

  if (file) {
    let upload: Blob = file;
    let contentType = file.type || "application/octet-stream";
    let name = file.name.replace(/[^\w.\-]+/g, "_");
    try {
      if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
        const { compressImage } = await import("./compressMedia");
        const { blob } = await compressImage(file, 1600, 0.85);
        upload = blob;
        contentType = blob.type || "image/jpeg";
        if (!/\.jpe?g$/i.test(name) && contentType.includes("jpeg")) name = name.replace(/\.[^.]+$/, "") + ".jpg";
      } else if (/^video\//.test(file.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
        const { compressVideo } = await import("./compressMedia");
        const out = await compressVideo(file, { maxEdge: 1080 });
        upload = out.blob;
        contentType = out.mime || "video/mp4";
        name = name.replace(/\.[^.]+$/, "") + "." + out.ext;
      }
    } catch {
      /* fall back to original bytes */
    }
    const path = `${convId}/${crypto.randomUUID()}-${name}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, upload, { contentType });
    if (upErr) {
      dropTemp(tempId);
      return toast(`Upload failed: ${errorText(upErr)}`, "error");
    }
    attachment.attachment_name = name;
    attachment.attachment_type = contentType;
    const localUrl = attachment.attachment_url;
    attachment.attachment_url = storageRef("attachments", path);
    if (localUrl) primeSignedUrl(attachment.attachment_url, localUrl);
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: convId,
      author_id: me,
      content: text,
      reply_to_id: replyTo?.id ?? null,
      ...attachment,
      ...(effect ? { effect } : {}),
    })
    .select()
    .single();
  if (error) {
    dropTemp(tempId);
    return toast(errorText(error), "error");
  }
  const real = data as Message;
  useChat.setState((s) => {
    const already = s.messages.some((m) => m.id === real.id);
    return {
      messages: already ? s.messages.filter((m) => m.id !== tempId) : s.messages.map((m) => (m.id === tempId ? real : m)),
    };
  });
  bumpChatList(real);
}

function dropTemp(tempId: string) {
  useChat.setState((s) => ({ messages: s.messages.filter((m) => m.id !== tempId) }));
}

export async function editMessage(id: string, content: string) {
  const text = content.trim();
  if (!text) return;
  useChat.setState((s) => ({
    messages: s.messages.map((m) => (m.id === id ? { ...m, content: text, edited_at: new Date().toISOString() } : m)),
    editingId: null,
  }));
  const { error } = await supabase.from("messages").update({ content: text, edited_at: new Date().toISOString() }).eq("id", id);
  if (error) toast(errorText(error), "error");
}

export async function deleteMessage(id: string) {
  useChat.setState((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m)) }));
  // RPC lets moderators remove other people's messages too (and logs it)
  const { error } = await supabase.rpc("mod_delete_message", { p_id: id });
  if (error) toast(errorText(error), "error");
}

export async function toggleReaction(msg: Message, emoji: string) {
  const me = get().userId;
  if (!me) return;
  const mine = (useChat.getState().reactions[msg.id] ?? []).some((r) => r.user_id === me && r.emoji === emoji);
  if (mine) {
    removeReactionLocal({ message_id: msg.id, user_id: me, emoji });
    await supabase.from("message_reactions").delete().match({ message_id: msg.id, user_id: me, emoji });
  } else {
    addReactionLocal({ message_id: msg.id, user_id: me, emoji, conversation_id: msg.conversation_id });
    const { error } = await supabase
      .from("message_reactions")
      .insert({ message_id: msg.id, user_id: me, emoji, conversation_id: msg.conversation_id });
    if (error && !error.message.includes("duplicate")) toast(errorText(error), "error");
  }
}

export function addReactionLocal(r: Reaction) {
  useChat.setState((s) => {
    const list = s.reactions[r.message_id] ?? [];
    if (list.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) return s;
    return { reactions: { ...s.reactions, [r.message_id]: [...list, r] } };
  });
}

export function removeReactionLocal(r: Pick<Reaction, "message_id" | "user_id" | "emoji">) {
  useChat.setState((s) => {
    const list = s.reactions[r.message_id];
    if (!list) return s;
    return {
      reactions: { ...s.reactions, [r.message_id]: list.filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)) },
    };
  });
}

/** Update Telegram-style list preview without a round-trip */
export function bumpChatList(m: Message) {
  set((s) => {
    const idx = s.chatList.findIndex((c) => c.id === m.conversation_id);
    if (idx === -1) return s;
    const item: ChatListItem = {
      ...s.chatList[idx],
      last_message: m.content || (m.attachment_name ? `📎 ${m.attachment_name}` : ""),
      last_author_id: m.author_id,
      last_message_at: m.created_at,
    };
    const rest = s.chatList.filter((_, i) => i !== idx);
    return { chatList: [item, ...rest] };
  });
}
