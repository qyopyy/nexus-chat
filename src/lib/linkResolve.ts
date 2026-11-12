import {
  assertMetadataOnly,
  cleanText,
  httpsUrl,
  knownSource,
  parseImportLink,
  soundCloudPage,
  youtubeIsoDuration,
  type ImportSource,
} from "./acetateImportParse";

export type LinkItem = {
  source: ImportSource;
  kind: "track" | "album" | "playlist" | "video" | "episode";
  title: string;
  artist: string | null;
  durationMs: number | null;
  artwork: string | null;
  sourceUrl: string;
  externalId: string | null;
};

export type LinkResolution = {
  title: string;
  source: ImportSource;
  sourceUrl: string;
  artwork: string | null;
  partial: boolean;
  note: string | null;
  items: LinkItem[];
};

type OEmbed = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  html?: string;
};

const spotifyToken: { value: string; exp: number } = { value: "", exp: 0 };

function item(partial: Omit<LinkItem, "title" | "artist" | "artwork" | "sourceUrl"> & { title: unknown; artist?: unknown; artwork?: unknown; sourceUrl: string }): LinkItem | null {
  const sourceUrl = httpsUrl(partial.sourceUrl);
  if (!sourceUrl || knownSource(sourceUrl) !== partial.source) return null;
  const title = cleanText(partial.title, 200);
  if (!title) return null;
  const artist = cleanText(partial.artist, 200);
  return {
    source: partial.source,
    kind: partial.kind,
    title,
    artist: artist || null,
    durationMs: partial.durationMs != null && partial.durationMs >= 0 && partial.durationMs < 86_400_000 ? Math.round(partial.durationMs) : null,
    artwork: httpsUrl(partial.artwork),
    sourceUrl,
    externalId: partial.externalId ? cleanText(partial.externalId, 80) : null,
  };
}

async function oembed(endpoint: string, page: string): Promise<OEmbed | null> {
  const url = new URL(endpoint);
  url.searchParams.set("url", page);
  url.searchParams.set("format", "json");
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Acetate/1.0 (metadata)" } });
  if (!res.ok) return null;
  return (await res.json()) as OEmbed;
}

async function spotifyAppToken() {
  const id = process.env.SPOTIFY_CLIENT_ID || "";
  const secret = process.env.SPOTIFY_CLIENT_SECRET || "";
  if (!id || !secret) return null;
  if (spotifyToken.value && spotifyToken.exp > Date.now() + 30_000) return spotifyToken.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  spotifyToken.value = body.access_token;
  spotifyToken.exp = Date.now() + (body.expires_in ?? 3600) * 1000;
  return spotifyToken.value;
}

async function spotifyGet(path: string) {
  const token = await spotifyAppToken();
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

function spotifyArtist(row: { artists?: { name?: string }[] } | null | undefined) {
  return (row?.artists ?? []).map((artist) => artist.name).filter(Boolean).join(", ");
}

async function resolveSpotify(link: Extract<NonNullable<ReturnType<typeof parseImportLink>>, { source: "spotify" }>, page: string): Promise<LinkResolution> {
  const embed = await oembed("https://open.spotify.com/oembed", page);
  const art = embed?.thumbnail_url;
  const api = await spotifyGet(`/${link.kind}s/${link.id}`);
  if (!api) {
    const one = item({
      source: "spotify",
      kind: link.kind === "playlist" || link.kind === "album" ? link.kind : link.kind,
      title: embed?.title || "Spotify",
      artist: embed?.author_name,
      artwork: art,
      sourceUrl: link.url,
      externalId: link.id,
      durationMs: null,
    });
    return {
      title: one?.title || "Spotify",
      source: "spotify",
      sourceUrl: link.url,
      artwork: one?.artwork || null,
      partial: link.kind === "album" || link.kind === "playlist",
      note: link.kind === "album" || link.kind === "playlist"
        ? "Spotify client credentials are not set, so this is the collection only. Track lists need SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
        : null,
      items: one ? [one] : [],
    };
  }
  if (link.kind === "track" || link.kind === "episode") {
    const row = item({
      source: "spotify",
      kind: link.kind,
      title: api.name,
      artist: link.kind === "episode" ? (api.show as { name?: string } | undefined)?.name : spotifyArtist(api as { artists?: { name?: string }[] }),
      artwork: ((api.album as { images?: { url?: string }[] } | undefined)?.images?.[0]?.url) || art,
      sourceUrl: link.url,
      externalId: link.id,
      durationMs: Number(api.duration_ms) || null,
    });
    return { title: row?.title || "Spotify", source: "spotify", sourceUrl: link.url, artwork: row?.artwork || null, partial: false, note: null, items: row ? [row] : [] };
  }
  const collection = link.kind === "album"
    ? ((api.tracks as { items?: Record<string, unknown>[] } | undefined)?.items ?? [])
    : ((api.tracks as { items?: { track?: Record<string, unknown> | null }[] } | undefined)?.items ?? []).map((row) => row.track).filter((row): row is Record<string, unknown> => !!row);
  const cover = (api.images as { url?: string }[] | undefined)?.[0]?.url || art;
  const items = collection.slice(0, 50).flatMap((row) => {
    const id = String(row.id || "");
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return [];
    const next = item({
      source: "spotify",
      kind: "track",
      title: row.name,
      artist: spotifyArtist(row as { artists?: { name?: string }[] }),
      artwork: cover,
      sourceUrl: `https://open.spotify.com/track/${id}`,
      externalId: id,
      durationMs: Number(row.duration_ms) || null,
    });
    return next ? [next] : [];
  });
  const title = cleanText(api.name, 200) || embed?.title || "Spotify";
  return {
    title,
    source: "spotify",
    sourceUrl: link.url,
    artwork: httpsUrl(cover),
    partial: collection.length > 50,
    note: collection.length > 50 ? "Showing the first 50 tracks." : null,
    items,
  };
}

async function youtubeVideo(id: string, embed: OEmbed | null): Promise<LinkItem | null> {
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || "";
  let durationMs: number | null = null;
  let title = embed?.title || "";
  let artist = embed?.author_name || "";
  let artwork = embed?.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  if (key) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", id);
    url.searchParams.set("key", key);
    const res = await fetch(url);
    if (res.ok) {
      const body = (await res.json()) as { items?: { snippet?: { title?: string; channelTitle?: string; thumbnails?: { high?: { url?: string } } }; contentDetails?: { duration?: string } }[] };
      const row = body.items?.[0];
      if (row?.snippet?.title) title = row.snippet.title;
      if (row?.snippet?.channelTitle) artist = row.snippet.channelTitle;
      if (row?.snippet?.thumbnails?.high?.url) artwork = row.snippet.thumbnails.high.url;
      durationMs = youtubeIsoDuration(row?.contentDetails?.duration);
    }
  }
  return item({
    source: "youtube",
    kind: "video",
    title: title || "YouTube",
    artist,
    artwork,
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    externalId: id,
    durationMs,
  });
}

async function resolveYouTube(link: Extract<NonNullable<ReturnType<typeof parseImportLink>>, { source: "youtube" }>, page: string): Promise<LinkResolution> {
  const embed = await oembed("https://www.youtube.com/oembed", page);
  if (link.kind === "video") {
    const row = await youtubeVideo(link.id, embed);
    return { title: row?.title || "YouTube", source: "youtube", sourceUrl: link.url, artwork: row?.artwork || null, partial: false, note: null, items: row ? [row] : [] };
  }
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!key) {
    const row = item({
      source: "youtube",
      kind: "playlist",
      title: embed?.title || "YouTube playlist",
      artist: embed?.author_name,
      artwork: embed?.thumbnail_url,
      sourceUrl: link.url,
      externalId: link.id,
      durationMs: null,
    });
    return {
      title: row?.title || "YouTube playlist",
      source: "youtube",
      sourceUrl: link.url,
      artwork: row?.artwork || null,
      partial: true,
      note: "YouTube playlist tracks need YOUTUBE_API_KEY. This entry is the playlist only.",
      items: row ? [row] : [],
    };
  }
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("playlistId", link.id);
  url.searchParams.set("key", key);
  const res = await fetch(url);
  if (!res.ok) throw new Error("YouTube didn't return that playlist");
  const body = (await res.json()) as { items?: { snippet?: { title?: string; videoOwnerChannelTitle?: string; thumbnails?: { high?: { url?: string } } }; contentDetails?: { videoId?: string } }[] };
  const items: LinkItem[] = [];
  for (const row of body.items ?? []) {
    const id = row.contentDetails?.videoId || "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    const next = item({
      source: "youtube",
      kind: "video",
      title: row.snippet?.title || "YouTube",
      artist: row.snippet?.videoOwnerChannelTitle,
      artwork: row.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      sourceUrl: `https://www.youtube.com/watch?v=${id}`,
      externalId: id,
      durationMs: null,
    });
    if (next) items.push(next);
  }
  return {
    title: cleanText(embed?.title, 200) || "YouTube playlist",
    source: "youtube",
    sourceUrl: link.url,
    artwork: httpsUrl(embed?.thumbnail_url || items[0]?.artwork),
    partial: (body.items?.length ?? 0) >= 50,
    note: (body.items?.length ?? 0) >= 50 ? "Showing the first 50 videos." : null,
    items,
  };
}

async function soundCloudToken() {
  const id = process.env.SOUNDCLOUD_CLIENT_ID || "";
  const secret = process.env.SOUNDCLOUD_CLIENT_SECRET || "";
  if (!id || !secret) return null;
  const res = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: { Accept: "application/json; charset=utf-8", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string };
  return body.access_token || null;
}

async function resolveSoundCloud(page: string): Promise<LinkResolution> {
  const safe = soundCloudPage(page);
  if (!safe) throw new Error("Paste a SoundCloud track or playlist page. Acetate does not read stream URLs.");
  const embed = await oembed("https://soundcloud.com/oembed", safe);
  const token = await soundCloudToken();
  if (token) {
    const resolved = await fetch(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(safe)}`, {
      headers: { Accept: "application/json; charset=utf-8", Authorization: `OAuth ${token}` },
    });
    if (resolved.ok) {
      const body = (await resolved.json()) as {
        kind?: string;
        title?: string;
        permalink_url?: string;
        artwork_url?: string;
        duration?: number;
        user?: { username?: string };
        tracks?: { id?: number; title?: string; permalink_url?: string; artwork_url?: string; duration?: number; user?: { username?: string } }[];
      };
      const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 50) : [];
      if (tracks.length) {
        const items = tracks.map((track) => item({
          source: "soundcloud",
          kind: "track",
          title: track.title,
          artist: track.user?.username || body.user?.username,
          artwork: largerArt(track.artwork_url || body.artwork_url),
          sourceUrl: track.permalink_url || safe,
          externalId: track.id ? String(track.id) : null,
          durationMs: track.duration ?? null,
        })).filter((row): row is LinkItem => !!row);
        return {
          title: cleanText(body.title || embed?.title, 200) || "SoundCloud",
          source: "soundcloud",
          sourceUrl: httpsUrl(body.permalink_url) || safe,
          artwork: httpsUrl(largerArt(body.artwork_url) || embed?.thumbnail_url),
          partial: (body.tracks?.length ?? 0) > 50,
          note: "Metadata only. SoundCloud audio is not downloaded from a link.",
          items,
        };
      }
      const one = item({
        source: "soundcloud",
        kind: body.kind === "playlist" ? "playlist" : "track",
        title: body.title || embed?.title,
        artist: body.user?.username || embed?.author_name,
        artwork: largerArt(body.artwork_url) || embed?.thumbnail_url,
        sourceUrl: body.permalink_url || safe,
        externalId: null,
        durationMs: body.duration ?? null,
      });
      if (one) {
        return { title: one.title, source: "soundcloud", sourceUrl: one.sourceUrl, artwork: one.artwork, partial: false, note: "Metadata only. SoundCloud audio is not downloaded from a link.", items: [one] };
      }
    }
  }
  const one = item({
    source: "soundcloud",
    kind: new URL(safe).pathname.includes("/sets/") ? "playlist" : "track",
    title: embed?.title || "SoundCloud",
    artist: embed?.author_name,
    artwork: embed?.thumbnail_url,
    sourceUrl: safe,
    externalId: null,
    durationMs: null,
  });
  const playlist = one?.kind === "playlist";
  return {
    title: one?.title || "SoundCloud",
    source: "soundcloud",
    sourceUrl: safe,
    artwork: one?.artwork || null,
    partial: playlist && !token,
    note: playlist && !token
      ? "SoundCloud credentials are not set, so this is the playlist only. Metadata only either way — audio is not downloaded."
      : "Metadata only. SoundCloud audio is not downloaded from a link.",
    items: one ? [one] : [],
  };
}

function largerArt(url?: string | null) {
  if (!url) return null;
  return url.replace("-large.", "-t500x500.");
}

export async function resolveLink(raw: string): Promise<LinkResolution> {
  const page = httpsUrl(raw.trim()) || raw.trim();
  const source = knownSource(page);
  if (!source) throw new Error("Paste a Spotify, YouTube, or SoundCloud link.");
  const parsed = parseImportLink(page);
  let result: LinkResolution;
  if (source === "spotify") {
    if (!parsed || parsed.source !== "spotify") throw new Error("That Spotify link needs a track, album, playlist, or episode.");
    result = await resolveSpotify(parsed, parsed.url);
  } else if (source === "youtube") {
    if (!parsed || parsed.source !== "youtube") throw new Error("That YouTube link needs a video or a playlist.");
    result = await resolveYouTube(parsed, parsed.url);
  } else {
    result = await resolveSoundCloud(parsed && parsed.source === "soundcloud" ? parsed.url : page);
  }
  if (!result.items.length) throw new Error("No public metadata came back for that link.");
  assertMetadataOnly(result);
  return result;
}
