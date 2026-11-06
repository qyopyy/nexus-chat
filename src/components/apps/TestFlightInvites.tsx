"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Pencil, Plane, Share2, Trash2 } from "lucide-react";
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
      {admin && <p className="mt-2 text-[11px] text-white/45">Get each link in App Store Connect → your app → TestFlight → External testing group → Public link. Only admins see the edit buttons.</p>}
    </section>
  );
}
