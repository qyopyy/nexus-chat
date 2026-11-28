"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, ExternalLink, FileText, Plus, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "@/store/app";
import { studioGo } from "@/store/studio";
import { prefillTakedown, type Platform } from "@/lib/takedown";
import { isLive, listSeals, saveCredits, sealConflicts, sealWork, updateWork, verifySeal, type SealRow, type ShieldWork } from "@/lib/shield";
import {
  MODE_LABEL,
  ROLES,
  SHIELD_PLATFORMS,
  allPlatforms,
  cleanCredits,
  creditIssues,
  creditsFromArtist,
  platformMode,
  platformsActive,
  protectionScore,
  setPlatformMode,
  type Credit,
  type Mode,
} from "@/lib/shieldPro";
import { cn } from "@/lib/utils";

const inp = "w-full min-w-0 rounded-lg border border-line bg-transparent px-2.5 py-2 text-sm outline-none focus:border-accent";
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/* ───────────────────────── command center (all songs) ───────────────────────── */
export function ShieldCommand({ works, onChange }: { works: ShieldWork[]; onChange: (w: ShieldWork) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const scored = useMemo(() => works.map((w) => ({ w, ...protectionScore(w) })), [works]);
  if (!works.length) return null;
  const avg = Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length);
  const sealed = works.filter((w) => w.meta_seal).length;
  const covered = works.filter((w) => platformsActive(w.platforms) > 0).length;
  const tally = new Map<string, number>();
  scored.forEach((x) => x.todo.forEach((t) => tally.set(t, (tally.get(t) ?? 0) + 1)));
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const bulk = async (id: string, label: string, patchFor: (w: ShieldWork) => Partial<ShieldWork> | null) => {
    setBusy(id);
    let n = 0;
    for (const w of works) {
      const p = patchFor(w);
      if (!p) continue;
      const x = await updateWork(w.id, p);
      if (x) {
        onChange(x);
        n++;
      }
    }
    setBusy(null);
    toast(n ? `${label}: ${n} song${n === 1 ? "" : "s"} updated` : "Nothing to change", n ? "success" : "info");
  };
  const sealAll = async () => {
    setBusy("seal");
    let n = 0;
    for (const w of works.filter((x) => !x.meta_seal)) {
      const r = await sealWork(w.id);
      if (r) {
        onChange({ ...w, meta_seal: r.seal, sealed_at: r.sealed_at });
        n++;
      }
    }
    setBusy(null);
    toast(n ? `Sealed ${n} song${n === 1 ? "" : "s"}` : "Everything is already sealed", n ? "success" : "info");
  };

  const ring = avg >= 80 ? "#34d399" : avg >= 50 ? "#fbbf24" : "#f87171";
  const act = "rounded-full bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active disabled:opacity-50";
  return (
    <div className="mb-4 rounded-3xl border border-line/70 bg-side p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${ring} ${avg * 3.6}deg, rgba(255,255,255,.1) 0)` }}>
          <div className="grid size-16 place-items-center rounded-full bg-side text-xl font-black tabular-nums">{avg}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold">Protection score</div>
          <div className="text-xs text-sub">
            {sealed}/{works.length} sealed · {covered}/{works.length} on platform watch · {works.filter(isLive).length} locked
          </div>
          {top.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-sub">
              {top.map(([t, n]) => (
                <li key={t}>
                  • {t} <span className="text-faint">({n} song{n === 1 ? "" : "s"})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!!busy} className={act} onClick={() => void bulk("lock", "Lockdown", (w) => (isLive(w) ? null : { status: "locked", unlock_at: null }))}>
          🔒 {busy === "lock" ? "Locking…" : "Lock everything"}
        </button>
        <button disabled={!!busy} className={act} onClick={() => void bulk("tt", "TikTok block", (w) => ({ block_where: [...new Set([...(w.block_where ?? []), "sound", "short", "video"])] }))}>
          🎵 TikTok block on all
        </button>
        <button disabled={!!busy} className={act} onClick={() => void bulk("strict", "Strict matching", (w) => (w.strict && w.notify_owner !== false ? null : { strict: true, notify_owner: true }))}>
          🔎 Strict + alerts on all
        </button>
        <button disabled={!!busy} className={act} onClick={() => void bulk("plat", "Platform watch", (w) => ({ platforms: allPlatforms("block") }))}>
          🌐 Protect every platform
        </button>
        <button disabled={!!busy} className={act} onClick={() => void sealAll()}>
          🔏 {busy === "seal" ? "Sealing…" : "Seal all metadata"}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── per-song panel ───────────────────────── */
export function ProPanel({ w, onChange }: { w: ShieldWork; onChange: (w: ShieldWork) => void }) {
  const { score, todo } = protectionScore(w);
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-black/20 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-sub">Protection score</span>
          <b className="tabular-nums">{score}/100</b>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/30">
          <div className={cn("h-full rounded-full", score >= 80 ? "bg-emerald-400" : score >= 50 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${score}%` }} />
        </div>
        {todo.length > 0 && <div className="mt-1.5 text-[11px] text-sub">Next: {todo.slice(0, 3).join(" · ")}</div>}
      </div>
      <CreditsSeal w={w} onChange={onChange} />
      <PlatformMatrix w={w} onChange={onChange} />
      <AccessExtras w={w} onChange={onChange} />
    </div>
  );
}

/* ───────────────────────── credits + seal ───────────────────────── */
function CreditsSeal({ w, onChange }: { w: ShieldWork; onChange: (w: ShieldWork) => void }) {
  const initial = useMemo(() => (w.credits?.length ? w.credits : creditsFromArtist(w.artist)), [w.credits, w.artist]);
  const [rows, setRows] = useState<Credit[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [seals, setSeals] = useState<SealRow[] | null>(null);
  const [dupes, setDupes] = useState<{ kind: string; n: number }[]>([]);
  const dirty = JSON.stringify(cleanCredits(rows)) !== JSON.stringify(cleanCredits(w.credits ?? []));
  const issues = creditIssues(rows);

  useEffect(() => setRows(initial), [initial]);
  useEffect(() => {
    let live = true;
    void sealConflicts(w.id).then((d) => live && setDupes(d));
    if (w.meta_seal) void verifySeal(w.id).then((v) => live && setValid(v));
    else setValid(null);
    return () => {
      live = false;
    };
  }, [w.id, w.meta_seal, w.updated_at, w.credits, w.title, w.isrc, w.upc]);

  const patch = (i: number, p: Partial<Credit>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy("save");
    const x = await saveCredits(w.id, rows);
    setBusy(null);
    if (x) {
      onChange(x);
      toast("Credits saved", "success");
    }
  };
  const seal = async () => {
    setBusy("seal");
    let cur = w;
    if (dirty) {
      const x = await saveCredits(w.id, rows);
      if (!x) return setBusy(null);
      cur = x;
    }
    const r = await sealWork(w.id);
    setBusy(null);
    if (!r) return;
    onChange({ ...cur, meta_seal: r.seal, sealed_at: r.sealed_at });
    setSeals(null);
    toast("Metadata sealed 🔏", "success");
  };
  const showHistory = async () => setSeals(await listSeals(w.id));
  const certificate = async () => {
    const list = seals ?? (await listSeals(w.id));
    const s = list[0];
    if (!s) return toast("Seal the metadata first", "info");
    const c = s.snapshot.credits ?? [];
    const html = `<!doctype html><meta charset="utf-8"><title>Shield 360 certificate — ${esc(s.snapshot.title)}</title><style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111}h1{margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:13px}code{word-break:break-all;font-size:12px}.s{background:#f4f4f6;padding:12px;border-radius:8px}</style>
<h1>Shield 360 · Metadata certificate</h1><div>Sealed ${esc(fmtDate(s.created_at))} (server time)</div>
<h2>${esc(s.snapshot.title)}</h2>
<table><tr><th>Artist</th><td>${esc(s.snapshot.artist || "—")}</td></tr><tr><th>ISRC</th><td>${esc(s.snapshot.isrc || "—")}</td></tr><tr><th>UPC / EAN</th><td>${esc(s.snapshot.upc || "—")}</td></tr><tr><th>Audio SHA-256</th><td><code>${esc(s.snapshot.sha256 || "—")}</code></td></tr></table>
<h3>Credits</h3><table><tr><th>Name</th><th>Role</th><th>Split</th><th>IPI</th></tr>${c.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${x.split != null ? esc(x.split) + "%" : ""}</td><td>${esc(x.ipi || "")}</td></tr>`).join("") || "<tr><td colspan=4>—</td></tr>"}</table>
<div class="s"><b>Seal (SHA-256)</b><br><code>${esc(s.seal)}</code></div>
<p style="color:#666;font-size:12px">This seal fingerprints the title, artists, codes, credits and audio hash exactly as stored on Nexus at the time above. If any of them is changed later, the seal no longer verifies until it is re-sealed, and every earlier seal stays on record.</p><script>setTimeout(()=>print(),300)</script>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const state = !w.meta_seal ? "none" : valid === null ? "check" : valid ? "ok" : "changed";
  return (
    <details className="group rounded-xl bg-black/20 p-3" open={!w.meta_seal || state === "changed"}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <Award className="size-4" /> Credits &amp; metadata seal
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold", state === "ok" ? "bg-emerald-500/20 text-emerald-300" : state === "changed" ? "bg-red-500/20 text-red-300" : "bg-white/10 text-sub")}>
          {state === "ok" ? "Sealed ✓" : state === "changed" ? "Changed since seal" : state === "check" ? "Checking…" : "Not sealed"}
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-sub">List every artist and contributor on this song. The seal locks title, artists, codes and audio into a tamper-evident, server-timestamped record you can show as proof.</p>
        {rows.map((c, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 rounded-lg bg-black/20 p-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_6.5rem_auto]">
            <input className={cn(inp, "col-span-1")} placeholder="Name" value={c.name} maxLength={120} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Name" />
            <button type="button" onClick={() => setRows((r) => r.filter((_, k) => k !== i))} className="grid size-9 place-items-center rounded-lg text-sub hover:bg-hover hover:text-red-400 sm:order-last" aria-label="Remove credit">
              <Trash2 className="size-4" />
            </button>
            <select className={cn(inp, "col-span-2 sm:col-span-1")} value={c.role} onChange={(e) => patch(i, { role: e.target.value })} aria-label="Role">
              {[...new Set([...ROLES, c.role])].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input className={inp} inputMode="decimal" placeholder="Split %" value={c.split ?? ""} onChange={(e) => patch(i, { split: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Split percent" />
            <input className={inp} inputMode="numeric" placeholder="IPI (opt.)" value={c.ipi ?? ""} onChange={(e) => patch(i, { ipi: e.target.value.replace(/\D/g, "").slice(0, 11) })} aria-label="IPI number" />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRows((r) => [...r, { name: "", role: r.some((x) => x.role === "Primary artist") ? "Featured artist" : "Primary artist" }])} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold">
            <Plus className="size-3.5" /> Add artist / credit
          </button>
          <button type="button" onClick={() => setRows(creditsFromArtist(w.artist))} className="rounded-full bg-hover px-3 py-1.5 text-xs font-semibold">
            Split from “{(w.artist ?? "artist").slice(0, 24)}”
          </button>
        </div>
        {issues.length > 0 && (
          <ul className="space-y-0.5 text-xs text-amber-300">
            {issues.map((t) => (
              <li key={t}>⚠ {t}</li>
            ))}
          </ul>
        )}
        {dupes.length > 0 && (
          <div className="flex gap-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Heads-up: other Nexus registrations share this {dupes.map((d) => `${d.kind === "audio" ? "audio file" : d.kind.toUpperCase()} (${d.n})`).join(" and ")}. Your seal still proves when <i>you</i> registered it.
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy || !dirty} onClick={() => void save()} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy === "save" ? "Saving…" : "Save credits"}
          </button>
          <button disabled={!!busy} onClick={() => void seal()} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            <ShieldCheck className="size-4" /> {busy === "seal" ? "Sealing…" : w.meta_seal ? "Re-seal metadata" : "Seal metadata"}
          </button>
          {w.meta_seal && (
            <button onClick={() => void certificate()} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold">
              <FileText className="size-4" /> Certificate
            </button>
          )}
        </div>
        {w.meta_seal && (
          <div className="text-[11px] text-sub">
            Seal <code className="break-all">{w.meta_seal.slice(0, 16)}…</code> · {fmtDate(w.sealed_at)}{" "}
            <button onClick={() => void showHistory()} className="underline">
              history
            </button>
            {seals && (
              <ul className="mt-1 space-y-0.5">
                {seals.map((s) => (
                  <li key={s.id}>
                    {fmtDate(s.created_at)} · <code>{s.seal.slice(0, 10)}…</code> · {s.snapshot.credits?.length ?? 0} credits
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

/* ───────────────────────── platform protection matrix ───────────────────────── */
function PlatformMatrix({ w, onChange }: { w: ShieldWork; onChange: (w: ShieldWork) => void }) {
  const [busy, setBusy] = useState(false);
  const q = w.isrc || `${w.title} ${w.artist ?? ""}`.trim();
  const save = async (platforms: Record<string, string>) => {
    setBusy(true);
    const x = await updateWork(w.id, { platforms });
    setBusy(false);
    if (x) onChange(x);
  };
  const kit = (id: string) => {
    const p = SHIELD_PLATFORMS.find((x) => x.id === id)!;
    if (!p.takedown) return p.form && window.open(p.form, "_blank", "noopener");
    prefillTakedown({
      platform: p.takedown as Platform,
      work_title: w.title,
      work_artist: w.artist ?? "",
      description: `I am the rights holder of “${w.title}”${w.artist ? ` by ${w.artist}` : ""}${w.isrc ? ` (ISRC ${w.isrc})` : ""}. This content was not authorised by me. It is registered and sealed in Nexus Shield 360${w.sealed_at ? ` (sealed ${new Date(w.sealed_at).toISOString().slice(0, 10)})` : ""}.`,
    });
    studioGo("takedowns");
    toast("Takedown notice filled in — check it and send", "info");
  };
  const active = platformsActive(w.platforms);
  const groups: ["dsp" | "social", string][] = [["social", "Social & video"], ["dsp", "Streaming & stores"]];
  return (
    <details className="rounded-xl bg-black/20 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        🌐 Platform protection
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-sub">{active}/{SHIELD_PLATFORMS.length} on</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-sub">
          Choose what you want on each platform: <b>Watch</b> = check regularly and flag copies, <b>Block</b> = a ready-to-send takedown notice for anything found, <b>Claim</b> = claim &amp; monetise (YouTube Content ID / Meta Rights Manager). Platforms run their own enforcement — Nexus prepares and tracks it.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["watch", "block"] as Mode[]).map((m) => (
            <button key={m} disabled={busy} onClick={() => void save(allPlatforms(m))} className="rounded-full bg-hover px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
              {MODE_LABEL[m]} everywhere
            </button>
          ))}
          <button disabled={busy} onClick={() => void save({})} className="rounded-full bg-hover px-3 py-1.5 text-xs font-semibold text-sub disabled:opacity-50">
            Clear
          </button>
        </div>
        {groups.map(([kind, title]) => (
          <div key={kind}>
            <div className="mb-1 text-[11px] font-bold tracking-wide text-faint uppercase">{title}</div>
            <div className="space-y-1.5">
              {SHIELD_PLATFORMS.filter((p) => p.kind === kind).map((p) => {
                const mode = platformMode(w.platforms, p.id);
                return (
                  <div key={p.id} className="rounded-lg bg-black/20 p-2">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block truncate text-[11px] text-sub">{p.hint}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <div className="flex rounded-full bg-black/30 p-0.5 text-xs">
                        {p.modes.map((m) => (
                          <button key={m} disabled={busy} onClick={() => void save(setPlatformMode(w.platforms, p.id, m))} className={cn("rounded-full px-2.5 py-1 font-semibold", mode === m ? (m === "off" ? "bg-white/15" : "bg-accent text-white") : "text-sub")}>
                            {MODE_LABEL[m]}
                          </button>
                        ))}
                      </div>
                      {mode !== "off" && (
                        <>
                          <a href={p.search(q)} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-xs font-semibold">
                            <ExternalLink className="size-3" /> Search
                          </a>
                          {(mode === "block" || mode === "claim") && (
                            <button onClick={() => kit(p.id)} className="rounded-full bg-hover px-2.5 py-1 text-xs font-semibold">
                              {p.takedown ? "Takedown notice" : "Report form"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

/* ───────────────────────── access extras ───────────────────────── */
function AccessExtras({ w, onChange }: { w: ShieldWork; onChange: (w: ShieldWork) => void }) {
  const [busy, setBusy] = useState(false);
  const toLocal = (s?: string | null) => (s ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const run = async (p: Partial<ShieldWork>, msg: string) => {
    setBusy(true);
    const x = await updateWork(w.id, p);
    setBusy(false);
    if (x) {
      onChange(x);
      toast(msg, "success");
    }
  };
  return (
    <div className="space-y-2 rounded-xl bg-black/20 p-3">
      <div className="text-sm font-semibold">🔑 Access controls</div>
      {w.allow_users.length > 0 ? (
        <label className="block text-xs text-sub">
          Collaborator access ends
          <div className="mt-1 flex gap-2">
            <input type="datetime-local" className={cn(inp, "[color-scheme:dark]")} value={toLocal(w.allow_until)} onChange={(e) => void run({ allow_until: e.target.value ? new Date(e.target.value).toISOString() : null }, e.target.value ? "Access will expire" : "Access never expires")} />
            {w.allow_until && (
              <button onClick={() => void run({ allow_until: null }, "Access never expires")} className="shrink-0 rounded-lg bg-hover px-3 text-xs font-semibold">
                Never
              </button>
            )}
          </div>
        </label>
      ) : (
        <p className="text-xs text-sub">Allow someone above to set an expiry on their access.</p>
      )}
      {!isLive(w) && (
        <button disabled={busy} onClick={() => void run({ status: "locked", unlock_at: null }, "Locked again 🔒")} className="rounded-full bg-red-500/20 px-4 py-2 text-sm font-bold text-red-200 disabled:opacity-50">
          🚨 Panic lock — block it again now
        </button>
      )}
    </div>
  );
}
