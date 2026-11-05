"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Radio, RefreshCw } from "lucide-react";
import { toast } from "@/store/app";
import { tunearo } from "@/lib/dist";
import { createSmartLink, findStoreLinks, getSmartLink, saveSmartLink, smartUrl, LINK_SERVICES, type SmartLink } from "@/lib/distExtras";
import { DELIVERY_STAGES, FEATURED_STORES, stageForStatus } from "@/lib/distStores";
import { cn } from "@/lib/utils";
import { Card } from "./Studio";
import type { DistRelease } from "@/lib/types";

/** Shown on a live (or in-delivery) release — pipeline + store link finder. */
export default function LiveDeliveryCard({
  release,
  onRefresh,
}: {
  release: DistRelease;
  onRefresh: () => void;
}) {
  const [link, setLink] = useState<SmartLink | null>(null);
  const [busy, setBusy] = useState(false);
  const stage = stageForStatus(release.status);
  const stageIdx = DELIVERY_STAGES.findIndex((s) => s.id === stage);

  useEffect(() => {
    void getSmartLink(release.id).then(setLink);
  }, [release.id]);

  const pullStores = async () => {
    setBusy(true);
    try {
      let l = link ?? (await getSmartLink(release.id)) ?? (await createSmartLink(release));
      if (!l) return;
      const found = await findStoreLinks(release.id);
      const merged = { ...l.links, ...found };
      l = (await saveSmartLink(l.id, { links: merged, enabled: true })) ?? l;
      setLink(l);
      const n = Object.keys(found).length;
      toast(n ? `Found ${n} store link${n === 1 ? "" : "s"}` : "No store links yet — try again in a day or two", n ? "success" : "info");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      await tunearo("sync", { release_id: release.id });
      onRefresh();
      toast("Status refreshed", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const filled = link ? Object.entries(link.links ?? {}).filter(([, v]) => !!v) : [];

  return (
    <Card
      title="Live delivery"
      right={
        <div className="flex items-center gap-1.5">
          <Radio className="size-4 text-[#23a55a]" />
          {release.tunearo_id && (
            <button onClick={() => void refresh()} disabled={busy} className="grid size-8 place-items-center rounded-full bg-hover hover:bg-active" aria-label="Refresh status">
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            </button>
          )}
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-4 gap-1">
        {DELIVERY_STAGES.map((s, i) => {
          const done = i <= stageIdx;
          const current = i === stageIdx;
          return (
            <div key={s.id} className={cn("rounded-xl px-2 py-2 text-center", done ? "bg-[#23a55a]/20" : "bg-black/20", current && "ring-1 ring-[#23a55a]")}>
              <div className={cn("text-[10px] font-black tracking-wide uppercase", done ? "text-[#4ade80]" : "text-sub")}>{s.label}</div>
            </div>
          );
        })}
      </div>

      <p className="mb-3 text-sm text-sub">{DELIVERY_STAGES[stageIdx]?.hint}</p>

      {release.status === "live" && (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FEATURED_STORES.map((s) => {
              const href = link?.links?.[s.id];
              return href ? (
                <a key={s.id} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: s.color }}>
                  {s.name} <ExternalLink className="size-3" />
                </a>
              ) : (
                <span key={s.id} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-sub">
                  {s.name} · pending
                </span>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => void pullStores()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-[#23a55a] px-4 py-2 text-sm font-bold text-black disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Find store links
            </button>
            {link && (
              <a href={smartUrl(link.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
                Open smart link <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          {filled.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {filled.map(([id, url]) => {
                const svc = LINK_SERVICES.find((s) => s.id === id);
                return (
                  <a key={id} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5 text-sm hover:bg-black/30">
                    <span className="size-2 rounded-full" style={{ background: svc?.color ?? "#888" }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{svc?.name ?? id}</span>
                    <ExternalLink className="size-3.5 text-sub" />
                  </a>
                );
              })}
            </div>
          )}

          {release.upc && <p className="mt-3 font-mono text-xs text-sub">UPC {release.upc}</p>}
        </>
      )}
    </Card>
  );
}
