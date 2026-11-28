import { IPA_KIND_META, type IpaKind } from "./ipaDownloads";
import { fetchReleases, pickAsset, signedAssetUrl, tagMatcher, versionOf, type AssetSpec, type Fetch, type Hit } from "./ipaRelease";

export type PlatformKind = "android" | "windows" | "mac";
export type AnyKind = IpaKind | PlatformKind;
export const PLATFORM_KINDS: PlatformKind[] = ["android", "windows", "mac"];
export const IPA_KINDS = Object.keys(IPA_KIND_META) as IpaKind[];
export const ALL_KINDS: AnyKind[] = [...IPA_KINDS, ...PLATFORM_KINDS];

export const isKind = (s: string | null): s is AnyKind => !!s && (ALL_KINDS as string[]).includes(s);

export function specFor(kind: AnyKind): AssetSpec {
  if (kind === "android") return { match: () => true, exts: [".apk"] };
  if (kind === "windows") return { match: () => true, exts: [".exe", ".msi"] };
  if (kind === "mac") return { match: () => true, exts: [".dmg"] };
  const m = IPA_KIND_META[kind];
  return { match: tagMatcher(kind, m.tagPrefix), assetHint: m.assetHint, exts: [".ipa"] };
}

/** Read-only GitHub token for the private repo. Set in the host's environment settings, never in the repo. */
export const releaseToken = () => process.env.GH_RELEASES_TOKEN || process.env.GITHUB_TOKEN || undefined;

export const serverFetch: Fetch = (url, init) => fetch(url, { ...init, next: { revalidate: 60 } } as RequestInit) as ReturnType<Fetch>;
const noCacheFetch: Fetch = (url, init) => fetch(url, { ...init, cache: "no-store" } as RequestInit) as ReturnType<Fetch>;

export type PublicBuild = { kind: AnyKind; tag: string; version: string; name: string; file: string; size: number; publishedAt: string | null; notes: string; url: string; htmlUrl: string; transporterOk: boolean };

export const fileUrl = (kind: AnyKind) => `/api/ipa/file?kind=${kind}`;
const toPublic = (kind: AnyKind, h: Hit): PublicBuild => ({
  kind,
  tag: h.tag,
  version: versionOf(h.tag),
  name: h.name,
  file: h.asset.name,
  size: h.asset.size,
  publishedAt: h.publishedAt,
  notes: h.notes,
  url: fileUrl(kind),
  htmlUrl: "/ipa",
  transporterOk: kind in IPA_KIND_META && !!IPA_KIND_META[kind as IpaKind].transporterOk,
});

export async function latestBuilds(kinds: AnyKind[]) {
  const r = await fetchReleases(serverFetch, releaseToken());
  if (!r.ok) return { ok: false as const, error: r.error };
  const builds: Partial<Record<AnyKind, PublicBuild | null>> = {};
  for (const k of kinds) {
    const h = pickAsset(r.releases, specFor(k));
    builds[k] = h ? toPublic(k, h) : null;
  }
  return { ok: true as const, builds };
}

export async function downloadTarget(kind: AnyKind): Promise<{ ok: true; url: string; file: string } | { ok: false; error: string; status: number }> {
  const token = releaseToken();
  const r = await fetchReleases(noCacheFetch, token);
  if (!r.ok) return { ok: false, error: r.error, status: r.error === "rate_limited" ? 429 : 503 };
  const hit = pickAsset(r.releases, specFor(kind));
  if (!hit) return { ok: false, error: "not_found", status: 404 };
  const url = await signedAssetUrl(noCacheFetch, hit, token);
  if (!url) return { ok: false, error: "github_unavailable", status: 502 };
  return { ok: true, url, file: hit.asset.name };
}
