"use client";

import { create } from "zustand";

export type MusicRoute =
  | { view: "home" }
  | { view: "artist"; id: string; name?: string }
  | { view: "page"; handle: string }
  | { view: "lookup"; tab?: "isrc" | "upc" | "link" }
  | { view: "library" }
  | { view: "search"; q?: string }
  | { view: "tool"; tool: import("@/components/music/Tools").ToolId };

export const useMusic = create<{ stack: MusicRoute[] }>(() => ({ stack: [{ view: "home" }] }));

export const musicRoute = () => {
  const s = useMusic.getState().stack;
  return s[s.length - 1];
};
export function musicGo(r: MusicRoute) {
  useMusic.setState((s) => ({ stack: [...s.stack, r].slice(-20) }));
}
export function musicBack() {
  useMusic.setState((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack }));
}
export function musicHome() {
  useMusic.setState({ stack: [{ view: "home" }] });
}
