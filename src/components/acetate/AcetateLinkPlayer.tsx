"use client";

import type { ImportSource } from "@/lib/acetateImportParse";

type Playable = {
  source: ImportSource;
  kind: string;
  title: string;
  externalId: string | null;
  sourceUrl: string;
};

const YT = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST = /^[A-Za-z0-9_-]{12,80}$/;
const SPOTIFY = /^[A-Za-z0-9]{10,40}$/;

function embedFor(item: Playable) {
  if (item.source === "youtube" && item.externalId && YT.test(item.externalId)) {
    return { src: `https://www.youtube.com/embed/${item.externalId}?playsinline=1&rel=0&modestbranding=1`, className: "aspect-video" };
  }
  if (item.source === "youtube" && item.kind === "playlist" && item.externalId && YT_LIST.test(item.externalId)) {
    return { src: `https://www.youtube.com/embed/videoseries?list=${item.externalId}&playsinline=1&rel=0`, className: "aspect-video" };
  }
  if (item.source === "spotify" && item.externalId && SPOTIFY.test(item.externalId)) {
    const kind = item.kind === "album" || item.kind === "playlist" || item.kind === "episode" ? item.kind : "track";
    return { src: `https://open.spotify.com/embed/${kind}/${item.externalId}`, className: kind === "track" || kind === "episode" ? "h-40" : "h-80" };
  }
  if (item.source === "soundcloud" && /^https:\/\/([a-z0-9-]+\.)?soundcloud\.com\//i.test(item.sourceUrl)) {
    return {
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(item.sourceUrl)}&auto_play=false&hide_related=true&show_comments=false&show_teaser=false&visual=false`,
      className: "h-44",
    };
  }
  return null;
}

const NAMES: Record<ImportSource, string> = { youtube: "YouTube", spotify: "Spotify", soundcloud: "SoundCloud" };

/** Official embeds only. This component never plays or stores a ripped audio file. */
export default function AcetateLinkPlayer({ item }: { item: Playable }) {
  const embed = embedFor(item);
  const name = NAMES[item.source];
  return (
    <div className="mt-2">
      {embed ? (
        <iframe
          title={item.title}
          src={embed.src}
          className={`block w-full rounded-2xl border-0 ${embed.className}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <p className="text-sm" style={{ color: "var(--ac-muted, #a3988c)" }}>No official player for this entry. Open it in {name}.</p>
      )}
      <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold" style={{ color: "var(--ac-accent, #e4a15a)" }}>
        Open in {name}
      </a>
    </div>
  );
}
