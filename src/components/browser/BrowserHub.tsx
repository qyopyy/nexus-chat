"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Download,
  ExternalLink,
  Globe,
  Home,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  TextSearch,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/app";
import { browserIpaReleasesUrl, openBrowser, type BrowserSearchHit } from "@/lib/browser";
import {
  DEFAULT_BROWSER_PREFS,
  loadBrowserPrefs,
  saveBrowserPrefs,
  searchUrlForPrefs,
  type BrowserPrefs,
} from "@/lib/browserPrefs";
import {
  articleFromPlainText,
  extractArticleFromDocument,
  extractArticleFromHtml,
  loadReadingModeSession,
  saveReadingModeSession,
  type ExtractedArticle,
} from "@/lib/browserReading";
import { emptyShieldStats, summarizeShields, type ShieldStats } from "@/lib/browserShields";
import BrowserReadingView from "./BrowserReadingView";
import BrowserSettings from "./BrowserSettings";

type View =
  | { kind: "home" }
  | { kind: "results"; q: string; hits: BrowserSearchHit[]; google: string; fetched: boolean }
  | { kind: "page"; url: string; title: string; text: string; shields?: ShieldStats }
  | { kind: "web"; url: string; shields?: ShieldStats };

const HIST_KEY = "nexus.browser.history";
const BM_KEY = "nexus.browser.bookmarks";

function loadList(key: string): { title: string; url: string; at: string }[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function saveList(key: string, rows: { title: string; url: string; at: string }[]) {
  localStorage.setItem(key, JSON.stringify(rows.slice(0, 40)));
}

function qsFromPrefs(prefs: BrowserPrefs) {
  const p = new URLSearchParams();
  p.set("shields", prefs.shields.enabled ? "1" : "0");
  p.set("ads", prefs.shields.blockAds ? "1" : "0");
  p.set("trackers", prefs.shields.blockTrackers ? "1" : "0");
  p.set("fp", prefs.shields.blockFingerprinting ? "1" : "0");
  p.set("scripts", prefs.shields.blockScripts ? "1" : "0");
  p.set("httpsOnly", prefs.shields.httpsOnly ? "1" : "0");
  if (prefs.dns !== "system") p.set("dns", prefs.dns);
  if (prefs.nextDnsConfig) p.set("nextdns", prefs.nextDnsConfig);
  if (prefs.customDohUrl) p.set("doh", prefs.customDohUrl);
  return p.toString();
}

export default function BrowserHub({
  mobile,
  onBack,
  standalone,
}: {
  mobile?: boolean;
  onBack?: () => void;
  standalone?: boolean;
}) {
  const [prefs, setPrefs] = useState<BrowserPrefs>(DEFAULT_BROWSER_PREFS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dnsStatus, setDnsStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: "home" });
  const [history, setHistory] = useState<{ title: string; url: string; at: string }[]>([]);
  const [bookmarks, setBookmarks] = useState<{ title: string; url: string; at: string }[]>([]);
  const [sessionShields, setSessionShields] = useState<ShieldStats>(emptyShieldStats());
  const stack = useRef<View[]>([{ kind: "home" }]);
  const [stackI, setStackI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const [findIdx, setFindIdx] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [readingMode, setReadingMode] = useState(false);
  const [readingArticle, setReadingArticle] = useState<ExtractedArticle | null>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [readingUrl, setReadingUrl] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && view.kind === "page") {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInput.current?.focus());
      }
      if (e.key === "Escape" && findOpen) setFindOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.kind, findOpen]);

  useEffect(() => {
    setFindIdx(0);
  }, [findQ, view.kind === "page" ? view.url : ""]);

  useEffect(() => {
    if (!findOpen || !findQ.trim()) return;
    requestAnimationFrame(() => document.getElementById("browser-find-active")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [findIdx, findQ, findOpen, view]);

  useEffect(() => {
    setPrefs(loadBrowserPrefs());
    setHistory(loadList(HIST_KEY));
    setBookmarks(loadList(BM_KEY));
    setReadingMode(loadReadingModeSession());
  }, []);

  const updatePrefs = (next: BrowserPrefs) => {
    setPrefs(saveBrowserPrefs(next));
  };

  const pushView = useCallback(
    (v: View) => {
      stack.current = [...stack.current.slice(0, stackI + 1), v];
      setStackI(stack.current.length - 1);
      setView(v);
      if (v.kind === "page" || v.kind === "web") {
        setSessionShields(v.shields || emptyShieldStats());
      }
    },
    [stackI],
  );

  const goBack = () => {
    if (stackI <= 0) {
      onBack?.();
      return;
    }
    const i = stackI - 1;
    setStackI(i);
    const v = stack.current[i]!;
    setView(v);
    if (v.kind === "page" || v.kind === "web") setSessionShields(v.shields || emptyShieldStats());
  };
  const goForward = () => {
    if (stackI >= stack.current.length - 1) return;
    const i = stackI + 1;
    setStackI(i);
    const v = stack.current[i]!;
    setView(v);
    if (v.kind === "page" || v.kind === "web") setSessionShields(v.shields || emptyShieldStats());
  };

  const shieldQs = useMemo(() => qsFromPrefs(prefs), [prefs]);

  function proxiedUrl(url: string) {
    return `/api/browser/proxy?url=${encodeURIComponent(url)}&${shieldQs}`;
  }

  async function testDns() {
    setDnsStatus("Checking…");
    try {
      const p = new URLSearchParams({ name: "doubleclick.net", ...Object.fromEntries(new URLSearchParams(shieldQs)) });
      // ensure dns params present even if shields qs omitted system
      if (prefs.dns !== "system") p.set("dns", prefs.dns);
      if (prefs.nextDnsConfig) p.set("nextdns", prefs.nextDnsConfig);
      if (prefs.customDohUrl) p.set("doh", prefs.customDohUrl);
      const res = await fetch(`/api/browser/dns?${p.toString()}`);
      const data = (await res.json()) as { blocked?: boolean; ips?: string[]; error?: string; provider?: string };
      if (data.error && !data.ips?.length && prefs.dns === "system") {
        setDnsStatus("System DNS (no DoH probe)");
        return;
      }
      if (data.error) {
        setDnsStatus(data.error);
        return;
      }
      setDnsStatus(
        data.blocked
          ? `OK · doubleclick.net blocked by ${data.provider || prefs.dns}`
          : `OK · resolved ${data.ips?.[0] || "—"}`,
      );
    } catch (e) {
      setDnsStatus(e instanceof Error ? e.message : "DNS test failed");
    }
  }

  async function runSearch(raw?: string) {
    const q = (raw ?? query).trim();
    if (!q) return;
    if (/^https?:\/\//i.test(q) || (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(q) && !/\s/.test(q))) {
      const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
      setQuery(url);
      await openLive(url);
      return;
    }
    setBusy(true);
    setQuery(q);
    try {
      const p = new URLSearchParams({
        q,
        engine: prefs.engine,
        ...(prefs.engine === "custom" ? { custom: prefs.customSearchUrl } : {}),
      });
      if (prefs.dns !== "system") p.set("dns", prefs.dns);
      if (prefs.nextDnsConfig) p.set("nextdns", prefs.nextDnsConfig);
      if (prefs.customDohUrl) p.set("doh", prefs.customDohUrl);
      const res = await fetch(`/api/browser/search?${p.toString()}`);
      const data = (await res.json()) as {
        results: BrowserSearchHit[];
        google: string;
        fetched: boolean;
        live?: boolean;
        note?: string;
        error?: string;
      };
      const open = data.google || searchUrlForPrefs(prefs, q);
      const hits = data.results || [];
      // Realtime live path: engine blocked scrape → open shielded live search immediately
      if (data.live || (!hits.length && !data.fetched)) {
        toast(data.note || data.error || "Opening live search…", "info");
        setBusy(false);
        await openLive(open);
        return;
      }
      if (data.note) toast(data.note, "info");
      const next: View = {
        kind: "results",
        q,
        hits,
        google: open,
        fetched: !!data.fetched,
      };
      pushView(next);
      const row = { title: `Search: ${q}`, url: open, at: new Date().toISOString() };
      const hist = [row, ...loadList(HIST_KEY).filter((h) => h.url !== row.url)];
      saveList(HIST_KEY, hist);
      setHistory(hist);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Search failed", "error");
    }
    setBusy(false);
  }

  async function openPage(url: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/browser/fetch?url=${encodeURIComponent(url)}&${shieldQs}`);
      const data = (await res.json()) as {
        url?: string;
        title?: string;
        text?: string;
        error?: string;
        shields?: ShieldStats;
      };
      if (data.error) {
        await openLive(url);
      } else {
        const shields = data.shields || emptyShieldStats();
        pushView({
          kind: "page",
          url: data.url || url,
          title: data.title || url,
          text: data.text || "",
          shields,
        });
        setSessionShields(shields);
        const row = { title: data.title || url, url: data.url || url, at: new Date().toISOString() };
        const hist = [row, ...loadList(HIST_KEY).filter((h) => h.url !== row.url)];
        saveList(HIST_KEY, hist);
        setHistory(hist);
      }
    } catch {
      await openLive(url);
    }
    setBusy(false);
  }

  async function openLive(url: string) {
    // Reader fetch seeds accurate shield counts without double-loading the iframe document
    setBusy(true);
    let shields = emptyShieldStats();
    try {
      const res = await fetch(`/api/browser/fetch?url=${encodeURIComponent(url)}&${shieldQs}`);
      const data = (await res.json()) as { shields?: ShieldStats; title?: string };
      if (data.shields) shields = data.shields;
      pushView({ kind: "web", url, shields });
      setSessionShields(shields);
      const row = { title: data.title || url, url, at: new Date().toISOString() };
      const hist = [row, ...loadList(HIST_KEY).filter((h) => h.url !== row.url)];
      saveList(HIST_KEY, hist);
      setHistory(hist);
    } catch {
      pushView({ kind: "web", url, shields });
      setSessionShields(shields);
    }
    setBusy(false);
  }

  function bookmarkCurrent() {
    let title = "Page";
    let url = "";
    if (view.kind === "page") {
      title = view.title;
      url = view.url;
    } else if (view.kind === "web") {
      title = view.url;
      url = view.url;
    } else if (view.kind === "results") {
      title = `Search: ${view.q}`;
      url = view.google;
    }
    if (!url) return;
    const row = { title, url, at: new Date().toISOString() };
    const next = [row, ...loadList(BM_KEY).filter((b) => b.url !== url)];
    saveList(BM_KEY, next);
    setBookmarks(next);
    toast("Bookmarked", "success");
  }

  const pageUrlForReading = view.kind === "page" || view.kind === "web" ? view.url : "";

  const loadReadingArticle = useCallback(
    async (url: string, pageText?: string, pageTitle?: string) => {
      if (!url) {
        setReadingError("Open a page first to use Reading mode.");
        setReadingArticle(null);
        return;
      }
      setReadingBusy(true);
      setReadingError(null);
      setReadingUrl(url);
      try {
        const doc = frameRef.current?.contentDocument;
        if (doc?.body && (doc.body.innerText || "").trim().length > 80) {
          const extracted = extractArticleFromDocument(doc, url);
          if (extracted.paragraphs.length) {
            setReadingArticle(extracted);
            setReadingBusy(false);
            return;
          }
        }

        const res = await fetch(`/api/browser/fetch?url=${encodeURIComponent(url)}&${shieldQs}`);
        const data = (await res.json()) as {
          error?: string;
          title?: string;
          text?: string;
          article?: ExtractedArticle;
          html?: string;
        };
        if (data.error) throw new Error(data.error);
        if (data.article?.paragraphs?.length) {
          setReadingArticle(data.article);
        } else if (data.html) {
          setReadingArticle(extractArticleFromHtml(data.html, url));
        } else if (data.text || pageText) {
          setReadingArticle(articleFromPlainText(data.title || pageTitle || url, data.text || pageText || "", url));
        } else {
          setReadingArticle(null);
          setReadingError("Couldn't extract readable content from this page.");
        }
      } catch (e) {
        if (pageText) {
          setReadingArticle(articleFromPlainText(pageTitle || url, pageText, url));
        } else {
          setReadingArticle(null);
          setReadingError(e instanceof Error ? e.message : "Couldn't load article.");
        }
      }
      setReadingBusy(false);
    },
    [shieldQs],
  );

  const readingSourceUrl = view.kind === "page" || view.kind === "web" ? view.url : "";
  const readingSourceText = view.kind === "page" ? view.text : "";
  const readingSourceTitle = view.kind === "page" ? view.title : "";

  useEffect(() => {
    if (!readingMode) return;
    if (view.kind === "page") {
      void loadReadingArticle(readingSourceUrl, readingSourceText, readingSourceTitle);
    } else if (view.kind === "web") {
      const t = window.setTimeout(() => void loadReadingArticle(readingSourceUrl), 50);
      return () => window.clearTimeout(t);
    } else {
      setReadingArticle(null);
      setReadingError(null);
    }
  }, [readingMode, view.kind, readingSourceUrl, readingSourceText, readingSourceTitle, loadReadingArticle]);

  function toggleReadingMode() {
    if (readingMode) {
      setReadingMode(false);
      saveReadingModeSession(false);
      setReadingError(null);
      return;
    }
    if (view.kind !== "page" && view.kind !== "web") {
      toast("Open a page first to use Reading mode", "info");
      return;
    }
    setReadingMode(true);
    saveReadingModeSession(true);
  }

  const engineLabel =
    prefs.engine === "custom" ? "Custom" : prefs.engine.charAt(0).toUpperCase() + prefs.engine.slice(1);
  const shieldsActive = prefs.shields.enabled;
  const shieldSummary = summarizeShields(sessionShields);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-[#0b1220] text-white", (mobile || standalone) && "pb-safe-2")}>
      <BrowserSettings
        open={settingsOpen}
        prefs={prefs}
        onClose={() => setSettingsOpen(false)}
        onChange={updatePrefs}
        onTestDns={() => void testDns()}
        dnsStatus={dnsStatus}
      />

      <header className={cn("shrink-0 border-b border-white/10 bg-[#111827]", mobile || standalone || onBack ? "pt-safe-3" : "")}>
        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
          {!standalone && (mobile || onBack) && (
            <button type="button" onClick={() => (onBack ? onBack() : goBack())} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
              <ArrowLeft className="size-5" />
            </button>
          )}
          <button type="button" disabled={stackI <= 0} onClick={goBack} className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10 disabled:opacity-30" aria-label="History back">
            <ArrowLeft className="size-4" />
          </button>
          <button type="button" disabled={stackI >= stack.current.length - 1} onClick={goForward} className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10 disabled:opacity-30" aria-label="Forward">
            <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              stack.current = [{ kind: "home" }];
              setStackI(0);
              setView({ kind: "home" });
              setQuery("");
              setSessionShields(emptyShieldStats());
            }}
            className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10"
            aria-label="Home"
          >
            <Home className="size-4" />
          </button>
          <form
            className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10 focus-within:ring-[#60a5fa]"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-[#60a5fa]" /> : <Search className="size-4 shrink-0 text-white/50" />}
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${engineLabel} or type a URL`}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-white/40"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {!!query && (
              <button type="button" onClick={() => setQuery("")} className="text-white/40 hover:text-white" aria-label="Clear">
                <X className="size-4" />
              </button>
            )}
          </form>
          <button
            type="button"
            onClick={() => {
              const next = {
                ...prefs,
                shields: { ...prefs.shields, enabled: !prefs.shields.enabled },
              };
              updatePrefs(next);
              toast(next.shields.enabled ? "Shields up" : "Shields down", "info");
            }}
            className={cn(
              "relative grid size-9 place-items-center rounded-full transition",
              shieldsActive ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/40" : "text-white/45 hover:bg-white/10",
            )}
            aria-label="Toggle shields"
            title={shieldSummary}
          >
            <Shield className="size-4" />
            {shieldsActive && sessionShields.blocked > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] rounded-full bg-orange-500 px-1 text-[9px] font-black text-[#0b1220]">
                {sessionShields.blocked > 99 ? "99+" : sessionShields.blocked}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={toggleReadingMode}
            className={cn(
              "grid size-9 place-items-center rounded-full transition",
              readingMode
                ? "bg-[#60a5fa]/20 text-[#93c5fd] ring-1 ring-[#60a5fa]/40"
                : pageUrlForReading
                  ? "text-white/70 hover:bg-white/10"
                  : "text-white/30 hover:bg-white/10",
            )}
            aria-label={readingMode ? "Exit reading mode" : "Reading mode"}
            aria-pressed={readingMode}
            title={readingMode ? "Exit reading mode" : "Reading mode"}
          >
            <BookOpen className="size-4" />
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10" aria-label="Settings">
            <Settings2 className="size-4" />
          </button>
          <button type="button" onClick={bookmarkCurrent} className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10" aria-label="Bookmark">
            <Bookmark className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
              shieldsActive ? "bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30" : "bg-white/10 text-white/45",
            )}
          >
            <Shield className="size-3" />
            {shieldsActive ? (sessionShields.blocked ? `${sessionShields.blocked} blocked` : "Shields up") : "Shields down"}
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60">
            {engineLabel}
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60">
            DNS · {prefs.dns === "nextdns" ? (prefs.nextDnsConfig ? `NextDNS ${prefs.nextDnsConfig}` : "NextDNS") : prefs.dns}
          </span>
          {!standalone && (
            <a
              href={browserIpaReleasesUrl()}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80 hover:bg-white/15"
            >
              <Download className="size-3" /> Get IPA
            </a>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {readingMode && (view.kind === "page" || view.kind === "web") && (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-[#141a24]">
            <BrowserReadingView
              article={readingArticle}
              url={readingUrl || pageUrlForReading}
              busy={readingBusy}
              error={readingError}
              onClose={() => {
                setReadingMode(false);
                saveReadingModeSession(false);
              }}
            />
          </div>
        )}
        {view.kind === "home" && (
          <div className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-10 pb-8">
            <div className="relative mb-6 grid size-20 place-items-center rounded-[1.75rem] bg-gradient-to-br from-[#60a5fa] via-[#a78bfa] to-[#f472b6] shadow-2xl shadow-blue-500/30">
              <Globe className="size-10 text-white" />
              <span className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full bg-orange-500 text-white shadow-lg ring-2 ring-[#0b1220]">
                <Shield className="size-4" />
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">Nexus Browser</h1>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">
              Private search with Brave-style shields, NextDNS / custom DoH, and your choice of search engine.
            </p>
            <form
              className="mt-8 flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search with ${engineLabel}…`}
                className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 text-base outline-none ring-1 ring-white/10 focus:ring-[#60a5fa]"
              />
              <button type="submit" className="rounded-2xl bg-[#60a5fa] px-5 font-bold text-[#0b1220]">
                Search
              </button>
            </form>

            <div className="mt-6 grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { t: "Shields", d: shieldsActive ? "Blocking ads & trackers" : "Currently off", a: () => setSettingsOpen(true) },
                { t: "DNS", d: prefs.dns === "nextdns" ? "NextDNS ready" : prefs.dns, a: () => setSettingsOpen(true) },
                { t: "Search", d: engineLabel, a: () => setSettingsOpen(true) },
              ].map((c) => (
                <button
                  key={c.t}
                  type="button"
                  onClick={c.a}
                  className="rounded-2xl bg-white/[0.04] p-3 text-left ring-1 ring-white/10 transition hover:bg-white/[0.07]"
                >
                  <div className="text-xs font-bold text-white/90">{c.t}</div>
                  <div className="mt-0.5 truncate text-[11px] text-white/45">{c.d}</div>
                </button>
              ))}
            </div>

            {!!bookmarks.length && (
              <section className="mt-10 w-full">
                <h2 className="mb-2 text-xs font-bold tracking-wide text-white/45 uppercase">Bookmarks</h2>
                <ul className="space-y-1">
                  {bookmarks.slice(0, 8).map((b) => (
                    <li key={b.url}>
                      <button type="button" onClick={() => void openLive(b.url)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10">
                        <Bookmark className="size-4 text-[#60a5fa]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!!history.length && (
              <section className="mt-6 w-full">
                <h2 className="mb-2 text-xs font-bold tracking-wide text-white/45 uppercase">Recent</h2>
                <ul className="space-y-1">
                  {history.slice(0, 10).map((h) => (
                    <li key={h.url + h.at}>
                      <button type="button" onClick={() => void openLive(h.url)} className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-white/10">
                        <span className="truncate text-sm font-semibold">{h.title}</span>
                        <span className="truncate text-[11px] text-white/40">{h.url}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!standalone && (
              <button type="button" onClick={() => openBrowser()} className="mt-8 text-xs font-semibold text-[#60a5fa] hover:underline">
                Open standalone browser mode
              </button>
            )}
          </div>
        )}

        {view.kind === "results" && (
          <div className="mx-auto max-w-2xl px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-white/60">
              <span>
                Results for <b className="text-white">{view.q}</b>
                <span className="text-white/40"> · {engineLabel}</span>
              </span>
              <a href={view.google} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#60a5fa] hover:underline">
                Open externally <ExternalLink className="size-3" />
              </a>
              <button
                type="button"
                onClick={() => void openLive(view.google)}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white/15"
              >
                <Globe className="size-3" /> Live results
              </button>
            </div>
            {!view.fetched && (
              <div className="mb-3 space-y-2 rounded-xl bg-amber-500/15 px-3 py-3 text-sm text-amber-100">
                <p>Couldn&apos;t load a result list — open the live search page with Shields.</p>
                <button
                  type="button"
                  onClick={() => void openLive(view.google)}
                  className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-[#0b1220]"
                >
                  Open live results now
                </button>
              </div>
            )}
            <ul className="space-y-3">
              {view.hits.map((h) => (
                <li key={h.url} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                  <button type="button" onClick={() => void openLive(h.url)} className="w-full text-left">
                    <div className="truncate text-[11px] text-emerald-300/90">{h.url}</div>
                    <div className="mt-0.5 text-base font-bold text-[#93c5fd] hover:underline">{h.title}</div>
                    {h.snippet && <p className="mt-1 text-sm leading-snug text-white/65">{h.snippet}</p>}
                  </button>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => void openPage(h.url)} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/70">
                      Reader
                    </button>
                    <button type="button" onClick={() => void openLive(h.url)} className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[10px] font-bold text-orange-200">
                      Shielded view
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.kind === "page" && (
          <div className="mx-auto max-w-2xl px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 text-lg font-bold">{view.title}</h2>
              <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[10px] font-bold text-orange-200">
                {summarizeShields(view.shields || emptyShieldStats())}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFindOpen(true);
                  requestAnimationFrame(() => findInput.current?.focus());
                }}
                className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                aria-label="Find in page"
                title="Find in page (⌘/Ctrl+F)"
              >
                <TextSearch className="size-4" />
              </button>
              <button type="button" onClick={() => void openLive(view.url)} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                Live view
              </button>
              <a href={view.url} target="_blank" rel="noreferrer" className="rounded-full bg-[#60a5fa] px-3 py-1 text-xs font-bold text-[#0b1220]">
                Open
              </a>
              <button type="button" onClick={() => void openPage(view.url)} className="grid size-8 place-items-center rounded-full hover:bg-white/10" aria-label="Refresh">
                <RefreshCw className="size-4" />
              </button>
            </div>
            <p className="mb-3 truncate text-[11px] text-white/40">{view.url}</p>
            {findOpen && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                <TextSearch className="size-4 text-white/60" />
                <input
                  ref={findInput}
                  value={findQ}
                  onChange={(e) => setFindQ(e.target.value)}
                  placeholder="Find in page…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                {(() => {
                  const q = findQ.trim().toLowerCase();
                  const hay = (view.text || "").toLowerCase();
                  const matches: number[] = [];
                  if (q) {
                    let from = 0;
                    while (from < hay.length) {
                      const i = hay.indexOf(q, from);
                      if (i < 0) break;
                      matches.push(i);
                      from = i + q.length;
                    }
                  }
                  const total = matches.length;
                  const cur = total ? ((findIdx % total) + total) % total : 0;
                  return (
                    <>
                      <span className="text-[11px] tabular-nums text-white/50">{total ? `${cur + 1}/${total}` : "0/0"}</span>
                      <button
                        type="button"
                        disabled={!total}
                        className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold disabled:opacity-40"
                        onClick={() => setFindIdx((i) => i - 1)}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        disabled={!total}
                        className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold disabled:opacity-40"
                        onClick={() => setFindIdx((i) => i + 1)}
                      >
                        Next
                      </button>
                      <button type="button" className="grid size-7 place-items-center rounded-full hover:bg-white/10" onClick={() => setFindOpen(false)} aria-label="Close find">
                        <X className="size-3.5" />
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
            <article className="whitespace-pre-wrap rounded-2xl bg-white/[0.04] p-4 text-[15px] leading-relaxed text-white/85 ring-1 ring-white/10">
              {highlightFind(view.text || "No readable text extracted.", findOpen ? findQ : "", findIdx)}
            </article>
          </div>
        )}

        {view.kind === "web" && (
          <div className="flex h-full min-h-[70vh] flex-col">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-white/50">
              <Shield className={cn("size-3.5", shieldsActive ? "text-orange-300" : "text-white/30")} />
              <span className="min-w-0 flex-1 truncate">
                {shieldsActive ? shieldSummary : "Shields down"} · {view.url}
              </span>
              <a href={view.url} target="_blank" rel="noreferrer" className="text-[#60a5fa]">
                External
              </a>
            </div>
            <iframe
              ref={frameRef}
              title="Nexus Browser"
              src={shieldsActive || prefs.dns !== "system" ? proxiedUrl(view.url) : view.url}
              className="min-h-0 w-full flex-1 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => {
                if (readingMode) void loadReadingArticle(view.url);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function highlightFind(raw: string, query: string, findIdx: number): ReactNode {
  const q = query.trim();
  if (!q) return raw;
  const lower = raw.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  const matches: number[] = [];
  let scan = 0;
  while (scan < lower.length) {
    const i = lower.indexOf(needle, scan);
    if (i < 0) break;
    matches.push(i);
    scan = i + needle.length;
  }
  const active = matches.length ? ((findIdx % matches.length) + matches.length) % matches.length : -1;
  let from = 0;
  let mi = 0;
  while (from < raw.length) {
    const i = lower.indexOf(needle, from);
    if (i < 0) {
      parts.push(raw.slice(from));
      break;
    }
    if (i > from) parts.push(raw.slice(from, i));
    const hit = raw.slice(i, i + q.length);
    const isActive = mi === active;
    parts.push(
      <mark key={`${i}-${mi}`} id={isActive ? "browser-find-active" : undefined} className={cn("rounded px-0.5", isActive ? "bg-amber-300 text-black" : "bg-amber-300/40 text-white")}>
        {hit}
      </mark>,
    );
    mi += 1;
    from = i + q.length;
  }
  return parts;
}
