import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fetch a page from the open internet and return a readable text preview. */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("url") || "").trim();
  let url: URL;
  try {
    url = new URL(raw);
    if (!/^https?:$/i.test(url.protocol)) throw new Error("Only http(s)");
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 NexusBrowser/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const ctype = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(ctype) && !ctype.includes("text/")) {
      return NextResponse.json({
        url: res.url || url.toString(),
        title: url.hostname,
        text: `Binary or non-HTML content (${ctype || "unknown"}). Open in a new tab to view.`,
        status: res.status,
      });
    }
    let html = await res.text();
    if (html.length > 500_000) html = html.slice(0, 500_000);
    const title =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim().slice(0, 200) || url.hostname;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    return NextResponse.json({ url: res.url || url.toString(), title, text, status: res.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fetch failed" }, { status: 502 });
  }
}
