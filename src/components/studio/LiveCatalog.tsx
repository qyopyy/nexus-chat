"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Link2, Radio, RefreshCw, Search, Share2 } from "lucide-react";
import { toast } from "@/store/app";
import { openRelease, studioGo } from "@/store/studio";
import { STATUS_INFO, distFileUrl, listReleases, tunearo } from "@/lib/dist";
import { createSmartLink, findStoreLinks, getSmartLink, listSmartLinks, saveSmartLink, smartUrl, type SmartLink } from "@/lib/distExtras";
import { DIST_STORES, FEATURED_STORES } from "@/lib/distStores";
import { cn } from "@/lib/utils";
import { Card, H, StatusPill } from "./Studio";
import type { DistRelease } from "@/lib/types";

/** Live catalog — releases that are out on Spotify, Apple Music and 150+ stores. */
export default function LiveCatalog() {
  const [rows, setRows] = useState<DistRelease[] | null>(null);
  const [links, setLinks] = useState<SmartLink[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [art, setArt] = useState<Record<string, string | null>>({});

  const reload = async () => {
    const list = await listReleases();
    setRows(list);
    setLinks(await listSmartLinks());
  };

  useEffect(() => {
    void reload();
    void tunearo("sync").catch(() => null).then(() => void reload());
  }, []);

  useEffect(() => {
    if (!rows) return;
    let alive = true;
    void Promise.all(
      rows
        .filter((r) => r.status === "live")
        .slice(0, 40)
        .map(async (r) => {
          const url = await distFileUrl(r.artwork_path);
          if (alive) setArt((a) => ({ ...a, [r.id]: url }));
        }),
    );
    return () => {
      alive = false;
    };
  }, [rows]);

  const live = useMemo(() => {
    const list = (rows ?? []).filter((r) => r.status === "live" || r.status === "takedown_requested");
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((r) => `${r.title} ${r.primary_artist_name} ${r.upc ?? ""}`.toLowerCase().includes(qq));
  }, [rows, q]);

  const linkByRelease = useMemo(() => Object.fromEntries(links.map((l) => [l.release_id, l])), [links]);

  const syncAll = async () => {
    setBusy(true);
    try {
      await tunearo("sync");
      await reload();
      toast("Live statuses refreshed from Tunearo", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const ensureLink = async (r: DistRelease): Promise<SmartLink | null> => {
    let link: SmartLink | null = linkByRelease[r.id] ?? (await getSmartLink(r.id));
    if (!link) {
      link = await createSmartLink(r);
      if (!link) return null;
    }
    try {
      const found = await findStoreLinks(r.id);
      if (Object.keys(found).length) {
        link = (await saveSmartLink(link.id, { links: { ...link.links, ...found } })) ?? link;
      }
    } catch {
      /* optional enrichment */
    }
    await reload();
    return link;
  };

  return (
    <>
      <H
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => void syncAll()} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-2 text-sm font-semibold hover:bg-active disabled:opacity-50">
              <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Sync
            </button>
            <button onClick={() => studioGo("releases")} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
              All releases
            </button>
          </div>
        }
      >
        Live catalog
      </H>

      <div className="mb-5 overflow-hidden rounded-3xl border border-[#23a55a]/30 bg-gradient-to-br from-[#23a55a]/20 via-side to-side p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#23a55a] text-black">
            <Radio className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black tracking-widest text-[#23a55a] uppercase">Nexus Live Distribution</div>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight">Your music, live worldwide</h2>
            <p className="mt-1 max-w-2xl text-sm text-sub">
              Releases that cleared Nexus review and Tunearo delivery. Pull store links, share smart pages, and keep royalties flowing — 150+ destinations including Spotify, Apple Music, TikTok, Snapchat and YouTube Music.
            </p>
          </div>
          <div className="rounded-2xl bg-black/30 px-4 py-3 text-center">
            <div className="text-3xl font-black tabular-nums text-[#23a55a]">{live.filter((r) => r.status === "live").length}</div>
            <div className="text-[11px] font-bold tracking-wide text-sub uppercase">Live now</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FEATURED_STORES.map((s) => (
            <span key={s.id} className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: s.color === "#111111" ? "#333" : s.color }}>
              {s.name}
            </span>
          ))}
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-sub">+{DIST_STORES.length - FEATURED_STORES.length} more</span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-line/70 bg-side px-3 py-2">
        <Search className="size-4 text-sub" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search live titles, artists, UPC…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-sub" />
      </div>

      {rows === null ? (
        <p className="text-sub">Loading…</p>
      ) : live.length === 0 ? (
        <Card className="py-12 text-center">
          <Radio className="mx-auto size-10 text-sub" />
          <div className="mt-3 font-semibold">Nothing live yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-sub">Submit a release from Music releases. After Nexus review and Tunearo delivery, it shows up here with store links.</p>
          <button onClick={() => openRelease("new")} className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">
            Create a release
          </button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((r) => {
            const link = linkByRelease[r.id];
            const storeCount = link ? Object.keys(link.links ?? {}).filter((k) => link.links[k]).length : 0;
            return (
              <div key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-side">
                <button onClick={() => openRelease(r.id)} className="relative aspect-square w-full overflow-hidden bg-black/30">
                  {art[r.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art[r.id]!} alt="" className="size-full object-cover transition hover:scale-[1.02]" />
                  ) : (
                    <div className="grid size-full place-items-center text-sub">No art</div>
                  )}
                  <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-black text-[#4ade80]">
                    <span className="size-1.5 animate-pulse rounded-full bg-[#4ade80]" />
                    {STATUS_INFO[r.status].label}
                  </span>
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div>
                    <div className="truncate font-bold">{r.title}</div>
                    <div className="truncate text-sm text-sub">{r.primary_artist_name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-sub">
                      <StatusPill status={r.status} />
                      <span>{r.release_type}</span>
                      {r.upc && <span className="font-mono">UPC {r.upc}</span>}
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <button
                      onClick={() => void (async () => {
                        const l = await ensureLink(r);
                        if (!l) return;
                        await navigator.clipboard.writeText(smartUrl(l.slug));
                        toast("Smart link copied", "success");
                      })()}
                      className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active"
                    >
                      <Share2 className="size-3.5" /> Share
                    </button>
                    {link && (
                      <a href={smartUrl(link.slug)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active">
                        <ExternalLink className="size-3.5" /> Page
                      </a>
                    )}
                    <button onClick={() => openRelease(r.id)} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active">
                      <Link2 className="size-3.5" /> {storeCount ? `${storeCount} stores` : "Open"}
                    </button>
                    {r.upc && (
                      <button
                        onClick={() => void navigator.clipboard.writeText(r.upc!).then(() => toast("UPC copied", "success"))}
                        className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active"
                      >
                        <Copy className="size-3.5" /> UPC
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card title="Where your music goes" className="mt-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DIST_STORES.map((s) => (
            <div key={s.id} className="flex items-start gap-3 rounded-xl bg-black/20 p-3">
              <span className="mt-0.5 size-2.5 shrink-0 rounded-full" style={{ background: s.color === "#111111" ? "#888" : s.color }} />
              <div className="min-w-0">
                <div className="text-sm font-bold">{s.name}</div>
                <div className="text-xs text-sub">{s.blurb}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-sub">Typical live · {s.eta}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
