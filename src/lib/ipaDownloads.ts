/** GitHub release search links for Sideloadly / AltStore IPAs. */
export const NEXUS_IPA_RELEASES_URL =
  "https://github.com/qyopyy/nexus-chat/releases?q=Nexus+iOS&expanded=true";
export const NEXUS_APPSTORE_IPA_RELEASES_URL =
  "https://github.com/qyopyy/nexus-chat/releases?q=App+Store+IPA&expanded=true";
export const NEXUS_APPSTORE_WORKFLOW_URL =
  "https://github.com/qyopyy/nexus-chat/actions/workflows/ipa-appstore.yml";
export const NEXUS_CAPGO_APP_URL = "https://console.capgo.app/app/hu.qyopy.nexus.B44X8B76QR";
export const NEXUS_CAPGO_APP_ID = "hu.qyopy.nexus.B44X8B76QR";

export type IpaKind = "nexus" | "wump" | "link" | "browser" | "appstore";

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
  nexus: {
    label: "Nexus (Sideloadly)",
    tagPrefix: "ios-",
    assetHint: "Nexus.ipa",
    query: "Nexus iOS",
    bundleId: "hu.qyopy.nexus.B44X8B76QR",
  },
  wump: {
    label: "Wump",
    tagPrefix: "wump-ios-",
    assetHint: "Wump.ipa",
    query: "Wump iOS",
    bundleId: "hu.qyopy.bump.B44X8B76QR",
  },
  link: {
    label: "Nexus Link",
    tagPrefix: "link-ios-",
    assetHint: "NexusLink.ipa",
    query: "Nexus Link iOS",
    bundleId: "hu.qyopy.link",
  },
  browser: {
    label: "Browser",
    tagPrefix: "browser-ios-",
    assetHint: "Browser.ipa",
    query: "Browser iOS",
    bundleId: "hu.qyopy.browser.B44X8B76QR",
  },
};

export function ipaReleasesUrl(kind: IpaKind) {
  const q = encodeURIComponent(IPA_KIND_META[kind].query);
  return `https://github.com/qyopyy/nexus-chat/releases?q=${q}&expanded=true`;
}

export type LatestIpa = {
  kind: IpaKind;
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
  htmlUrl: string;
  transporterOk?: boolean;
};

/** Client helper — hits our API which reads public GitHub Releases. */
export async function fetchLatestIpa(kind: IpaKind = "nexus"): Promise<LatestIpa | null> {
  try {
    const r = await fetch(`/api/ipa/latest?kind=${kind}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as LatestIpa;
  } catch {
    return null;
  }
}
