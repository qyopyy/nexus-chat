/** TestFlight public invite links — shared as nexusproject.cc/beta (all apps) or /beta/<app> (one app). */
import { SITE } from "@/lib/seo";

export type TfApp = "nexus" | "wump" | "browser" | "link";
export type TfLink = { app: TfApp; url: string; note: string | null; opens: number; updated_at: string };

export const TF_APPS: { id: TfApp; name: string; blurb: string; color: string }[] = [
  { id: "nexus", name: "Nexus", blurb: "Chat, calls, servers, games and music", color: "#5865f2" },
  { id: "wump", name: "Wump", blurb: "Live map with your friends", color: "#22c55e" },
  { id: "browser", name: "Nexus Browser", blurb: "Private browser with shields", color: "#0ea5e9" },
  { id: "link", name: "Nexus Link", blurb: "Your link-in-bio page", color: "#f97316" },
];

export const TF_URL_RE = /^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]{6,16}$/;

/** accept "testflight.apple.com/join/AbC123", with or without https / trailing slash / query */
export function normalizeTf(raw: string): string | null {
  const s = raw.trim().replace(/^http:\/\//i, "https://");
  const withProto = /^https:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    const out = `https://testflight.apple.com${u.pathname.replace(/\/+$/, "")}`;
    return u.hostname === "testflight.apple.com" && TF_URL_RE.test(out) ? out : null;
  } catch {
    return null;
  }
}

export const betaUrl = (app?: TfApp) => `${SITE.url}/beta${app ? `/${app}` : ""}`;

/** native share sheet when there is one, otherwise copy */
export async function shareInvite(url: string, title: string): Promise<"shared" | "copied" | "failed"> {
  const text = `Join the ${title} beta on TestFlight`;
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
