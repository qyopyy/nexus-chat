"use client";

import { create } from "zustand";

export type StudioSection =
  | "dashboard"
  | "content"
  | "analytics"
  | "comments"
  | "customization"
  | "releases"
  | "royalties"
  | "review"
  | "dist-settings";

export type VideosRoute = { view: "home"; q?: string; tab?: "all" | "subs" } | { view: "watch"; key: string; t?: number } | { view: "channel"; userId: string };

type S = {
  section: StudioSection;
  /** open release editor */
  releaseId: string | null;
  /** video being edited in the details dialog */
  editVideoId: string | null;
  uploadOpen: boolean;
  videoStack: VideosRoute[];
};

export const useStudio = create<S>(() => ({
  section: "dashboard",
  releaseId: null,
  editVideoId: null,
  uploadOpen: false,
  videoStack: [{ view: "home" }],
}));

export const studioGo = (section: StudioSection) => useStudio.setState({ section, releaseId: null });
export const openRelease = (id: string | null) => useStudio.setState({ section: "releases", releaseId: id });

export function videosGo(r: VideosRoute) {
  useStudio.setState((s) => ({ videoStack: [...s.videoStack, r].slice(-20) }));
}
export function videosBack() {
  useStudio.setState((s) => ({ videoStack: s.videoStack.length > 1 ? s.videoStack.slice(0, -1) : s.videoStack }));
}
export function videosHome() {
  useStudio.setState({ videoStack: [{ view: "home" }] });
}
