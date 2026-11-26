"use client";

import { supabase, errorText } from "./supabase";
import { toast, useApp } from "@/store/app";
import { useChat } from "@/store/chat";
import type { EmbedItem, EmbedOverrides } from "./types";

const cap = (v: string | undefined, n: number) => (v ?? "").trim().slice(0, n) || undefined;

/** Only https images may be used as a custom embed picture. */
export function safeEmbedImage(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && t.length <= 1000 ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function cleanItem(i: EmbedItem): EmbedItem | null {
  const out: EmbedItem = {};
  const title = cap(i.title, 120);
  const description = cap(i.description, 300);
  const image = safeEmbedImage(i.image);
  if (title) out.title = title;
  if (description) out.description = description;
  if (image) out.image = image;
  if (i.hide) out.hide = true;
  return Object.keys(out).length ? out : null;
}

/** Save embed edits for one of my messages (null = reset every embed to the original preview). */
export async function saveEmbed(messageId: string, embed: EmbedOverrides | null) {
  const next: EmbedOverrides | null = embed && (embed.off || (embed.items && Object.keys(embed.items).length)) ? embed : null;
  const prev = useChat.getState().messages.find((m) => m.id === messageId)?.embed ?? null;
  useChat.setState((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, embed: next } : m)) }));
  const { error } = await supabase.from("messages").update({ embed: next }).eq("id", messageId);
  if (error) {
    useChat.setState((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, embed: prev } : m)) }));
    toast(errorText(error) || "Couldn't save the embed", "error");
    return false;
  }
  return true;
}

/** Upload a custom embed picture (re-encoded to a ≤1200px JPEG) and return its public URL. */
export async function uploadEmbedImage(file: File): Promise<string | null> {
  const me = useApp.getState().userId;
  if (!me) return null;
  if (!/^image\//.test(file.type)) {
    toast("Pick an image", "error");
    return null;
  }
  if (file.size > 15 * 1024 * 1024) {
    toast("Images can be up to 15 MB", "error");
    return null;
  }
  const { malwareGate } = await import("./malwareGuard");
  if (await malwareGate(file, { fileName: file.name, context: "image" })) return null;
  const { compressImage } = await import("./compressMedia");
  const { blob } = await compressImage(file, 1200, 0.88);
  const path = `${me}/embed-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
  if (error) {
    toast(errorText(error) || "Upload failed", "error");
    return null;
  }
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
