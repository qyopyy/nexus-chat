"use client";

import { create } from "zustand";
import type { SoloScoreGame } from "@/lib/games";

export type RoomGame = "streets" | "geo" | "four" | "flappy" | "classicstrike" | "globalstrike" | "beat";
export type GameInvite = { id: string; from_id: string; game: RoomGame; code: string; created_at: string };

/** Incoming score duel from a DM — schema-free, local-only. */
export type ScoreChallengeInvite = {
  id: string;
  from_id: string;
  game: SoloScoreGame;
  target: number;
  created_at: string;
};

/** Challenge the player is currently attempting after accepting. */
export type ActiveScoreChallenge = {
  from_id: string;
  game: SoloScoreGame;
  target: number;
};

/** games hub: a room to join (from ?play= links, chat cards or invite pop-ups) and whether a game is running full screen */
export const useGames = create<{
  joinCode: string | null;
  joinGame: RoomGame;
  playing: boolean;
  invites: GameInvite[];
  scoreInvites: ScoreChallengeInvite[];
  activeScoreChallenge: ActiveScoreChallenge | null;
  /** open this solo arcade game in GamesHub (score duel accept, deep links) */
  soloFocus: SoloScoreGame | null;
  /** Beat Battle: community song id from an invite link, opened once the hub mounts */
  beatSong: string | null;
}>(() => ({
  joinCode: null,
  joinGame: "streets",
  playing: false,
  invites: [],
  scoreInvites: [],
  activeScoreChallenge: null,
  soloFocus: null,
  beatSong: null,
}));

export function joinGame(code: string, game: RoomGame = "streets") {
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  useGames.setState({ joinCode: code.toUpperCase(), joinGame: game });
  void import("@/store/app").then(({ useApp }) => useApp.setState(mobile ? { mobileTab: "games", hub: null, mobileSidebar: true } : { hub: "games" }));
}

/** open Beat Battle on a shared community song (?beat=<id> links) */
export function openBeatSongId(id: string) {
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  useGames.setState({ beatSong: id });
  void import("@/store/app").then(({ useApp }) => useApp.setState(mobile ? { mobileTab: "games", hub: null, mobileSidebar: true } : { hub: "games" }));
}

export function openSoloGame(game: SoloScoreGame) {
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  useGames.setState({ soloFocus: game });
  void import("@/store/app").then(({ useApp }) => useApp.setState(mobile ? { mobileTab: "games", hub: null, mobileSidebar: true } : { hub: "games" }));
}
