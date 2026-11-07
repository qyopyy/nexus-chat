"use client";

import { Check } from "lucide-react";
import SiteFrame from "./SiteFrame";
import Reveal from "./Reveal";
import LiveStats from "./LiveStats";
import { FEATURES } from "./features";

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function FeaturesPage() {
  return (
    <SiteFrame active="/features">
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-10 text-center sm:px-6 sm:pt-20">
        <h1 className="site-rise text-4xl font-black tracking-tight sm:text-6xl">
          Built for <span className="site-gradient-text">everything you do</span> together
        </h1>
        <p className="site-rise mx-auto mt-4 max-w-2xl text-white/65 sm:text-lg" style={{ animationDelay: "100ms" }}>
          Jump to a section or scroll through it all.
        </p>
        <div className="site-rise mt-6 flex flex-wrap justify-center gap-2" style={{ animationDelay: "180ms" }}>
          {FEATURES.map((f) => (
            <a key={f.title} href={`#${slug(f.title)}`} className="site-btn rounded-full bg-white/[.06] px-3.5 py-2 text-sm font-semibold ring-1 ring-white/10 hover:bg-white/10">
              {f.emoji} {f.title}
            </a>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title}>
            <section id={slug(f.title)} className="grid scroll-mt-24 items-center gap-6 rounded-3xl bg-white/[.04] p-6 ring-1 ring-white/10 sm:p-10 md:grid-cols-2">
              <div className={i % 2 ? "md:order-2" : ""}>
                <div className="text-sm font-bold tracking-wide uppercase" style={{ color: f.color }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{f.title}</h2>
                <p className="mt-2 text-white/65">{f.blurb}</p>
                <ul className="mt-5 space-y-2.5">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[15px]">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full" style={{ background: `${f.color}33`, color: f.color }}>
                        <Check className="size-3.5" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`grid place-items-center ${i % 2 ? "md:order-1" : ""}`}>
                <div className="site-float grid aspect-square w-full max-w-[260px] place-items-center rounded-[2.5rem] text-[7rem]" style={{ background: `radial-gradient(circle at 30% 30%, ${f.color}55, ${f.color}10 70%)`, animationDelay: `${-i}s` }}>
                  {f.emoji}
                </div>
              </div>
            </section>
          </Reveal>
        ))}
      </div>

      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <Reveal>
          <LiveStats />
          <div className="mt-8 text-center">
            <a href="/register" className="site-btn inline-block rounded-full bg-[#5865f2] px-8 py-3.5 font-bold">
              Try it free
            </a>
          </div>
        </Reveal>
      </section>
    </SiteFrame>
  );
}
