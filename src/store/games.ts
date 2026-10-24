"use client";

import { create } from "zustand";

/** games hub: a room code to join (from ?play= links / chat invites) and whether a game is running full screen */
export const useGames = create<{ joinCode: string | null; playing: boolean }>(() => ({ joinCode: null, playing: false }));

export function joinGame(code: string) {
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  useGames.setState({ joinCode: code.toUpperCase() });
  void import("@/store/app").then(({ useApp }) => useApp.setState(mobile ? { mobileTab: "games", hub: null } : { hub: "games" }));
}
