/** Heuristic article extraction for Nexus Browser reading mode (no Readability dependency). */

export type ExtractedArticle = {
  title: string;
  byline: string | null;
  paragraphs: string[];
  siteName: string | null;
};

export const READING_MODE_SESSION_KEY = "nexus.browser.readingMode";
export const READING_MODE_PREFS_KEY = "nexus.browser.readingMode.persist";

export function loadReadingModeSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const persist = localStorage.getItem(READING_MODE_PREFS_KEY);
    if (persist === "1" || persist === "0") return persist === "1";
    return sessionStorage.getItem(READING_MODE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveReadingModeSession(on: boolean, persist = false) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(READING_MODE_SESSION_KEY, on ? "1" : "0");
    if (persist) localStorage.setItem(READING_MODE_PREFS_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html: string) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}

function metaContent(html: string, ...names: string[]) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i",
    );
    const m = html.match(re);
    const v = (m?.[1] || m?.[2] || "").trim();
    if (v) return decodeEntities(v);
  }
  return "";
}

function firstMatch(html: string, re: RegExp) {
  const m = html.match(re);
  return m?.[1] ? stripTags(m[1]).slice(0, 300) : "";
}

function extractBlock(html: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m?.[1] || "";
}

function paragraphsFromHtml(chunk: string): string[] {
  const ps: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) {
    const t = stripTags(m[1] || "").replace(/\s+/g, " ").trim();
    if (t.length >= 40 || (t.length >= 20 && /[.!?]/.test(t))) ps.push(t);
  }
  if (ps.length >= 2) return ps;

  const plain = stripTags(chunk)
    .replace(/\n{2,}/g, "\n\n")
    .trim();
  if (!plain) return [];
  const parts = plain
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40);
  return parts.length ? parts : plain.length > 80 ? [plain.slice(0, 12_000)] : [];
}

function scoreRegion(chunk: string) {
  const ps = paragraphsFromHtml(chunk);
  const chars = ps.reduce((n, p) => n + p.length, 0);
  return chars + ps.length * 80;
}

/**
 * Extract title, optional byline, and body paragraphs from raw HTML.
 * Prefers article/main; falls back to densest p-tag region.
 */
export function extractArticleFromHtml(html: string, pageUrl?: string): ExtractedArticle {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  const title =
    metaContent(cleaned, "og:title", "twitter:title") ||
    firstMatch(cleaned, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
    firstMatch(cleaned, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
    (pageUrl
      ? (() => {
          try {
            return new URL(pageUrl).hostname;
          } catch {
            return "Article";
          }
        })()
      : "Article");

  const bylineRaw =
    metaContent(cleaned, "author", "article:author", "byl", "sailthru.author") ||
    firstMatch(
      cleaned,
      /<(?:span|div|p|a)\b[^>]*(?:class|rel|itemprop)=["'][^"']*(?:byline|author)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p|a)>/i,
    ) ||
    "";
  const byline = bylineRaw.replace(/^by\s+/i, "").slice(0, 160) || null;

  const siteName = metaContent(cleaned, "og:site_name") || null;

  const candidates = [
    extractBlock(cleaned, "article"),
    extractBlock(cleaned, "main"),
    ...[
      ...cleaned.matchAll(
        /<div\b[^>]*(?:class|id)=["'][^"']*(?:article|post|entry|content|story|readable)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
      ),
    ].map((m) => m[1] || ""),
    cleaned,
  ].filter(Boolean);

  let best = "";
  let bestScore = 0;
  for (const c of candidates) {
    const s = scoreRegion(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  let paragraphs = paragraphsFromHtml(best).slice(0, 80);
  if (!paragraphs.length) {
    const plain = stripTags(cleaned).replace(/\s+/g, " ").trim().slice(0, 8000);
    if (plain) paragraphs = [plain];
  }

  return {
    title: title.slice(0, 240) || "Article",
    byline,
    paragraphs,
    siteName,
  };
}

/** Extract from a live Document (e.g. same-origin proxied iframe). */
export function extractArticleFromDocument(doc: Document, pageUrl?: string): ExtractedArticle {
  try {
    return extractArticleFromHtml(doc.documentElement?.outerHTML || doc.body?.innerHTML || "", pageUrl);
  } catch {
    return { title: doc.title || "Article", byline: null, paragraphs: [], siteName: null };
  }
}

export function articleFromPlainText(title: string, text: string, pageUrl?: string): ExtractedArticle {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const body =
    paragraphs.length > 1
      ? paragraphs
      : text
          .replace(/\s+/g, " ")
          .trim()
          .match(/.{1,480}(?:\s|$)/g)
          ?.map((s) => s.trim())
          .filter(Boolean) || [text.trim()].filter(Boolean);
  let siteName: string | null = null;
  if (pageUrl) {
    try {
      siteName = new URL(pageUrl).hostname;
    } catch {
      siteName = null;
    }
  }
  return { title: title || "Article", byline: null, paragraphs: body.slice(0, 80), siteName };
}
