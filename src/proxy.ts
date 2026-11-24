import { NextResponse, type NextRequest } from "next/server";

// Custom domains: a verified domain (e.g. martin.com) opens that member's public profile, or a pre-save campaign page.
// Requests on nexusproject.cc / *.vercel.app / localhost pass straight through untouched.
const MAIN = /(^|\.)nexusproject\.cc$|\.vercel\.app$|^localhost$|^127\.0\.0\.1$|^\[::1\]$/;
const SITE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://nexusproject.cc").hostname.replace(/^www\./, "");
  } catch {
    return "nexusproject.cc";
  }
})();
const cache = new Map<string, { value: string | null; at: number }>();
const TTL = 60_000;

/** Ask the database which row a custom host belongs to (one RPC per kind, cached for a minute). */
async function lookup(kind: "profile" | "presave", host: string): Promise<string | null> {
  const key = `${kind}:${host}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let value: string | null = null;
  if (base && anon) {
    try {
      const r = await fetch(`${base.replace(/\/$/, "")}/rest/v1/rpc/${kind === "profile" ? "profile_by_domain" : "presave_slug_by_domain"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
        body: JSON.stringify({ p_domain: host }),
        cache: "no-store",
      });
      if (r.ok) value = ((await r.json()) as string | null) || null;
    } catch {
      return hit?.value ?? null;
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, { value, at: Date.now() });
  return value;
}

// The Nexus Browser App Store app is a web browser only — keep its WebView on /browser/app (+ legal pages).
const BROWSER_APP_UA = /NexusBrowser/;
const BROWSER_APP_ALLOWED = /^\/(browser\/app|privacy|terms|contact)(\/|$)/;

export async function proxy(req: NextRequest) {
  if (BROWSER_APP_UA.test(req.headers.get("user-agent") ?? "") && !BROWSER_APP_ALLOWED.test(req.nextUrl.pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/browser/app";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase().replace(/^www\./, "");
  if (!host || host === SITE_HOST || MAIN.test(host)) return NextResponse.next();
  const [username, presaveSlug] = await Promise.all([lookup("profile", host), lookup("presave", host)]);
  // not a profile or pre-save domain (e.g. another domain of this site): serve the site as usual
  if (!username && !presaveSlug) return NextResponse.next();
  const main = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${SITE_HOST}`);
  const atRoot = req.nextUrl.pathname === "/" || req.nextUrl.pathname === "";
  if (username) {
    if (atRoot) {
      const url = req.nextUrl.clone();
      url.pathname = `/u/${username}`;
      return NextResponse.rewrite(url);
    }
    // everything else lives on the main site
    return NextResponse.redirect(main, 307);
  }
  // A creator's own domain for a pre-save campaign: the page opens at "/". Spotify sends fans back
  // to /presave/index.html?slug=… (a file, so it never reaches this function).
  if (atRoot) {
    const url = req.nextUrl.clone();
    url.pathname = "/presave/index.html";
    url.search = "";
    return NextResponse.rewrite(url);
  }
  return NextResponse.redirect(new URL(`/p/${presaveSlug}`, `https://${SITE_HOST}`), 307);
}

export const config = {
  // pages only — skip Next internals, API routes and files with an extension (images, icons, …)
  matcher: ["/((?!_next/|api/|.*\\.[A-Za-z0-9]+$).*)"],
};
