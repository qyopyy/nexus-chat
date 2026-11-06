"use client";

import { BookOpen, Loader2, X } from "lucide-react";
import type { ExtractedArticle } from "@/lib/browserReading";

export default function BrowserReadingView({
  article,
  url,
  busy,
  error,
  onClose,
}: {
  article: ExtractedArticle | null;
  url: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#141a24]">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <BookOpen className="size-4 text-[#93c5fd]" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold tracking-wide text-white/55 uppercase">
          Reading mode
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80 hover:bg-white/15"
          aria-label="Exit reading mode"
        >
          <X className="size-3.5" /> Exit
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto max-w-[42rem] px-5 py-8 sm:px-8 sm:py-10"
          style={{ fontFamily: 'Georgia, "Source Serif 4", "Times New Roman", serif' }}
        >
          {busy && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-white/55">
              <Loader2 className="size-5 animate-spin text-[#60a5fa]" />
              Extracting article…
            </div>
          )}

          {!busy && error && (
            <div className="rounded-2xl bg-amber-500/15 px-4 py-4 text-sm text-amber-100 ring-1 ring-amber-400/20">
              {error}
            </div>
          )}

          {!busy && !error && article && (
            <>
              {(article.siteName || url) && (
                <p
                  className="mb-3 text-[11px] font-semibold tracking-wide text-[#60a5fa]/80 uppercase"
                  style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
                >
                  {article.siteName ||
                    (() => {
                      try {
                        return new URL(url).hostname;
                      } catch {
                        return url;
                      }
                    })()}
                </p>
              )}
              <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-[#f1f5f9] sm:text-[2rem]">
                {article.title}
              </h1>
              {article.byline && (
                <p className="mt-3 text-[15px] text-white/50" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
                  {/^by\s/i.test(article.byline) ? article.byline : `By ${article.byline}`}
                </p>
              )}
              <p className="mt-2 truncate text-[11px] text-white/30" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
                {url}
              </p>
              <div className="mt-8 space-y-5 text-[1.125rem] leading-[1.75] text-[#e2e8f0]/92">
                {article.paragraphs.length ? (
                  article.paragraphs.map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <p className="text-white/45">No readable article text found on this page.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
