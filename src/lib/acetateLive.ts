"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { mergeProfiles } from "./data";
import type { Profile } from "./types";

const TABLES = [
  "acetate_projects",
  "acetate_tracks",
  "acetate_memberships",
  "acetate_versions",
  "acetate_comments",
  "acetate_shares",
  "acetate_stored",
  "acetate_entitlements",
  "acetate_listens",
  "acetate_likes",
  "acetate_follows",
  "acetate_collaborators",
  "acetate_notifications",
] as const;

/** One channel per signed-in library. RLS still decides which rows arrive. */
export function useAcetateLive(userId: string | null, onLibrary: () => void) {
  const refresh = useRef(onLibrary);
  refresh.current = onLibrary;

  useEffect(() => {
    if (!userId) return;
    let timer = 0;
    const kick = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refresh.current(), 280);
    };
    let channel: RealtimeChannel = supabase.channel(`acetate-library:${userId}`);
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, kick);
    }
    channel = channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (payload) => {
      const row = payload.new as Profile | undefined;
      if (row?.id) mergeProfiles([row]);
      kick();
    });
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
