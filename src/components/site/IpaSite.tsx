"use client";

import { useCallback, useEffect, useState } from "react";
import { Apple, Check, Copy, Download, Monitor, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import SiteFrame from "./SiteFrame";
import { IPA_KIND_META, fetchLatestAll, type IpaKind, type LatestIpa } from "@/lib/ipaDownloads";

type Kind = IpaKind | "android" | "windows" | "mac";
type Builds = Partial<Record<Kind, LatestIpa | null>>;

const SIDELOAD: IpaKind[] = ["nexus", "wump", "browser", "link", "distro", "untitled"];
const SIGNED: IpaKind[] = ["appstore", "wump-appstore", "browser-appstore", "link-appstore"];
const PLATFORMS: { kind: Kind; name: string; note: string; Icon: typeof Monitor }[] = [
  { kind: "android", name: "Android", note: "APK. Open it on your phone and allow installs from your browser if asked.", Icon: Smartphone },
  { kind: "windows", name: "Windows", note: "Desktop app with notifications and a tray icon.", Icon: Monitor },
  { kind: "mac", name: "macOS", note: "Desktop app for Apple silicon and Intel.", Icon: Apple },
];

const ago = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = Math.max(0, Date.now() - +new Date(iso));
  const m = Math.floor(d / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  const days = Math.floor(m / 1440);
  return days < 45 ? `${days} day${days === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString();
};
const size = (n?: number) => (!n ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(n >= 1.05e8 ? 0 : 1)} MB` : `${Math.round(n / 1024)} KB`);

function Card({ kind, label, sub, b, hot, Icon }: { kind: Kind; label: string; sub: string; b: LatestIpa | null | undefined; hot: boolean; Icon: typeof Monitor }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${location.origin}/api/ipa/file?kind=${kind}`;
  return (
    <li id={kind} className={`scroll-mt-24 rounded-2xl bg-white/[.04] p-4 ring-1 transition ${hot ? "ring-[#5865f2]" : "ring-white/10"}`} data-testid="build" data-kind={kind}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{label}</div>
          <div className="truncate text-xs text-white/50">{sub}</div>
          {b ? (
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-white/70" data-testid="meta">
              <span className="font-semibold text-white">Version {b.version ?? b.tag}</span>
              {b.publishedAt && <span>{ago(b.publishedAt)}</span>}
              {b.size ? <span>{size(b.size)}</span> : null}
            </div>
          ) : (
            <div className="mt-1 text-xs text-white/45">{b === null ? "Not published yet" : "Checking…"}</div>
          )}
        </div>
      </div>
      {b?.notes ? <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-white/55">{b.notes}</p> : null}
      <div className="mt-3 flex gap-2">
        <a
          href={b ? `/api/ipa/file?kind=${kind}` : undefined}
          aria-disabled={!b}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ${b ? "bg-white text-black" : "pointer-events-none bg-white/10 text-white/40"}`}
        >
          <Download className="size-4" /> Download
        </a>
        <button
          disabled={!b}
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1800)));
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2.5 text-sm font-semibold disabled:opacity-40"
          aria-label={`Copy the always-latest link for ${label}`}
        >
          {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />} {copied ? "Copied" : "Link"}
        </button>
      </div>
    </li>
  );
}

export default function IpaSite() {
  const [builds, setBuilds] = useState<Builds>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);
  const [checked, setChecked] = useState<string | null>(null);
  const [hash, setHash] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    const r = await fetchLatestAll();
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setErr("");
    setBuilds(r.builds);
    setChecked(r.checkedAt);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    const vis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", vis);
    return () => (clearInterval(t), document.removeEventListener("visibilitychange", vis));
  }, [load]);
  useEffect(() => {
    const h = () => setHash(location.hash.slice(1));
    h();
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (hash && Object.keys(builds).length) document.getElementById(hash)?.scrollIntoView({ block: "center" });
  }, [hash, builds]);

  return (
    <SiteFrame active="/download">
      <section className="mx-auto max-w-3xl px-4 pt-10 text-center sm:px-6 sm:pt-16">
        <h1 className="site-rise text-4xl font-black tracking-tight sm:text-5xl">Nexus downloads</h1>
        <p className="site-rise mx-auto mt-3 max-w-xl text-white/65 sm:text-lg" style={{ animationDelay: "80ms" }}>
          Every download is the newest build, every time. Save a link once and it keeps working.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/50">
          <button onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/80">
            <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> Check for new versions
          </button>
          {checked && <span data-testid="checked">Checked {ago(checked)}</span>}
        </div>
      </section>

      <main className="mx-auto mt-8 max-w-3xl space-y-8 px-4 pb-24 sm:px-6">
        {err && (
          <div role="alert" className="rounded-2xl bg-amber-400/10 p-4 text-sm text-amber-100 ring-1 ring-amber-300/20" data-testid="load-error">
            {err}{" "}
            <button onClick={() => void load()} className="font-bold underline underline-offset-2">
              Try again
            </button>
          </div>
        )}

        <section aria-labelledby="h-iphone">
          <h2 id="h-iphone" className="mb-1 text-lg font-black">
            iPhone and iPad
          </h2>
          <p className="mb-3 text-sm text-white/55">Install these with Sideloadly on a computer (steps below). Free Apple IDs need a refresh every 7 days.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SIDELOAD.map((k) => (
              <Card key={k} kind={k} label={IPA_KIND_META[k].label.replace(" (Sideloadly)", "")} sub={IPA_KIND_META[k].bundleId} b={builds[k]} hot={hash === k} Icon={Smartphone} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="h-signed">
          <h2 id="h-signed" className="mb-1 text-lg font-black">
            App Store signed
          </h2>
          <p className="mb-3 text-sm text-white/55">For uploading through Apple’s Transporter or for TestFlight. Not for Sideloadly.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SIGNED.map((k) => (
              <Card key={k} kind={k} label={IPA_KIND_META[k].label.replace(" (App Store signed)", "")} sub={IPA_KIND_META[k].bundleId} b={builds[k]} hot={hash === k} Icon={ShieldCheck} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="h-desk">
          <h2 id="h-desk" className="mb-3 text-lg font-black">
            Android and desktop
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map((p) => (
              <Card key={p.kind} kind={p.kind} label={p.name} sub={p.note} b={builds[p.kind]} hot={hash === p.kind} Icon={p.Icon} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="h-how" className="space-y-2">
          <h2 id="h-how" className="text-lg font-black">
            How to install on iPhone
          </h2>
          <details className="rounded-2xl bg-white/[.04] p-4 ring-1 ring-white/10" open>
            <summary className="cursor-pointer font-bold">With Sideloadly (Windows or Mac)</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-white/70">
              <li>Install Sideloadly on your computer and plug in your iPhone.</li>
              <li>Download the .ipa above and drag it into Sideloadly.</li>
              <li>Enter your Apple ID and press Start.</li>
              <li>On the iPhone: Settings, General, VPN &amp; Device Management, trust your Apple ID.</li>
              <li>Open the app. Repeat the steps every 7 days with a free Apple ID.</li>
            </ol>
          </details>
          <details className="rounded-2xl bg-white/[.04] p-4 ring-1 ring-white/10">
            <summary className="cursor-pointer font-bold">With AltStore or SideStore</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-white/70">
              <li>On your iPhone, open the downloaded .ipa in Files, tap Share and choose AltStore (or SideStore).</li>
              <li>Sign in with your Apple ID if asked and wait for it to install.</li>
            </ol>
          </details>
          <details className="rounded-2xl bg-white/[.04] p-4 ring-1 ring-white/10">
            <summary className="cursor-pointer font-bold">Updating</summary>
            <p className="mt-3 text-sm text-white/70">Download again from the same button or saved link and install over the old app. Your data stays on your account.</p>
          </details>
        </section>
      </main>
    </SiteFrame>
  );
}
