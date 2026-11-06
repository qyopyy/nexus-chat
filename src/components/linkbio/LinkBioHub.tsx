"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Link2, LogOut, Plus, Shield, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { roleRank } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { normalizeLink, PLATFORMS } from "@/lib/links";
import {
  LINKBIO_BACKGROUNDS,
  LINKBIO_FONTS,
  LINKBIO_THEMES,
  linkbioMine,
  linkbioSave,
  openLinkBio,
  publicLinkBioUrl,
  type LinkBioBackground,
  type LinkBioFont,
  type LinkBioLink,
  type LinkBioPage,
  type LinkBioTheme,
} from "@/lib/linkbio";
import LinkBioAdmin from "@/components/linkbio/LinkBioAdmin";

export { openLinkBio };

export default function LinkBioHub({
  mobile,
  onBack,
  standalone,
}: {
  mobile?: boolean;
  onBack?: () => void;
  standalone?: boolean;
}) {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : null));
  const canAdmin = roleRank(me?.site_role) >= 2;
  const [tab, setTab] = useState<"edit" | "admin">("edit");
  const [page, setPage] = useState<LinkBioPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [plat, setPlat] = useState("website");

  useEffect(() => {
    void linkbioMine().then(setPage);
  }, []);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    const next = await linkbioSave(patch);
    if (next) setPage(next);
    setBusy(false);
  }

  if (tab === "admin" && canAdmin) {
    return <LinkBioAdmin onBack={() => setTab("edit")} />;
  }

  if (!page) {
    return (
      <div className="grid h-full place-items-center bg-[#0a0214] text-white/60">
        <div className="size-10 animate-spin rounded-full border-4 border-[#a855f7] border-t-transparent" />
      </div>
    );
  }

  const links = page.links ?? [];
  const publicUrl = publicLinkBioUrl(page.username);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07060f] text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile || standalone ? "pt-safe-3 pb-2" : "h-12")}>
        {(onBack || mobile) && (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : useApp.setState({ mobileTab: "me", appsTool: null, hub: null }))}
            className="grid size-9 place-items-center rounded-full hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <Sparkles className="size-5 text-[#c084fc]" />
        <div className="min-w-0 flex-1">
          <div className={cn("font-bold tracking-tight", mobile || standalone ? "text-xl" : "text-base")}>Nexus Link</div>
          <div className="truncate text-[11px] text-white/45">Link in bio · themes · 999</div>
        </div>
        {canAdmin && (
          <button type="button" onClick={() => setTab("admin")} className="grid size-9 place-items-center rounded-full hover:bg-white/10" title="Link Admin">
            <Shield className="size-4 text-[#a855f7]" />
          </button>
        )}
        <a href={publicUrl} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full hover:bg-white/10" title="Open public page">
          <ExternalLink className="size-4" />
        </a>
        {standalone && (
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="grid size-9 place-items-center rounded-full hover:bg-white/10"
            title="Log out"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-5 p-3 sm:grid-cols-2 sm:p-5">
          {/* Editor */}
          <div className="space-y-4">
            <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold tracking-wide text-white/70 uppercase">Profile</h2>
                {page.premium ? (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">⭐ Premium</span>
                ) : (
                  <span className="text-[11px] text-white/40">Free · ask admin for Premium</span>
                )}
              </div>
              <label className="mb-1 block text-xs font-semibold text-white/50">Username</label>
              <div className="mb-3 flex gap-2">
                <span className="grid place-items-center rounded-xl bg-black/30 px-3 text-white/40">@</span>
                <input
                  defaultValue={page.username}
                  key={`u-${page.username}`}
                  onBlur={(e) => {
                    const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
                    if (v && v !== page.username) void save({ username: v });
                  }}
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />
              </div>
              <label className="mb-1 block text-xs font-semibold text-white/50">Display name</label>
              <input
                defaultValue={page.display_name}
                key={`d-${page.display_name}`}
                onBlur={(e) => {
                  const v = e.target.value.trim().slice(0, 48);
                  if (v && v !== page.display_name) void save({ display_name: v });
                }}
                className="mb-3 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
              />
              <label className="mb-1 block text-xs font-semibold text-white/50">Bio</label>
              <textarea
                defaultValue={page.bio ?? ""}
                key={`b-${page.bio ?? ""}`}
                rows={3}
                maxLength={280}
                onBlur={(e) => {
                  const v = e.target.value.trim().slice(0, 280);
                  if (v !== (page.bio ?? "")) void save({ bio: v });
                }}
                className="w-full resize-none rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
              />
              <label className="mt-3 mb-1 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={page.published !== false} onChange={(e) => void save({ published: e.target.checked })} />
                Published
              </label>
            </section>

            <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <h2 className="mb-3 text-sm font-bold tracking-wide text-white/70 uppercase">Links</h2>
              <div className="mb-3 space-y-2">
                {links.map((l, i) => (
                  <div key={`${l.url}-${i}`} className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
                    <Link2 className="size-4 shrink-0 text-white/40" />
                    <div className="min-w-0 flex-1 truncate text-sm">{l.label || l.url}</div>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                      onClick={() => void save({ links: links.filter((_, j) => j !== i) })}
                      aria-label="Remove link"
                    >
                      <Trash2 className="size-3.5 text-white/50" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={plat} onChange={(e) => setPlat(e.target.value)} className="rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10">
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="URL or @handle"
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]"
                />
                <button
                  type="button"
                  disabled={busy || links.length >= 20}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold disabled:opacity-40"
                  onClick={() => {
                    const n = normalizeLink(linkInput, plat);
                    if (!n) return;
                    const row: LinkBioLink = { ...n, label: n.label };
                    void save({ links: [...links, row] });
                    setLinkInput("");
                  }}
                >
                  <Plus className="size-4" /> Add
                </button>
              </div>
            </section>

            <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <h2 className="mb-3 text-sm font-bold tracking-wide text-white/70 uppercase">Theme</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LINKBIO_THEMES.map((t) => {
                  const locked = Boolean(t.premium && !page.premium);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={locked || busy}
                      onClick={() => void save({ theme: t.id as LinkBioTheme })}
                      className={cn(
                        "rounded-xl px-3 py-2.5 text-left ring-1 transition",
                        page.theme === t.id ? "bg-[#a855f7]/25 ring-[#a855f7]" : "bg-black/25 ring-white/10 hover:bg-white/5",
                        locked && "opacity-40",
                      )}
                    >
                      <div className="text-sm font-bold">{t.name}</div>
                      <div className="text-[11px] text-white/45">{t.tag}{t.premium ? " · ⭐" : ""}</div>
                    </button>
                  );
                })}
              </div>

              <h3 className="mt-4 mb-2 text-xs font-bold tracking-wide text-white/50 uppercase">Animated background</h3>
              <div className="flex flex-wrap gap-2">
                {LINKBIO_BACKGROUNDS.map((b) => {
                  const locked = Boolean(b.premium && !page.premium);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={locked || busy}
                      onClick={() => void save({ background: b.id as LinkBioBackground })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold ring-1",
                        page.background === b.id ? "bg-[#a855f7]/30 ring-[#a855f7]" : "bg-black/25 ring-white/10",
                        locked && "opacity-40",
                      )}
                    >
                      {b.name}
                      {b.premium ? " ⭐" : ""}
                    </button>
                  );
                })}
              </div>

              <h3 className="mt-4 mb-2 text-xs font-bold tracking-wide text-white/50 uppercase">Font</h3>
              <div className="flex flex-wrap gap-2">
                {LINKBIO_FONTS.map((f) => {
                  const locked = Boolean(f.premium && !page.premium);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={locked || busy}
                      onClick={() => void save({ font: f.id as LinkBioFont })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold ring-1",
                        page.font === f.id ? "bg-[#a855f7]/30 ring-[#a855f7]" : "bg-black/25 ring-white/10",
                        locked && "opacity-40",
                      )}
                    >
                      {f.name}
                      {f.premium ? " ⭐" : ""}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={page.animated_bg} onChange={(e) => void save({ animated_bg: e.target.checked })} />
                  Animate background
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={page.glow} onChange={(e) => void save({ glow: e.target.checked })} />
                  Glowing username
                </label>
              </div>
            </section>
          </div>

          {/* Live preview tip */}
          <div className="space-y-4">
            <section
              className="overflow-hidden rounded-3xl p-5 ring-1 ring-white/10"
              style={{
                background:
                  page.theme === "juice999" || page.theme === "purple999"
                    ? "radial-gradient(ellipse at 50% 0%,#3b0a5c 0%,#0a0214 55%,#000 100%)"
                    : "linear-gradient(180deg,#12101c,#07060f)",
              }}
            >
              <div className="text-[11px] font-bold tracking-[0.14em] text-[#c084fc] uppercase">Live preview</div>
              <div
                className={cn(
                  "mt-4 text-center text-3xl font-black tracking-tight",
                  page.glow && "animate-pulse",
                )}
                style={{
                  textShadow: page.glow ? "0 0 12px #a855f7, 0 0 32px #c084fc88" : undefined,
                  fontFamily: page.font === "juice" || page.font === "marker" ? "Permanent Marker, cursive" : page.font === "display" ? "Bebas Neue, sans-serif" : undefined,
                }}
              >
                {page.display_name}
              </div>
              <div className="mt-1 text-center text-sm text-white/50">@{page.username}</div>
              {page.bio && <p className="mx-auto mt-3 max-w-xs whitespace-pre-wrap text-center text-sm text-white/65">{page.bio}</p>}
              <div className="mt-4 space-y-2">
                {links.slice(0, 5).map((l, i) => (
                  <div key={i} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold">
                    {l.label || l.url}
                  </div>
                ))}
              </div>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-bold text-[#1a0533]"
              >
                Open /bio/{page.username} <ExternalLink className="size-4" />
              </a>
              <p className="mt-3 text-center text-[11px] text-white/40">{page.view_count} views · theme {page.theme} · bg {page.background}</p>
            </section>

            <section className="rounded-2xl bg-white/5 p-4 text-sm text-white/60 ring-1 ring-white/10">
              <p>
                Nexus Link is a side project with its own login at <code className="text-white/80">/bio/app</code>. Public pages live at{" "}
                <code className="text-white/80">/bio/username</code>. Juice 999 themes, 999 backgrounds, and the Juice font need Premium — grant it in Link Admin.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
