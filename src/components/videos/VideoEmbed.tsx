"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { videosGo } from "@/store/studio";
import { fmtViews, getVideo, VIDEO_LINK_RE } from "@/lib/videos";
import { Thumb } from "./VideoCard";
import type { Video } from "@/lib/types";

const cache = new Map<string, Video | null>();

/** Rich preview for Nexus video links sent in chat */
export default function VideoEmbed({ text }: { text: string }) {
  const m = text.match(VIDEO_LINK_RE);
  const host = typeof window !== "undefined" ? window.location.host : "";
  const sameSite = !!m && (text.includes(host) || !/https?:\/\//.test(text.slice(0, text.indexOf("/v/"))));
  const key = m?.[1] ?? null;
  const [v, setV] = useState<Video | null>(key ? (cache.get(key) ?? null) : null);
  const owner = useApp((s) => (v ? s.profiles[v.owner_id] : undefined));
  useEffect(() => {
    if (!key || !sameSite || cache.has(key)) return;
    void getVideo(key).then((x) => {
      cache.set(key, x);
      setV(x);
    });
  }, [key, sameSite]);
  if (!key || !sameSite || !v) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        useApp.setState({ hub: "videos", mobileTab: "videos", mobileSidebar: true });
        videosGo({ view: "watch", key });
      }}
      className="mt-2 block w-72 max-w-full overflow-hidden rounded-xl bg-black/25 text-left ring-1 ring-white/10 transition hover:ring-white/25"
    >
      <Thumb v={v} rounded="rounded-none" />
      <div className="p-2.5">
        <div className="line-clamp-2 text-sm font-semibold">{v.title}</div>
        <div className="mt-0.5 truncate text-xs opacity-70">
          {owner?.display_name ?? "…"} · {fmtViews(v.views)} views
        </div>
      </div>
    </button>
  );
}
