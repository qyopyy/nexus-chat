"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LifeBuoy, Mail, MessageSquare, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SiteFrame from "./SiteFrame";
import Reveal from "./Reveal";

const CATEGORIES = [
  { id: "general", label: "General question" },
  { id: "account", label: "Account & sign-in" },
  { id: "billing", label: "Premium & billing" },
  { id: "bug", label: "Bug report" },
  { id: "safety", label: "Safety & reporting" },
  { id: "music", label: "Music & distribution" },
  { id: "other", label: "Something else" },
];

const FAQ = [
  ["How fast do you reply?", "Usually within a day. You'll get our answer by email and on your ticket page."],
  ["I can't sign in", "Use “Forgot password” on the sign-in screen. If you set up two-factor and lost the device, pick “Account & sign-in” below."],
  ["How do I report someone?", "Open their profile card or long-press a message and tap Report — it goes straight to the Nexus team."],
] as const;

const input = "w-full rounded-xl bg-white/[.06] px-4 py-3 text-[15px] text-white placeholder:text-white/35 outline-none ring-1 ring-white/10 transition focus:bg-white/[.09] focus:ring-2 focus:ring-[#5865f2]";

export default function ContactPage() {
  const [f, setF] = useState({ name: "", email: "", category: "general", subject: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticket_no: number; link: string; emailed: boolean } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  // signed-in members get their details filled in
  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user;
      if (!u) return;
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", u.id).maybeSingle();
      setF((x) => ({ ...x, email: x.email || u.email || "", name: x.name || (p as { display_name?: string } | null)?.display_name || "" }));
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify(f),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't send");
      setDone(j);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't send");
    }
    setBusy(false);
  };

  return (
    <SiteFrame active="/contact">
      <section className="mx-auto max-w-5xl px-4 pt-12 sm:px-6 sm:pt-20">
        <div className="text-center">
          <div className="site-float mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[#5865f2]/20 text-[#8b9bff]">
            <LifeBuoy className="size-8" />
          </div>
          <h1 className="site-rise text-4xl font-black tracking-tight sm:text-5xl">How can we help?</h1>
          <p className="site-rise mx-auto mt-3 max-w-xl text-white/65" style={{ animationDelay: "100ms" }}>
            Send us a message — you&apos;ll get a ticket number and our reply by email.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            {done ? (
              <div className="rounded-3xl bg-white/[.04] p-8 text-center ring-1 ring-white/10">
                <CheckCircle2 className="site-rise mx-auto size-14 text-[#36d39a]" />
                <h2 className="mt-4 text-2xl font-black">Ticket #{done.ticket_no} is open</h2>
                <p className="mt-2 text-white/65">{done.emailed ? `We sent a confirmation to ${f.email}.` : "We'll reply to the email you gave us."} Keep this link to follow along:</p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <a href={done.link} className="site-btn rounded-full bg-[#5865f2] px-6 py-3 font-bold">
                    View my ticket
                  </a>
                  <button onClick={() => (setDone(null), setF({ ...f, subject: "", message: "" }))} className="site-btn rounded-full bg-white/10 px-6 py-3 font-semibold">
                    Send another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white/[.04] p-5 ring-1 ring-white/10 sm:p-7">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required maxLength={80} value={f.name} onChange={set("name")} placeholder="Your name" autoComplete="name" className={input} />
                  <input required type="email" maxLength={254} value={f.email} onChange={set("email")} placeholder="Email for our reply" autoComplete="email" inputMode="email" className={input} />
                </div>
                <select value={f.category} onChange={set("category")} className={input}>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#17181c]">
                      {c.label}
                    </option>
                  ))}
                </select>
                <input required minLength={3} maxLength={120} value={f.subject} onChange={set("subject")} placeholder="Subject" className={input} />
                <textarea required minLength={10} maxLength={5000} rows={6} value={f.message} onChange={set("message")} placeholder="Tell us what's going on…" className={`${input} resize-y`} />
                {/* honeypot — hidden from people */}
                <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="hidden" aria-hidden name="website" />
                {err && <p className="rounded-xl bg-[#ed4245]/15 px-4 py-2.5 text-sm text-[#ff8a8c]">{err}</p>}
                <button disabled={busy} className="site-btn flex w-full items-center justify-center gap-2 rounded-full bg-[#5865f2] py-3.5 text-base font-bold disabled:opacity-60">
                  <Send className="size-4" /> {busy ? "Sending…" : "Send message"}
                </button>
                <p className="text-center text-xs text-white/40">{f.message.length.toLocaleString()} / 5,000</p>
              </form>
            )}
          </Reveal>

          <div className="space-y-3">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={i * 80}>
                <details className="site-card group rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/10">
                  <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
                    <MessageSquare className="size-4 text-[#8b9bff]" /> {q}
                    <span className="ml-auto transition group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-2 text-sm text-white/65">{a}</p>
                </details>
              </Reveal>
            ))}
            <Reveal delay={260}>
              <div className="rounded-2xl bg-white/[.04] p-5 text-sm text-white/65 ring-1 ring-white/10">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Mail className="size-4 text-[#8b9bff]" /> Prefer email?
                </div>
                <p className="mt-1">
                  Write to{" "}
                  <a href="mailto:owner@qyopy.hu" className="text-white underline decoration-white/30 underline-offset-2">
                    owner@qyopy.hu
                  </a>
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
