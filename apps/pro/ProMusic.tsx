"use client";

import { useMemo, useState } from "react";
import { AudioLines, CalendarDays, Clock, Coins, Disc3, Fingerprint, HardDrive, ListMusic, Music2, PenLine, Plus, Trash2, Volume2 } from "lucide-react";
import AppFrame from "../AppFrame";
import { cn } from "@/lib/utils";
import { box, btn, btnGhost, CopyBtn, Field, field, Hint, NOTE_PCS, Num, Pills, Stat, uid, useStored, downloadText, type P } from "./kit";
import * as M from "@/lib/pro/music";

/* 1 ─ Chord progression builder */
export function ChordBuilder({ onBack, mobile }: P) {
  const [key, setKey] = useStored("chord.key", 0);
  const [mode, setMode] = useStored<M.Mode>("chord.mode", "major");
  const [text, setText] = useStored("chord.text", "I V vi IV");
  const nums = text.split(/[\s,-]+/).filter(Boolean);
  const out = M.progression(key, mode, nums);
  const line = out.map((o) => o.chord ?? "?").join(" – ");
  return (
    <AppFrame title="Chord progression builder" Icon={Music2} iconClass="text-[#a78bfa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Key">
            <select value={key} onChange={(e) => setKey(Number(e.target.value))} className={field}>
              {NOTE_PCS.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field title="Mode">
            <Pills items={["major", "minor"] as const} value={mode} onChange={setMode} />
          </Field>
        </div>
        <Field title="Roman numerals (I, ii, bVII, V7, vii°…)">
          <input value={text} onChange={(e) => setText(e.target.value)} className={field} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {M.POPULAR_PROGRESSIONS.map((p) => (
            <button
              key={p.name}
              onClick={() => {
                setMode(p.mode);
                setText(p.numerals.join(" "));
              }}
              className={btnGhost}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className={box}>
        <div className="flex flex-wrap gap-2">
          {out.map((o, i) => (
            <div key={i} className="min-w-16 rounded-xl bg-black/25 px-4 py-3 text-center">
              <div className="text-2xl font-extrabold">{o.chord ?? "?"}</div>
              <div className="text-xs text-sub">{o.numeral}</div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <CopyBtn text={line}>Copy chords</CopyBtn>
        </div>
      </div>
    </AppFrame>
  );
}

/* 2 ─ Delay & reverb time calculator */
export function DelayCalc({ onBack, mobile }: P) {
  const [bpm, setBpm] = useStored("delay.bpm", 120);
  const rows = M.noteValueMs(bpm);
  return (
    <AppFrame title="Delay & reverb times" Icon={AudioLines} iconClass="text-[#34d399]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Tempo (BPM)">
          <Num value={bpm} onChange={setBpm} min={20} max={300} />
        </Field>
        <div className="overflow-hidden rounded-xl">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-black/30 text-xs uppercase text-sub">
              <tr>
                <th className="px-3 py-2 text-left">Note</th>
                <th className="px-3 py-2 text-right">Straight</th>
                <th className="px-3 py-2 text-right">Dotted</th>
                <th className="px-3 py-2 text-right">Triplet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="odd:bg-black/10">
                  <td className="px-3 py-2 font-semibold">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.straight.toFixed(1)} ms</td>
                  <td className="px-3 py-2 text-right">{r.dotted.toFixed(1)} ms</td>
                  <td className="px-3 py-2 text-right">{r.triplet.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint>Tip: set reverb pre-delay to a 1/64–1/32 value and delay feedback to 1/8 dotted for classic movement.</Hint>
      </div>
    </AppFrame>
  );
}

/* 3 ─ Streaming royalty estimator */
export function RoyaltyEstimator({ onBack, mobile }: P) {
  const [streams, setStreams] = useStored<Record<string, number>>("roy.streams", { Spotify: 100000, "Apple Music": 20000, "YouTube Music": 15000, Tidal: 2000, Deezer: 4000, "Amazon Music": 8000 });
  const [rates, setRates] = useStored<Record<string, number>>("roy.rates", M.DEFAULT_RATES);
  const [cut, setCut] = useStored("roy.cut", 100);
  const r = M.royaltyEstimate(streams, rates);
  return (
    <AppFrame title="Royalty estimator" Icon={Coins} iconClass="text-[#fbbf24]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        {r.rows.map((row) => (
          <div key={row.platform} className="grid grid-cols-[1fr_1fr_1fr] items-end gap-2">
            <div className="pb-2.5 text-sm font-semibold">{row.platform}</div>
            <Field title="Streams">
              <Num value={streams[row.platform]} onChange={(n) => setStreams({ ...streams, [row.platform]: n || 0 })} />
            </Field>
            <Field title="$/stream">
              <Num step="0.0001" value={rates[row.platform]} onChange={(n) => setRates({ ...rates, [row.platform]: n || 0 })} />
            </Field>
          </div>
        ))}
        <Field title="Your share of the master (%)">
          <Num value={cut} onChange={setCut} min={0} max={100} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Stat k="Streams" v={r.streams.toLocaleString()} />
          <Stat k="Gross" v={`$${r.total.toFixed(2)}`} />
          <Stat k="Your cut" v={`$${((r.total * (cut || 0)) / 100).toFixed(2)}`} tone="good" />
        </div>
        <Hint>Rates are rough public averages and vary by country, plan and distributor. Edit them to match your statements.</Hint>
      </div>
    </AppFrame>
  );
}

/* 4 ─ Harmonic mixing (Camelot) */
export function CamelotMixer({ onBack, mobile }: P) {
  const [key, setKey] = useStored("cam.key", 0);
  const [mode, setMode] = useStored<M.Mode>("cam.mode", "minor");
  const code = M.keyToCamelot(key, mode);
  const comp = M.camelotCompatible(code);
  return (
    <AppFrame title="Harmonic mixing" Icon={Disc3} iconClass="text-[#f472b6]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Track key">
            <select value={key} onChange={(e) => setKey(Number(e.target.value))} className={field}>
              {NOTE_PCS.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field title="Mode">
            <Pills items={["major", "minor"] as const} value={mode} onChange={setMode} />
          </Field>
        </div>
        <div className="rounded-xl bg-black/25 p-4 text-center">
          <div className="text-xs uppercase text-sub">Camelot code</div>
          <div className="text-5xl font-extrabold">{code}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {comp.map((c) => {
            const k = M.camelotToKey(c.code);
            return <Stat key={c.code} k={c.why} v={`${c.code} · ${k?.label ?? ""}`} />;
          })}
        </div>
        <Hint>Mix between tracks whose codes are the same, one step apart, or share a number across A/B for smooth transitions.</Hint>
      </div>
    </AppFrame>
  );
}

/* 5 ─ Loudness targets */
export function LoudnessGuide({ onBack, mobile }: P) {
  const [measured, setMeasured] = useStored("loud.measured", -9);
  return (
    <AppFrame title="Loudness targets" Icon={Volume2} iconClass="text-[#60a5fa]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="Your master's integrated loudness (LUFS)">
          <Num step="0.1" value={measured} onChange={setMeasured} />
        </Field>
        {M.LOUDNESS_TARGETS.map((t) => {
          const g = M.gainToTarget(measured, t.lufs);
          return (
            <div key={t.platform} className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-semibold">{t.platform}</div>
                <div className="text-xs text-sub">
                  {t.lufs} LUFS · {t.note}
                </div>
              </div>
              <div className={cn("shrink-0 text-sm font-bold tabular-nums", g < 0 ? "text-amber-400" : g > 0 ? "text-sky-400" : "text-emerald-400")}>{g === 0 ? "On target" : `${g > 0 ? "+" : ""}${g} dB`}</div>
            </div>
          );
        })}
        <Hint>Platforms only turn loud tracks down (some turn quiet ones up). Keep true peak below −1 dBTP to avoid clipping after encoding.</Hint>
      </div>
    </AppFrame>
  );
}

/* 6 ─ Audio file size calculator */
export function AudioSize({ onBack, mobile }: P) {
  const [sr, setSr] = useStored("size.sr", 44100);
  const [bits, setBits] = useStored("size.bits", 24);
  const [ch, setCh] = useStored("size.ch", 2);
  const [len, setLen] = useStored("size.len", "3:30");
  const sec = M.parseDuration(len);
  const wav = M.audioFileBytes(sr, bits, ch, sec);
  return (
    <AppFrame title="Audio file size" Icon={HardDrive} iconClass="text-[#38bdf8]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Sample rate">
            <select value={sr} onChange={(e) => setSr(Number(e.target.value))} className={field}>
              {[44100, 48000, 88200, 96000, 192000].map((v) => (
                <option key={v} value={v}>
                  {v / 1000} kHz
                </option>
              ))}
            </select>
          </Field>
          <Field title="Bit depth">
            <select value={bits} onChange={(e) => setBits(Number(e.target.value))} className={field}>
              {[16, 24, 32].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field title="Channels">
            <select value={ch} onChange={(e) => setCh(Number(e.target.value))} className={field}>
              <option value={1}>Mono</option>
              <option value={2}>Stereo</option>
              <option value={6}>5.1</option>
            </select>
          </Field>
          <Field title="Length (m:ss)">
            <input value={len} onChange={(e) => setLen(e.target.value)} className={field} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat k="WAV / AIFF" v={M.formatBytes(wav)} />
          <Stat k="FLAC (≈55%)" v={M.formatBytes(wav * 0.55)} />
          <Stat k="MP3 320 kbps" v={M.formatBytes((320000 / 8) * sec)} />
          <Stat k="AAC 256 kbps" v={M.formatBytes((256000 / 8) * sec)} />
        </div>
      </div>
    </AppFrame>
  );
}

/* 7 ─ Setlist builder */
type SetRow = { id: string; title: string; len: string; bpm: number };
export function SetlistBuilder({ onBack, mobile }: P) {
  const [rows, setRows] = useStored<SetRow[]>("set.rows", []);
  const [name, setName] = useStored("set.name", "My set");
  const stats = M.setlistStats(rows.map((r) => ({ title: r.title, seconds: M.parseDuration(r.len), bpm: r.bpm })));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const a = rows.slice();
    [a[i], a[j]] = [a[j], a[i]];
    setRows(a);
  };
  const text = `${name}\n${rows.map((r, i) => `${i + 1}. ${r.title || "Untitled"} (${r.len}${r.bpm ? `, ${r.bpm} BPM` : ""})`).join("\n")}\nTotal: ${M.formatDuration(stats.total)}`;
  return (
    <AppFrame title="Setlist builder" Icon={ListMusic} iconClass="text-[#fb7185]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={cn(field, "font-bold")} aria-label="Setlist name" />
        {rows.map((r, i) => (
          <div key={r.id} className={cn("grid grid-cols-[auto_1fr_4.5rem_4rem_auto] items-center gap-1.5 rounded-xl p-1", stats.bigJumps.includes(i) && "ring-1 ring-amber-400/60")}>
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} className="text-xs text-sub" aria-label="Move up">
                ▲
              </button>
              <button onClick={() => move(i, 1)} className="text-xs text-sub" aria-label="Move down">
                ▼
              </button>
            </div>
            <input value={r.title} placeholder="Song" onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)))} className={field} />
            <input value={r.len} placeholder="3:20" onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, len: e.target.value } : x)))} className={field} />
            <input value={r.bpm || ""} placeholder="BPM" inputMode="numeric" onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, bpm: Number(e.target.value) || 0 } : x)))} className={field} />
            <button onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="p-2 text-sub hover:text-red-400" aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button onClick={() => setRows([...rows, { id: uid(), title: "", len: "3:30", bpm: 0 }])} className={cn(btnGhost, "inline-flex items-center gap-1.5")}>
          <Plus size={14} /> Add song
        </button>
        <div className="grid grid-cols-3 gap-2">
          <Stat k="Songs" v={stats.count} />
          <Stat k="Runtime" v={M.formatDuration(stats.total)} />
          <Stat k="Avg BPM" v={stats.avgBpm || "—"} />
        </div>
        {stats.bigJumps.length > 0 && <Hint>Amber rows jump 20+ BPM from the previous song — consider reordering or adding a transition.</Hint>}
        <CopyBtn text={text}>Copy setlist</CopyBtn>
      </div>
    </AppFrame>
  );
}

/* 8 ─ Lyric syllables & rhymes */
export function SyllableCounter({ onBack, mobile }: P) {
  const [text, setText] = useStored("syl.text", "");
  const lines = text.split("\n");
  const scheme = useMemo(() => M.rhymeScheme(lines), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AppFrame title="Syllables & rhymes" Icon={PenLine} iconClass="text-[#c084fc]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste or write lyrics, one line per row…" className={cn(field, "resize-y")} />
        <div className="space-y-1">
          {lines.map((l, i) =>
            l.trim() ? (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-6 shrink-0 rounded bg-accent/25 text-center text-xs font-bold">{scheme[i]}</span>
                <span className="min-w-0 flex-1 truncate text-sub">{l}</span>
                <span className="shrink-0 tabular-nums font-semibold">{M.lineSyllables(l)}</span>
              </div>
            ) : null,
          )}
        </div>
        <Hint>Syllable counts are an English estimate. Letters on the left show lines that end with the same sound (A, B, C…).</Hint>
      </div>
    </AppFrame>
  );
}

/* 9 ─ Release rollout generator */
export function RolloutPlanner({ onBack, mobile }: P) {
  const [date, setDate] = useStored("roll.date", "");
  const [title, setTitle] = useStored("roll.title", "");
  const plan = date ? M.rolloutPlan(date) : [];
  const csv = `Date,Task,Details\n${plan.map((p) => `${p.date},"${p.title}","${p.detail}"`).join("\n")}`;
  return (
    <AppFrame title="Rollout planner" Icon={CalendarDays} iconClass="text-[#f97316]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <div className="grid grid-cols-2 gap-2">
          <Field title="Release title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
          </Field>
          <Field title="Release date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </Field>
        </div>
        {plan.map((p) => (
          <div key={p.offset} className={cn("flex gap-3 rounded-xl bg-black/25 px-3 py-2.5", p.offset === 0 && "ring-2 ring-accent/70")}>
            <div className="w-24 shrink-0 text-sm font-bold tabular-nums">{p.date}</div>
            <div className="min-w-0">
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs text-sub">{p.detail}</div>
            </div>
          </div>
        ))}
        {!plan.length && <Hint>Pick a release date to get a 10-step timeline from masters to the post-release push.</Hint>}
        {plan.length > 0 && (
          <button onClick={() => downloadText(`${(title || "release").replace(/\W+/g, "-")}-rollout.csv`, csv, "text/csv")} className={btn}>
            Download CSV
          </button>
        )}
      </div>
    </AppFrame>
  );
}

/* 10 ─ ISRC validator */
export function IsrcCheck({ onBack, mobile }: P) {
  const [v, setV] = useState("");
  const r = M.parseIsrc(v);
  return (
    <AppFrame title="ISRC validator" Icon={Fingerprint} iconClass="text-[#2dd4bf]" mobile={mobile} onBack={onBack}>
      <div className={cn(box, "space-y-3")}>
        <Field title="ISRC code">
          <input value={v} onChange={(e) => setV(e.target.value)} placeholder="US-RC1-76-07839" className={cn(field, "font-mono")} />
        </Field>
        {v && (
          <>
            <div className={cn("rounded-xl px-3 py-2.5 text-sm font-semibold", r.valid ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")}>{r.valid ? `Valid · ${r.normalized}` : "Not a valid ISRC (needs 2 letters, 3 letters/digits, 2-digit year, 5 digits)"}</div>
            {r.valid && (
              <div className="grid grid-cols-2 gap-2">
                <Stat k="Country" v={r.country} />
                <Stat k="Registrant" v={r.registrant} />
                <Stat k="Year" v={r.year} />
                <Stat k="Designation" v={r.designation} />
              </div>
            )}
          </>
        )}
        <Hint>An ISRC identifies one recording. Your distributor normally assigns it — never reuse the same code for a different recording.</Hint>
      </div>
    </AppFrame>
  );
}
