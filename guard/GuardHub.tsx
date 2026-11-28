"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp, toast, openModal } from "@/store/app";
import { mfaListFactors } from "@/lib/mfa";
import { loadNetPrefs, saveNetPrefs, type NetPrefs } from "@/lib/netPrefs";
import {
  loadManual, saveManual, scanLink, watchAdd, watchAlerts, watchList, watchRemove, watchRescan,
  type GuardVerdict, type GuardWatch,
} from "@/lib/guard";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const TONE = {
  safe: { label: "Safe", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", dot: "#34d399" },
  suspicious: { label: "Suspicious", cls: "bg-amber-500/15 text-amber-300 ring-amber-400/30", dot: "#fbbf24" },
  danger: { label: "Dangerous", cls: "bg-red-500/15 text-red-300 ring-red-400/30", dot: "#f87171" },
} as const;

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-[#111114] p-5 ring-1 ring-white/[.06]">
      <h2 className="font-serif text-2xl">{title}</h2>
      {sub && <p className="mt-1 text-[13px] leading-snug text-[#a39e96]">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const color = pct >= 80 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#f87171";
  return (
    <svg viewBox="0 0 110 110" className="size-28 shrink-0 -rotate-90">
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s" }} />
      <text x="55" y="61" textAnchor="middle" className="rotate-90 fill-white text-[26px] font-bold" style={{ transformOrigin: "55px 55px" }}>{pct}</text>
    </svg>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-white/15"}`}>
      <span className={`absolute top-0.5 size-6 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function VerdictCard({ v }: { v: GuardVerdict }) {
  const t = TONE[v.verdict];
  return (
    <div className="mt-3 rounded-2xl bg-white/[.04] p-4">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${t.cls}`}>{t.label}</span>
        <span className="truncate text-sm text-[#a39e96]">{v.host}</span>
        {v.tracker && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#a39e96]">tracker</span>}
      </div>
      {v.final_url !== v.url && <p className="mt-2 break-all text-[12px] text-[#a39e96]">Goes to: {v.final_url}</p>}
      <ul className="mt-3 space-y-1.5">
        {v.reasons.map((r, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug">
            <span>{r.level === "bad" ? "🚫" : r.level === "warn" ? "⚠️" : "ℹ️"}</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MANUAL: { id: string; title: string; body: string }[] = [
  { id: "dns", title: "Ad-blocking DNS installed", body: "Install an encrypted DNS profile (AdGuard, NextDNS, Cloudflare Security…) so ads, trackers and malware domains are blocked in every app." },
  { id: "relay", title: "iCloud Private Relay on", body: "Settings → your name → iCloud → Private Relay. Hides your IP and browsing from sites and networks." },
  { id: "mail", title: "Mail Privacy Protection on", body: "Settings → Mail → Privacy Protection. Stops senders from seeing when and where you open email." },
  { id: "sdp", title: "Stolen Device Protection on", body: "Settings → Face ID & Passcode → Stolen Device Protection. Protects your Apple ID if your phone and passcode are stolen." },
  { id: "update", title: "iOS is up to date", body: "Settings → General → Software Update, with automatic updates on. This is the single biggest protection against malware." },
];

export default function GuardHub() {
  const userId = useApp((s) => s.userId);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GuardVerdict | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<GuardWatch[]>([]);
  const [net, setNet] = useState<NetPrefs | null>(null);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [has2fa, setHas2fa] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setList(await watchList());
    } catch (e) {
      setErr((e as Error).message);
    }
    const f = await mfaListFactors();
    setHas2fa(f.all.some((x) => x.status === "verified"));
    setHasKey(f.webauthn.some((x) => x.status === "verified"));
  }, [userId]);

  useEffect(() => {
    setNet(loadNetPrefs());
    setManual(loadManual());
    void refresh();
  }, [refresh]);

  const setNetPref = (patch: Partial<NetPrefs>) => {
    const next = { ...(net ?? loadNetPrefs()), ...patch };
    setNet(next);
    saveNetPrefs(next);
  };
  const setMan = (id: string, v: boolean) => {
    const next = { ...manual, [id]: v };
    setManual(next);
    saveManual(next);
  };

  const checks = useMemo(
    () => [
      { id: "2fa", done: has2fa },
      { id: "key", done: hasKey },
      { id: "strip", done: !!net?.stripTrackers },
      { id: "proxy", done: !!net?.mediaProxy },
      { id: "calls", done: !!net?.relayCalls },
      { id: "watch", done: list.length > 0 },
      ...MANUAL.map((m) => ({ id: m.id, done: !!manual[m.id] })),
    ],
    [has2fa, hasKey, net, list.length, manual],
  );
  const pct = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

  async function scan() {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await scanLink(url.trim()));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function watch() {
    if (!result || !userId) return toast("Sign in to watch links 24/7", "error");
    try {
      await watchAdd(result, userId);
      toast("Watching 24/7 — you'll get an alert from Nexus if it turns bad", "success");
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-xl space-y-4 px-5 py-8 pb-24">
        <Link href="/" className="text-[13px] text-[#a39e96]">← Back to Nexus</Link>
        <p className="text-[11px] font-semibold tracking-[0.28em] text-[#7ee0c6] uppercase">Nexus Guard</p>
        <h1 className="font-serif text-4xl">Protection, on all the time.</h1>

        <section className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-[#10261f] to-[#0c1311] p-5 ring-1 ring-emerald-400/20">
          <Ring pct={pct} />
          <div>
            <div className="text-lg font-bold">{pct >= 80 ? "Well protected" : pct >= 50 ? "Getting there" : "Needs attention"}</div>
            <p className="mt-1 text-[13px] leading-snug text-[#a8bdb5]">
              {checks.filter((c) => c.done).length} of {checks.length} protections on. Scores your account, privacy settings and watchlist.
            </p>
          </div>
        </section>

        <Card title="Link Shield" sub="Paste any link before you tap it. Checks scam patterns and malware/phishing blocklists, and unwraps short links.">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void scan()}
              placeholder="https://…"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className="min-w-0 flex-1 rounded-xl bg-white/[.06] px-4 py-3 text-[15px] outline-none ring-1 ring-white/10 focus:ring-emerald-400/50"
            />
            <button type="button" disabled={busy || !url.trim()} onClick={() => void scan()} className="rounded-xl bg-emerald-500 px-5 text-[15px] font-bold text-black disabled:opacity-40">
              {busy ? "…" : "Scan"}
            </button>
          </div>
          {err && <p className="mt-3 text-[13px] text-red-300">{err}</p>}
          {result && (
            <>
              <VerdictCard v={result} />
              <button type="button" onClick={() => void watch()} className="mt-3 w-full rounded-xl bg-white/10 py-3 text-[14px] font-semibold active:bg-white/15">
                👁 Watch this link 24/7
              </button>
            </>
          )}
        </Card>

        <Card title="24/7 watchlist" sub="Nexus re-checks these every 3 hours and messages you the moment one turns suspicious or dangerous — even with the app closed.">
          {!userId ? (
            <p className="text-[13px] text-[#a39e96]">Sign in to keep a watchlist.</p>
          ) : list.length === 0 ? (
            <p className="text-[13px] text-[#a39e96]">Nothing watched yet. Scan a link and tap “Watch 24/7” — handy for your own pages, pre-save links and bio links.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((w) => (
                <li key={w.id} className="rounded-2xl bg-white/[.04] p-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: TONE[w.verdict].dot }} />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{w.url.replace(/^https?:\/\//, "")}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${TONE[w.verdict].cls}`}>{TONE[w.verdict].label}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[12px] text-[#a39e96]">
                    <span className="flex-1">Checked {ago(w.last_scan)}</span>
                    <label className="flex items-center gap-1.5">
                      Alerts
                      <Toggle on={w.alerts_on} label="Alerts" onChange={(v) => void watchAlerts(w.id, v).then(refresh).catch((e) => toast(e.message, "error"))} />
                    </label>
                    <button type="button" className="font-semibold text-emerald-300" onClick={() => void watchRescan(w).then(() => refresh()).catch((e) => toast(e.message, "error"))}>Rescan</button>
                    <button type="button" className="font-semibold text-red-300" onClick={() => void watchRemove(w.id).then(refresh).catch((e) => toast(e.message, "error"))}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your protections">
          <ul className="divide-y divide-white/[.06]">
            <Row done={has2fa} title="Two-factor authentication" body="Authy, passkey or security key on your account." action="Set up" onAction={() => openModal("settings", "account")} />
            <Row done={hasKey} title="Passkey or hardware key" body="Flipper Zero, YubiKey or Face ID passkey as a second factor." action="Link" onAction={() => openModal("settings", "account")} />
            <Row done={!!net?.stripTrackers} title="Strip tracking from links" body="Removes utm_, fbclid and similar junk from links you send." toggle={(v) => setNetPref({ stripTrackers: v })} />
            <Row done={!!net?.mediaProxy} title="Hide my IP in link previews" body="Previews load through Nexus so sites never see your address." toggle={(v) => setNetPref({ mediaProxy: v })} />
            <Row done={!!net?.relayCalls} title="Relay calls" body="Other people never see your IP during calls." toggle={(v) => setNetPref({ relayCalls: v })} />
            <Row done={list.length > 0} title="Link watchlist" body="At least one link watched around the clock." />
            {MANUAL.map((m) => (
              <Row
                key={m.id}
                done={!!manual[m.id]}
                title={m.title}
                body={m.body}
                toggle={(v) => setMan(m.id, v)}
                action={m.id === "dns" ? "Get profile" : undefined}
                onAction={m.id === "dns" ? () => openModal("settings", "network") : undefined}
              />
            ))}
          </ul>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/defend" className="rounded-3xl bg-gradient-to-br from-[#1c1830] to-[#101018] p-4 ring-1 ring-white/[.08] active:scale-[0.98]">
            <span className="text-3xl">🧪</span>
            <div className="mt-1 text-lg font-bold">File check</div>
            <div className="text-[13px] leading-snug text-[#a39e96]">Inspect an APK or file before you open it.</div>
          </Link>
          <button type="button" onClick={() => openModal("settings", "network")} className="rounded-3xl bg-gradient-to-br from-[#1c1830] to-[#101018] p-4 text-left ring-1 ring-white/[.08] active:scale-[0.98]">
            <span className="text-3xl">🚫</span>
            <div className="mt-1 text-lg font-bold">Ad &amp; tracker block</div>
            <div className="text-[13px] leading-snug text-[#a39e96]">Encrypted DNS for your whole phone — AdGuard, NextDNS and more.</div>
          </button>
        </div>

        <p className="px-1 text-[12px] leading-relaxed text-[#7d7971]">
          Honest note: iPhone doesn’t let any app scan other apps or your files, so no app — Nexus included — can be a full device antivirus on iOS. Guard protects the places Nexus can: your links, your DNS, your account and your watched pages.
        </p>
      </main>
    </div>
  );
}

function Row({ done, title, body, toggle, action, onAction }: { done: boolean; title: string; body: string; toggle?: (v: boolean) => void; action?: string; onAction?: () => void }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-bold ${done ? "bg-emerald-500 text-black" : "bg-white/10 text-[#a39e96]"}`}>{done ? "✓" : ""}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="text-[12.5px] leading-snug text-[#a39e96]">{body}</div>
        {action && !done && onAction && (
          <button type="button" onClick={onAction} className="mt-1.5 text-[13px] font-semibold text-emerald-300">{action} →</button>
        )}
      </div>
      {toggle && <Toggle on={done} onChange={toggle} label={title} />}
    </li>
  );
}
