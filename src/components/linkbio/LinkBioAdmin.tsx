"use client";

import { useEffect, useState } from "react";
import { Crown, Link2, RefreshCw, Shield, Star, Ticket } from "lucide-react";
import {
  linkbioAdminList,
  linkbioAdminSetPremium,
  linkbioAdminSetUsername,
  linkbioInviteCreate,
  linkbioInviteList,
  linkbioInviteRevoke,
  type LinkBioAdminRow,
  type LinkBioInvite,
} from "@/lib/linkbio";
import { cn } from "@/lib/utils";
import { roleRank } from "@/lib/theme";
import { useApp } from "@/store/app";

export default function LinkBioAdmin({ onBack }: { onBack?: () => void }) {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : null));
  const canMint = roleRank(me?.site_role) >= 3;
  const [rows, setRows] = useState<LinkBioAdminRow[]>([]);
  const [invites, setInvites] = useState<LinkBioInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [uname, setUname] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteUses, setInviteUses] = useState(1);

  async function reload() {
    setLoading(true);
    const [pages, inv] = await Promise.all([linkbioAdminList(), linkbioInviteList()]);
    setRows(pages);
    setInvites(inv);
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
          <div className="text-xs text-white/50">Invites · Usernames · Premium</div>
        </div>
        <button type="button" onClick={() => void reload()} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Refresh">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto max-w-3xl space-y-4">
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

          {loading && <p className="text-sm text-white/50">Loading pages…</p>}
          {!loading && !rows.length && <p className="text-sm text-white/50">No Link pages yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">@{r.username}</span>
                    {r.premium && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                        <Star className="size-3" /> Premium
                      </span>
                    )}
                    {!r.published && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/50">Draft</span>}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {r.display_name} · owner @{r.owner_username} · {r.theme} · {r.view_count} views
                  </div>
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
