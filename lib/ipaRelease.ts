// Latest-release lookup for a PRIVATE GitHub repo. Pure logic with an injected fetch so it can be tested.
//
// The repo can stay private: the server holds a read-only token (an env var, never in the repo or the browser),
// finds the newest release, and sends visitors to a short-lived download link that GitHub itself signs.
// The token is never put in any link or response.

export const RELEASE_REPO = "qyopyy/nexus-chat";

export type GhAsset = { id: number; name: string; size: number; browser_download_url: string };
export type GhRelease = { tag_name: string; name: string | null; published_at: string | null; draft?: boolean; prerelease?: boolean; body?: string | null; assets: GhAsset[] };

export type AssetSpec = { match: (tag: string) => boolean; assetHint?: string; exts: string[] };

export type Hit = { tag: string; name: string; publishedAt: string | null; notes: string; asset: { id: number; name: string; size: number; publicUrl: string } };

/** Newest published release whose tag matches and that carries a fitting file. Drafts never count. */
export function pickAsset(releases: GhRelease[], spec: AssetSpec): Hit | null {
  const ordered = [...releases].filter((r) => !r.draft).sort((a, b) => +new Date(b.published_at ?? 0) - +new Date(a.published_at ?? 0));
  for (const r of ordered) {
    if (!spec.match(r.tag_name || "")) continue;
    const files = r.assets ?? [];
    const asset = files.find((a) => a.name === spec.assetHint) ?? files.find((a) => spec.exts.some((e) => a.name.toLowerCase().endsWith(e)));
    if (!asset) continue;
    return { tag: r.tag_name, name: r.name || r.tag_name, publishedAt: r.published_at, notes: cleanNotes(r.body), asset: { id: asset.id, name: asset.name, size: asset.size, publicUrl: asset.browser_download_url } };
  }
  return null;
}

export function cleanNotes(body: string | null | undefined, max = 500): string {
  const t = (body ?? "")
    .replace(/\r/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "…" : t;
}

export function tagMatcher(kind: string, prefix: string): (tag: string) => boolean {
  // "ios-12" is the Nexus Sideloadly build; "ios-appstore-12" is a different one and must never match it.
  const exact: Record<string, RegExp> = {
    nexus: /^ios-\d+$/,
    wump: /^wump-ios-\d+$/,
    browser: /^browser-ios-\d+$/,
    link: /^link-ios-\d+$/,
    distro: /^distro-ios-\d+$/,
    untitled: /^untitled-ios-\d+$/,
  };
  const re = exact[kind];
  return re ? (t) => re.test(t) : (t) => t.startsWith(prefix);
}

export const versionOf = (tag: string) => tag.replace(/^.*?(\d+(\.\d+)*)$/, "$1");

// ------------------------------------------------------------------ talking to GitHub
export type Fetch = (url: string, init?: { headers?: Record<string, string>; redirect?: "manual" | "follow" }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; headers: { get: (n: string) => string | null } }>;

const headers = (token: string | undefined, accept: string): Record<string, string> => ({
  Accept: accept,
  "User-Agent": "nexus-ipa-downloads",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export type ReleasesResult = { ok: true; releases: GhRelease[] } | { ok: false; error: "needs_token" | "bad_token" | "rate_limited" | "github_unavailable"; status: number };

export async function fetchReleases(f: Fetch, token?: string, repo = RELEASE_REPO): Promise<ReleasesResult> {
  let r;
  try {
    r = await f(`https://api.github.com/repos/${repo}/releases?per_page=60`, { headers: headers(token, "application/vnd.github+json") });
  } catch {
    return { ok: false, error: "github_unavailable", status: 0 };
  }
  if (r.ok) return { ok: true, releases: (await r.json()) as GhRelease[] };
  // a private repo answers 404 to anyone without access
  if (r.status === 404) return { ok: false, error: token ? "bad_token" : "needs_token", status: 404 };
  if (r.status === 401) return { ok: false, error: "bad_token", status: 401 };
  if (r.status === 403 || r.status === 429) return { ok: false, error: r.headers.get("x-ratelimit-remaining") === "0" || r.status === 429 ? "rate_limited" : "bad_token", status: r.status };
  return { ok: false, error: "github_unavailable", status: r.status };
}

/** GitHub answers an asset request with a redirect to a signed link that lasts a few minutes. We hand that to the visitor. */
export async function signedAssetUrl(f: Fetch, hit: Hit, token?: string, repo = RELEASE_REPO): Promise<string | null> {
  if (!token) return hit.asset.publicUrl; // public repo: the normal link works
  let r;
  try {
    r = await f(`https://api.github.com/repos/${repo}/releases/assets/${hit.asset.id}`, { headers: headers(token, "application/octet-stream"), redirect: "manual" });
  } catch {
    return null;
  }
  const loc = r.headers.get("location");
  return r.status >= 300 && r.status < 400 && loc ? loc : null;
}

export const ERROR_TEXT: Record<string, string> = {
  needs_token: "Downloads are being set up. Please try again soon.",
  bad_token: "Downloads are temporarily unavailable.",
  rate_limited: "Too many requests right now. Try again in a minute.",
  github_unavailable: "Could not reach the release server. Try again in a minute.",
  not_found: "No build has been published for this one yet.",
};
