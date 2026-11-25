"use client";

import { useEffect, useRef, useState } from "react";
import { Clipboard, Download, HardDrive, KeyRound, Monitor, ListChecks, Pin, Plus, Signal, Timer, Trash2, Wifi, Heart } from "lucide-react";
import QRCode from "qrcode";
import AppFrame from "../AppFrame";
import { cn } from "@/lib/utils";
import { box, btn, btnGhost, CopyBtn, Field, field, Hint, Num, Pills, Stat, uid, useStored, type P } from "./kit";
import * as Ph from "@/lib/pro/phone";

/* 31 ─ Storage planner */
export function StoragePlanner({ onBack, mobile }: P) {
  const [free, setFree] = useStored("store.free", 32);
  const items = [
    { n: "Photos (HEIC ~3 MB)", mb: 3 },
    { n: "4K video minute (~350 MB)", mb: 350 },
    { n: "1080p video minute (~130 MB)", mb: 130 },
    { n: "Songs (AAC ~8 MB)", mb: 8 },
    { n: "Lossless songs (~30 MB)", mb: 30 },
    { n: "Voice memos minute (~1 MB)", mb: 1 },
  ];
  return (
    <AppFrame title="Storage planner" Icon={HardDrive} iconClass="text-[#38bdf8]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Free space (GB)">
          <Num value={free} onChange={setFree} min={0} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {items.map((i) => (
            <Stat key={i.n} k={i.n} v={Ph.storageFit(free || 0, i.mb).toLocaleString()} />
          ))}
        </div>
      </div>
    </AppFrame>
  );
}

/* 32 ─ Mobile data estimator */
export function DataEstimator({ onBack, mobile }: P) {
  const [hrs, setHrs] = useStored<Record<string, number>>("data.hrs", { "Music streaming (normal)": 2, "Video 1080p": 0.5, "Social scrolling": 1 });
  const [plan, setPlan] = useStored("data.plan", 20);
  const gb = Ph.monthlyData(Ph.DATA_PROFILES.map((p) => ({ mbPerHour: p.mbPerHour, hoursPerDay: hrs[p.name] || 0 })));
  const pct = plan > 0 ? Math.min(100, (gb / plan) * 100) : 0;
  return (
    <AppFrame title="Data usage estimator" Icon={Signal} iconClass="text-[#34d399]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        {Ph.DATA_PROFILES.map((p) => (
          <div key={p.name} className="grid grid-cols-[1fr_5rem] items-center gap-2">
            <div className="text-sm">
              {p.name}
              <span className="ml-1 text-xs text-sub">{p.mbPerHour} MB/h</span>
            </div>
            <Num step="0.25" value={hrs[p.name] ?? 0} onChange={(n) => setHrs({ ...hrs, [p.name]: n || 0 })} aria-label={`${p.name} hours per day`} />
          </div>
        ))}
        <Hint>Hours per day for each activity.</Hint>
        <Field title="Your monthly plan (GB)">
          <Num value={plan} onChange={setPlan} />
        </Field>
        <div className="h-2.5 overflow-hidden rounded-full bg-black/30">
          <div className={cn("h-full", pct >= 100 ? "bg-red-500" : pct > 80 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
        </div>
        <Stat k="Estimated per month" v={`${gb.toFixed(1)} GB`} tone={gb > plan ? "bad" : "good"} />
      </div>
    </AppFrame>
  );
}

/* 33 ─ Download time */
export function DownloadTime({ onBack, mobile }: P) {
  const [size, setSize] = useStored("dl.size", 500);
  const [unit, setUnit] = useStored<"MB" | "GB">("dl.unit", "MB");
  const [speed, setSpeed] = useStored("dl.speed", 50);
  const mb = unit === "GB" ? size * 1000 : size;
  return (
    <AppFrame title="Download time" Icon={Download} iconClass="text-[#60a5fa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field title="File size">
            <Num value={size} onChange={setSize} />
          </Field>
          <Field title="Unit">
            <Pills items={["MB", "GB"] as const} value={unit} onChange={setUnit} />
          </Field>
        </div>
        <Field title="Connection speed (Mbps)">
          <Num value={speed} onChange={setSpeed} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {[0.5, 1].map((f) => (
            <Stat key={f} k={f === 1 ? "At full speed" : "At 50% real-world"} v={Ph.humanDuration(Ph.downloadSeconds(mb, (speed || 0) * f))} />
          ))}
        </div>
      </div>
    </AppFrame>
  );
}

/* 34 ─ Password lab */
export function PasswordLab({ onBack, mobile }: P) {
  const [opts, setOpts] = useStored<Ph.PwOpts>("pw.opts", { length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true });
  const [kind, setKind] = useState<"Password" | "Passphrase">("Password");
  const [words, setWords] = useState(4);
  const [pw, setPw] = useState("");
  const [test, setTest] = useState("");
  const make = () => setPw(kind === "Password" ? Ph.generatePassword(opts) : Ph.passphrase(Ph.WORDS, words));
  useEffect(make, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = Ph.passwordStrength(test || pw);
  const toggles: [keyof Ph.PwOpts, string][] = [
    ["lower", "a–z"],
    ["upper", "A–Z"],
    ["digits", "0–9"],
    ["symbols", "!@#"],
    ["avoidAmbiguous", "No look-alikes"],
  ];
  return (
    <AppFrame title="Password lab" Icon={KeyRound} iconClass="text-[#fbbf24]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Pills items={["Password", "Passphrase"] as const} value={kind} onChange={setKind} />
        <div className="break-all rounded-xl bg-black/25 p-3 font-mono text-lg">{pw}</div>
        {kind === "Password" ? (
          <>
            <Field title={`Length: ${opts.length}`}>
              <input type="range" min={8} max={64} value={opts.length} onChange={(e) => setOpts({ ...opts, length: Number(e.target.value) })} className="w-full" />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {toggles.map(([k, l]) => (
                <button key={k} onClick={() => setOpts({ ...opts, [k]: !opts[k] })} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", opts[k] ? "bg-accent text-white" : "bg-black/25 text-sub")}>
                  {l}
                </button>
              ))}
            </div>
          </>
        ) : (
          <Field title={`Words: ${words}`}>
            <input type="range" min={3} max={8} value={words} onChange={(e) => setWords(Number(e.target.value))} className="w-full" />
          </Field>
        )}
        <div className="flex gap-2">
          <button onClick={make} className={btn}>
            Generate
          </button>
          <CopyBtn text={pw} />
        </div>
      </div>
      <div className={cn(box, "space-y-3")}>
        <Field title="Check a password (stays on this device)">
          <input type="password" value={test} onChange={(e) => setTest(e.target.value)} className={field} autoComplete="off" />
        </Field>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("h-2 flex-1 rounded-full", i < Math.min(4, s.score + 1) ? (s.score >= 3 ? "bg-emerald-500" : s.score === 2 ? "bg-amber-400" : "bg-red-500") : "bg-black/30")} />
          ))}
        </div>
        <Stat k="Strength" v={`${s.label} · ~${s.bits} bits`} />
      </div>
    </AppFrame>
  );
}

/* 35 ─ Phone checklists */
export function PhoneChecklists({ onBack, mobile }: P) {
  const [id, setId] = useStored("chk.id", "new");
  const [done, setDone] = useStored<Record<string, boolean>>("chk.done", {});
  const list = Ph.PHONE_CHECKLISTS.find((c) => c.id === id) ?? Ph.PHONE_CHECKLISTS[0];
  const n = list.items.filter((_, i) => done[`${list.id}:${i}`]).length;
  return (
    <AppFrame title="Phone checklists" Icon={ListChecks} iconClass="text-[#a78bfa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Pills items={Ph.PHONE_CHECKLISTS.map((c) => c.title)} value={list.title} onChange={(t) => setId(Ph.PHONE_CHECKLISTS.find((c) => c.title === t)?.id ?? "new")} />
        <div className="h-2 overflow-hidden rounded-full bg-black/30">
          <div className="h-full bg-emerald-500" style={{ width: `${(n / list.items.length) * 100}%` }} />
        </div>
        {list.items.map((it, i) => {
          const k = `${list.id}:${i}`;
          return (
            <label key={k} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5 text-sm">
              <input type="checkbox" checked={!!done[k]} onChange={(e) => setDone({ ...done, [k]: e.target.checked })} className="size-4" />
              <span className={cn(done[k] && "text-sub line-through")}>{it}</span>
            </label>
          );
        })}
        <button
          onClick={() => {
            const next = { ...done };
            list.items.forEach((_, i) => delete next[`${list.id}:${i}`]);
            setDone(next);
          }}
          className={btnGhost}
        >
          Reset list
        </button>
      </div>
    </AppFrame>
  );
}

/* 36 ─ Wi-Fi QR */
export function WifiQr({ onBack, mobile }: P) {
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [sec, setSec] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [hidden, setHidden] = useState(false);
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!ssid) return setSrc("");
    let live = true;
    QRCode.toDataURL(Ph.wifiPayload(ssid, pass, sec, hidden), { margin: 2, width: 320 }).then((u) => live && setSrc(u), () => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [ssid, pass, sec, hidden]);
  return (
    <AppFrame title="Wi-Fi QR" Icon={Wifi} iconClass="text-[#2dd4bf]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Network name (SSID)">
          <input value={ssid} onChange={(e) => setSsid(e.target.value)} className={field} />
        </Field>
        <Pills items={["WPA", "WEP", "nopass"] as const} value={sec} onChange={setSec} />
        {sec !== "nopass" && (
          <Field title="Password">
            <input value={pass} onChange={(e) => setPass(e.target.value)} className={field} autoComplete="off" />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden network
        </label>
        {src && (
          <div className="grid place-items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Wi-Fi QR code" className="size-56 rounded-xl bg-white p-2" />
            <Hint>Guests scan this with their camera to join — no typing.</Hint>
          </div>
        )}
      </div>
    </AppFrame>
  );
}

/* 37 ─ Screen calculator */
export function ScreenCalc({ onBack, mobile }: P) {
  const [w, setW] = useStored("scr.w", 1179);
  const [h, setH] = useStored("scr.h", 2556);
  const [d, setD] = useStored("scr.d", 6.1);
  return (
    <AppFrame title="Screen calculator" Icon={Monitor} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-3 gap-2">
          <Field title="Width px">
            <Num value={w} onChange={setW} />
          </Field>
          <Field title="Height px">
            <Num value={h} onChange={setH} />
          </Field>
          <Field title="Diagonal in">
            <Num step="0.1" value={d} onChange={setD} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat k="Aspect" v={Ph.aspectRatio(w, h)} />
          <Stat k="PPI" v={Ph.ppi(w, h, d)} />
          <Stat k="Megapixels" v={((w * h) / 1e6).toFixed(2)} />
        </div>
      </div>
    </AppFrame>
  );
}

/* 38 ─ Emergency card */
export function EmergencyCard({ onBack, mobile }: P) {
  const [f, setF] = useStored("ice.f", { name: "", contact1: "", contact2: "", notes: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <AppFrame title="Emergency card" Icon={Heart} iconClass="text-[#f87171]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Your name">
          <input value={f.name} onChange={set("name")} className={field} />
        </Field>
        <Field title="Emergency contact 1">
          <input value={f.contact1} onChange={set("contact1")} className={field} />
        </Field>
        <Field title="Emergency contact 2">
          <input value={f.contact2} onChange={set("contact2")} className={field} />
        </Field>
        <Field title="Notes for responders">
          <textarea value={f.notes} onChange={set("notes")} rows={3} className={field} />
        </Field>
        <Hint>Saved only on this device. Add details you are comfortable showing; print or screenshot it for your lock screen.</Hint>
        <div className="rounded-2xl border-2 border-red-400/70 bg-black/25 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-red-300">In case of emergency</div>
          <div className="mt-1 text-xl font-extrabold">{f.name || "Your name"}</div>
          <div className="mt-2 space-y-0.5 text-sm">
            {f.contact1 && <div>☎ {f.contact1}</div>}
            {f.contact2 && <div>☎ {f.contact2}</div>}
            {f.notes && <div className="mt-1 whitespace-pre-wrap text-sub">{f.notes}</div>}
          </div>
        </div>
        <button onClick={() => window.print()} className={btnGhost}>
          Print
        </button>
      </div>
    </AppFrame>
  );
}

/* 39 ─ Clipboard board */
type Clip = { id: string; text: string; ts: number; pinned?: boolean };
export function ClipBoard({ onBack, mobile }: P) {
  const [clips, setClips] = useStored<Clip[]>("clips.list", []);
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    setClips([{ id: uid(), text: text.trim(), ts: Date.now() }, ...clips].slice(0, 100));
    setText("");
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) setClips([{ id: uid(), text: t.trim(), ts: Date.now() }, ...clips].slice(0, 100));
    } catch {
      /* permission denied */
    }
  };
  return (
    <AppFrame title="Clipboard board" Icon={Clipboard} iconClass="text-[#fbbf24]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Save a snippet, address, code…" className={field} />
        <div className="flex gap-2">
          <button onClick={add} className={cn(btn, "inline-flex items-center gap-1.5")}>
            <Plus size={14} /> Save
          </button>
          <button onClick={paste} className={btnGhost}>
            Paste from clipboard
          </button>
        </div>
      </div>
      {Ph.pinOrder(clips).map((c) => (
        <div key={c.id} className={cn(box, "space-y-2")}>
          <div className="whitespace-pre-wrap break-words text-sm">{c.text}</div>
          <div className="flex items-center gap-2">
            <CopyBtn text={c.text} />
            <button onClick={() => setClips(clips.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned } : x)))} className={cn(btnGhost, c.pinned && "text-amber-300")} aria-label="Pin">
              <Pin size={14} />
            </button>
            <button onClick={() => setClips(clips.filter((x) => x.id !== c.id))} className={btnGhost} aria-label="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </AppFrame>
  );
}

/* 40 ─ Stopwatch with laps */
export function Stopwatch({ onBack, mobile }: P) {
  const [ms, setMs] = useState(0);
  const [run, setRun] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const base = useRef(0);
  useEffect(() => {
    if (!run) return;
    const start = performance.now() - base.current;
    const id = setInterval(() => {
      base.current = performance.now() - start;
      setMs(base.current);
    }, 33);
    return () => clearInterval(id);
  }, [run]);
  const fmt = (v: number) => {
    const t = Math.floor(v / 10);
    const cs = t % 100;
    const s = Math.floor(t / 100) % 60;
    const m = Math.floor(t / 6000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };
  return (
    <AppFrame title="Stopwatch" Icon={Timer} iconClass="text-[#34d399]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-4 text-center")}>
        <div className="text-5xl font-extrabold tabular-nums">{fmt(ms)}</div>
        <div className="flex justify-center gap-2">
          <button onClick={() => setRun(!run)} className={btn}>
            {run ? "Stop" : ms ? "Resume" : "Start"}
          </button>
          <button onClick={() => {
              if (run) setLaps([ms, ...laps]);
              else {
                setMs(0);
                base.current = 0;
                setLaps([]);
              }
            }} className={btnGhost}>
            {run ? "Lap" : "Reset"}
          </button>
        </div>
        <div className="space-y-1 text-left">
          {laps.map((l, i) => (
            <div key={i} className="flex justify-between rounded-lg bg-black/25 px-3 py-1.5 text-sm tabular-nums">
              <span className="text-sub">Lap {laps.length - i}</span>
              <span className="font-semibold">{fmt(l)}</span>
              <span className="text-sub">+{fmt(l - (laps[i + 1] ?? 0))}</span>
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
