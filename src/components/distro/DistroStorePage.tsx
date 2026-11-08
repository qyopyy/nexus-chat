"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Clock, Lightbulb, Plus } from "lucide-react";
import { supabase, isConfigured } from "@/lib/supabase";
import { brandVars, loadBrands, useBrand } from "@/lib/distBrand";
import { DISTRO_FAQ, STORE_PAGES, storePage } from "@/lib/distroSeo";
import { cn } from "@/lib/utils";
import { DistroFooter, DistroHeader } from "./DistroLanding";

const STEPS = [
  ["Upload", "Audio (WAV/FLAC), a 3000×3000 cover and your credits — once."],
  ["We check it", "Metadata, artwork and audio are reviewed against store rules so nothing bounces."],
  ["Delivered", "Your release goes out to every store you picked on the date you set."],
  ["Get paid", "Stream counts, clicks and royalties land in one workspace, with splits for collaborators."],
];

/** /distro/[store] — store-specific landing page (unique copy per store for search). */
export default function DistroStorePage({ slug }: { slug: string }) {
  const s = storePage(slug)!;
  const brand = useBrand();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => {
    void loadBrands();
    if (isConfigured) void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const faq = [...s.faq, ...DISTRO_FAQ.slice(0, 3)];
  const others = STORE_PAGES.filter((x) => x.slug !== s.slug);

  return (
    <div className="dx dx-scroll min-h-dvh overflow-x-hidden" data-dx-theme={brand.theme} style={brandVars(brand.accent)}>
      <DistroHeader signedIn={signedIn} home={false} />

      <section className="relative overflow-hidden border-b border-[var(--dx-line)]">
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 90% at 15% 0%, ${s.color}26, transparent 60%), radial-gradient(60% 80% at 100% 100%, ${brand.accent}30, transparent 60%)` }} />
        <div className="dx-grain absolute inset-0" />
        <div className="relative mx-auto max-w-[1180px] px-4 py-14 md:py-20">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-[13px] text-[var(--dx-muted)]">
            <Link href="/distro" className="hover:text-white">
              Distribution
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-[var(--dx-sub-2)]">{s.name}</span>
          </nav>
          <span className="dx-tag">{s.name} distribution</span>
          <h1 className="mt-4 max-w-[760px] text-[40px] leading-[1.04] font-medium tracking-[-0.03em] sm:text-[58px]">{s.headline}.</h1>
          <p className="mt-5 max-w-[620px] text-[17px] text-[var(--dx-sub)]">{s.description}</p>
          <div className="mt-6 flex items-center gap-2 text-[14px] text-[var(--dx-sub-2)]">
            <Clock className="size-4" /> {s.time}
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/distro/app" className="dx-btn dx-btn-primary dx-btn-lg">
              Release on {s.name} <ArrowRight className="size-4" />
            </Link>
            <Link href="/distro#pricing" className="dx-btn dx-btn-lg">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--dx-line)]">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-[30px] leading-[1.1] font-medium tracking-[-0.02em]">What you get on {s.name}</h2>
            <ul className="mt-6 space-y-3">
              {s.perks.map((p) => (
                <li key={p} className="flex gap-3 text-[15px]">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--dx-hi)]" /> {p}
                </li>
              ))}
              <li className="flex gap-3 text-[15px]">
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--dx-hi)]" /> Free ISRC and UPC codes, and you keep 100% of your rights
              </li>
            </ul>
          </div>
          <div className="dx-panel p-5">
            <div className="flex items-center gap-2 text-[15px] font-medium">
              <Lightbulb className="size-4 text-[var(--dx-hi)]" /> Tips for {s.name}
            </div>
            <ul className="mt-3 space-y-2.5 text-[14px] text-[var(--dx-sub)]">
              {s.tips.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--dx-hi)] dx-round" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--dx-line)]">
        <div className="mx-auto max-w-[1180px] px-4 py-14">
          <h2 className="text-[30px] leading-[1.1] font-medium tracking-[-0.02em]">How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, b], i) => (
              <li key={t} className="dx-panel p-5">
                <span className="text-[13px] text-[var(--dx-muted)]">0{i + 1}</span>
                <h3 className="mt-2 text-[17px] font-medium">{t}</h3>
                <p className="mt-1.5 text-[14px] text-[var(--dx-sub)]">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-[var(--dx-line)]">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-14 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="text-[30px] leading-[1.1] font-medium tracking-[-0.02em]">{s.name} questions</h2>
          <div className="border-t border-[var(--dx-line)]">
            {faq.map(([q, a], i) => (
              <div key={q} className="border-b border-[var(--dx-line)]">
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center gap-3 py-4 text-left text-[16px] font-medium">
                  <span className="flex-1">{q}</span>
                  <Plus className={cn("size-4 shrink-0 transition", open === i && "rotate-45")} />
                </button>
                <p className={cn("pb-4 text-[15px] leading-relaxed text-[var(--dx-sub)]", open !== i && "sr-only")}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--dx-line)]">
        <div className="mx-auto max-w-[1180px] px-4 py-12">
          <div className="dx-label mb-4">Also release on</div>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link key={o.slug} href={`/distro/${o.slug}`} className="dx-btn dx-btn-sm">
                {o.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(60% 120% at 50% 120%, ${brand.accent}40, transparent 70%)` }} />
        <div className="relative mx-auto max-w-[1180px] px-4 py-16 text-center">
          <h2 className="text-[34px] leading-[1.05] font-medium tracking-[-0.03em] sm:text-[46px]">Your next release on {s.name} starts here.</h2>
          <Link href="/distro/app" className="dx-btn dx-btn-primary dx-btn-lg mt-7">
            {signedIn ? "Open your workspace" : "Start releasing"} <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <DistroFooter />
    </div>
  );
}
