"use client";

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";

export type CustomEmoji = {
  id: string;
  space_id: string | null;
  owner_id: string;
  name: string;
  url: string;
  animated: boolean;
  created_at?: string;
};

/** `<:name:uuid>` (static) / `<a:name:uuid>` (animated) — the token stored in message text & reactions */
export const EMOJI_TOKEN_RE = /<a?:([a-z0-9_]{2,32}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/;
export const emojiToken = (e: Pick<CustomEmoji, "name" | "id" | "animated">) => `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`;
export function parseEmojiToken(s: string): { name: string; id: string } | null {
  const m = s.match(new RegExp(`^${EMOJI_TOKEN_RE.source}$`));
  return m ? { name: m[1], id: m[2] } : null;
}

export const SERVER_EMOJI_LIMIT = 200;
export const PERSONAL_EMOJI_LIMIT = 100;
const MAX_BYTES = 2 * 1024 * 1024;

type State = {
  byId: Record<string, CustomEmoji | null>; // null = looked up, missing (deleted)
  mine: CustomEmoji[]; // everything I can use: personal + servers I'm in
  loaded: boolean;
};
export const useEmojis = create<State>(() => ({ byId: {}, mine: [], loaded: false }));

function remember(list: CustomEmoji[]) {
  if (!list.length) return;
  useEmojis.setState((s) => {
    const byId = { ...s.byId };
    for (const e of list) byId[e.id] = e;
    return { byId };
  });
}

/** Load every emoji I can use anywhere on Nexus (my own + all servers I'm in). */
export async function loadMyEmojis(force = false) {
  const me = useApp.getState().userId;
  if (!me) return;
  if (useEmojis.getState().loaded && !force) return;
  const spaceIds = useApp.getState().spaces.map((s) => s.id);
  const filters = [`and(space_id.is.null,owner_id.eq.${me})`];
  if (spaceIds.length) filters.push(`space_id.in.(${spaceIds.join(",")})`);
  const { data, error } = await supabase.from("custom_emojis").select("*").or(filters.join(",")).order("created_at").limit(2000);
  if (error) return;
  const list = (data ?? []) as CustomEmoji[];
  remember(list);
  useEmojis.setState({ mine: list, loaded: true });
}

/* lazy batch lookup for emojis seen in messages (from servers I'm not in, etc.) */
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
export function requestEmoji(id: string) {
  const s = useEmojis.getState();
  if (id in s.byId || pending.has(id)) return;
  pending.add(id);
  if (timer) return;
  timer = setTimeout(async () => {
    const ids = Array.from(pending).slice(0, 200);
    ids.forEach((i) => pending.delete(i));
    timer = null;
    const { data } = await supabase.from("custom_emojis").select("*").in("id", ids);
    const found = (data ?? []) as CustomEmoji[];
    useEmojis.setState((st) => {
      const byId = { ...st.byId };
      for (const i of ids) byId[i] = null;
      for (const e of found) byId[e.id] = e;
      return { byId };
    });
    if (pending.size) requestEmoji(Array.from(pending)[0]);
  }, 40);
}

export function cleanEmojiName(raw: string) {
  return raw
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

/** Upload an image and register it as a server emoji (spaceId) or a personal one (null). */
export async function addCustomEmoji(spaceId: string | null, file: File, rawName: string): Promise<CustomEmoji | null> {
  const me = useApp.getState().userId;
  if (!me) return null;
  const name = cleanEmojiName(rawName || file.name);
  if (name.length < 2) {
    toast("Emoji names need at least 2 letters or numbers", "error");
    return null;
  }
  if (!/^image\/(png|gif|webp|jpeg)$/.test(file.type)) {
    toast("Use a PNG, GIF, WEBP or JPG image", "error");
    return null;
  }
  const animated = file.type === "image/gif" || (file.type === "image/webp" && (await isAnimatedWebp(file)));
  let body: Blob = file;
  let type = file.type;
  if (!animated) {
    // shrink stills to 128px — crisp at every size emojis are shown
    try {
      const { compressImage } = await import("./compressMedia");
      const out = await compressImage(file, 128, 0.92);
      body = out.blob;
      type = out.blob.type || "image/webp";
    } catch {
      /* keep the original */
    }
  }
  if (body.size > MAX_BYTES) {
    toast("Emoji images must be under 2 MB", "error");
    return null;
  }
  const ext = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const path = `${me}/${spaceId ?? "me"}-${name}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("emojis").upload(path, body, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) {
    toast(errorText(up.error), "error");
    return null;
  }
  const { data, error } = await supabase.rpc("add_custom_emoji", { p_space: spaceId, p_name: name, p_path: path, p_animated: animated });
  if (error) {
    void supabase.storage.from("emojis").remove([path]);
    toast(errorText(error), "error");
    return null;
  }
  const e = data as CustomEmoji;
  remember([e]);
  useEmojis.setState((s) => ({ mine: [...s.mine, e] }));
  toast(`:${e.name}: added`, "success");
  return e;
}

export async function deleteCustomEmoji(e: CustomEmoji) {
  const { error } = await supabase.rpc("delete_custom_emoji", { p_id: e.id });
  if (error) return toast(errorText(error), "error");
  const path = e.url.split("/object/public/emojis/")[1];
  if (path && e.owner_id === useApp.getState().userId) void supabase.storage.from("emojis").remove([path]);
  useEmojis.setState((s) => ({ mine: s.mine.filter((x) => x.id !== e.id), byId: { ...s.byId, [e.id]: null } }));
}

export async function renameCustomEmoji(e: CustomEmoji, raw: string) {
  const name = cleanEmojiName(raw);
  const { error } = await supabase.rpc("rename_custom_emoji", { p_id: e.id, p_name: name });
  if (error) return toast(errorText(error), "error");
  const next = { ...e, name };
  useEmojis.setState((s) => ({ mine: s.mine.map((x) => (x.id === e.id ? next : x)), byId: { ...s.byId, [e.id]: next } }));
}

export async function loadSpaceEmojis(spaceId: string): Promise<CustomEmoji[]> {
  const { data } = await supabase.from("custom_emojis").select("*").eq("space_id", spaceId).order("created_at");
  const list = (data ?? []) as CustomEmoji[];
  remember(list);
  return list;
}

async function isAnimatedWebp(file: File) {
  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const txt = String.fromCharCode(...head);
    return txt.includes("ANIM") || txt.includes("ANMF") || (txt.includes("VP8X") && (head[20] & 0x02) === 0x02);
  } catch {
    return false;
  }
}

/** `<:name:id>` → `:name:` for plain-text places (chat list previews, notifications, copy). */
export function emojiPlain(s: string | null | undefined) {
  return (s ?? "").replace(new RegExp(EMOJI_TOKEN_RE.source, "g"), ":$1:");
}

/** Replace hand-typed `:name:` with the matching custom emoji token (skips code spans). */
export function withCustomEmojis(text: string) {
  const { mine } = useEmojis.getState();
  if (!mine.length || !text.includes(":")) return text;
  const me = useApp.getState().userId;
  const map = new Map<string, CustomEmoji>();
  for (const e of mine) if (e.space_id) map.set(e.name, e);
  for (const e of mine) if (!e.space_id && e.owner_id === me) map.set(e.name, e); // personal wins
  return text
    .split(/(`[^`]*`|<a?:[a-z0-9_]{2,32}:[0-9a-f-]{36}>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/(^|[^<a-z0-9_]):([a-z0-9_]{2,32}):/gi, (all, pre: string, n: string) => {
      const e = map.get(n.toLowerCase());
      return e ? pre + emojiToken(e) : all;
    })))
    .join("");
}
