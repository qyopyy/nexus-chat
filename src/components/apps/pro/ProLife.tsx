"use client";

import { useEffect, useState } from "react";
import { Cake, CalendarDays, Dices, Flame, Grid2X2, Landmark, NotebookPen, PiggyBank, Plus, Scale, Trash2, Wind } from "lucide-react";
import AppFrame from "../AppFrame";
import { cn } from "@/lib/utils";
import { box, btn, btnGhost, CopyBtn, Field, field, Hint, Num, Pills, Stat, uid, useStored, type P } from "./kit";
import * as L from "@/lib/pro/life";

const localDay = () => {
  const d = new Date();
  return L.isoDay(d.getTime(), d.getTimezoneOffset());
};

/* 41 ─ Habit tracker */
type Habit = { id: string; name: string; days: string[] };
export function HabitTracker({ onBack, mobile }: P) {
  const [habits, setHabits] = useStored<Habit[]>("habit.list", [{ id: "a", name: "Write or record for 30 min", days: [] }]);
  const [name, setName] = useState("");
  const today = localDay();
  const toggle = (h: Habit) => setHabits(habits.map((x) => (x.id === h.id ? { ...x, days: x.days.includes(today) ? x.days.filter((d) => d !== today) : [...x.days, today] } : x)));
  return (
    <AppFrame title="Habit tracker" Icon={Flame} iconClass="text-[#fb923c]" mobile={mobile} onBack={onBack}>
      {habits.map((h) => {
        const s = L.habitStreak(h.days, today);
        const done = h.days.includes(today);
        return (
          <div key={h.id} className={cn(box, "space-y-2")}>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(h)} className={cn("grid size-9 shrink-0 place-items-center rounded-full text-lg", done ? "bg-emerald-500 text-white" : "bg-black/30 text-sub")} aria-label={done ? "Mark not done" : "Mark done today"}>
                ✓
              </button>
              <div className="min-w-0 flex-1 font-semibold">{h.name}</div>
              <button onClick={() => setHabits(habits.filter((x) => x.id !== h.id))} className="p-2 text-sub hover:text-red-400" aria-label="Delete habit">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat k="Streak" v={`🔥 ${s.current}`} />
              <Stat k="Best" v={s.best} />
              <Stat k="Total days" v={s.total} />
            </div>
          </div>
        );
      })}
      <div className={cn(box, "flex gap-2")}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New habit" className={field} />
        <button
          onClick={() => {
            if (name.trim()) {
              setHabits([...habits, { id: uid(), name: name.trim(), days: [] }]);
              setName("");
            }
          }}
          className={btn}
        >
          Add
        </button>
      </div>
    </AppFrame>
  );
}

/* 42 ─ Mood journal */
type Entry = { id: string; day: string; mood: number; text: string };
export function MoodJournal({ onBack, mobile }: P) {
  const [list, setList] = useStored<Entry[]>("journal.list", []);
  const [mood, setMood] = useState(3);
  const [text, setText] = useState("");
  const avg = L.moodAverage(list.slice(0, 14));
  return (
    <AppFrame title="Mood journal" Icon={NotebookPen} iconClass="text-[#c084fc]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="flex justify-between">
          {L.MOODS.map((m, i) => (
            <button key={m} onClick={() => setMood(i + 1)} className={cn("size-12 rounded-full text-2xl", mood === i + 1 ? "bg-accent/40 ring-2 ring-accent" : "bg-black/25")} aria-label={`Mood ${i + 1} of 5`}>
              {m}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What's on your mind?" className={field} />
        <button
          onClick={() => {
            setList([{ id: uid(), day: localDay(), mood, text: text.trim() }, ...list]);
            setText("");
          }}
          className={btn}
        >
          Save entry
        </button>
        {list.length > 0 && <Stat k="Average (last 14 entries)" v={`${L.MOODS[Math.max(0, Math.round(avg) - 1)]} ${avg}`} />}
        <Hint>Private — stored only on this device. This journal is for reflection, not medical advice.</Hint>
      </div>
      {list.map((e) => (
        <div key={e.id} className={cn(box, "flex gap-3")}>
          <div className="text-2xl">{L.MOODS[e.mood - 1]}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-sub">{e.day}</div>
            <div className="whitespace-pre-wrap break-words text-sm">{e.text || "—"}</div>
          </div>
          <button onClick={() => setList(list.filter((x) => x.id !== e.id))} className="self-start p-1.5 text-sub hover:text-red-400" aria-label="Delete entry">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </AppFrame>
  );
}

/* 43 ─ Countdown manager */
type Cd = { id: string; name: string; at: string };
export function Countdowns({ onBack, mobile }: P) {
  const [list, setList] = useStored<Cd[]>("cd.list", []);
  const [name, setName] = useState("");
  const [at, setAt] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <AppFrame title="Countdowns" Icon={CalendarDays} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Event name" className={field} />
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={field} />
        <button
          disabled={!name.trim() || !at}
          onClick={() => {
            setList([...list, { id: uid(), name: name.trim(), at }]);
            setName("");
            setAt("");
          }}
          className={cn(btn, "inline-flex items-center gap-1.5")}
        >
          <Plus size={14} /> Add countdown
        </button>
      </div>
      {list
        .slice()
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .map((c) => {
          const p = L.countdownParts(Date.parse(c.at), now);
          return (
            <div key={c.id} className={cn(box, "space-y-2")}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold">{c.name}</div>
                <button onClick={() => setList(list.filter((x) => x.id !== c.id))} className="p-1.5 text-sub hover:text-red-400" aria-label="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {([["d", p.days], ["h", p.hours], ["m", p.minutes], ["s", p.seconds]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-black/25 py-2">
                    <div className="text-2xl font-extrabold tabular-nums">{v}</div>
                    <div className="text-[11px] uppercase text-sub">{k}</div>
                  </div>
                ))}
              </div>
              {p.past && <Hint>This happened {p.days} day{p.days === 1 ? "" : "s"} ago.</Hint>}
            </div>
          );
        })}
    </AppFrame>
  );
}

/* 44 ─ 50/30/20 budget */
export function BudgetSplit({ onBack, mobile }: P) {
  const [income, setIncome] = useStored("budget.income", 2000);
  const [rule, setRule] = useStored("budget.rule", [50, 30, 20]);
  const b = L.budgetSplit(income || 0, rule[0], rule[1], rule[2]);
  const labels = ["Needs", "Wants", "Savings"];
  return (
    <AppFrame title="Budget split" Icon={PiggyBank} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Monthly take-home income">
          <Num value={income} onChange={setIncome} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {labels.map((l, i) => (
            <Field key={l} title={`${l} %`}>
              <Num value={rule[i]} onChange={(n) => setRule(rule.map((r, j) => (j === i ? n || 0 : r)))} />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat k="Needs" v={b.needs.toLocaleString()} />
          <Stat k="Wants" v={b.wants.toLocaleString()} />
          <Stat k="Savings" v={b.savings.toLocaleString()} tone="good" />
        </div>
        <Hint>Percentages are scaled if they don't add to 100. The classic rule is 50/30/20.</Hint>
      </div>
    </AppFrame>
  );
}

/* 45 ─ Loan calculator */
export function LoanCalc({ onBack, mobile }: P) {
  const [p, setP] = useStored("loan.p", 10000);
  const [r, setR] = useStored("loan.r", 6);
  const [m, setM] = useStored("loan.m", 36);
  const l = L.loanPayment(p || 0, r || 0, m || 0);
  const rows = L.amortization(p || 0, r || 0, m || 0, 6);
  return (
    <AppFrame title="Loan calculator" Icon={Landmark} iconClass="text-[#60a5fa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-3 gap-2">
          <Field title="Amount">
            <Num value={p} onChange={setP} />
          </Field>
          <Field title="APR %">
            <Num step="0.1" value={r} onChange={setR} />
          </Field>
          <Field title="Months">
            <Num value={m} onChange={setM} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat k="Monthly" v={l.monthly.toLocaleString()} />
          <Stat k="Interest" v={l.interest.toLocaleString()} tone="bad" />
          <Stat k="Total" v={l.total.toLocaleString()} />
        </div>
        {rows.length > 0 && (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-sub">
              <tr>
                <th className="py-1 text-left">#</th>
                <th className="text-right">Interest</th>
                <th className="text-right">Principal</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.n} className="odd:bg-black/10">
                  <td className="py-1">{x.n}</td>
                  <td className="text-right">{x.interest.toFixed(2)}</td>
                  <td className="text-right">{x.principal.toFixed(2)}</td>
                  <td className="text-right">{x.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Hint>Estimate for a fixed-rate amortising loan. Real offers may add fees.</Hint>
      </div>
    </AppFrame>
  );
}

/* 46 ─ Date difference */
export function DateDiff({ onBack, mobile }: P) {
  const [a, setA] = useState(localDay());
  const [b, setB] = useState(localDay());
  const d = L.dateDiff(a, b);
  return (
    <AppFrame title="Date calculator" Icon={Cake} iconClass="text-[#fbbf24]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="From">
            <input type="date" value={a} onChange={(e) => setA(e.target.value)} className={field} />
          </Field>
          <Field title="To">
            <input type="date" value={b} onChange={(e) => setB(e.target.value)} className={field} />
          </Field>
        </div>
        {d ? (
          <div className="grid grid-cols-2 gap-2">
            <Stat k="Years / months / days" v={`${d.years}y ${d.months}m ${d.days}d`} />
            <Stat k="Total days" v={d.totalDays.toLocaleString()} />
            <Stat k="Weeks" v={(d.totalDays / 7).toFixed(1)} />
            <Stat k="Hours" v={(d.totalDays * 24).toLocaleString()} />
          </div>
        ) : (
          <Hint>Pick two valid dates.</Hint>
        )}
      </div>
    </AppFrame>
  );
}

/* 47 ─ Decision matrix */
export function DecisionMatrix({ onBack, mobile }: P) {
  const [crit, setCrit] = useStored("dm.crit", [{ name: "Cost", weight: 3 }, { name: "Quality", weight: 4 }, { name: "Time", weight: 2 }]);
  const [opts, setOpts] = useStored("dm.opts", [{ name: "Option A", scores: [3, 4, 3] }, { name: "Option B", scores: [5, 2, 4] }]);
  const ranked = L.decisionScores(crit, opts);
  const setScore = (oi: number, ci: number, v: number) => setOpts(opts.map((o, i) => (i === oi ? { ...o, scores: crit.map((_, k) => (k === ci ? v : o.scores[k] || 0)) } : o)));
  return (
    <AppFrame title="Decision matrix" Icon={Scale} iconClass="text-[#a78bfa]" mobile={mobile} onBack={onBack} wide>
      <div className={cn(box, "space-y-3 overflow-x-auto")}>
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr>
              <th />
              {crit.map((c, ci) => (
                <th key={ci} className="px-1 pb-2">
                  <input value={c.name} onChange={(e) => setCrit(crit.map((x, i) => (i === ci ? { ...x, name: e.target.value } : x)))} className={cn(field, "py-1.5 text-center text-sm")} />
                  <input type="number" min={0} max={10} value={c.weight} onChange={(e) => setCrit(crit.map((x, i) => (i === ci ? { ...x, weight: Number(e.target.value) || 0 } : x)))} className={cn(field, "mt-1 py-1 text-center text-xs")} aria-label={`${c.name} weight`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opts.map((o, oi) => (
              <tr key={oi}>
                <td className="pr-1">
                  <input value={o.name} onChange={(e) => setOpts(opts.map((x, i) => (i === oi ? { ...x, name: e.target.value } : x)))} className={cn(field, "py-1.5 text-sm")} />
                </td>
                {crit.map((_, ci) => (
                  <td key={ci} className="p-1">
                    <input type="number" min={0} max={5} value={o.scores[ci] ?? 0} onChange={(e) => setScore(oi, ci, Math.min(5, Math.max(0, Number(e.target.value) || 0)))} className={cn(field, "py-1.5 text-center")} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <button onClick={() => setOpts([...opts, { name: `Option ${String.fromCharCode(65 + opts.length)}`, scores: crit.map(() => 3) }])} className={btnGhost}>
            + Option
          </button>
          <button onClick={() => {
              setCrit([...crit, { name: "New", weight: 2 }]);
              setOpts(opts.map((o) => ({ ...o, scores: [...o.scores, 3] })));
            }} className={btnGhost}>
            + Criterion
          </button>
        </div>
        <Hint>Weights 0–10 (importance), scores 0–5 (how well each option does).</Hint>
      </div>
      <div className={cn(box, "space-y-2")}>
        {ranked.map((r, i) => (
          <div key={r.name + i} className={cn("flex justify-between rounded-xl px-3 py-2.5 font-semibold", i === 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-black/25")}>
            <span>
              {i + 1}. {r.name}
            </span>
            <span className="tabular-nums">{r.score}</span>
          </div>
        ))}
      </div>
    </AppFrame>
  );
}

/* 48 ─ Eisenhower matrix */
type Task = { id: string; text: string; urgent: boolean; important: boolean };
export function PriorityMatrix({ onBack, mobile }: P) {
  const [tasks, setTasks] = useStored<Task[]>("eis.tasks", []);
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(true);
  const quads: [string, boolean, boolean, string][] = [
    ["Do now", true, true, "bg-red-500/15"],
    ["Schedule", false, true, "bg-sky-500/15"],
    ["Delegate", true, false, "bg-amber-500/15"],
    ["Drop", false, false, "bg-zinc-500/15"],
  ];
  return (
    <AppFrame title="Priority matrix" Icon={Grid2X2} iconClass="text-[#f87171]" mobile={mobile} onBack={onBack} wide>
      <div className={cn(box, "space-y-3")}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Task" className={field} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} /> Important
          </label>
          <button
            disabled={!text.trim()}
            onClick={() => {
              setTasks([...tasks, { id: uid(), text: text.trim(), urgent, important }]);
              setText("");
            }}
            className={btn}
          >
            Add
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {quads.map(([name, u, i, bg]) => (
          <div key={name} className={cn("min-h-28 rounded-2xl p-3", bg)}>
            <div className="mb-2 text-sm font-bold">{name}</div>
            {tasks
              .filter((t) => L.eisenhower(t.urgent, t.important) === name)
              .map((t) => (
                <div key={t.id} className="mb-1 flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 break-words">{t.text}</span>
                  <button onClick={() => setTasks(tasks.filter((x) => x.id !== t.id))} className="text-sub hover:text-red-400" aria-label="Done">
                    ✓
                  </button>
                </div>
              ))}
            <span className="sr-only">
              {u ? "urgent" : "not urgent"} {i ? "important" : "not important"}
            </span>
          </div>
        ))}
      </div>
    </AppFrame>
  );
}

/* 49 ─ Breathing guide */
export function BreathingGuide({ onBack, mobile }: P) {
  const [pi, setPi] = useState(0);
  const [running, setRunning] = useState(false);
  const [t, setT] = useState(0);
  const pattern = L.BREATH_PATTERNS[pi];
  useEffect(() => {
    if (!running) return;
    const start = performance.now() - t * 1000;
    const id = setInterval(() => setT((performance.now() - start) / 1000), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const ph = L.breathPhaseAt(pattern.phases, t);
  const scale = 0.55 + 0.45 * L.breathScale(pattern.phases, t);
  return (
    <AppFrame title="Breathing guide" Icon={Wind} iconClass="text-[#2dd4bf]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-4 text-center")}>
        <Pills items={L.BREATH_PATTERNS.map((p) => p.name)} value={pattern.name} onChange={(n) => {
            setPi(Math.max(0, L.BREATH_PATTERNS.findIndex((p) => p.name === n)));
            setT(0);
            setRunning(false);
          }} />
        <div className="grid h-56 place-items-center">
          <div className="grid size-48 place-items-center rounded-full bg-accent/30 ring-4 ring-accent/50 transition-transform duration-100" style={{ transform: `scale(${scale})` }}>
            <div>
              <div className="text-2xl font-extrabold">{running ? ph.name : "Ready"}</div>
              {running && <div className="text-3xl font-bold tabular-nums">{ph.left}</div>}
            </div>
          </div>
        </div>
        <button onClick={() => {
            if (running) setT(0);
            setRunning(!running);
          }} className={btn}>
          {running ? "Stop" : "Begin"}
        </button>
        <Hint>Breathe in through the nose, out slowly through the mouth. Stop if you feel dizzy.</Hint>
      </div>
    </AppFrame>
  );
}
/* 50 ─ Dice & coin */
export function DiceCoin({ onBack, mobile }: P) {
  const [sides, setSides] = useState(6);
  const [count, setCount] = useState(2);
  const [res, setRes] = useState<{ rolls: number[]; sum: number } | null>(null);
  const [coin, setCoin] = useState("");
  return (
    <AppFrame title="Dice & coin" Icon={Dices} iconClass="text-[#fb923c]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Pills items={["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const} value={`d${sides}` as "d6"} onChange={(v) => setSides(Number(v.slice(1)))} />
        <Field title="How many dice">
          <Num value={count} onChange={(n) => setCount(Math.max(1, Math.min(50, n || 1)))} min={1} max={50} />
        </Field>
        <button onClick={() => setRes(L.rollDice(sides, count))} className={btn}>
          Roll
        </button>
        {res && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {res.rolls.map((r, i) => (
                <span key={i} className="grid size-11 place-items-center rounded-xl bg-black/25 text-lg font-bold tabular-nums">
                  {r}
                </span>
              ))}
            </div>
            <Stat k="Total" v={res.sum} />
            <CopyBtn text={`${count}d${sides}: ${res.rolls.join(" + ")} = ${res.sum}`} />
          </div>
        )}
      </div>
      <div className={cn(box, "space-y-3 text-center")}>
        <button onClick={() => setCoin(L.pickOne(["Heads", "Tails"]) ?? "")} className={btn}>
          Flip a coin
        </button>
        {coin && <div className="text-3xl font-extrabold">{coin}</div>}
      </div>
    </AppFrame>
  );
}
