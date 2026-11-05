"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Download,
  ExternalLink,
  Globe,
  Home,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/app";
import { browserIpaReleasesUrl, openBrowser, type BrowserSearchHit } from "@/lib/browser";

type Engine = "google" | "bing" | "duckduckgo";
type View =
  | { kind: "home" }
  | { kind: "results"; q: string; hits: BrowserSearchHit[]; google: string; fetched: boolean }
  | { kind: "page"; url: string; title: string; text: string }
  | { kind: "web"; url: string };

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

export default function BrowserHub({
  mobile,
  onBack,
  standalone,
}: {
  mobile?: boolean;
  onBack?: () => void;
  standalone?: boolean;
}) {
  const [engine, setEngine] = useState<Engine>("google");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: "home" });
  const [history, setHistory] = useState<{ title: string; url: string; at: string }[]>([]);
  const [bookmarks, setBookmarks] = useState<{ title: string; url: string; at: string }[]>([]);
  const stack = useRef<View[]>([{ kind: "home" }]);
  const [stackI, setStackI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(loadList(HIST_KEY));
    setBookmarks(loadList(BM_KEY));
  }, []);

  const pushView = useCallback((v: View) => {
    stack.current = [...stack.current.slice(0, stackI + 1), v];
    setStackI(stack.current.length - 1);
    setView(v);
  }, [stackI]);

  const goBack = () => {
    if (stackI <= 0) {
      onBack?.();
      return;
    }
    const i = stackI - 1;
    setStackI(i);
    setView(stack.current[i]);
  };
  const goForward = () => {
    if (stackI >= stack.current.length - 1) return;
    const i = stackI + 1;
    setStackI(i);
    setView(stack.current[i]);
  };

  async function runSearch(raw?: string) {
    const q = (raw ?? query).trim();
    if (!q) return;
    // URL typed into the bar
    if (/^https?:\/\//i.test(q) || (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(q) && !/\s/.test(q))) {
      const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
      setQuery(url);
      await openPage(url);
      return;
    }
    setBusy(true);
    setQuery(q);
    try {
      const res = await fetch(`/api/browser/search?q=${encodeURIComponent(q)}&engine=${engine}`);
      const data = (await res.json()) as {
        results: BrowserSearchHit[];
        google: string;
        fetched: boolean;
        error?: string;
      };
      if (data.error && !data.results?.length) toast(data.error, "info");
      const next: View = {
        kind: "results",
        q,
        hits: data.results || [],
        google: data.google || `https://www.google.com/search?q=${encodeURIComponent(q)}`,
        fetched: !!data.fetched,
      };
      pushView(next);
      const row = { title: `Search: ${q}`, url: data.google, at: new Date().toISOString() };
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
      const res = await fetch(`/api/browser/fetch?url=${encodeURIComponent(url)}`);
      const data = (await res.json()) as { url?: string; title?: string; text?: string; error?: string };
      if (data.error) {
        // Fall back to live web view (iframe / Cap webview)
        pushView({ kind: "web", url });
      } else {
        pushView({ kind: "page", url: data.url || url, title: data.title || url, text: data.text || "" });
        const row = { title: data.title || url, url: data.url || url, at: new Date().toISOString() };
        const hist = [row, ...loadList(HIST_KEY).filter((h) => h.url !== row.url)];
        saveList(HIST_KEY, hist);
        setHistory(hist);
      }
    } catch {
      pushView({ kind: "web", url });
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

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-[#0b1220] text-white", (mobile || standalone) && "pb-safe-2")}>
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
              placeholder="Search Google or type a URL"
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
          <button type="button" onClick={bookmarkCurrent} className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10" aria-label="Bookmark">
            <Bookmark className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2">
          <span className="shrink-0 text-[10px] font-bold tracking-wide text-white/45 uppercase">Engine</span>
          {([
            ["google", "Google"],
            ["bing", "Bing"],
            ["duckduckgo", "DuckDuckGo"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setEngine(id)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                engine === id ? "bg-[#60a5fa] text-[#0b1220]" : "bg-white/10 text-white/70",
              )}
            >
              {label}
            </button>
          ))}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view.kind === "home" && (
          <div className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-10 pb-8">
            <div className="mb-6 grid size-20 place-items-center rounded-[1.75rem] bg-gradient-to-br from-[#60a5fa] via-[#a78bfa] to-[#f472b6] shadow-2xl shadow-blue-500/30">
              <Globe className="size-10 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight">Nexus Browser</h1>
            <p className="mt-2 max-w-sm text-center text-sm text-white/60">
              Search with Google — results are fetched from google.com on Nexus servers, then opened here.
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
                placeholder="Search the web…"
                className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 text-base outline-none ring-1 ring-white/10 focus:ring-[#60a5fa]"
              />
              <button type="submit" className="rounded-2xl bg-[#60a5fa] px-5 font-bold text-[#0b1220]">
                Search
              </button>
            </form>
            {!!bookmarks.length && (
              <section className="mt-10 w-full">
                <h2 className="mb-2 text-xs font-bold tracking-wide text-white/45 uppercase">Bookmarks</h2>
                <ul className="space-y-1">
                  {bookmarks.slice(0, 8).map((b) => (
                    <li key={b.url}>
                      <button type="button" onClick={() => void openPage(b.url)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10">
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
                      <button type="button" onClick={() => void openPage(h.url)} className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-white/10">
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
              </span>
              <a href={view.google} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#60a5fa] hover:underline">
                Open on Google <ExternalLink className="size-3" />
              </a>
              <button
                type="button"
                onClick={() => pushView({ kind: "web", url: view.google })}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white/15"
              >
                <Globe className="size-3" /> Live Google page
              </button>
            </div>
            {!view.fetched && (
              <p className="mb-3 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
                Couldn&apos;t parse Google HTML this time — use Live Google page or open on Google.
              </p>
            )}
            <ul className="space-y-3">
              {view.hits.map((h) => (
                <li key={h.url} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                  <button type="button" onClick={() => void openPage(h.url)} className="w-full text-left">
                    <div className="truncate text-[11px] text-emerald-300/90">{h.url}</div>
                    <div className="mt-0.5 text-base font-bold text-[#93c5fd] hover:underline">{h.title}</div>
                    {h.snippet && <p className="mt-1 text-sm leading-snug text-white/65">{h.snippet}</p>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.kind === "page" && (
          <div className="mx-auto max-w-2xl px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 text-lg font-bold">{view.title}</h2>
              <button type="button" onClick={() => pushView({ kind: "web", url: view.url })} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
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
            <article className="whitespace-pre-wrap rounded-2xl bg-white/[0.04] p-4 text-[15px] leading-relaxed text-white/85 ring-1 ring-white/10">
              {view.text || "No readable text extracted."}
            </article>
          </div>
        )}

        {view.kind === "web" && (
          <div className="flex h-full min-h-[70vh] flex-col">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-white/50">
              <Globe className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{view.url}</span>
              <a href={view.url} target="_blank" rel="noreferrer" className="text-[#60a5fa]">
                External
              </a>
            </div>
            <iframe title="Nexus Browser" src={view.url} className="min-h-0 w-full flex-1 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" />
          </div>
        )}
      </div>
    </div>
  );
}
