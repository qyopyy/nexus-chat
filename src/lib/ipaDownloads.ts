/** GitHub release search links for Sideloadly / AltStore IPAs. */
// The GitHub repo is private, so visitors are sent to our own downloads page instead of github.com.
export const NEXUS_IPA_RELEASES_URL = "/ipa#nexus";
export const NEXUS_APPSTORE_IPA_RELEASES_URL = "/ipa#appstore";
export const NEXUS_APPSTORE_WORKFLOW_URL =
  "https://github.com/qyopyy/nexus-chat/actions/workflows/ipa-appstore.yml";
export const NEXUS_APPSTORE_APPS_WORKFLOW_URL =
  "https://github.com/qyopyy/nexus-chat/actions/workflows/ipa-appstore-apps.yml";
export const NEXUS_CAPGO_APP_URL = "https://console.capgo.app/app/hu.qyopy.nexus.B44X8B76QR";
export const NEXUS_CAPGO_APP_ID = "hu.qyopy.nexus.B44X8B76QR";

export type IpaKind =
  | "nexus"
  | "wump"
  | "link"
  | "browser"
  | "distro"
  | "untitled"
  | "appstore"
  | "wump-appstore"
  | "browser-appstore"
  | "link-appstore";

export const IPA_KIND_META: Record<
  IpaKind,
  { label: string; tagPrefix: string; assetHint: string; query: string; bundleId: string; transporterOk?: boolean }
> = {
  appstore: {
    label: "Nexus (App Store signed)",
    tagPrefix: "ios-appstore-",
    assetHint: "Nexus-AppStore.ipa",
    query: "App Store IPA",
    bundleId: "hu.qyopy.nexus.B44X8B76QR",
    transporterOk: true,
  },
  "wump-appstore": {
    label: "Wump (App Store signed)",
    tagPrefix: "wump-appstore-",
    assetHint: "Wump-AppStore.ipa",
    query: "Wump App Store IPA",
    bundleId: "hu.qyopy.bump.B44X8B76QR",
    transporterOk: true,
  },
  "browser-appstore": {
    label: "Browser (App Store signed)",
    tagPrefix: "browser-appstore-",
    assetHint: "Browser-AppStore.ipa",
    query: "Browser App Store IPA",
    bundleId: "hu.qyopy.browser.B44X8B76QR",
    transporterOk: true,
  },
  "link-appstore": {
    label: "Nexus Link (App Store signed)",
    tagPrefix: "link-appstore-",
    assetHint: "NexusLink-AppStore.ipa",
    query: "Link App Store IPA",
    bundleId: "hu.qyopy.link",
    transporterOk: true,
  },
  nexus: {
    label: "Nexus (Sideloadly)",
    tagPrefix: "ios-",
    assetHint: "Nexus.ipa",
    query: "Nexus iOS",
    bundleId: "hu.qyopy.nexus.B44X8B76QR",
  },
  wump: {
    label: "Wump (Sideloadly)",
    tagPrefix: "wump-ios-",
    assetHint: "Wump.ipa",
    query: "Wump iOS",
    bundleId: "hu.qyopy.bump.B44X8B76QR",
  },
  link: {
    label: "Nexus Link (Sideloadly)",
    tagPrefix: "link-ios-",
    assetHint: "NexusLink.ipa",
    query: "Nexus Link iOS",
    bundleId: "hu.qyopy.link",
  },
  browser: {
    label: "Browser (Sideloadly)",
    tagPrefix: "browser-ios-",
    assetHint: "Browser.ipa",
    query: "Browser iOS",
    bundleId: "hu.qyopy.browser.B44X8B76QR",
  },
  distro: {
    label: "Distro (Sideloadly)",
    tagPrefix: "distro-ios-",
    assetHint: "Distro.ipa",
    query: "Distro iOS",
    bundleId: "hu.qyopy.distro",
  },
  untitled: {
    label: "Untitled (Sideloadly)",
    tagPrefix: "untitled-ios-",
    assetHint: "Untitled.ipa",
    query: "Untitled iOS",
    bundleId: "hu.qyopy.untitled",
  },
};

export function ipaReleasesUrl(kind: IpaKind) {
  return `/ipa#${kind}`;
}

export type LatestIpa = {
  kind: IpaKind;
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
  htmlUrl: string;
  transporterOk?: boolean;
  version?: string;
  size?: number;
  notes?: string;
  file?: string;
};

/** Newest build for every app in one request (platform builds included). */
export type LatestAll = { builds: Partial<Record<IpaKind | "android" | "windows" | "mac", LatestIpa | null>>; checkedAt: string };
export type LatestAllResult = ({ ok: true } & LatestAll) | { ok: false; message: string };
export async function fetchLatestAll(): Promise<LatestAllResult> {
  try {
    const r = await fetch("/api/ipa/all", { cache: "no-store" });
    const j = (await r.json()) as Partial<LatestAll> & { message?: string };
    if (!r.ok || !j.builds) return { ok: false, message: j.message ?? "Could not load downloads." };
    return { ok: true, builds: j.builds, checkedAt: j.checkedAt ?? new Date().toISOString() };
  } catch {
    return { ok: false, message: "No connection. Try again." };
  }
}

/** Client helper: our API reads the releases with a server-side token, so the repo itself can stay private. */
export async function fetchLatestIpa(kind: IpaKind = "nexus"): Promise<LatestIpa | null> {
  try {
    const r = await fetch(`/api/ipa/latest?kind=${kind}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as LatestIpa;
  } catch {
    return null;
  }
}
