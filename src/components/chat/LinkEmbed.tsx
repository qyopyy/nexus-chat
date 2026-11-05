"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractUrls, fetchLinkPreview, hostLabel, type LinkPreview } from "@/lib/unfurl";

/** Discord-style link embeds (OG image + SEO title/description) for private chats. */
export default function LinkEmbed({ text, mine }: { text: string; mine?: boolean }) {
  const urls = extractUrls(text, 2);
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex w-full max-w-[340px] flex-col gap-2">
      {urls.map((u) => (
        <EmbedCard key={u} url={u} mine={mine} />
      ))}
    </div>
  );
}

function EmbedCard({ url, mine }: { url: string; mine?: boolean }) {
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void fetchLinkPreview(url).then((p) => {
      if (live) setPreview(p);
    });
    return () => {
      live = false;
    };
  }, [url]);

  if (preview === undefined) {
    return <div className={cn("h-24 animate-pulse rounded-xl", mine ? "bg-white/10" : "bg-black/20")} />;
  }
  if (!preview) return null;

  if (preview.youtubeId) {
    return (
      <a
        href={preview.finalUrl || url}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        className={cn("block overflow-hidden rounded-xl ring-1 transition hover:ring-white/30", mine ? "bg-black/20 ring-white/15" : "bg-black/25 ring-white/10")}
      >
        <div className="relative aspect-video bg-black">
          <img src={preview.image ?? undefined} alt="" className="size-full object-cover" loading="lazy" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full bg-[#ff0033] text-white shadow-lg">▶</span>
          </span>
        </div>
        <div className="border-l-4 border-[#ff0033] p-2.5">
          <div className="text-[10px] font-bold tracking-wide text-white/55 uppercase">YouTube</div>
          <div className="line-clamp-2 text-sm font-semibold">{preview.title}</div>
          {preview.description && <div className="mt-0.5 truncate text-xs opacity-70">{preview.description}</div>}
        </div>
      </a>
    );
  }

  if (preview.spotifyEmbed) {
    return (
      <div className="overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
        <iframe src={preview.spotifyEmbed} title="Spotify" loading="lazy" allow="encrypted-media; clipboard-write" className="h-[152px] w-full border-0" />
      </div>
    );
  }

  const host = preview.siteName || hostLabel(preview.finalUrl || url);
  return (
    <a
      href={preview.finalUrl || url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "block overflow-hidden rounded-xl border-l-4 text-left ring-1 transition hover:brightness-110",
        mine ? "border-[#6ab7ff] bg-black/20 ring-white/10" : "border-accent bg-black/25 ring-white/10",
      )}
    >
      {preview.image && (
        <div className="max-h-44 overflow-hidden bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.image}
            alt=""
            className="max-h-44 w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement | null)?.remove();
            }}
          />
        </div>
      )}
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-white/55 uppercase">
          {preview.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.favicon}
              alt=""
              className="size-3.5 rounded-sm"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <span className="truncate">{host}</span>
          <ExternalLink className="ml-auto size-3 opacity-50" />
        </div>
        {preview.title && <div className="mt-1 line-clamp-2 text-sm font-semibold text-[#6ab7ff]">{preview.title}</div>}
        {preview.description && <div className="mt-0.5 line-clamp-3 text-xs leading-snug opacity-75">{preview.description}</div>}
      </div>
    </a>
  );
}
