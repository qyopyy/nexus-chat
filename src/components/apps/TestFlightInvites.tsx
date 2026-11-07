"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Mail, Pencil, Plane, RefreshCw, Share2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { roleRank } from "@/lib/theme";
import { TF_APPS, betaUrl, normalizeTf, shareInvite, type TfApp, type TfLink } from "@/lib/testflight";
import { cn } from "@/lib/utils";

/** Apps tab card: share TestFlight invites with new testers. Admins paste the public links here. */
export default function TestFlightInvites() {
  const admin = useApp((s) => roleRank(s.userId ? s.profiles[s.userId]?.site_role : null) >= 3);
  const me = useApp((s) => s.userId);
  const [links, setLinks] = useState<Partial<Record<TfApp, TfLink>>>({});
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<TfApp | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("testflight_links").select("app,url,note,opens,updated_at");
    const next: Partial<Record<TfApp, TfLink>> = {};
    for (const r of (data as TfLink[] | null) ?? []) next[r.app] = r;
    setLinks(next);
    setLoaded(true);
  }, []);
  useEffect(() => void load(), [load]);

  const share = async (url: string, title: string) => {
    const r = await shareInvite(url, title);
    if (r === "copied") toast("Invite link copied", "success");
    else if (r === "failed") toast("Couldn't share — copy the link instead", "error");
  };
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Copied", "success");
    } catch {
      toast(url, "info");
    }
  };
  const save = async (app: TfApp) => {
    const url = normalizeTf(draft);
    if (!url) return toast("Paste the public link from App Store Connect → TestFlight (testflight.apple.com/join/…)", "error");
    const { error } = await supabase.from("testflight_links").upsert({ app, url, updated_by: me, updated_at: new Date().toISOString() });
    if (error) return toast(error.message, "error");
    setEditing(null);
    setDraft("");
    toast("Invite link saved", "success");
    void load();
  };
  const remove = async (app: TfApp) => {
    const { error } = await supabase.from("testflight_links").delete().eq("app", app);
    if (error) return toast(error.message, "error");
    void load();
  };

  const live = TF_APPS.filter((a) => links[a.id]);
  if (!loaded || (!admin && live.length === 0)) return null;

  return (
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#10233a] to-[#0b0f1a] p-4 text-white ring-1 ring-white/10">
      <div className="mb-3 flex items-start gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0a84ff]/20 text-[#5ab0ff]">
          <Plane className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black">Invite testers · TestFlight</div>
          <p className="text-[11px] leading-relaxed text-white/60">Send a friend the link — they install TestFlight, tap Join, and get the iPhone app before it&apos;s on the App Store.</p>
        </div>
        {live.length > 0 && (
          <button onClick={() => void share(betaUrl(), "Nexus apps")} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-white/90">
            <Share2 className="size-3.5" /> Share all
          </button>
        )}
      </div>

      <div className="space-y-2">
        {TF_APPS.filter((a) => admin || links[a.id]).map((a) => {
          const l = links[a.id];
          return (
            <div key={a.id} className="rounded-xl bg-white/[.06] p-2.5 ring-1 ring-white/5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg text-sm font-black" style={{ background: a.color }}>
                  {a.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{a.name}</div>
                  <div className="truncate text-[11px] text-white/55">
                    {l ? (admin ? `${betaUrl(a.id).replace(/^https?:\/\//, "")} · ${l.opens} tap${l.opens === 1 ? "" : "s"}` : a.blurb) : "No invite link yet"}
                  </div>
                </div>
                {l && (
                  <>
                    <button onClick={() => void copy(betaUrl(a.id))} className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={`Copy ${a.name} invite`}>
                      <Copy className="size-4" />
                    </button>
                    <button onClick={() => void share(betaUrl(a.id), a.name)} className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={`Share ${a.name} invite`}>
                      <Share2 className="size-4" />
                    </button>
                    <a href={betaUrl(a.id)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-[#0a84ff] px-3 py-1.5 text-xs font-bold hover:bg-[#0a84ff]/85">
                      Join <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
                {admin && (
                  <button
                    onClick={() => {
                      setEditing(editing === a.id ? null : a.id);
                      setDraft(l?.url ?? "");
                    }}
                    className={cn("grid size-8 place-items-center rounded-full hover:bg-white/20", editing === a.id ? "bg-white/25" : "bg-white/10")}
                    aria-label={`Edit ${a.name} TestFlight link`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
              {admin && editing === a.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(a.id);
                  }}
                  className="mt-2 flex gap-2"
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="https://testflight.apple.com/join/…"
                    inputMode="url"
                    className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:ring-2 focus:ring-[#0a84ff]/60"
                  />
                  <button className="rounded-lg bg-[#0a84ff] px-3 text-sm font-bold">Save</button>
                  {l && (
                    <button type="button" onClick={() => void remove(a.id)} className="grid w-9 place-items-center rounded-lg bg-white/10 hover:bg-dnd" aria-label="Remove link">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </form>
              )}
            </div>
          );
        })}
      </div>
      {admin && <Testers />}
      {admin && <p className="mt-2 text-[11px] text-white/45">Get each link in App Store Connect → your app → TestFlight → External testing group → Public link. Only admins see the edit buttons.</p>}
    </section>
  );
}

type Signup = { id: string; app: TfApp; email: string; first_name: string; last_name: string; status: "pending" | "invited" | "failed"; error: string | null; created_at: string };

/** admin: email signups from /beta, the 10,000 limit and the App Store Connect connection */
function Testers() {
  const [rows, setRows] = useState<Signup[]>([]);
  const [counts, setCounts] = useState({ invited: 0, pending: 0, failed: 0 });
  const [conn, setConn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [list, inv, pen, fail] = await Promise.all([
      supabase.from("testflight_signups").select("id,app,email,first_name,last_name,status,error,created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("testflight_signups").select("id", { count: "exact", head: true }).eq("status", "invited"),
      supabase.from("testflight_signups").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("testflight_signups").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    setRows((list.data as Signup[]) ?? []);
    setCounts({ invited: inv.count ?? 0, pending: pen.count ?? 0, failed: fail.count ?? 0 });
  }, []);
  useEffect(() => {
    void load();
    void supabase.functions.invoke("testflight-invite", { body: { action: "status" } }).then(({ data }) => {
      const d = data as { configured?: boolean; error?: string; groups?: Record<string, string | { error: string }> } | null;
      if (!d) return setConn("Couldn't check the Apple connection");
      if (!d.configured) return setConn(d.error ?? "Apple connection not set up");
      const g = d.groups?.nexus;
      setConn(typeof g === "string" ? `Connected · adding testers to “${g}”` : `Connected, but: ${g?.error ?? "no group"}`);
    });
  }, [load]);

  const retry = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("testflight-invite", { body: { action: "retry" } });
    setBusy(false);
    const d = data as { configured?: boolean; sent?: number; failed?: number; errors?: string[]; error?: string } | null;
    if (error || !d) return toast("Couldn't send invites", "error");
    if (!d.configured) return toast(d.error ?? "Apple connection not set up", "error");
    toast(`Sent ${d.sent} invite${d.sent === 1 ? "" : "s"}${d.failed ? ` · ${d.failed} failed: ${d.errors?.[0] ?? ""}` : ""}`, d.failed ? "error" : "success");
    void load();
  };
  const remove = async (id: string) => {
    await supabase.from("testflight_signups").delete().eq("id", id);
    void load();
  };

  return (
    <div className="mt-3 rounded-xl bg-black/25 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Mail className="size-4 text-[#5ab0ff]" />
        <span className="text-sm font-bold">Email signups</span>
        <span className="ml-auto text-xs text-white/60 tabular-nums">{counts.invited.toLocaleString()} / 10,000 invited</span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#0a84ff]" style={{ width: `${Math.min(100, (counts.invited / 10000) * 100)}%` }} />
      </div>
      {conn && <div className={cn("mb-2 text-[11px]", conn.startsWith("Connected ·") ? "text-[#7ee2a8]" : "text-[#ffcc66]")}>{conn}</div>}
      {counts.pending + counts.failed > 0 && (
        <button onClick={() => void retry()} disabled={busy} className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a84ff] py-2 text-sm font-bold disabled:opacity-60">
          <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Send {counts.pending + counts.failed} waiting invite{counts.pending + counts.failed === 1 ? "" : "s"}
        </button>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-white/50">No signups yet — share nexusproject.cc/beta.</div>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {r.first_name} {r.last_name} <span className="font-normal text-white/45">· {r.app}</span>
                </span>
                <span className="block truncate text-white/55" title={r.error ?? undefined}>
                  {r.email}
                  {r.error ? ` · ${r.error}` : ""}
                </span>
              </span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", r.status === "invited" ? "bg-[#30d158]/20 text-[#7ee2a8]" : r.status === "failed" ? "bg-[#ff453a]/20 text-[#ff8a80]" : "bg-white/10 text-white/70")}>
                {r.status}
              </span>
              <button onClick={() => void remove(r.id)} className="grid size-6 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white" aria-label={`Remove ${r.email}`}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
