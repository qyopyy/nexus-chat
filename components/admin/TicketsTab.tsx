"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import { supabase, errorText } from "@/lib/supabase";
import { toast, useApp } from "@/store/app";
import { loadProfiles } from "@/lib/data";
import { cn } from "@/lib/utils";

type Ticket = { id: string; ticket_no: number; name: string; email: string; category: string; subject: string; status: "open" | "answered" | "closed"; user_id: string | null; created_at: string; updated_at: string };
type Msg = { id: number; staff_id: string | null; body: string; emailed: boolean; created_at: string };
const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const TONE = { open: "bg-idle/20 text-idle", answered: "bg-ok/20 text-ok", closed: "bg-white/10 text-sub" } as const;

/** Admin → Tickets: Contact-us messages; replies are emailed to the customer */
export default function TicketsTab() {
  const [status, setStatus] = useState<Ticket["status"] | "all">("open");
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    setRows(null);
    let q = supabase.from("support_tickets").select("id,ticket_no,name,email,category,subject,status,user_id,created_at,updated_at").order("updated_at", { ascending: false }).limit(100);
    if (status !== "all") q = q.eq("status", status);
    const { data } = await q;
    setRows((data ?? []) as Ticket[]);
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-lg bg-side p-1">
          {(["open", "answered", "closed", "all"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md px-3 py-1.5 text-sm font-semibold capitalize", status === s ? "bg-accent text-white" : "text-sub hover:text-txt")}>
              {s}
            </button>
          ))}
        </div>
        <a href="/contact" target="_blank" rel="noreferrer" className="ml-auto text-sm text-sub hover:text-txt">
          Contact page ↗
        </a>
      </div>
      {rows === null ? (
        <p className="py-6 text-center text-sub">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-side py-10 text-center text-sub">No {status === "all" ? "" : status} tickets. 🎉</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-xl bg-side">
              <button onClick={() => setOpen(open === t.id ? null : t.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-hover">
                <span className="w-12 shrink-0 font-mono text-xs text-sub">#{t.ticket_no}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.subject}</div>
                  <div className="truncate text-xs text-sub">
                    {t.name} · {t.email} · {t.category} · {when(t.updated_at)}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold capitalize", TONE[t.status])}>{t.status}</span>
              </button>
              {open === t.id && <TicketThread t={t} onChanged={load} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TicketThread({ t, onChanged }: { t: Ticket; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const profiles = useApp((s) => s.profiles);
  const load = useCallback(async () => {
    const { data } = await supabase.from("support_messages").select("id,staff_id,body,emailed,created_at").eq("ticket_id", t.id).order("created_at");
    const list = (data ?? []) as Msg[];
    setMsgs(list);
    void loadProfiles(list.map((m) => m.staff_id).filter(Boolean) as string[]);
  }, [t.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (close: boolean) => {
    if (reply.trim().length < 2) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ ticketId: t.id, body: reply.trim(), close }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't send");
      if (j.emailed) toast(`Reply emailed to ${t.email}`, "success");
      else {
        toast("Reply saved — opening your mail app to send it (add RESEND_API_KEY in Vercel to email automatically)", "info");
        window.location.href = j.mailto;
      }
      setReply("");
      void load();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send", "error");
    }
    setBusy(false);
  };
  const setStatus = async (s: Ticket["status"]) => {
    const { error } = await supabase.rpc("staff_set_ticket_status", { p_id: t.id, p_status: s });
    if (error) toast(errorText(error), "error");
    else onChanged();
  };

  return (
    <div className="space-y-3 border-t border-line/60 bg-panel/60 p-3">
      {msgs === null ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : (
        msgs.map((m) => (
          <div key={m.id} className={cn("rounded-lg p-3 text-sm", m.staff_id ? "ml-6 bg-accent/15" : "mr-6 bg-white/[.05]")}>
            <div className="mb-1 flex items-center gap-2 text-xs text-sub">
              <b className="text-txt">{m.staff_id ? (profiles[m.staff_id]?.display_name ?? "Staff") : t.name}</b>
              {when(m.created_at)}
              {m.staff_id && (
                <span className={cn("ml-auto flex items-center gap-1", m.emailed ? "text-ok" : "text-sub")}>
                  <Mail className="size-3" /> {m.emailed ? "emailed" : "not emailed"}
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))
      )}
      <textarea value={reply} onChange={(e) => setReply(e.target.value.slice(0, 5000))} rows={4} placeholder={`Reply to ${t.name} — it's emailed to ${t.email}`} className="w-full rounded-lg bg-rail p-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy || reply.trim().length < 2} onClick={() => void send(false)} className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          <Send className="size-4" /> {busy ? "Sending…" : "Send reply"}
        </button>
        <button disabled={busy || reply.trim().length < 2} onClick={() => void send(true)} className="rounded-md bg-hover px-4 py-2 text-sm font-semibold disabled:opacity-40">
          Send &amp; close
        </button>
        <div className="ml-auto flex gap-1">
          {t.status !== "closed" ? (
            <button onClick={() => void setStatus("closed")} className="rounded-md px-3 py-2 text-sm text-sub hover:bg-hover hover:text-txt">
              Close without reply
            </button>
          ) : (
            <button onClick={() => void setStatus("open")} className="rounded-md px-3 py-2 text-sm text-sub hover:bg-hover hover:text-txt">
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
