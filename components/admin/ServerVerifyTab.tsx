"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { listVerifyRequests, reviewVerifyRequest, setServerVerified, type VerifyQueueRow } from "@/lib/serverVerify";
import VerifiedServerBadge from "@/components/ui/VerifiedServerBadge";

type Status = "pending" | "approved" | "rejected";

/** Admin: review "apply for verified server" applications + verify/unverify any server directly. */
export default function ServerVerifyTab() {
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<VerifyQueueRow[] | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const reload = () => {
    setRows(null);
    void listVerifyRequests(status).then(setRows);
  };
  useEffect(reload, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (r: VerifyQueueRow, approve: boolean) => {
    setBusy(r.id);
    const ok = await reviewVerifyRequest(r.id, approve, notes[r.id]);
    setBusy(null);
    if (ok) setRows((l) => (l ?? []).filter((x) => x.id !== r.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["pending", "approved", "rejected"] as Status[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold capitalize", status === s ? "bg-accent text-white" : "bg-hover text-sub")}>
            {s}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-side px-3 py-6 text-center text-sm text-sub">No {status} applications.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl bg-side p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl text-xs font-black text-white" style={{ background: r.space?.icon_color ?? "#5865F2" }}>
                  {r.space?.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.space.icon_url} alt="" className="size-full object-cover" />
                  ) : (
                    (r.space?.name ?? "?").slice(0, 2).toUpperCase()
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-bold">
                    <span className="truncate">{r.space?.name ?? "Deleted server"}</span>
                    {r.space?.verified && <VerifiedServerBadge size={15} />}
                  </div>
                  <div className="text-[11px] text-sub">Applied {new Date(r.created_at).toLocaleString()}{r.members != null ? ` · ${r.members} members` : ""}</div>
                </div>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{r.reason}</p>
              {r.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.links.map((l) => (
                    <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="flex max-w-full items-center gap-1 truncate rounded-full bg-black/25 px-2 py-0.5 text-[11px] text-[#6ab7ff]">
                      <ExternalLink className="size-3 shrink-0" /> <span className="truncate">{l.replace(/^https:\/\//, "")}</span>
                    </a>
                  ))}
                </div>
              )}
              {status === "pending" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value.slice(0, 500) }))}
                    placeholder="Note to the owner (optional)"
                    className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm outline-none"
                  />
                  <button disabled={busy === r.id} onClick={() => void decide(r, true)} className="flex items-center gap-1 rounded-lg bg-ok px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                    {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Verify
                  </button>
                  <button disabled={busy === r.id} onClick={() => void decide(r, false)} className="flex items-center gap-1 rounded-lg bg-dnd/20 px-3 py-2 text-sm font-bold text-dnd disabled:opacity-50">
                    <X className="size-4" /> Decline
                  </button>
                </div>
              ) : (
                r.note && <p className="mt-2 text-[12px] text-sub">Note: {r.note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <DirectVerify onDone={reload} />
    </div>
  );
}

/** search any server by name / invite and toggle the checkmark */
function DirectVerify({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; verified: boolean; invite_code: string; vanity_code: string | null }[]>([]);
  const search = async () => {
    const s = q.trim().replace(/[%,()]/g, "");
    if (s.length < 2) return;
    const { data } = await supabase.rpc("admin_find_spaces", { p_query: s });
    setHits((data as typeof hits | null) ?? []);
  };
  return (
    <div className="rounded-2xl bg-side p-3">
      <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Verify a server directly</div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="Server name, invite or vanity code"
          className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm outline-none"
        />
        <button onClick={() => void search()} className="rounded-lg bg-accent px-3 py-2 text-white" aria-label="Search">
          <Search className="size-4" />
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {hits.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-semibold">
              <span className="truncate">{h.name}</span>
              {h.verified && <VerifiedServerBadge size={14} />}
            </span>
            <code className="hidden truncate text-[11px] text-faint sm:block">{h.vanity_code || h.invite_code}</code>
            <button
              onClick={async () => {
                if (await setServerVerified(h.id, !h.verified)) {
                  setHits((l) => l.map((x) => (x.id === h.id ? { ...x, verified: !h.verified } : x)));
                  onDone();
                }
              }}
              className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", h.verified ? "bg-dnd/20 text-dnd" : "bg-ok text-white")}
            >
              {h.verified ? "Remove ✓" : "Verify"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
