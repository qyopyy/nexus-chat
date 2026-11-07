import { NextResponse, type NextRequest } from "next/server";

// Custom profile domains: a verified domain (e.g. martin.com) opens that member's public profile.
// Requests on nexusproject.cc / *.vercel.app / localhost pass straight through untouched.
const MAIN = /(^|\.)nexusproject\.cc$|\.vercel\.app$|^localhost$|^127\.0\.0\.1$|^\[::1\]$/;
const SITE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://nexusproject.cc").hostname.replace(/^www\./, "");
  } catch {
    return "nexusproject.cc";
  }
})();
const cache = new Map<string, { user: string | null; at: number }>();
const TTL = 60_000;

async function lookup(host: string): Promise<string | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL) return hit.user;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let user: string | null = null;
  if (base && key) {
    try {
      const r = await fetch(`${base.replace(/\/$/, "")}/rest/v1/rpc/profile_by_domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ p_domain: host }),
        cache: "no-store",
      });
      if (r.ok) user = ((await r.json()) as string | null) || null;
    } catch {
      return hit?.user ?? null;
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(host, { user, at: Date.now() });
  return user;
}

export async function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase().replace(/^www\./, "");
  if (!host || host === SITE_HOST || MAIN.test(host)) return NextResponse.next();
  const username = await lookup(host);
  // not a profile domain (e.g. another domain of this site): serve the site as usual
  if (!username) return NextResponse.next();
  const main = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${SITE_HOST}`);
  if (req.nextUrl.pathname === "/" || req.nextUrl.pathname === "") {
    const url = req.nextUrl.clone();
    url.pathname = `/u/${username}`;
    return NextResponse.rewrite(url);
  }
  // everything else lives on the main site
  return NextResponse.redirect(main, 307);
}

export const config = {
  // pages only — skip Next internals, API routes and files with an extension (images, icons, …)
  matcher: ["/((?!_next/|api/|.*\\.[A-Za-z0-9]+$).*)"],
};
