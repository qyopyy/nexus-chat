"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Copy, ExternalLink, Mail } from "lucide-react";
import { toast } from "@/store/app";
import { PLATFORM, STATUS, listTakedowns, setTakedownStatus, type Takedown } from "@/lib/takedown";
import { followUpState, followUpSubject, followUpText, summarize, type NoticeRec } from "@/lib/takedownFollowUp";
import { cn } from "@/lib/utils";

const rec = (t: Takedown): NoticeRec => ({ id: t.id, status: t.status, sent_at: t.sent_at, work_title: t.work_title, isrc: t.isrc, upc: t.upc, infringing: t.infringing, platform: t.platform, contact: t.contact });

/** Sent notices with follow-up reminders: nudge at day 7, escalate at day 14. */
export default function TakedownTracker() {
  const [list, setList] = useState<Takedown[] | null>(null);
  const reload = useCallback(() => void listTakedowns().then(setList), []);
  useEffect(reload, [reload]);

  const sent = useMemo(() => (list ?? []).filter((t) => t.status !== "draft"), [list]);
  const sum = useMemo(() => summarize(sent.map(rec)), [sent]);
  if (!list || sent.length === 0) return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", "success");
    } catch {
      toast(text, "info");
    }
  };
  const mark = async (t: Takedown, s: "resolved" | "rejected") => {
    if (await setTakedownStatus(t.id, s, t.note)) reload();
  };

  return (
    <div className="space-y-3 rounded-2xl bg-side p-4">
      <div className="flex items-center gap-2">
        <BellRing className="size-5 text-[#f0b232]" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Takedown tracker</div>
          <div className="text-xs text-sub">
            {sum.counts.waiting} waiting · {sum.counts.follow_up + sum.counts.escalate} need a follow-up · {sum.counts.done} taken down{sum.counts.rejected ? ` · ${sum.counts.rejected} rejected` : ""}
          </div>
        </div>
      </div>
      <ul className="space-y-2">
        {sent.slice(0, 12).map((t) => {
          const f = followUpState(rec(t));
          const P = PLATFORM[t.platform];
          const subj = followUpSubject(rec(t));
          const body = followUpText(rec(t), P.name);
          const due = f.stage === "follow_up" || f.stage === "escalate";
          return (
            <li key={t.id} className={cn("rounded-xl bg-black/20 p-3", due && "ring-1 ring-[#f0b232]/50")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: P.color }}>
                  {P.short}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.work_title}</span>
                <span className="text-xs font-semibold" style={{ color: f.stage === "escalate" ? "#ed4245" : due ? "#f0b232" : STATUS[t.status].color }}>
                  {f.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-sub">{f.next}</p>
              {due && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={`mailto:${P.email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#1DB954] px-3 py-1 text-xs font-bold text-black">
                    <Mail className="size-3.5" /> Send follow-up
                  </a>
                  <button onClick={() => void copy(`${subj}\n\n${body}`)} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1 text-xs font-bold hover:bg-active">
                    <Copy className="size-3.5" /> Copy
                  </button>
                  {f.stage === "escalate" && (
                    <a href={P.form} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1 text-xs font-bold hover:bg-active">
                      <ExternalLink className="size-3.5" /> {P.name} form
                    </a>
                  )}
                </div>
              )}
              {t.status === "sent" && (
                <div className="mt-2 flex gap-2 text-xs">
                  <button onClick={() => void mark(t, "resolved")} className="rounded-full bg-hover px-3 py-1 font-semibold hover:bg-active">
                    It&apos;s down ✓
                  </button>
                  <button onClick={() => void mark(t, "rejected")} className="rounded-full bg-hover px-3 py-1 font-semibold hover:bg-active">
                    They rejected it
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
