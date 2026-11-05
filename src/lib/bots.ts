"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";

export type SystemBotKey = "nexus" | "music" | "orders" | "fun" | "trivia" | "spotify";

export type BotCommandDef = { cmd: string; reply: string };

export type CommunityBot = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string;
  avatar_url: string | null;
  color: string;
  commands: BotCommandDef[];
  webhook_token: string;
  public: boolean;
  uses: number;
  created_at: string;
};

export type BotCard = {
  kind: "system" | "community";
  key?: SystemBotKey;
  id?: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  avatar_url?: string | null;
  commands: string[] | BotCommandDef[];
  owner_id?: string;
  public?: boolean;
  uses?: number;
};

export const SYSTEM_BOTS: BotCard[] = [
  {
    kind: "system",
    key: "nexus",
    slug: "nexusbot",
    name: "Nexus Bot",
    description: "Dice, flips, 8-ball, and choose-one helpers for every chat.",
    color: "#5865F2",
    commands: ["/help", "/roll", "/flip", "/8ball", "/choose"],
  },
  {
    kind: "system",
    key: "music",
    slug: "musicbot",
    name: "Music Bot",
    description: "Audia ISRCs, track lookup, UPC — Spotify-first with Deezer fallback.",
    color: "#EB459E",
    commands: ["/isrc", "/song", "/upc", "/spotify", "/track"],
  },
  {
    kind: "system",
    key: "spotify",
    slug: "spotifybot",
    name: "Spotify Bot",
    description: "Search Spotify tracks, albums, and artists with open.spotify.com links.",
    color: "#1DB954",
    commands: ["/spotify", "/track", "/album", "/artist"],
  },
  {
    kind: "system",
    key: "fun",
    slug: "funbot",
    name: "Fun Bot",
    description: "Jokes, facts, rock-paper-scissors, rates, and ship percentages.",
    color: "#FEE75C",
    commands: ["/joke", "/fact", "/rps", "/rate", "/ship"],
  },
  {
    kind: "system",
    key: "trivia",
    slug: "triviabot",
    name: "Trivia Bot",
    description: "Quick music & culture trivia rounds. /trivia then /answer.",
    color: "#57F287",
    commands: ["/trivia", "/answer"],
  },
  {
    kind: "system",
    key: "orders",
    slug: "orderbot",
    name: "Order Bot",
    description: "Premium plans and your order receipts.",
    color: "#3BA55D",
    commands: ["/premium", "/orders"],
  },
];

export function botPublicUrl(slug: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc";
  return `${base}/b/${slug}`;
}

export function botInviteUrl(slug: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc";
  return `${base}/?addbot=${encodeURIComponent(slug)}`;
}

export async function listCommunityBots(mineOnly = false) {
  let q = supabase.from("community_bots").select("*").order("created_at", { ascending: false }).limit(60);
  if (mineOnly) {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) return [] as CommunityBot[];
    q = q.eq("owner_id", uid);
  } else {
    q = q.eq("public", true);
  }
  const { data, error } = await q;
  if (error) {
    toast(errorText(error), "error");
    return [] as CommunityBot[];
  }
  return (data ?? []).map(normalizeBot);
}

function normalizeBot(row: Record<string, unknown>): CommunityBot {
  const cmds = Array.isArray(row.commands)
    ? (row.commands as BotCommandDef[]).map((c) => ({
        cmd: String((c as BotCommandDef).cmd ?? "").replace(/^\//, ""),
        reply: String((c as BotCommandDef).reply ?? ""),
      }))
    : [];
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ""),
    avatar_url: (row.avatar_url as string) ?? null,
    color: String(row.color ?? "#5865F2"),
    commands: cmds,
    webhook_token: String(row.webhook_token ?? ""),
    public: !!row.public,
    uses: Number(row.uses ?? 0),
    created_at: String(row.created_at),
  };
}

export async function createCommunityBot(input: {
  slug: string;
  name: string;
  description?: string;
  color?: string;
  commands?: BotCommandDef[];
}) {
  const { data, error } = await supabase.rpc("create_community_bot", {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description ?? "",
    p_color: input.color ?? "#5865F2",
    p_commands: (input.commands ?? []).map((c) => ({ cmd: c.cmd.replace(/^\//, ""), reply: c.reply })),
  });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  toast("Bot created — share its /b/ link or invite it to a server", "success");
  return normalizeBot(data as Record<string, unknown>);
}

export async function updateCommunityBot(
  id: string,
  patch: Partial<{ name: string; description: string; color: string; commands: BotCommandDef[]; public: boolean; avatar_url: string | null }>,
) {
  const { data, error } = await supabase.rpc("update_community_bot", {
    p_id: id,
    p_name: patch.name ?? null,
    p_description: patch.description ?? null,
    p_color: patch.color ?? null,
    p_commands: patch.commands ? patch.commands.map((c) => ({ cmd: c.cmd.replace(/^\//, ""), reply: c.reply })) : null,
    p_public: patch.public ?? null,
    p_avatar_url: patch.avatar_url === undefined ? null : patch.avatar_url,
  });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  toast("Bot updated", "success");
  return normalizeBot(data as Record<string, unknown>);
}

export async function deleteCommunityBot(id: string) {
  const { error } = await supabase.from("community_bots").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  else toast("Bot deleted", "success");
}

export async function installBotToSpace(spaceId: string, opts: { systemKey?: SystemBotKey; communityBotId?: string }) {
  const { error } = await supabase.rpc("install_bot_to_space", {
    p_space: spaceId,
    p_system_key: opts.systemKey ?? null,
    p_community_bot_id: opts.communityBotId ?? null,
  });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  toast("Bot invited to the server", "success");
  return true;
}

export async function uninstallBot(installId: string) {
  const { error } = await supabase.rpc("uninstall_bot_from_space", { p_install_id: installId });
  if (error) toast(errorText(error), "error");
  else toast("Bot removed from server", "success");
}

export async function listSpaceBotInstalls(spaceId: string) {
  const { data, error } = await supabase
    .from("space_bot_installs")
    .select("id, system_key, community_bot_id, installed_at, community_bots(id, slug, name, color)")
    .eq("space_id", spaceId)
    .order("installed_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function fetchBotBySlug(slug: string): Promise<BotCard | null> {
  const { data, error } = await supabase.rpc("bot_by_slug", { p_slug: slug });
  if (error || !data) return null;
  const j = data as Record<string, unknown>;
  if (j.kind === "system") {
    return SYSTEM_BOTS.find((b) => b.key === j.key) ?? {
      kind: "system",
      key: j.key as SystemBotKey,
      slug: String(j.slug),
      name: String(j.name),
      description: String(j.description ?? ""),
      color: String(j.color ?? "#5865F2"),
      commands: (j.commands as string[]) ?? [],
    };
  }
  return {
    kind: "community",
    id: String(j.id),
    slug: String(j.slug),
    name: String(j.name),
    description: String(j.description ?? ""),
    color: String(j.color ?? "#5865F2"),
    avatar_url: (j.avatar_url as string) ?? null,
    commands: (j.commands as BotCommandDef[]) ?? [],
    owner_id: String(j.owner_id),
    public: !!j.public,
    uses: Number(j.uses ?? 0),
  };
}

export function communityWebhookUrl(bot: CommunityBot) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://fcnabeudhdlugruqzezn.supabase.co";
  return `${base}/functions/v1/bots?bot=${bot.id}&token=${bot.webhook_token}`;
}
