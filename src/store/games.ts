"use client";

import { create } from "zustand";

export type RoomGame = "streets" | "geo" | "four" | "flappy" | "classicstrike";
export type GameInvite = { id: string; from_id: string; game: RoomGame; code: string; created_at: string };

/** games hub: a room to join (from ?play= links, chat cards or invite pop-ups) and whether a game is running full screen */
export const useGames = create<{ joinCode: string | null; joinGame: RoomGame; playing: boolean; invites: GameInvite[] }>(() => ({ joinCode: null, joinGame: "streets", playing: false, invites: [] }));

export function joinGame(code: string, game: RoomGame = "streets") {
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  useGames.setState({ joinCode: code.toUpperCase(), joinGame: game });
  void import("@/store/app").then(({ useApp }) => useApp.setState(mobile ? { mobileTab: "games", hub: null, mobileSidebar: true } : { hub: "games" }));
}
