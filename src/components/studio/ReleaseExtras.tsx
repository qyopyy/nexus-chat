"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Copy, ExternalLink, Link2, Megaphone, RefreshCw, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "@/store/app";
import { STATUS_INFO, GENRES, LANGUAGES } from "@/lib/dist";
import {
  INSTRUMENTS,
  LINK_SERVICES,
  MOODS,
  STYLES,
  createSmartLink,
  findStoreLinks,
  getDefaults,
  linkStats,
  saveSmartLink,
  setDefaults,
  slugFreeLink,
  smartUrl,
  summarize,
  type Check,
  type Pitch,
  type ReleaseDefaults,
  type SmartLink,
  type StatusLog,
} from "@/lib/distExtras";
import { cn } from "@/lib/utils";
import NameTag from "@/components/ui/NameTag";
import { Card } from "./Studio";
import type { DistRelease, DistTrack } from "@/lib/types";

// ------------------------------------------------------------------ readiness
export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? "var(--color-ok)" : score >= 60 ? "var(--color-idle)" : "var(--color-dnd)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="currentColor" fontSize={size * 0.28} fontWeight={800}>
        {score}
      </text>
    </svg>
  );
}

export function ReadinessCard({ score, checks }: { score: number; checks: Check[] }) {
  const [all, setAll] = useState(false);
  const failing = checks.filter((c) => !c.ok);
  const shown = all ? checks : failing;
  return (
    <Card title="Release readiness">
      <div className="flex items-center gap-4">
        <ScoreRing score={score} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">{score >= 85 ? "Looking great" : score >= 60 ? "Almost there" : "Needs work"}</div>
          <div className="text-sub">
            {checks.length - failing.length} of {checks.length} checks passed
            {failing.some((c) => c.level === "required") && <span className="text-dnd"> · {failing.filter((c) => c.level === "required").length} required to submit</span>}
          </div>
        </div>
        <button onClick={() => setAll(!all)} className="text-xs font-semibold text-accent">
          {all ? "Show issues" : "Show all"}
        </button>
      </div>
      <div className="mt-3 space-y-1">
        {shown.map((c) => (
          <div key={c.id} className="flex items-start gap-2 text-sm">
            {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> : c.level === "required" ? <X className="mt-0.5 size-4 shrink-0 text-dnd" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-idle" />}
            <div className="min-w-0">
              <span className={cn(!c.ok && c.level === "required" && "font-medium")}>{c.label}</span>
              {!c.ok && c.fix && <span className="text-sub"> — {c.fix}</span>}
            </div>
          </div>
        ))}
        {!shown.length && <div className="text-sm text-ok">Everything checks out.</div>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ smart link
export function SmartLinkCard({ r, link, onLink }: { r: DistRelease; link: SmartLink | null; onLink: (l: SmartLink | null) => void }) {
  const [local, setLocal] = useState<SmartLink | null>(link);
  const [finding, setFinding] = useState(false);
  const [stats, setStats] = useState<ReturnType<typeof summarize> | null>(null);
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  useEffect(() => setLocal(link), [link]);
  useEffect(() => {
    if (link) void linkStats(30).then((rows) => setStats(summarize(rows, link.id)));
  }, [link]);
  useEffect(() => {
    if (!local || local.slug === link?.slug) return setSlugOk(null);
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(local.slug)) return setSlugOk(false);
    const t = setTimeout(() => void slugFreeLink(local.slug, local.id).then(setSlugOk), 300);
    return () => clearTimeout(t);
  }, [local, link?.slug]);

  if (!link || !local) {
    return (
      <Card title="Smart link & pre-save">
        <p className="mb-3 text-sm text-sub">One page for every store: share it before release as a pre-save countdown, then fans pick Spotify, Apple Music, YouTube and more. Views and clicks are tracked.</p>
        <button
          onClick={async () => {
            const l = await createSmartLink(r);
            if (l) onLink(l);
          }}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          <Link2 className="size-4" /> Create smart link
        </button>
      </Card>
    );
  }

  const url = smartUrl(link.slug);
  const save = async (patch: Partial<SmartLink>) => {
    const x = await saveSmartLink(link.id, patch);
    if (x) onLink(x);
  };
  const setUrl = (k: string, v: string) => setLocal({ ...local, links: { ...local.links, [k]: v } });
  const top = stats ? Object.entries(stats.byService).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];

  return (
    <Card title="Smart link & pre-save">
      <div className="flex flex-wrap items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-lg bg-black/25 px-3 py-2 font-mono text-sm text-accent hover:underline">
          {url.replace(/^https?:\/\//, "")}
        </a>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(url);
            toast("Link copied", "success");
          }}
          className="grid size-9 place-items-center rounded-lg bg-hover hover:bg-active"
          aria-label="Copy link"
        >
          <Copy className="size-4" />
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-lg bg-hover hover:bg-active" aria-label="Open">
          <ExternalLink className="size-4" />
        </a>
        <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
          <input type="checkbox" checked={link.enabled} onChange={(e) => void save({ enabled: e.target.checked })} className="size-4" /> Live
        </label>
      </div>

      {stats && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/20 p-2">
            <div className="text-lg font-bold tabular-nums">{stats.views}</div>
            <div className="text-[11px] text-sub">views · 30d</div>
          </div>
          <div className="rounded-xl bg-black/20 p-2">
            <div className="text-lg font-bold tabular-nums">{stats.clicks}</div>
            <div className="text-[11px] text-sub">store clicks</div>
          </div>
          <div className="rounded-xl bg-black/20 p-2">
            <div className="text-lg font-bold tabular-nums">{Math.round(stats.ctr * 100)}%</div>
            <div className="text-[11px] text-sub">click rate</div>
          </div>
          {top.length > 0 && (
            <div className="col-span-3 flex flex-wrap justify-center gap-1.5 text-xs text-sub">
              {top.map(([k, n]) => (
                <span key={k} className="rounded-full bg-white/5 px-2 py-0.5">
                  {LINK_SERVICES.find((s) => s.id === k)?.name ?? k} {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-sub">Link name</span>
          <div className="flex items-center rounded-lg border border-line px-2 focus-within:border-accent">
            <span className="text-sub">/l/</span>
            <input
              value={local.slug}
              onChange={(e) => setLocal({ ...local, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 61) })}
              onBlur={() => slugOk && void save({ slug: local.slug })}
              className="min-w-0 flex-1 bg-transparent py-2 outline-none"
            />
            {slugOk === false && <span className="text-xs text-dnd">taken</span>}
          </div>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-sub">Headline (optional)</span>
          <input
            value={local.headline ?? ""}
            maxLength={120}
            onChange={(e) => setLocal({ ...local, headline: e.target.value })}
            onBlur={() => void save({ headline: local.headline?.trim() || null })}
            placeholder="New single out now 🔥"
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Store links</span>
        <button
          disabled={finding}
          onClick={async () => {
            setFinding(true);
            try {
              const found = await findStoreLinks(r.id);
              const n = Object.keys(found).filter((k) => !local.links[k]).length;
              const links = { ...found, ...Object.fromEntries(Object.entries(local.links).filter(([, v]) => v)) };
              setLocal({ ...local, links });
              await save({ links });
              toast(n ? `Found ${n} store link${n === 1 ? "" : "s"}` : "No new links found yet — stores can take a few days after release", n ? "success" : "info");
            } catch (e) {
              toast((e as Error).message, "error");
            }
            setFinding(false);
          }}
          className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active disabled:opacity-50"
        >
          {finding ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Find automatically
        </button>
        <span className="text-xs text-sub">uses the UPC / ISRC once stores have it</span>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {LINK_SERVICES.map((s) => (
          <label key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-2 focus-within:border-accent">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="w-24 shrink-0 truncate text-xs text-sub">{s.name}</span>
            <input
              value={local.links[s.id] ?? ""}
              onChange={(e) => setUrl(s.id, e.target.value.trim())}
              onBlur={() => {
                const v = local.links[s.id];
                if (v && !/^https:\/\//.test(v)) return toast("Links must start with https://", "error");
                const links = Object.fromEntries(Object.entries(local.links).filter(([, x]) => x));
                if (JSON.stringify(links) !== JSON.stringify(link.links)) void save({ links });
              }}
              placeholder={s.hint}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs outline-none placeholder:text-faint"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">Before the release date the page shows a countdown with Pre-save buttons; on release day it switches to Play buttons.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ pitch
function ChipPick({ label, options, value, max, onChange }: { label: string; options: string[]; value: string[]; max: number; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs text-sub">
        {label} <span className="text-faint">(up to {max})</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? value.filter((x) => x !== o) : value.length < max ? [...value, o] : value)}
              className={cn("rounded-full px-2.5 py-1 text-xs font-semibold transition", on ? "bg-accent text-white" : "bg-black/25 text-sub hover:text-txt")}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PitchCard({ pitch, tracks, canEdit, onSave }: { pitch: Pitch | null; tracks: DistTrack[]; canEdit: boolean; onSave: (p: Partial<Pitch>) => Promise<void> }) {
  const [p, setP] = useState<Partial<Pitch>>(pitch ?? { moods: [], styles: [], instruments: [] });
  const [dirty, setDirty] = useState(false);
  useEffect(() => setP(pitch ?? { moods: [], styles: [], instruments: [] }), [pitch]);
  const set = (x: Partial<Pitch>) => (setP({ ...p, ...x }), setDirty(true));
  return (
    <Card title="Playlist pitch">
      <p className="mb-3 text-sm text-sub">
        <Megaphone className="mr-1 inline size-4" /> Tell curators about the song. Admins see this with the release and use it for editorial pitching (best 3+ weeks before release).
      </p>
      <fieldset disabled={!canEdit} className="space-y-3">
        {tracks.length > 1 && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-sub">Focus track</span>
            <select value={p.focus_track ?? ""} onChange={(e) => set({ focus_track: e.target.value || null })} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none">
              <option value="" className="bg-side">
                First track
              </option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id} className="bg-side">
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <ChipPick label="Moods" options={MOODS} value={p.moods ?? []} max={3} onChange={(moods) => set({ moods })} />
        <ChipPick label="Styles" options={STYLES} value={p.styles ?? []} max={3} onChange={(styles) => set({ styles })} />
        <ChipPick label="Instruments" options={INSTRUMENTS} value={p.instruments ?? []} max={5} onChange={(instruments) => set({ instruments })} />
        <label className="block text-sm">
          <span className="mb-1 flex justify-between text-xs text-sub">
            <span>Describe the song</span>
            <span>{(p.description ?? "").length}/500</span>
          </span>
          <textarea
            value={p.description ?? ""}
            maxLength={500}
            rows={3}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="What it's about, how it was made, why it'll connect…"
            className="w-full resize-y rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-sub">Sounds like</span>
            <input value={p.similar_artists ?? ""} maxLength={300} onChange={(e) => set({ similar_artists: e.target.value })} placeholder="Kordhell, DVRST" className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-sub">Artist hometown</span>
            <input value={p.hometown ?? ""} maxLength={100} onChange={(e) => set({ hometown: e.target.value })} placeholder="Budapest, HU" className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-sub">Marketing plans</span>
          <textarea value={p.marketing ?? ""} maxLength={1000} rows={2} onChange={(e) => set({ marketing: e.target.value })} placeholder="TikTok / Snapchat campaign, music video, live shows, press…" className="w-full resize-y rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
        </label>
      </fieldset>
      {canEdit && (
        <button
          disabled={!dirty}
          onClick={async () => {
            await onSave({
              focus_track: p.focus_track ?? null,
              moods: p.moods ?? [],
              styles: p.styles ?? [],
              instruments: p.instruments ?? [],
              description: p.description?.trim() || null,
              similar_artists: p.similar_artists?.trim() || null,
              hometown: p.hometown?.trim() || null,
              marketing: p.marketing?.trim() || null,
            });
            setDirty(false);
          }}
          className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save pitch
        </button>
      )}
    </Card>
  );
}

/** compact read-only pitch for the admin review queue */
export function PitchSummary({ p, tracks }: { p: Pitch; tracks: DistTrack[] }) {
  const focus = tracks.find((t) => t.id === p.focus_track)?.title;
  return (
    <div className="rounded-lg bg-accent/10 p-2.5 text-sm ring-1 ring-accent/20">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <Megaphone className="size-4" /> Playlist pitch{focus ? ` · focus: ${focus}` : ""}
      </div>
      {p.description && <p className="whitespace-pre-wrap">{p.description}</p>}
      <div className="mt-1 text-xs text-sub">{[...p.moods, ...p.styles, ...p.instruments].join(" · ")}</div>
      {(p.similar_artists || p.hometown || p.marketing) && (
        <div className="mt-1 text-xs text-sub">{[p.similar_artists && `Sounds like ${p.similar_artists}`, p.hometown, p.marketing].filter(Boolean).join(" · ")}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ timeline
export function Timeline({ log }: { log: StatusLog[] }) {
  if (!log.length) return null;
  return (
    <Card title="History">
      <ol className="relative space-y-3 border-l border-line pl-4">
        {log.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-side" style={{ background: STATUS_INFO[e.status]?.color ?? "#888" }} />
            <div className="text-sm font-semibold">{STATUS_INFO[e.status]?.label ?? e.status}</div>
            <div className="text-xs text-sub">
              {new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              {e.actor && (
                <>
                  {" · "}
                  <NameTag userId={e.actor} badges={false} />
                </>
              )}
            </div>
            {e.note && <div className="mt-0.5 text-xs whitespace-pre-wrap text-txt/80">{e.note}</div>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ------------------------------------------------------------------ defaults
export function DefaultsDialog({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<ReleaseDefaults>(getDefaults());
  const inp = "w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-side p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-lg font-bold">Release defaults</div>
        <p className="mb-4 text-sm text-sub">New releases start with these details (saved on this device).</p>
        <div className="space-y-2">
          <input className={inp} value={d.primary_artist_name ?? ""} onChange={(e) => setD({ ...d, primary_artist_name: e.target.value })} placeholder="Primary artist (e.g. MA Beats)" />
          <input className={inp} value={d.label_name ?? ""} onChange={(e) => setD({ ...d, label_name: e.target.value })} placeholder="Label (e.g. Audia Music Recordings)" />
          <input className={inp} value={d.copyright_holder ?? ""} onChange={(e) => setD({ ...d, copyright_holder: e.target.value })} placeholder="℗ / © holder" />
          <div className="grid grid-cols-2 gap-2">
            <select className={inp} value={d.primary_genre ?? ""} onChange={(e) => setD({ ...d, primary_genre: e.target.value || undefined })}>
              <option value="" className="bg-side">
                Genre
              </option>
              {GENRES.map((g) => (
                <option key={g} className="bg-side">
                  {g}
                </option>
              ))}
            </select>
            <select className={inp} value={d.language ?? ""} onChange={(e) => setD({ ...d, language: e.target.value || undefined })}>
              <option value="" className="bg-side">
                Language
              </option>
              {LANGUAGES.map((g) => (
                <option key={g} className="bg-side">
                  {g}
                </option>
              ))}
            </select>
          </div>
          <select className={inp} value={d.release_type ?? ""} onChange={(e) => setD({ ...d, release_type: (e.target.value || undefined) as ReleaseDefaults["release_type"] })}>
            <option value="" className="bg-side">
              Release type
            </option>
            {["Single", "EP", "Album"].map((g) => (
              <option key={g} className="bg-side">
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-hover">
            Cancel
          </button>
          <button
            onClick={() => {
              setDefaults(Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === "string" && v.trim())) as ReleaseDefaults);
              toast("Defaults saved", "success");
              onClose();
            }}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
