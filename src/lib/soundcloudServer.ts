import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { cleanText, httpsUrl, soundCloudPage } from "./acetateImportParse";

/** Server-only SoundCloud OAuth. Audio is fetched only from the official /download endpoint. */

export const SOUNDCLOUD_IMPORT_MAX = 80 * 1024 * 1024;
export const SC_COOKIE = "ac_sc";
export const SC_PKCE = "ac_sc_pkce";

export type ScSession = {
  access: string;
  refresh: string;
  exp: number;
  scId: string;
  name: string;
  userId: string;
};

type ApiTrack = {
  id?: number | string;
  title?: string;
  permalink_url?: string;
  artwork_url?: string;
  duration?: number;
  downloadable?: boolean;
  download_url?: string;
  user?: { id?: number | string; username?: string };
};

export type ScCard = {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number | null;
  permalink: string;
  own: boolean;
  canImport: boolean;
  reason: string | null;
};

export function soundCloudConfigured() {
  return Boolean(process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET);
}

export function redirectUri(req: Request) {
  const fixed = process.env.SOUNDCLOUD_REDIRECT_URI?.trim();
  if (fixed) return fixed;
  return `${new URL(req.url).origin}/api/acetate/soundcloud/callback`;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function sign(payload: string) {
  const key = process.env.SOUNDCLOUD_CLIENT_SECRET || "";
  const mac = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function unsign(token: string) {
  const key = process.env.SOUNDCLOUD_CLIENT_SECRET || "";
  const cut = token.lastIndexOf(".");
  if (!key || cut <= 0) return null;
  const payload = token.slice(0, cut);
  const mac = token.slice(cut + 1);
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return payload;
}

export function seal(value: unknown) {
  return sign(Buffer.from(JSON.stringify(value)).toString("base64url"));
}

export function open<T>(token: string | undefined): T | null {
  if (!token) return null;
  const payload = unsign(token);
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(16).toString("base64url") };
}

export function authorizeUrl(req: Request, challenge: string, state: string) {
  const url = new URL("https://secure.soundcloud.com/authorize");
  url.searchParams.set("client_id", process.env.SOUNDCLOUD_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function userFromRequest(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function flagEnabled(name: "soundcloud_import" | "link_import" | "format_convert") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return true;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from("site_settings").select(name).eq("id", 1).maybeSingle();
  if (error || !data) return true;
  return (data as Record<string, boolean>)[name] !== false;
}

async function tokenRequest(body: URLSearchParams) {
  const res = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: { Accept: "application/json; charset=utf-8", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("SoundCloud didn't accept that sign-in");
  return (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeCode(req: Request, code: string, verifier: string) {
  const body = await tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.SOUNDCLOUD_CLIENT_ID || "",
    client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET || "",
    redirect_uri: redirectUri(req),
    code_verifier: verifier,
    code,
  }));
  if (!body.access_token || !body.refresh_token) throw new Error("SoundCloud didn't return a token");
  return body;
}

async function api(access: string, path: string) {
  const res = await fetch(`https://api.soundcloud.com${path}`, {
    headers: { Accept: "application/json; charset=utf-8", Authorization: `OAuth ${access}` },
  });
  if (res.status === 401) return { unauthorized: true as const, json: null };
  if (!res.ok) throw new Error(`SoundCloud request failed (${res.status})`);
  return { unauthorized: false as const, json: await res.json() };
}

export async function refreshSession(session: ScSession): Promise<ScSession> {
  const body = await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.SOUNDCLOUD_CLIENT_ID || "",
    client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET || "",
    refresh_token: session.refresh,
  }));
  if (!body.access_token || !body.refresh_token) throw new Error("Reconnect SoundCloud");
  return { ...session, access: body.access_token, refresh: body.refresh_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
}

export async function liveSession(raw: string | undefined) {
  const session = open<ScSession>(raw);
  if (!session?.access || !session.refresh || !session.userId) return { session: null, sealed: null as string | null };
  if (session.exp > Date.now() + 60_000) return { session, sealed: null as string | null };
  const next = await refreshSession(session);
  return { session: next, sealed: seal(next) };
}

function idOf(value: number | string | undefined) {
  if (value == null) return "";
  const text = String(value);
  const urn = text.match(/(\d{1,20})$/);
  return urn ? urn[1] : "";
}

export function publicArt(value?: string | null) {
  const safe = httpsUrl(value || "");
  if (!safe) return null;
  try {
    const host = new URL(safe).hostname.toLowerCase();
    if (!host.endsWith("sndcdn.com") && !host.endsWith("soundcloud.com")) return safe;
  } catch {
    return null;
  }
  return safe.replace("-large.", "-t500x500.");
}

function officialDownload(track: ApiTrack) {
  const id = idOf(track.id);
  if (!track.download_url || !id) return null;
  try {
    const url = new URL(track.download_url);
    if (url.protocol !== "https:" || url.hostname !== "api.soundcloud.com") return null;
    const path = url.pathname.toLowerCase();
    if (!path.includes("/download") || path.includes("/stream")) return null;
    if (!path.includes(id)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function card(track: ApiTrack, meId: string, forceOwn = false): ScCard | null {
  const id = idOf(track.id);
  const permalink = soundCloudPage(track.permalink_url || "");
  if (!id || !permalink) return null;
  const own = forceOwn || (idOf(track.user?.id) === meId && meId !== "");
  const download = officialDownload(track);
  const canImport = own || (track.downloadable === true && !!download);
  return {
    id,
    title: cleanText(track.title, 200) || "Untitled",
    artist: cleanText(track.user?.username, 200) || "SoundCloud",
    artwork: publicArt(track.artwork_url),
    durationMs: typeof track.duration === "number" ? track.duration : null,
    permalink,
    own,
    canImport,
    reason: canImport ? null : "This track is not downloadable. The artist has not enabled downloads.",
  };
}

export async function soundCloudMe(access: string) {
  const res = await api(access, "/me");
  if (res.unauthorized || !res.json) return null;
  const body = res.json as { id?: number | string; username?: string };
  const id = idOf(body.id);
  if (!id) return null;
  return { id, name: cleanText(body.username, 80) || "SoundCloud" };
}

export async function listOwnTracks(access: string, meId: string) {
  const res = await api(access, "/me/tracks?limit=50");
  if (res.unauthorized) throw new Error("Reconnect SoundCloud");
  const body = res.json as ApiTrack[] | { collection?: ApiTrack[] };
  const rows = Array.isArray(body) ? body : body.collection ?? [];
  return rows.map((track) => card(track, meId, true)).filter((track): track is ScCard => !!track);
}

export async function inspectTrack(access: string, meId: string, trackId: string) {
  const res = await api(access, `/tracks/${encodeURIComponent(trackId)}`);
  if (res.unauthorized) throw new Error("Reconnect SoundCloud");
  const row = card(res.json as ApiTrack, meId);
  if (!row) throw new Error("SoundCloud didn't return that track");
  return { card: row, download: officialDownload(res.json as ApiTrack), rawOwn: idOf((res.json as ApiTrack).user?.id) === meId };
}

export async function resolveTrack(access: string, meId: string, page: string) {
  const safe = soundCloudPage(page);
  if (!safe) throw new Error("Paste a SoundCloud track page. Acetate does not read stream URLs.");
  const res = await api(access, `/resolve?url=${encodeURIComponent(safe)}`);
  if (res.unauthorized) throw new Error("Reconnect SoundCloud");
  const body = res.json as ApiTrack & { kind?: string };
  if (body.kind && body.kind !== "track") throw new Error("Paste one SoundCloud track. Playlists stay metadata-only.");
  const row = card(body, meId);
  if (!row) throw new Error("SoundCloud didn't return that track");
  return row;
}

function allowedFileHost(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (path.includes("/streams") || path.endsWith("/stream")) return false;
  if (host === "api.soundcloud.com") return path.includes("/download");
  if (host === "sndcdn.com" || host.endsWith(".sndcdn.com")) return true;
  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) return true;
  return false;
}

async function followDownload(start: string, access: string) {
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    if (!allowedFileHost(current)) {
      throw new Error("SoundCloud did not return an official download. Acetate will not use the stream.");
    }
    const res = await fetch(current, {
      headers: { Authorization: `OAuth ${access}`, Accept: "*/*" },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("SoundCloud did not return an official download. Acetate will not use the stream.");
      current = new URL(next, current).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new Error("SoundCloud did not enable a download for this track. Acetate will not use the stream.");
    }
    if (!res.ok) throw new Error(`SoundCloud download failed (${res.status}).`);
    return res;
  }
  throw new Error("SoundCloud did not return an official download. Acetate will not use the stream.");
}

export async function readDownload(access: string, meId: string, trackId: string) {
  const found = await inspectTrack(access, meId, trackId);
  if (!found.card.canImport) {
    throw new Error(found.card.reason || "This track is not downloadable.");
  }
  const endpoint = found.download || (found.rawOwn ? `https://api.soundcloud.com/tracks/${trackId}/download` : "");
  if (!endpoint) throw new Error("SoundCloud did not expose a download URL. Acetate will not use the stream.");
  const res = await followDownload(endpoint, access);
  const length = Number(res.headers.get("content-length") || 0);
  if (length > SOUNDCLOUD_IMPORT_MAX) {
    throw new Error(`That download is over 80 MB. Download it from SoundCloud and upload the file into Vault. Acetate will not use the stream.`);
  }
  if (!res.body) throw new Error("SoundCloud returned an empty download.");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > SOUNDCLOUD_IMPORT_MAX) {
      await reader.cancel();
      throw new Error("That download is over 80 MB. Download it from SoundCloud and upload the file into Vault. Acetate will not use the stream.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const type = res.headers.get("content-type") || "application/octet-stream";
  return { bytes, type, card: found.card };
}

export function extFor(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes("wav")) return "wav";
  if (lower.includes("flac")) return "flac";
  if (lower.includes("aiff") || lower.includes("aif")) return "aiff";
  if (lower.includes("mp4") || lower.includes("aac") || lower.includes("m4a")) return "m4a";
  if (lower.includes("ogg")) return "ogg";
  return "mp3";
}

export function sniffAudioExt(bytes: Uint8Array, type: string) {
  const head = Buffer.from(bytes.subarray(0, 12)).toString("latin1");
  if (head.startsWith("RIFF") && Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WAVE") return "wav";
  if (head.startsWith("fLaC")) return "flac";
  if (head.startsWith("FORM")) return "aiff";
  if (head.startsWith("OggS")) return "ogg";
  if (head.includes("ftyp")) return "m4a";
  if (head.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "mp3";
  return extFor(type);
}
