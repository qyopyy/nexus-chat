"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SiteFrame from "./SiteFrame";

type Thread = { ticket_no: number; subject: string; status: "open" | "answered" | "closed"; name: string; created_at: string; messages: { from: "you" | "support"; staff: string | null; body: string; at: string }[] };
const STATUS = { open: ["Waiting for us", "#ffd400"], answered: ["We replied", "#36d39a"], closed: ["Closed", "#8b8b93"] } as const;

/** the customer's private ticket page (link from the confirmation / reply email) */
export default function TicketPage() {
  const [ids, setIds] = useState<{ id: string; k: string } | null>(null);
  const [t, setT] = useState<Thread | null | undefined>(undefined);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setIds({ id: q.get("id") ?? "", k: q.get("k") ?? "" });
  }, []);
  const load = useCallback(async () => {
    if (!ids?.id || !ids.k) return setT(null);
    const { data } = await supabase.rpc("get_support_ticket", { p_id: ids.id, p_key: ids.k });
    setT((data as Thread | null) ?? null);
  }, [ids]);
  useEffect(() => {
    if (ids) void load();
  }, [ids, load]);

  const send = async () => {
    if (!ids || reply.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("customer_reply_ticket", { p_id: ids.id, p_key: ids.k, p_body: reply.trim() });
    setBusy(false);
    if (error) return setErr(error.message);
    setReply("");
    void load();
  };

  return (
    <SiteFrame active="/contact">
      <section className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 sm:pt-16">
        {t === undefined ? (
          <div className="h-60 animate-pulse rounded-3xl bg-white/[.04]" />
        ) : t === null ? (
          <div className="rounded-3xl bg-white/[.04] p-8 text-center ring-1 ring-white/10">
            <h1 className="text-2xl font-black">Ticket not found</h1>
            <p className="mt-2 text-white/60">Check the link in your email, or open a new ticket.</p>
            <a href="/contact" className="site-btn mt-6 inline-block rounded-full bg-[#5865f2] px-6 py-3 font-bold">
              Contact us
            </a>
          </div>
        ) : (
          <>
            <div className="site-rise flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                #{t.ticket_no} · {t.subject}
              </h1>
              <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${STATUS[t.status][1]}22`, color: STATUS[t.status][1] }}>
                {STATUS[t.status][0]}
              </span>
            </div>
            <div className="mt-6 space-y-3">
              {t.messages.map((m, i) => (
                <div key={i} className={`site-rise flex ${m.from === "you" ? "justify-end" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${m.from === "you" ? "rounded-br-md bg-[#5865f2]" : "rounded-bl-md bg-white/[.07] ring-1 ring-white/10"}`}>
                    <div className="mb-1 text-xs font-semibold opacity-70">
                      {m.from === "you" ? "You" : `${m.staff ?? "Nexus"} · Support`} · {new Date(m.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <p className="text-[15px] whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-white/[.04] p-3 ring-1 ring-white/10">
              <textarea value={reply} onChange={(e) => setReply(e.target.value.slice(0, 5000))} rows={3} placeholder={t.status === "closed" ? "Reply to reopen this ticket…" : "Add a reply…"} className="w-full resize-y bg-transparent p-2 text-[15px] outline-none placeholder:text-white/35" />
              {err && <p className="px-2 pb-2 text-sm text-[#ff8a8c]">{err}</p>}
              <div className="flex justify-end">
                <button disabled={busy || reply.trim().length < 2} onClick={() => void send()} className="site-btn flex items-center gap-2 rounded-full bg-[#5865f2] px-5 py-2.5 text-sm font-bold disabled:opacity-40">
                  <Send className="size-4" /> {busy ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </SiteFrame>
  );
}
