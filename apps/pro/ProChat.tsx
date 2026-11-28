"use client";

import { useMemo, useState } from "react";
import { BookOpen, Clock, Coins, Gift, Link2, Mail, Plus, Search, Share2, Shuffle, Smile, Trash2, Type, Users } from "lucide-react";
import AppFrame from "../AppFrame";
import { cn } from "@/lib/utils";
import { box, btn, btnGhost, CopyBtn, Field, field, Hint, Num, Pills, Stat, uid, useStored, type P } from "./kit";
import * as C from "@/lib/pro/chat";

/* 21 ─ Canned replies */
type Snip = { id: string; name: string; body: string };
export function ReplySnippets({ onBack, mobile }: P) {
  const [list, setList] = useStored<Snip[]>("snip.list", [
    { id: "a", name: "Thanks + follow up", body: "Thanks {name}! I'll get back to you by {day}." },
    { id: "b", name: "Booking info", body: "Hi {name}, my rate for {event} is {rate}. Happy to jump on a quick call." },
  ]);
  const [vars, setVars] = useStored<Record<string, string>>("snip.vars", {});
  const [q, setQ] = useState("");
  const shown = list.filter((s) => (s.name + s.body).toLowerCase().includes(q.toLowerCase()));
  return (
    <AppFrame title="Reply snippets" Icon={Mail} iconClass="text-[#38bdf8]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search snippets" className={cn(field, "pl-9")} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["name", "day", "rate"].map((k) => (
            <Field key={k} title={`{${k}}`}>
              <input value={vars[k] ?? ""} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} className={field} />
            </Field>
          ))}
        </div>
        <Hint>Use {"{name}"}, {"{day}"}, {"{rate}"} or any {"{word}"} — filled variables are substituted when you copy.</Hint>
      </div>
      {shown.map((s) => (
        <div key={s.id} className={cn(box, "space-y-2")}>
          <div className="flex gap-2">
            <input value={s.name} onChange={(e) => setList(list.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} className={cn(field, "font-bold")} />
            <button onClick={() => setList(list.filter((x) => x.id !== s.id))} className="p-2 text-sub hover:text-red-400" aria-label="Delete">
              <Trash2 size={16} />
            </button>
          </div>
          <textarea value={s.body} rows={3} onChange={(e) => setList(list.map((x) => (x.id === s.id ? { ...x, body: e.target.value } : x)))} className={field} />
          <CopyBtn text={C.applySnippet(s.body, vars)}>Copy with variables</CopyBtn>
        </div>
      ))}
      <button onClick={() => setList([{ id: uid(), name: "New snippet", body: "" }, ...list])} className={cn(btn, "inline-flex items-center gap-1.5")}>
        <Plus size={14} /> New snippet
      </button>
    </AppFrame>
  );
}

/* 22 ─ Fancy text */
export function FancyText({ onBack, mobile }: P) {
  const [text, setText] = useState("Nexus drop tonight");
  return (
    <AppFrame title="Fancy text" Icon={Type} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <input value={text} onChange={(e) => setText(e.target.value)} className={field} />
        {C.FANCY_STYLES.map((s) => {
          const out = C.fancyText(text, s);
          return (
            <div key={s} className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase text-sub">{s}</div>
                <div className="break-words text-base">{out}</div>
              </div>
              <CopyBtn text={out} />
            </div>
          );
        })}
        <Hint>Works in bios and captions on most apps. Screen readers may read styled text letter by letter, so use it sparingly.</Hint>
      </div>
    </AppFrame>
  );
}

/* 23 ─ Poll maker */
export function PollMaker({ onBack, mobile }: P) {
  const [q, setQ] = useState("Which single should drop first?");
  const [opts, setOpts] = useState(["Option A", "Option B", ""]);
  const text = C.pollText(q, opts);
  return (
    <AppFrame title="Quick poll" Icon={Share2} iconClass="text-[#a78bfa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Question">
          <input value={q} onChange={(e) => setQ(e.target.value)} className={field} />
        </Field>
        {opts.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className={field} />
            <button onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="p-2 text-sub hover:text-red-400" aria-label="Remove option">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {opts.length < 10 && (
          <button onClick={() => setOpts([...opts, ""])} className={cn(btnGhost, "inline-flex items-center gap-1.5")}>
            <Plus size={14} /> Add option
          </button>
        )}
        <pre className="whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-sm">{text}</pre>
        <CopyBtn text={text}>Copy poll</CopyBtn>
      </div>
    </AppFrame>
  );
}

/* 24 ─ Tone & reading time */
export function ToneChecker({ onBack, mobile }: P) {
  const [text, setText] = useState("");
  const t = C.toneCheck(text);
  return (
    <AppFrame title="Tone & reading time" Icon={Smile} iconClass="text-[#fbbf24]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className={field} placeholder="Paste a message before you send it…" />
        <div className="grid grid-cols-3 gap-2">
          <Stat k="Words" v={t.words} />
          <Stat k="Read time" v={`${t.readSeconds}s`} />
          <Stat k="Caps words" v={t.caps} />
        </div>
        {text && (
          <ul className="space-y-1.5">
            {t.flags.map((f) => (
              <li key={f} className="rounded-xl bg-black/25 px-3 py-2 text-sm">
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}

/* 25 ─ Meeting slot finder */
const ZONES = ["UTC", "Europe/London", "Europe/Budapest", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney"];
export function MeetingSlots({ onBack, mobile }: P) {
  const [zones, setZones] = useStored<string[]>("meet.zones", ["Europe/Budapest", "America/New_York"]);
  const slots = useMemo(() => C.meetingSlots(Date.now(), zones, 6), [zones]);
  const text = `Possible times:\n${slots.map((s) => zones.map((z) => `${C.formatInZone(s, z)} (${z.split("/").pop()?.replace("_", " ")})`).join("  |  ")).join("\n")}`;
  const toggle = (z: string) => setZones(zones.includes(z) ? zones.filter((x) => x !== z) : [...zones, z]);
  return (
    <AppFrame title="Meeting slot finder" Icon={Clock} iconClass="text-[#5865f2]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="flex flex-wrap gap-1.5">
          {ZONES.map((z) => (
            <button key={z} onClick={() => toggle(z)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", zones.includes(z) ? "bg-accent text-white" : "bg-black/25 text-sub")}>
              {z.split("/").pop()?.replace("_", " ")}
            </button>
          ))}
        </div>
        {zones.length === 0 && <Hint>Choose at least one time zone.</Hint>}
        {zones.length > 0 && slots.length === 0 && <Hint>No overlap between 08:00 and 21:59 in the next 3 days for this mix of zones.</Hint>}
        {slots.map((s) => (
          <div key={s} className="rounded-xl bg-black/25 px-3 py-2.5 text-sm">
            {zones.map((z) => (
              <div key={z} className="flex justify-between gap-3">
                <span className="text-sub">{z.split("/").pop()?.replace("_", " ")}</span>
                <span className="font-semibold tabular-nums">{C.formatInZone(s, z)}</span>
              </div>
            ))}
          </div>
        ))}
        {slots.length > 0 && <CopyBtn text={text}>Copy options</CopyBtn>}
      </div>
    </AppFrame>
  );
}

/* 26 ─ Expense splitter */
type Person = { id: string; name: string; paid: number };
export function ExpenseSplit({ onBack, mobile }: P) {
  const [ps, setPs] = useStored<Person[]>("exp.people", [{ id: "a", name: "Alex", paid: 0 }, { id: "b", name: "Sam", paid: 0 }]);
  const r = C.splitExpenses(ps.map((p) => ({ name: p.name || "?", paid: p.paid })));
  return (
    <AppFrame title="Expense splitter" Icon={Coins} iconClass="text-[#34d399]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        {ps.map((p) => (
          <div key={p.id} className="grid grid-cols-[1fr_6rem_auto] items-center gap-1.5">
            <input value={p.name} onChange={(e) => setPs(ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} className={field} placeholder="Name" />
            <Num value={p.paid} onChange={(n) => setPs(ps.map((x) => (x.id === p.id ? { ...x, paid: n || 0 } : x)))} aria-label="Amount paid" />
            <button onClick={() => setPs(ps.filter((x) => x.id !== p.id))} className="p-2 text-sub hover:text-red-400" aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button onClick={() => setPs([...ps, { id: uid(), name: "", paid: 0 }])} className={cn(btnGhost, "inline-flex items-center gap-1.5")}>
          <Plus size={14} /> Add person
        </button>
        <Stat k="Fair share each" v={r.share.toFixed(2)} />
        {r.transfers.map((t, i) => (
          <div key={i} className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold">
            {t.from} pays {t.to} <span className="tabular-nums">{t.amount.toFixed(2)}</span>
          </div>
        ))}
        {!r.transfers.length && ps.some((p) => p.paid > 0) && <Hint>Everyone is settled.</Hint>}
      </div>
    </AppFrame>
  );
}

/* 27 ─ Group picker */
export function GroupPicker({ onBack, mobile }: P) {
  const [mode, setMode] = useState<"Teams" | "Secret Santa" | "Pick one">("Teams");
  const [raw, setRaw] = useStored("group.names", "");
  const [teams, setTeams] = useState(2);
  const [result, setResult] = useState<string[]>([]);
  const names = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const run = () => {
    if (mode === "Teams") setResult(C.teamSplit(names, teams).map((t, i) => `Team ${i + 1}: ${t.join(", ")}`));
    else if (mode === "Secret Santa") setResult(C.secretSanta(names).map((p) => `${p.from} → ${p.to}`));
    else setResult(names.length ? [C.shuffle(names)[0]] : []);
  };
  return (
    <AppFrame title="Group picker" Icon={Users} iconClass="text-[#fb923c]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Pills items={["Teams", "Secret Santa", "Pick one"] as const} value={mode} onChange={setMode} />
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder="Names, one per line or comma-separated" className={field} />
        {mode === "Teams" && (
          <Field title="Number of teams">
            <Num value={teams} onChange={(n) => setTeams(Math.max(1, n || 1))} min={1} />
          </Field>
        )}
        <button onClick={run} disabled={names.length < (mode === "Secret Santa" ? 2 : 1)} className={cn(btn, "inline-flex items-center gap-1.5")}>
          <Shuffle size={14} /> {mode === "Pick one" ? "Pick" : "Shuffle"}
        </button>
        {result.length > 0 && (
          <>
            <div className="space-y-1.5">
              {result.map((r, i) => (
                <div key={i} className="rounded-xl bg-black/25 px-3 py-2 text-sm font-semibold">
                  {r}
                </div>
              ))}
            </div>
            {mode !== "Secret Santa" && <CopyBtn text={result.join("\n")} />}
            {mode === "Secret Santa" && <Hint>Each person should only see their own line — reveal one at a time.</Hint>}
          </>
        )}
      </div>
    </AppFrame>
  );
}

/* 28 ─ Chat stats */
export function ChatStats({ onBack, mobile }: P) {
  const [raw, setRaw] = useState("");
  const s = useMemo(() => C.chatStats(raw), [raw]);
  return (
    <AppFrame title="Chat stats" Icon={BookOpen} iconClass="text-[#2dd4bf]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} className={cn(field, "font-mono text-xs")} placeholder={"Paste an exported chat, e.g.\n12/11/2026, 21:05 - Ana: Hello!"} />
        <Hint>Runs entirely in your browser; nothing is uploaded.</Hint>
        {s.messages > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat k="Messages" v={s.messages} />
              <Stat k="Busiest hour" v={s.busiestHour >= 0 ? `${String(s.busiestHour).padStart(2, "0")}:00` : "—"} />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-sub">Who talks most</div>
              {s.people.map(([n, c]) => (
                <div key={n} className="flex justify-between py-0.5 text-sm">
                  <span>{n}</span>
                  <span className="tabular-nums text-sub">{c}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-sub">Top words</div>
              <div className="flex flex-wrap gap-1.5">
                {s.topWords.map(([w, c]) => (
                  <span key={w} className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold">
                    {w} · {c}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}

/* 29 ─ Out-of-office writer */
export function OutOfOffice({ onBack, mobile }: P) {
  const [f, setF] = useStored("ooo.f", { name: "", from: "", to: "", backup: "", urgent: "" });
  const [tone, setTone] = useState<"formal" | "friendly">("friendly");
  const text = C.outOfOffice(f, tone);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <AppFrame title="Auto-reply writer" Icon={Gift} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Pills items={["friendly", "formal"] as const} value={tone} onChange={setTone} />
        <div className="grid grid-cols-2 gap-2">
          <Field title="Your name">
            <input value={f.name} onChange={set("name")} className={field} />
          </Field>
          <Field title="Back on">
            <input type="date" value={f.to} onChange={set("to")} className={field} />
          </Field>
          <Field title="Away since">
            <input type="date" value={f.from} onChange={set("from")} className={field} />
          </Field>
          <Field title="Backup contact">
            <input value={f.backup} onChange={set("backup")} className={field} />
          </Field>
        </div>
        <Field title="Backup email / phone">
          <input value={f.urgent} onChange={set("urgent")} className={field} />
        </Field>
        <pre className="whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-sm">{text}</pre>
        <CopyBtn text={text}>Copy reply</CopyBtn>
      </div>
    </AppFrame>
  );
}

/* 30 ─ Link cleaner */
export function LinkCleaner({ onBack, mobile }: P) {
  const [raw, setRaw] = useState("");
  const rows = raw.split(/\s+/).filter(Boolean).map((u) => ({ in: u, ...C.cleanUrl(u) }));
  const out = rows.map((r) => r.url).join("\n");
  return (
    <AppFrame title="Link cleaner" Icon={Link2} iconClass="text-[#60a5fa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder="Paste links — tracking parameters (utm_, fbclid, si, igshid…) are stripped" className={field} />
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl bg-black/25 px-3 py-2 text-sm">
            <div className="break-all">{r.url}</div>
            <div className="text-xs text-sub">{"invalid" in r ? "Not a valid URL" : r.removed ? `Removed ${r.removed} tracker${r.removed > 1 ? "s" : ""}` : "Already clean"}</div>
          </div>
        ))}
        {out && <CopyBtn text={out}>Copy cleaned</CopyBtn>}
      </div>
    </AppFrame>
  );
}
