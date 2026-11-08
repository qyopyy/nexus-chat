"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChartColumn, Check, Coins, Link2, Palette, Plus, ShieldCheck, Split, Upload } from "lucide-react";
import { supabase, isConfigured } from "@/lib/supabase";
import { brandVars, loadBrands, useBrand } from "@/lib/distBrand";
import { PLANS } from "@/lib/premium";
import { cn } from "@/lib/utils";

const STORES = ["Spotify", "Apple Music", "TikTok", "YouTube Music", "Amazon Music", "Deezer", "Tidal", "Instagram", "Snapchat", "SoundCloud", "Pandora", "Shazam"];

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { icon: Upload, title: "One upload, every store", body: "Audio, cover and credits once. We check it, then send it to 150+ stores and socials." },
  { icon: ChartColumn, title: "Stats that make sense", body: "Link views, store clicks, countries and top releases on one overview." },
  { icon: Split, title: "Splits built in", body: "Add collaborators and their share per track. Everyone sees what they're owed." },
  { icon: Coins, title: "Earnings in one place", body: "Royalty reports by month, store and release, with lifetime totals." },
  { icon: Link2, title: "Smart links & pre-saves", body: "Every release gets a page that sends fans to the store they already use." },
  { icon: ShieldCheck, title: "Protection included", body: "Shield 360, Content ID scans and Profile Defender keep leaks and fakes off." },
];

const FAQ: [string, string][] = [
  ["Do I keep my rights?", "Yes. You own your masters. We only get the permission needed to deliver and collect for you, and you can take a release down whenever you like."],
  ["How long until my release is live?", "Most releases are reviewed within a couple of days. Give yourself two to three weeks before the release date so pre-saves and pitching have time to work."],
  ["Which stores do you send to?", "Spotify, Apple Music, TikTok, YouTube Music, Amazon, Deezer, Tidal, Instagram, Snapchat and more than 150 others."],
  ["Can I use my own label name and logo?", "Yes. Labels can white-label the workspace with their own name, logo and colour, so artists see your brand instead of ours."],
  ["Do I get ISRC and UPC codes?", "Yes, every release gets them for free. Already have your own? Add them on the release."],
];

/** Public distribution landing at /distro — workspace lives at /distro/app. */
export default function DistroLanding() {
  const brand = useBrand();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => {
    void loadBrands();
    if (isConfigured) void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const plans = PLANS.filter((p) => p.rank >= 3);
  const cta = signedIn ? "Open your workspace" : "Start releasing";

  return (
    <div className="dx dx-scroll min-h-dvh overflow-x-hidden" data-dx-theme={brand.theme} style={brandVars(brand.accent)}>
      {/* nav */}
      <header className="sticky top-0 z-20 border-b border-[var(--dx-line)] bg-[var(--dx-bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-6 px-4">
          <Link href="/distro" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center overflow-hidden bg-[var(--dx-hi)] text-[11px] font-black text-black">
              {brand.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo_url} alt="" className="size-full object-cover" />
              ) : (
                brand.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <span className="text-[15px] font-semibold">{brand.name}</span>
          </Link>
          <nav className="hidden gap-5 text-[14px] text-[var(--dx-sub)] md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#white-label" className="hover:text-white">For labels</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </nav>
          <div className="ml-auto flex gap-2">
            {!signedIn && (
              <Link href="/distro/app" className="dx-btn dx-btn-sm max-sm:hidden">
                Log in
              </Link>
            )}
            <Link href="/distro/app" className="dx-btn dx-btn-primary dx-btn-sm">
              {signedIn ? "Workspace" : "Get started"}
            </Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden border-b border-[var(--dx-line)]">
        <div className="absolute inset-0" style={{ background: `radial-gradient(80% 90% at 15% 0%, ${brand.accent}30, transparent 60%), radial-gradient(70% 80% at 100% 100%, ${brand.theme === "999" ? "#e1060026" : "#5b3cff30"}, transparent 60%)` }} />
        <div className="dx-grain absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1180px] gap-10 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <span className="dx-tag">Music distribution</span>
            <h1 className="mt-4 text-[44px] leading-[1.02] font-medium tracking-[-0.03em] sm:text-[64px]">
              Put your music
              <br />
              everywhere.
              <br />
              <span className="text-[var(--dx-muted)]">Keep all of it.</span>
            </h1>
            <p className="mt-5 max-w-[480px] text-[17px] text-[var(--dx-sub)]">{(brand.custom && brand.tagline) || "Release to Spotify, Apple Music, TikTok and 150+ stores. Keep your rights, see who's listening, and get paid — from one quiet workspace."}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link href="/distro/app" className="dx-btn dx-btn-primary h-11 px-5 text-[15px]">
                {cta} <ArrowRight className="size-4" />
              </Link>
              <a href="#pricing" className="dx-btn h-11 px-5 text-[15px]">
                See pricing
              </a>
            </div>
          </div>
          <MockWorkspace name={brand.name} />
        </div>
      </section>

      {/* stores */}
      <section className="border-b border-[var(--dx-line)]">
        <div className="mx-auto max-w-[1180px] px-4 py-8">
          <div className="dx-label mb-4">Delivered to</div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[17px] font-medium text-[var(--dx-muted)]">
            {STORES.map((s) => (
              <span key={s}>{s}</span>
            ))}
            <span className="text-[var(--dx-hi)]">+140 more</span>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="border-b border-[var(--dx-line)]">
        <div className="mx-auto max-w-[1180px] px-4 py-16">
          <h2 className="max-w-[640px] text-[34px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[42px]">Everything after the last mixdown.</h2>
          <p className="mt-3 max-w-[560px] text-[16px] text-[var(--dx-sub)]">Upload, check, deliver, track, get paid. No spreadsheets, no inbox archaeology.</p>
          <div className="mt-10 grid border-t border-l border-[var(--dx-line)] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="border-r border-b border-[var(--dx-line)] p-6">
                <span className="grid size-10 place-items-center border border-[var(--dx-line-2)] bg-[var(--dx-raise)]">
                  <f.icon className="size-4.5" />
                </span>
                <h3 className="mt-4 text-[17px] font-medium">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--dx-sub)]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* white label */}
      <section id="white-label" className="border-b border-[var(--dx-line)]">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="dx-tag">For labels</span>
            <h2 className="mt-4 text-[34px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[42px]">Your label. Your name on it.</h2>
            <p className="mt-3 text-[16px] text-[var(--dx-sub)]">Set your own name, logo, colour and support email. Your artists sign in and see your workspace — we stay in the background.</p>
            <ul className="mt-6 space-y-2.5 text-[15px]">
              {["Your logo and colour across the workspace", "Your tagline on every overview", "Your support email for artist questions", "Hide “Powered by Nexus” entirely"].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <Check className="size-4 text-[var(--dx-accent)]" /> {t}
                </li>
              ))}
            </ul>
            <Link href="/distro/app#settings" className="dx-btn mt-7">
              Set up branding <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Northside", "#1DB954"],
              ["Velvet Rec.", "#FA243C"],
              ["Lumen", "#A238FF"],
            ].map(([n, c]) => (
              <div key={n} className="border border-[var(--dx-line)] bg-[var(--dx-panel)] p-3" style={brandVars(c)}>
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center text-[10px] font-black" style={{ background: c, color: "var(--dx-on-accent)" }}>
                    {n.slice(0, 1)}
                  </span>
                  <span className="truncate text-[12px] font-semibold">{n}</span>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="h-2 w-3/4 bg-[var(--dx-active)]" />
                  <div className="h-2 w-1/2 bg-[var(--dx-active)]" />
                  <div className="h-2 w-2/3 bg-[var(--dx-active)]" />
                </div>
                <div className="mt-3 h-6 text-center text-[10px] leading-6 font-semibold" style={{ background: c, color: "var(--dx-on-accent)" }}>
                  New release
                </div>
              </div>
            ))}
            <p className="col-span-3 text-[12px] text-[var(--dx-dim)]">Example label workspaces.</p>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-b border-[var(--dx-line)]">
        <div className="mx-auto max-w-[1180px] px-4 py-16">
          <h2 className="text-[34px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[42px]">Simple pricing.</h2>
          <p className="mt-3 text-[16px] text-[var(--dx-sub)]">Monthly, cancel any time. Your releases stay yours.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {plans.map((p, i) => (
              <div key={p.id} className={cn("flex flex-col border bg-[var(--dx-panel)] p-6", i === 1 ? "border-[var(--dx-hi)]" : "border-[var(--dx-line)]")}>
                <div className="flex items-center justify-between">
                  <span className="text-[16px] font-semibold">{p.short}</span>
                  {i === 1 && <span className="dx-tag">Popular</span>}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[40px] font-medium tracking-[-0.02em]">${p.price}</span>
                  <span className="text-[14px] text-[var(--dx-muted)]">/month</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2 text-[14px] text-[var(--dx-sub-2)]">
                  {p.perks.map((x) => (
                    <li key={x} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--dx-muted)]" /> {x}
                    </li>
                  ))}
                </ul>
                <Link href="/distro/app#settings" className={cn("dx-btn mt-6 justify-center", i === 1 && "dx-btn-primary")}>
                  Choose {p.short}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* faq */}
      <section id="faq" className="border-b border-[var(--dx-line)]">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="text-[34px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[42px]">Questions.</h2>
          <div className="border-t border-[var(--dx-line)]">
            {FAQ.map(([q, a], i) => (
              <div key={q} className="border-b border-[var(--dx-line)]">
                <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 py-4 text-left text-[16px] font-medium">
                  <span className="flex-1">{q}</span>
                  <Plus className={cn("size-4 shrink-0 transition", open === i && "rotate-45")} />
                </button>
                {open === i && <p className="pb-4 text-[15px] leading-relaxed text-[var(--dx-sub)]">{a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(60% 120% at 50% 120%, ${brand.accent}40, transparent 70%)` }} />
        <div className="dx-grain absolute inset-0" />
        <div className="relative mx-auto max-w-[1180px] px-4 py-20 text-center">
          <h2 className="text-[38px] leading-[1.05] font-medium tracking-[-0.03em] sm:text-[52px]">Your next release starts here.</h2>
          <Link href="/distro/app" className="dx-btn dx-btn-primary mt-7 h-11 px-6 text-[15px]">
            {cta} <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[var(--dx-line)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 px-4 py-6 text-[13px] text-[var(--dx-muted)]">
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
          {brand.support_email && <a href={`mailto:${brand.support_email}`} className="hover:text-white">{brand.support_email}</a>}
          <div className="ml-auto flex gap-4">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/contact" className="hover:text-white">Contact</Link>
            {!brand.hide_nexus && <Link href="/" className="hover:text-white">Powered by Nexus</Link>}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** a quiet, illustrative mock of the workspace overview */
function MockWorkspace({ name }: { name: string }) {
  const bars = [12, 18, 15, 22, 28, 24, 31, 27, 35, 42, 38, 46, 52, 49, 58, 63];
  return (
    <div className="border border-[var(--dx-line)] bg-[var(--dx-bg)] shadow-2xl" aria-hidden>
      <div className="flex items-center gap-2 border-b border-[var(--dx-line)] px-3 py-2">
        <span className="size-2.5 bg-[var(--dx-line-2)]" />
        <span className="size-2.5 bg-[var(--dx-line-2)]" />
        <span className="size-2.5 bg-[var(--dx-line-2)]" />
        <span className="ml-2 truncate text-[12px] text-[var(--dx-muted)]">{name} — Overview</span>
      </div>
      <div className="grid sm:grid-cols-[110px_1fr]">
        <div className="hidden space-y-1 border-r border-[var(--dx-line)] p-2 text-[11px] text-[var(--dx-muted)] sm:block">
          {["Overview", "Releases", "Artists", "Analytics", "Earnings", "Tools"].map((t, i) => (
            <div key={t} className={cn("px-2 py-1.5", i === 0 && "bg-[var(--dx-active)] text-white")}>
              {t}
            </div>
          ))}
        </div>
        <div className="space-y-3 p-3">
          <div className="relative h-16 overflow-hidden border border-[var(--dx-line)]" style={{ background: "linear-gradient(90deg,var(--dx-active),var(--dx-raise),var(--dx-line-2),var(--dx-active))" }}>
            <div className="dx-grain absolute inset-0" />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/20 bg-[var(--dx-bg)]/90 px-2.5 py-1 text-[11px]">+ New release</span>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <div className="border border-[var(--dx-line)] p-2.5">
              <div className="text-[11px] text-[var(--dx-muted)]">Store clicks · 30D</div>
              <div className="text-[18px] font-medium">12,480</div>
              <div className="mt-2 flex h-16 items-end gap-[2px]">
                {bars.map((b, i) => (
                  <div key={i} className="flex-1 bg-[var(--dx-hi)]/80" style={{ height: `${b}%` }} />
                ))}
              </div>
            </div>
            <div className="space-y-2 border border-[var(--dx-line)] p-2.5">
              <div className="text-[11px] text-[var(--dx-muted)]">Earnings</div>
              <div className="text-[18px] font-medium">£1,204</div>
              <div className="text-[10px] text-[var(--dx-dim)]">This month</div>
              <div className="h-px bg-[var(--dx-line)]" />
              <div className="flex items-center gap-1.5 text-[11px]">
                <Palette className="size-3" /> Your brand here
              </div>
            </div>
          </div>
          <div className="border border-[var(--dx-line)]">
            {[
              ["Midnight Drive", "Live", "#3ba55d"],
              ["Glass Hearts", "In review", "#f0b232"],
              ["Neon Coast EP", "Draft", "#8f8f8f"],
            ].map(([t, s, c]) => (
              <div key={t} className="flex items-center gap-2 border-b border-[var(--dx-line)] px-2.5 py-1.5 text-[11px] last:border-0">
                <span className="size-5 bg-[var(--dx-active)]" />
                <span className="flex-1 truncate">{t}</span>
                <span className="flex items-center gap-1 border border-[var(--dx-line-2)] px-1.5 text-[10px]">
                  <span className="size-1" style={{ background: c }} />
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
