"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Award, BadgeCheck, Crown, Link2, Network, RefreshCw, Shield, ShieldAlert, Star, Ticket } from "lucide-react";
import {
  LINKBIO_ADMIN_BADGE_KEYS,
  linkbioAdminBlockHost,
  linkbioAdminClearLinks,
  linkbioAdminList,
  linkbioAdminNetwork,
  linkbioAdminSetBadge,
  linkbioAdminSetPremium,
  linkbioAdminSetPublished,
  linkbioAdminSetUsername,
  linkbioAdminSuspend,
  linkbioAdminUnblockHost,
  linkbioInviteCreate,
  linkbioInviteList,
  linkbioInviteRevoke,
  type LinkBioAdminRow,
  type LinkBioInvite,
  type LinkBioNetwork,
} from "@/lib/linkbio";
import { createBadge, refreshBadges } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { roleRank } from "@/lib/theme";
import { useApp } from "@/store/app";

export default function LinkBioAdmin({ onBack }: { onBack?: () => void }) {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : null));
  const catalog = useApp((s) => s.badges);
  const canMint = roleRank(me?.site_role) >= 3;
  const [panel, setPanel] = useState<"pages" | "network">("pages");
  const [rows, setRows] = useState<LinkBioAdminRow[]>([]);
  const [invites, setInvites] = useState<LinkBioInvite[]>([]);
  const [network, setNetwork] = useState<LinkBioNetwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [uname, setUname] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteUses, setInviteUses] = useState(1);
  const [expandBadges, setExpandBadges] = useState<string | null>(null);
  const [blockHost, setBlockHost] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [newBadgeName, setNewBadgeName] = useState("");
  const [newBadgeIcon, setNewBadgeIcon] = useState("✨");
  const [newBadgeColor, setNewBadgeColor] = useState("#A855F7");
  const [newBadgeKey, setNewBadgeKey] = useState("");
  const [newBadgeDesc, setNewBadgeDesc] = useState("");

  const badgeOptions = useMemo(() => {
    const byKey = Object.values(catalog).filter((b) => b.key);
    const preferred = LINKBIO_ADMIN_BADGE_KEYS.map((k) => byKey.find((b) => b.key === k)).filter(
      (b): b is (typeof byKey)[number] => !!b,
    );
    const extras = byKey
      .filter((b) => b.key !== "verified" && !LINKBIO_ADMIN_BADGE_KEYS.includes(b.key as (typeof LINKBIO_ADMIN_BADGE_KEYS)[number]))
      .sort((a, b) => b.priority - a.priority);
    return [...preferred, ...extras];
  }, [catalog]);

  async function reload() {
    setLoading(true);
    await refreshBadges();
    const [pages, inv, net] = await Promise.all([linkbioAdminList(), linkbioInviteList(), linkbioAdminNetwork()]);
    setRows(pages);
    setInvites(inv);
    setNetwork(net);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3">
        {onBack && (
          <button type="button" onClick={onBack} className="rounded-full px-3 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10">
            ← Back
          </button>
        )}
        <Shield className="size-5 text-[#a855f7]" />
        <div className="min-w-0 flex-1">
          <div className="font-bold">Nexus Link Admin</div>
          <div className="text-xs text-white/50">Protect · Networking · Invites · Badges</div>
        </div>
        <button
          type="button"
          onClick={() => setPanel("pages")}
          className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", panel === "pages" ? "bg-white/15 text-[#c084fc]" : "hover:bg-white/10")}
        >
          Pages
        </button>
        <button
          type="button"
          onClick={() => setPanel("network")}
          className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", panel === "network" ? "bg-white/15 text-[#c084fc]" : "hover:bg-white/10")}
        >
          Network
        </button>
        <button type="button" onClick={() => void reload()} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Refresh">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto max-w-3xl space-y-4">
          {panel === "network" && (
            <>
              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="mb-3 flex items-center gap-2">
                  <Network className="size-4 text-[#c084fc]" />
                  <h2 className="font-bold">Networking &amp; protect</h2>
                </div>
                <p className="mb-3 text-xs text-white/50">
                  Malware link scanning, upload AV gate, DDoS rate limits on /bio + APIs, and security headers on every public page.
                </p>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Live pages", network?.pages_live ?? "—"],
                    ["Suspended", network?.pages_suspended ?? "—"],
                    ["Views (total)", network?.views_total?.toLocaleString() ?? "—"],
                    ["Clicks 24h", network?.clicks_24h?.toLocaleString() ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-black/30 p-3">
                      <div className="text-[11px] text-white/45">{k}</div>
                      <div className="font-mono text-lg font-black tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  {(["malware", "ddos_rate_limit", "security_headers", "link_scan"] as const).map((k) => (
                    <span key={k} className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300">
                      ✓ {k.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert className="size-4 text-[#c084fc]" />
                  <h2 className="font-bold">Blocked hosts</h2>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <input
                    value={blockHost}
                    onChange={(e) => setBlockHost(e.target.value.slice(0, 120))}
                    placeholder="bad-domain.example"
                    className="min-w-[160px] flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
                  />
                  <input
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value.slice(0, 120))}
                    placeholder="Reason"
                    className="min-w-[120px] flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold"
                    onClick={async () => {
                      if (!blockHost.trim()) return;
                      const next = await linkbioAdminBlockHost(blockHost.trim(), blockReason || undefined);
                      if (next) {
                        setNetwork(next);
                        setBlockHost("");
                        setBlockReason("");
                      }
                    }}
                  >
                    Block host
                  </button>
                </div>
                <div className="space-y-1.5">
                  {(network?.blocked_hosts ?? []).length === 0 && <p className="text-sm text-white/40">No custom blocks yet — built-in malware patterns still apply.</p>}
                  {(network?.blocked_hosts ?? []).map((h) => (
                    <div key={h.host} className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm">
                      <code className="font-semibold text-[#e9d5ff]">{h.host}</code>
                      <span className="flex-1 truncate text-white/45">{h.reason || ""}</span>
                      <button
                        type="button"
                        className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/15"
                        onClick={async () => {
                          const next = await linkbioAdminUnblockHost(h.host);
                          if (next) setNetwork(next);
                        }}
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="size-4 text-[#c084fc]" />
                  <h2 className="font-bold">Security events</h2>
                </div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto">
                  {(network?.events ?? []).length === 0 && <p className="text-sm text-white/40">No events logged yet.</p>}
                  {(network?.events ?? []).map((e) => (
                    <div key={e.id} className="rounded-lg bg-black/25 px-2.5 py-1.5 text-xs">
                      <span className="font-bold text-[#c084fc]">{e.kind}</span>
                      {e.username ? <span className="text-white/70"> · @{e.username}</span> : null}
                      {e.detail ? <span className="text-white/45"> — {e.detail}</span> : null}
                      <div className="text-[10px] text-white/35">{new Date(e.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <h2 className="mb-3 font-bold">Top pages by views</h2>
                <div className="space-y-1.5">
                  {(network?.top_pages ?? []).map((p) => (
                    <div key={p.username} className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold">@{p.username}</span>
                      {p.suspended && <span className="text-[10px] font-bold text-red-300">SUSP</span>}
                      {!p.published && <span className="text-[10px] font-bold text-white/40">DRAFT</span>}
                      <span className="font-mono text-xs text-[#c084fc]">{p.view_count}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {panel === "pages" && (
          <>
          <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="mb-3 flex items-center gap-2">
              <Ticket className="size-4 text-[#c084fc]" />
              <h2 className="font-bold">Invite codes</h2>
            </div>
            <p className="mb-3 text-xs text-white/50">New users registering at /bio/app need a code. Seeded founder code: NEXUS999</p>
            {canMint && (
              <div className="mb-3 flex flex-wrap gap-2">
                <input
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value.slice(0, 120))}
                  placeholder="Note (optional)"
                  className="min-w-[140px] flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={inviteUses}
                  onChange={(e) => setInviteUses(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="w-20 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
                  title="Max uses"
                />
                <button
                  type="button"
                  className="rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold"
                  onClick={async () => {
                    const created = await linkbioInviteCreate(inviteUses, inviteNote || undefined, 30);
                    if (created) {
                      setInviteNote("");
                      void reload();
                    }
                  }}
                >
                  Mint invite
                </button>
              </div>
            )}
            <div className="space-y-2">
              {invites.length === 0 && <p className="text-sm text-white/40">No invites yet.</p>}
              {invites.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm">
                  <code className="font-bold tracking-wider text-[#e9d5ff]">{inv.code}</code>
                  <span className="text-white/45">
                    {inv.uses}/{inv.max_uses} used
                    {inv.revoked_at ? " · revoked" : ""}
                    {inv.note ? ` · ${inv.note}` : ""}
                  </span>
                  <span className="flex-1" />
                  {canMint && !inv.revoked_at && (
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/15"
                      onClick={async () => {
                        const next = await linkbioInviteRevoke(inv.id);
                        if (next) setInvites(next);
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {canMint && (
            <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="mb-3 flex items-center gap-2">
                <Award className="size-4 text-[#c084fc]" />
                <h2 className="font-bold">Add badge</h2>
              </div>
              <p className="mb-3 text-xs text-white/50">Create a catalog badge (with a stable key) then grant it on any Link page below.</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="w-14">
                  <span className="mb-1 block text-[10px] font-semibold text-white/45 uppercase">Icon</span>
                  <input
                    value={newBadgeIcon}
                    onChange={(e) => setNewBadgeIcon(e.target.value.slice(0, 4))}
                    className="w-full rounded-xl bg-black/30 px-2 py-2 text-center text-lg outline-none ring-1 ring-white/10"
                  />
                </label>
                <label className="min-w-[120px] flex-1">
                  <span className="mb-1 block text-[10px] font-semibold text-white/45 uppercase">Name</span>
                  <input
                    value={newBadgeName}
                    onChange={(e) => setNewBadgeName(e.target.value.slice(0, 32))}
                    placeholder="Creator"
                    className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
                  />
                </label>
                <label className="min-w-[100px] flex-1">
                  <span className="mb-1 block text-[10px] font-semibold text-white/45 uppercase">Key</span>
                  <input
                    value={newBadgeKey}
                    onChange={(e) => setNewBadgeKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32))}
                    placeholder="creator"
                    className="w-full rounded-xl bg-black/30 px-3 py-2 font-mono text-sm outline-none ring-1 ring-white/10"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-semibold text-white/45 uppercase">Color</span>
                  <input type="color" value={newBadgeColor} onChange={(e) => setNewBadgeColor(e.target.value)} className="h-10 w-12 cursor-pointer rounded-xl bg-black/30" />
                </label>
                <label className="min-w-full flex-1 sm:min-w-[180px]">
                  <span className="mb-1 block text-[10px] font-semibold text-white/45 uppercase">Description</span>
                  <input
                    value={newBadgeDesc}
                    onChange={(e) => setNewBadgeDesc(e.target.value.slice(0, 120))}
                    placeholder="Optional"
                    className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10"
                  />
                </label>
                <button
                  type="button"
                  disabled={!newBadgeName.trim() || !newBadgeIcon.trim()}
                  className="rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold disabled:opacity-40"
                  onClick={async () => {
                    const id = await createBadge(newBadgeName, newBadgeIcon, newBadgeColor, newBadgeDesc, newBadgeKey || undefined);
                    if (id) {
                      setNewBadgeName("");
                      setNewBadgeDesc("");
                      setNewBadgeKey("");
                      setNewBadgeIcon("✨");
                      await refreshBadges();
                    }
                  }}
                >
                  Create badge
                </button>
              </div>
            </section>
          )}

          {loading && <p className="text-sm text-white/50">Loading pages…</p>}
          {!loading && !rows.length && <p className="text-sm text-white/50">No Link pages yet.</p>}
          {rows.map((r) => {
            const ownerKeys = new Set((r.badges ?? []).map((b) => b.key));
            const showBadges = expandBadges === r.id;
            return (
              <div key={r.id} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">@{r.username}</span>
                      {r.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#2AABEE]/20 px-2 py-0.5 text-[11px] font-bold text-[#7dd3fc]">
                          <BadgeCheck className="size-3.5" /> Verified
                        </span>
                      )}
                      {r.premium && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                          <Star className="size-3" /> Premium
                        </span>
                      )}
                      {!r.published && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/50">Draft</span>}
                      {r.suspended && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-300">Suspended</span>}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                      {r.display_name} · owner @{r.owner_username}
                      {r.owner_role ? ` · ${r.owner_role}` : ""} · {r.theme} · {r.view_count} views
                      {typeof r.links_count === "number" ? ` · ${r.links_count} links` : ""}
                    </div>
                    {r.suspend_reason && <div className="mt-1 text-xs text-red-300/80">{r.suspend_reason}</div>}
                    {(r.badges?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.badges!.slice(0, 10).map((b) => (
                          <span
                            key={b.key}
                            title={b.name}
                            className="inline-grid size-7 place-items-center rounded-lg text-sm"
                            style={{ background: `${b.color}26`, boxShadow: `inset 0 0 0 1px ${b.color}66` }}
                          >
                            {b.icon}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <a
                    href={`/bio/${encodeURIComponent(r.username)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/15"
                  >
                    <Link2 className="size-3.5" /> Open
                  </a>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {editId === r.id ? (
                    <>
                      <input
                        value={uname}
                        onChange={(e) => setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
                        className="min-w-[140px] flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm outline-none ring-1 ring-white/15 focus:ring-[#a855f7]"
                        placeholder="new_username"
                      />
                      <button
                        type="button"
                        className="rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold text-white"
                        onClick={async () => {
                          const next = await linkbioAdminSetUsername(r.id, uname);
                          if (next) setRows(next);
                          setEditId(null);
                        }}
                      >
                        Save name
                      </button>
                      <button type="button" className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
                      onClick={() => {
                        setEditId(r.id);
                        setUname(r.username);
                      }}
                    >
                      Change username
                    </button>
                  )}

                  {r.premium ? (
                    <button
                      type="button"
                      className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
                      onClick={async () => {
                        const next = await linkbioAdminSetPremium(r.id, false);
                        if (next) setRows(next);
                      }}
                    >
                      Remove Premium
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-xl bg-amber-400/20 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-400/30"
                      onClick={async () => {
                        const next = await linkbioAdminSetPremium(r.id, true);
                        if (next) setRows(next);
                      }}
                    >
                      <Crown className="size-3.5" /> Grant Premium
                    </button>
                  )}

                  {canMint && (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold",
                        r.verified ? "bg-[#2AABEE]/20 text-[#7dd3fc] hover:bg-[#2AABEE]/30" : "bg-white/10 hover:bg-white/15",
                      )}
                      onClick={async () => {
                        const next = await linkbioAdminSetBadge(r.owner_id, "verified", !r.verified);
                        if (next) setRows(next);
                      }}
                    >
                      <BadgeCheck className="size-3.5" /> {r.verified ? "Remove verified" : "Verify ✓"}
                    </button>
                  )}

                  {canMint && (
                    <button
                      type="button"
                      className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
                      onClick={() => setExpandBadges(showBadges ? null : r.id)}
                    >
                      {showBadges ? "Hide badges" : "More badges"}
                    </button>
                  )}

                  <button
                    type="button"
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
                    disabled={Boolean(r.suspended)}
                    onClick={async () => {
                      const next = await linkbioAdminSetPublished(r.id, !r.published);
                      if (next) setRows(next);
                    }}
                  >
                    {r.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-dnd/30"
                    onClick={async () => {
                      if (!confirm(`Clear all links on @${r.username}?`)) return;
                      const next = await linkbioAdminClearLinks(r.id);
                      if (next) setRows(next);
                    }}
                  >
                    Clear links
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold",
                      r.suspended ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "bg-red-500/20 text-red-200 hover:bg-red-500/30",
                    )}
                    onClick={async () => {
                      if (r.suspended) {
                        const next = await linkbioAdminSuspend(r.id, false);
                        if (next) setRows(next);
                        return;
                      }
                      const reason = prompt("Suspend reason (shown on public page)", "Security / malware review") || undefined;
                      const next = await linkbioAdminSuspend(r.id, true, reason);
                      if (next) setRows(next);
                    }}
                  >
                    <ShieldAlert className="size-3.5" /> {r.suspended ? "Unsuspend" : "Suspend"}
                  </button>
                </div>

                {canMint && showBadges && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {badgeOptions.map((b) => {
                      if (!b?.key) return null;
                      const on = ownerKeys.has(b.key);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          title={b.description || b.name}
                          onClick={async () => {
                            const next = await linkbioAdminSetBadge(r.owner_id, b.key!, !on);
                            if (next) setRows(next);
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold ring-1 transition",
                            on ? "bg-white/15 ring-white/25" : "bg-black/20 ring-white/10 hover:bg-white/10",
                          )}
                        >
                          <span
                            className="grid size-7 place-items-center rounded-lg text-sm"
                            style={{ background: `${b.color}33`, boxShadow: `inset 0 0 0 1px ${b.color}66` }}
                          >
                            {b.icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{b.name}</span>
                          <span className={cn("text-[10px] uppercase", on ? "text-ok" : "text-white/35")}>{on ? "On" : "Off"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
