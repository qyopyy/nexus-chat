"use client";

import { useState } from "react";
import { Briefcase, FileText, Hash, Mail, Package, PenLine, Plus, Receipt, Target, Trash2, Truck, Type } from "lucide-react";
import AppFrame from "../AppFrame";
import { cn } from "@/lib/utils";
import { box, btn, btnGhost, CopyBtn, Field, field, Hint, Num, Pills, Stat, uid, useStored, type P } from "./kit";
import * as B from "@/lib/pro/biz";

const today = () => new Date().toISOString().slice(0, 10);

/* 11 ─ Invoice builder */
type InvLine = B.Line & { id: string };
export function InvoiceBuilder({ onBack, mobile }: P) {
  const [from, setFrom] = useStored("inv.from", "");
  const [to, setTo] = useStored("inv.to", "");
  const [no, setNo] = useStored("inv.no", "INV-001");
  const [cur, setCur] = useStored("inv.cur", "USD");
  const [tax, setTax] = useStored("inv.tax", 0);
  const [disc, setDisc] = useStored("inv.disc", 0);
  const [lines, setLines] = useStored<InvLine[]>("inv.lines", [{ id: "a", desc: "Mixing & mastering", qty: 1, price: 150 }]);
  const t = B.invoiceTotals(lines, tax, disc);
  const text = `INVOICE ${no}\nDate: ${today()}\n\nFrom:\n${from}\n\nTo:\n${to}\n\n${lines.map((l) => `${l.desc} — ${l.qty} × ${B.money(l.price, cur)} = ${B.money(l.qty * l.price, cur)}`).join("\n")}\n\nSubtotal: ${B.money(t.subtotal, cur)}${disc ? `\nDiscount (${disc}%): -${B.money(t.discount, cur)}` : ""}${tax ? `\nTax (${tax}%): ${B.money(t.tax, cur)}` : ""}\nTOTAL: ${B.money(t.total, cur)}`;
  const upd = (id: string, p: Partial<InvLine>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  return (
    <AppFrame title="Invoice builder" Icon={Receipt} iconClass="text-[#34d399]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Invoice #">
            <input value={no} onChange={(e) => setNo(e.target.value)} className={field} />
          </Field>
          <Field title="Currency">
            <select value={cur} onChange={(e) => setCur(e.target.value)} className={field}>
              {["USD", "EUR", "GBP", "HUF", "CAD", "AUD", "JPY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field title="From">
            <textarea value={from} onChange={(e) => setFrom(e.target.value)} rows={3} className={field} />
          </Field>
          <Field title="Bill to">
            <textarea value={to} onChange={(e) => setTo(e.target.value)} rows={3} className={field} />
          </Field>
        </div>
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_3.5rem_5rem_auto] items-center gap-1.5">
            <input value={l.desc} placeholder="Description" onChange={(e) => upd(l.id, { desc: e.target.value })} className={field} />
            <Num value={l.qty} onChange={(n) => upd(l.id, { qty: n || 0 })} aria-label="Quantity" />
            <Num value={l.price} onChange={(n) => upd(l.id, { price: n || 0 })} aria-label="Price" />
            <button onClick={() => setLines(lines.filter((x) => x.id !== l.id))} className="p-2 text-sub hover:text-red-400" aria-label="Remove line">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button onClick={() => setLines([...lines, { id: uid(), desc: "", qty: 1, price: 0 }])} className={cn(btnGhost, "inline-flex items-center gap-1.5")}>
          <Plus size={14} /> Add line
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Discount %">
            <Num value={disc} onChange={(n) => setDisc(n || 0)} />
          </Field>
          <Field title="Tax %">
            <Num value={tax} onChange={(n) => setTax(n || 0)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat k="Subtotal" v={B.money(t.subtotal, cur)} />
          <Stat k="Total due" v={B.money(t.total, cur)} tone="good" />
        </div>
        <div className="flex gap-2">
          <CopyBtn text={text}>Copy invoice</CopyBtn>
          <button onClick={() => window.print()} className={btnGhost}>
            Print / PDF
          </button>
        </div>
      </div>
    </AppFrame>
  );
}

/* 12 ─ Split sheet */
type Party = { id: string; name: string; role: string; pct: number };
export function SplitSheet({ onBack, mobile }: P) {
  const [title, setTitle] = useStored("ss.title", "");
  const [ps, setPs] = useStored<Party[]>("ss.parties", [{ id: "a", name: "", role: "Writer", pct: 50 }, { id: "b", name: "", role: "Producer", pct: 50 }]);
  const s = B.splitSheet(title, ps, today());
  const upd = (id: string, p: Partial<Party>) => setPs(ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  return (
    <AppFrame title="Split sheet" Icon={FileText} iconClass="text-[#fbbf24]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Song title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </Field>
        {ps.map((p) => (
          <div key={p.id} className="grid grid-cols-[1fr_1fr_4rem_auto] items-center gap-1.5">
            <input value={p.name} placeholder="Name" onChange={(e) => upd(p.id, { name: e.target.value })} className={field} />
            <input value={p.role} placeholder="Role" onChange={(e) => upd(p.id, { role: e.target.value })} className={field} />
            <Num value={p.pct} onChange={(n) => upd(p.id, { pct: n || 0 })} aria-label="Percent" />
            <button onClick={() => setPs(ps.filter((x) => x.id !== p.id))} className="p-2 text-sub hover:text-red-400" aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button onClick={() => setPs([...ps, { id: uid(), name: "", role: "Writer", pct: 0 }])} className={cn(btnGhost, "inline-flex items-center gap-1.5")}>
          <Plus size={14} /> Add person
        </button>
        <div className={cn("rounded-xl px-3 py-2.5 text-sm font-semibold", s.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>{s.ok ? "Splits total 100%" : `Splits total ${s.total}% — must equal 100%`}</div>
        <CopyBtn text={s.text}>Copy agreement text</CopyBtn>
        <Hint>A simple record of who owns what. It is not legal advice — have a lawyer review anything high-value.</Hint>
      </div>
    </AppFrame>
  );
}

/* 13 ─ Hashtag sets */
type TagSet = { id: string; name: string; tags: string };
export function HashtagSets({ onBack, mobile }: P) {
  const [sets, setSets] = useStored<TagSet[]>("tags.sets", []);
  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const parsed = B.extractHashtags(raw);
  return (
    <AppFrame title="Hashtag sets" Icon={Hash} iconClass="text-[#38bdf8]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Set name (e.g. Release week)" className={field} />
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} placeholder="#newmusic #hiphop #indie…" className={field} />
        <div className="flex items-center gap-2">
          <button
            disabled={!parsed.length}
            onClick={() => {
              setSets([{ id: uid(), name: name || "Untitled set", tags: parsed.join(" ") }, ...sets]);
              setName("");
              setRaw("");
            }}
            className={btn}
          >
            Save set ({parsed.length})
          </button>
          <Hint>Duplicates are removed automatically.</Hint>
        </div>
      </div>
      {sets.map((s) => (
        <div key={s.id} className={cn(box, "space-y-2")}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold">{s.name}</div>
            <button onClick={() => setSets(sets.filter((x) => x.id !== s.id))} className="p-1.5 text-sub hover:text-red-400" aria-label="Delete set">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="text-sm text-sub">{s.tags}</div>
          <CopyBtn text={s.tags} />
        </div>
      ))}
    </AppFrame>
  );
}

/* 14 ─ Caption limits */
export function CaptionCheck({ onBack, mobile }: P) {
  const [text, setText] = useState("");
  const [platform, setPlatform] = useStored("cap.platform", "Instagram");
  const platforms = Object.keys(B.PLATFORM_LIMITS) as string[];
  const st = B.captionStatus(text, platform);
  return (
    <AppFrame title="Caption limits" Icon={Type} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Pills items={platforms} value={platform} onChange={setPlatform} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className={field} placeholder="Write your caption…" />
        <div className="h-2 overflow-hidden rounded-full bg-black/30">
          <div className={cn("h-full", st.over ? "bg-red-500" : st.pct > 85 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${st.pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat k="Characters" v={st.len} />
          <Stat k="Limit" v={st.limit} />
          <Stat k={st.over ? "Over by" : "Left"} v={Math.abs(st.left)} tone={st.over ? "bad" : "good"} />
        </div>
      </div>
    </AppFrame>
  );
}

/* 15 ─ Merch pricing */
export function MerchPricing({ onBack, mobile }: P) {
  const [cost, setCost] = useStored("merch.cost", 12);
  const [price, setPrice] = useStored("merch.price", 30);
  const [fees, setFees] = useStored("merch.fees", 5);
  const [target, setTarget] = useStored("merch.target", 50);
  const m = B.merchMargin(cost || 0, price || 0, fees || 0);
  const suggested = B.priceForMargin(cost || 0, target || 0, fees || 0);
  return (
    <AppFrame title="Merch pricing" Icon={Package} iconClass="text-[#fb923c]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-3 gap-2">
          <Field title="Unit cost">
            <Num value={cost} onChange={setCost} />
          </Field>
          <Field title="Sell price">
            <Num value={price} onChange={setPrice} />
          </Field>
          <Field title="Fees %">
            <Num value={fees} onChange={setFees} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat k="Profit / unit" v={m.profit.toFixed(2)} tone={m.profit >= 0 ? "good" : "bad"} />
          <Stat k="Margin" v={`${m.marginPct}%`} />
          <Stat k="Markup" v={`${m.markupPct}%`} />
          <Stat k="Fees / unit" v={m.fees.toFixed(2)} />
        </div>
        <Field title="Target margin %">
          <Num value={target} onChange={setTarget} />
        </Field>
        <div className="rounded-xl bg-accent/15 px-3 py-2.5 text-sm font-semibold">{Number.isFinite(suggested) ? `Price at ${target}% margin: ${suggested.toFixed(2)}` : "Target margin is not reachable with these fees."}</div>
      </div>
    </AppFrame>
  );
}

/* 16 ─ Tour budget */
type Exp = B.Expense & { id: string };
export function TourBudget({ onBack, mobile }: P) {
  const [exp, setExp] = useStored<Exp[]>("tour.exp", [{ id: "a", label: "Van rental", amount: 1200 }, { id: "b", label: "Food", amount: 40, perShow: true }]);
  const [shows, setShows] = useStored("tour.shows", 8);
  const [pay, setPay] = useStored("tour.pay", 250);
  const t = B.tourBudget(exp, shows || 1, pay || 0);
  const upd = (id: string, p: Partial<Exp>) => setExp(exp.map((e) => (e.id === id ? { ...e, ...p } : e)));
  return (
    <AppFrame title="Tour budget" Icon={Truck} iconClass="text-[#60a5fa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Number of shows">
            <Num value={shows} onChange={setShows} min={1} />
          </Field>
          <Field title="Avg. pay per show">
            <Num value={pay} onChange={setPay} />
          </Field>
        </div>
        {exp.map((e) => (
          <div key={e.id} className="grid grid-cols-[1fr_5rem_auto_auto] items-center gap-1.5">
            <input value={e.label} onChange={(ev) => upd(e.id, { label: ev.target.value })} className={field} placeholder="Expense" />
            <Num value={e.amount} onChange={(n) => upd(e.id, { amount: n || 0 })} />
            <label className="flex items-center gap-1 text-xs text-sub">
              <input type="checkbox" checked={!!e.perShow} onChange={(ev) => upd(e.id, { perShow: ev.target.checked })} />
              /show
            </label>
            <button onClick={() => setExp(exp.filter((x) => x.id !== e.id))} className="p-2 text-sub hover:text-red-400" aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button onClick={() => setExp([...exp, { id: uid(), label: "", amount: 0 }])} className={cn(btnGhost, "inline-flex items-center gap-1.5")}>
          <Plus size={14} /> Add expense
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Stat k="Total cost" v={t.cost.toLocaleString()} />
          <Stat k="Income" v={t.income.toLocaleString()} />
          <Stat k="Net" v={t.net.toLocaleString()} tone={t.net >= 0 ? "good" : "bad"} />
          <Stat k="Break-even / show" v={t.breakEvenPerShow.toLocaleString()} />
        </div>
      </div>
    </AppFrame>
  );
}

/* 17 ─ Tech rider */
export function RiderBuilder({ onBack, mobile }: P) {
  const [f, setF] = useStored("rider.f", { act: "", contact: "", people: "1", set: "45", needs: "2 × DI boxes\n1 × SM58 microphone\nStage monitor wedge\nPower for laptop at DJ position", hospitality: "Water, towels, hot meal or buyout" });
  const text = `TECHNICAL RIDER — ${f.act || "Artist"}\nContact: ${f.contact}\nPeople on stage: ${f.people}\nSet length: ${f.set} min\n\nSTAGE / TECHNICAL REQUIREMENTS\n${f.needs
    .split("\n")
    .filter(Boolean)
    .map((l) => `- ${l.replace(/^[-•]\s*/, "")}`)
    .join("\n")}\n\nHOSPITALITY\n${f.hospitality}\n\nPlease confirm any substitutions in advance.`;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <AppFrame title="Tech rider" Icon={Briefcase} iconClass="text-[#a78bfa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Act name">
            <input value={f.act} onChange={set("act")} className={field} />
          </Field>
          <Field title="Booking contact">
            <input value={f.contact} onChange={set("contact")} className={field} />
          </Field>
          <Field title="People on stage">
            <input value={f.people} onChange={set("people")} className={field} inputMode="numeric" />
          </Field>
          <Field title="Set length (min)">
            <input value={f.set} onChange={set("set")} className={field} inputMode="numeric" />
          </Field>
        </div>
        <Field title="Technical needs (one per line)">
          <textarea value={f.needs} onChange={set("needs")} rows={5} className={field} />
        </Field>
        <Field title="Hospitality">
          <textarea value={f.hospitality} onChange={set("hospitality")} rows={2} className={field} />
        </Field>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-xs">{text}</pre>
        <CopyBtn text={text}>Copy rider</CopyBtn>
      </div>
    </AppFrame>
  );
}

/* 18 ─ Goal tracker */
type Goal = { id: string; name: string; start: number; current: number; target: number; from: string; to: string };
export function GoalTracker({ onBack, mobile }: P) {
  const [goals, setGoals] = useStored<Goal[]>("goals.list", []);
  const add = () => setGoals([...goals, { id: uid(), name: "10k monthly listeners", start: 0, current: 0, target: 10000, from: today(), to: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) }]);
  const upd = (id: string, p: Partial<Goal>) => setGoals(goals.map((g) => (g.id === id ? { ...g, ...p } : g)));
  return (
    <AppFrame title="Goal tracker" Icon={Target} iconClass="text-[#34d399]" mobile={mobile} onBack={onBack}>
      {goals.map((g) => {
        const p = B.goalProgress(g.start, g.current, g.target, g.from, g.to);
        return (
          <div key={g.id} className={cn(box, "space-y-3")}>
            <div className="flex items-center gap-2">
              <input value={g.name} onChange={(e) => upd(g.id, { name: e.target.value })} className={cn(field, "font-bold")} />
              <button onClick={() => setGoals(goals.filter((x) => x.id !== g.id))} className="p-2 text-sub hover:text-red-400" aria-label="Delete goal">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/30">
              <div className={cn("h-full", p.onTrack ? "bg-emerald-500" : "bg-amber-400")} style={{ width: `${p.pct}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field title="Start">
                <Num value={g.start} onChange={(n) => upd(g.id, { start: n || 0 })} />
              </Field>
              <Field title="Now">
                <Num value={g.current} onChange={(n) => upd(g.id, { current: n || 0 })} />
              </Field>
              <Field title="Target">
                <Num value={g.target} onChange={(n) => upd(g.id, { target: n || 0 })} />
              </Field>
              <Field title="From">
                <input type="date" value={g.from} onChange={(e) => upd(g.id, { from: e.target.value })} className={field} />
              </Field>
              <Field title="Deadline">
                <input type="date" value={g.to} onChange={(e) => upd(g.id, { to: e.target.value })} className={field} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat k="Progress" v={`${p.pct}%`} />
              <Stat k="Days left" v={p.daysLeft} />
              <Stat k="Needed / day" v={p.perDay} tone={p.onTrack ? "good" : "bad"} />
            </div>
          </div>
        );
      })}
      <button onClick={add} className={cn(btn, "inline-flex items-center gap-1.5")}>
        <Plus size={14} /> New goal
      </button>
    </AppFrame>
  );
}

/* 19 ─ Bio generator */
export function BioBuilder({ onBack, mobile }: P) {
  const [f, setF] = useStored("bio.f", { name: "", genre: "", city: "", influences: "", milestone: "", link: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const short = B.bioFrom(f, "short");
  const long = B.bioFrom(f, "long");
  return (
    <AppFrame title="Bio builder" Icon={PenLine} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          {(["name", "genre", "city", "influences", "milestone", "link"] as const).map((k) => (
            <Field key={k} title={k}>
              <input value={f[k]} onChange={set(k)} className={field} placeholder={k === "milestone" ? "e.g. 1M streams in 2026." : ""} />
            </Field>
          ))}
        </div>
        <div className="space-y-2">
          <div className="rounded-xl bg-black/25 p-3 text-sm">{short}</div>
          <CopyBtn text={short}>Copy short</CopyBtn>
          <div className="rounded-xl bg-black/25 p-3 text-sm">{long}</div>
          <CopyBtn text={long}>Copy long</CopyBtn>
        </div>
      </div>
    </AppFrame>
  );
}

/* 20 ─ Outreach templates */
export function OutreachTemplates({ onBack, mobile }: P) {
  const [idx, setIdx] = useState(0);
  const [vars, setVars] = useStored<Record<string, string>>("outreach.vars", {});
  const tpl = B.OUTREACH_TEMPLATES[idx];
  const names = B.templateVars(tpl.body);
  const out = B.fillTemplate(tpl.body, vars);
  return (
    <AppFrame title="Outreach templates" Icon={Mail} iconClass="text-[#60a5fa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Pills items={B.OUTREACH_TEMPLATES.map((t) => t.name)} value={tpl.name} onChange={(n) => setIdx(B.OUTREACH_TEMPLATES.findIndex((t) => t.name === n))} />
        <div className="grid grid-cols-2 gap-2">
          {names.map((n) => (
            <Field key={n} title={n.replace(/_/g, " ")}>
              <input value={vars[n] ?? ""} onChange={(e) => setVars({ ...vars, [n]: e.target.value })} className={field} />
            </Field>
          ))}
        </div>
        <pre className="whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-sm">{out}</pre>
        <CopyBtn text={out}>Copy message</CopyBtn>
      </div>
    </AppFrame>
  );
}
