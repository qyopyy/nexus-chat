"use client";

/** Link previews for private messages — Open Graph / Twitter / classic SEO meta. */

export type LinkPreview = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  /** special players */
  youtubeId?: string | null;
  spotifyEmbed?: string | null;
};

export const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

export function extractUrls(text: string, limit = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const u = m[1];
    if (seen.has(u)) continue;
    // Nexus video cards & game invites already render their own embeds
    if (/\/v\/[A-Za-z0-9_-]+/.test(u) || /[?&]play=[A-Z2-9]{6}\b/.test(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, "") === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/);
      return m?.[1] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const mem = new Map<string, LinkPreview | null>();
const inflight = new Map<string, Promise<LinkPreview | null>>();

function fromSession(url: string): LinkPreview | null | undefined {
  try {
    const raw = sessionStorage.getItem(`nexus:unfurl:${url}`);
    if (raw === "null") return null;
    if (!raw) return undefined;
    return JSON.parse(raw) as LinkPreview;
  } catch {
    return undefined;
  }
}

function toSession(url: string, p: LinkPreview | null) {
  try {
    sessionStorage.setItem(`nexus:unfurl:${url}`, p ? JSON.stringify(p) : "null");
  } catch {
    /* quota */
  }
}

/** Resolve a rich preview: YouTube/Spotify short-circuit client-side; everything else hits /api/unfurl. */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (mem.has(url)) return mem.get(url)!;
  const cached = fromSession(url);
  if (cached !== undefined) {
    mem.set(url, cached);
    return cached;
  }
  const hit = inflight.get(url);
  if (hit) return hit;

  const job = (async () => {
    const yt = youtubeId(url);
    if (yt) {
      const preview: LinkPreview = {
        url,
        finalUrl: url,
        title: "YouTube",
        description: null,
        image: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
        siteName: "YouTube",
        favicon: "https://www.youtube.com/favicon.ico",
        youtubeId: yt,
      };
      // enrich title via oEmbed (no CORS issues)
      try {
        const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (r.ok) {
          const j = (await r.json()) as { title?: string; author_name?: string };
          preview.title = j.title ?? preview.title;
          preview.description = j.author_name ? `by ${j.author_name}` : null;
        }
      } catch {
        /* keep stub */
      }
      mem.set(url, preview);
      toSession(url, preview);
      return preview;
    }

    try {
      const { spotifyEmbed } = await import("./links");
      const emb = spotifyEmbed(url);
      if (emb) {
        const preview: LinkPreview = {
          url,
          finalUrl: url,
          title: "Spotify",
          description: null,
          image: null,
          siteName: "Spotify",
          favicon: "https://open.spotify.com/favicon.ico",
          spotifyEmbed: emb,
        };
        mem.set(url, preview);
        toSession(url, preview);
        return preview;
      }
    } catch {
      /* continue */
    }

    try {
      const r = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`, { credentials: "same-origin" });
      if (!r.ok) {
        mem.set(url, null);
        toSession(url, null);
        return null;
      }
      const preview = (await r.json()) as LinkPreview;
      mem.set(url, preview);
      toSession(url, preview);
      return preview;
    } catch {
      mem.set(url, null);
      return null;
    }
  })();

  inflight.set(url, job);
  try {
    return await job;
  } finally {
    inflight.delete(url);
  }
}
