"use client";

import { create } from "zustand";
import { loadJSON, saveJSON } from "./utils";

// Typing privacy + how typing looks (per device).
export type TypingStyle = "dots" | "wave" | "pulse" | "keys" | "pencil" | "orbit" | "equalizer";
export type LiveStyle = "pop" | "glow" | "blur" | "matrix" | "rainbow" | "plain";
export type ChatFx = {
  /** let others see "… is typing" */
  showTyping: boolean;
  /** let others see your words while you type */
  liveTyping: boolean;
  /** how OTHER people's typing looks to me */
  style: TypingStyle;
  liveStyle: LiveStyle;
};
const KEY = "nexus.chatfx";
const DEF: ChatFx = { showTyping: true, liveTyping: false, style: "wave", liveStyle: "pop" };
export const useChatFx = create<ChatFx>(() => (typeof window === "undefined" ? DEF : { ...DEF, ...loadJSON<Partial<ChatFx>>(KEY, {}) }));
export function setChatFx(patch: Partial<ChatFx>) {
  useChatFx.setState(patch);
  saveJSON(KEY, useChatFx.getState());
}

export const TYPING_STYLES: [TypingStyle, string][] = [
  ["wave", "Wave"],
  ["dots", "Classic dots"],
  ["pulse", "Pulse bubble"],
  ["keys", "Keyboard"],
  ["pencil", "Pencil"],
  ["orbit", "Orbit"],
  ["equalizer", "Equalizer"],
];
export const LIVE_STYLES: [LiveStyle, string][] = [
  ["pop", "Pop-in"],
  ["glow", "Neon glow"],
  ["blur", "Blur focus"],
  ["matrix", "Matrix"],
  ["rainbow", "Rainbow"],
  ["plain", "Plain"],
];
