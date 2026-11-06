"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Smartphone } from "lucide-react";
import {
  NEXUS_CAPGO_APP_URL,
  fetchLatestIpa,
  ipaReleasesUrl,
  type IpaKind,
  type LatestIpa,
  IPA_KIND_META,
} from "@/lib/ipaDownloads";
import { cn } from "@/lib/utils";

const KINDS: IpaKind[] = ["nexus", "wump", "link", "browser"];

/** Website surface for GitHub IPA builds + Capgo cloud channel. */
export default function IpaDownloads({ compact }: { compact?: boolean }) {
  const [latest, setLatest] = useState<Partial<Record<IpaKind, LatestIpa | null>>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(KINDS.map(async (k) => [k, await fetchLatestIpa(k)] as const));
      if (cancelled) return;
      const next: Partial<Record<IpaKind, LatestIpa | null>> = {};
      for (const [k, v] of entries) next[k] = v;
      setLatest(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl ring-1 ring-white/10",
        compact ? "bg-side p-3" : "bg-gradient-to-br from-[#151825] to-[#0b0f1a] p-4 text-white",
      )}
    >
      <div className="mb-3 flex items-start gap-2">
        <span className={cn("grid size-10 place-items-center rounded-xl", compact ? "bg-accent/15 text-accent" : "bg-white/10")}>
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-black", compact ? "text-txt" : "text-white")}>iOS apps (.ipa)</div>
          <p className={cn("text-[11px] leading-relaxed", compact ? "text-sub" : "text-white/55")}>
            Built on GitHub Actions · Sideloadly / AltStore · live site via Vercel · Capgo OTA for the native shell
          </p>
        </div>
        <a
          href={NEXUS_CAPGO_APP_URL}
          target="_blank"
          rel="noreferrer"
          className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold", compact ? "bg-white/10 text-sub" : "bg-white/10 text-white/70")}
        >
          Capgo <ExternalLink className="size-3" />
        </a>
      </div>

      <ul className="space-y-1.5">
        {KINDS.map((kind) => {
          const meta = IPA_KIND_META[kind];
          const hit = latest[kind];
          const href = hit?.url || ipaReleasesUrl(kind);
          return (
            <li key={kind}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition",
                  compact ? "hover:bg-hover" : "hover:bg-white/10",
                )}
              >
                <span className={cn("grid size-9 place-items-center rounded-lg", compact ? "bg-black/30 text-accent" : "bg-white/10 text-[#a5b4fc]")}>
                  <Download className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-semibold", compact ? "text-txt" : "text-white")}>{meta.label}</span>
                  <span className={cn("block truncate text-[10px]", compact ? "text-sub" : "text-white/45")}>
                    {hit ? `${hit.tag} · ${hit.name}` : `GitHub releases · ${meta.bundleId}`}
                  </span>
                </span>
                <ExternalLink className={cn("size-3.5 shrink-0", compact ? "text-sub" : "text-white/40")} />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
