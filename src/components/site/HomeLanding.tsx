"use client";

import { ArrowRight, Download, Sparkles } from "lucide-react";
import SiteFrame from "./SiteFrame";
import LiveStats from "./LiveStats";
import Reveal from "./Reveal";
import { FEATURES } from "./features";
import ArtistGrid from "./ArtistGrid";

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** a little animated chat on the hero */
function HeroChat() {
  const bubbles = [
    { me: false, t: "you on tonight? 🎮", d: 0 },
    { me: true, t: "yes!! starting Global Strike", d: 500 },
    { me: false, t: "joining the call 📞", d: 1000 },
    { me: true, t: "sharing my screen in 4K ✨", d: 1500 },
  ];
  return (
    <div className="site-float relative mx-auto w-full max-w-[340px] rounded-[2.2rem] bg-gradient-to-b from-white/15 to-white/5 p-2 shadow-[0_30px_80px_-20px_rgba(88,101,242,.6)] ring-1 ring-white/15">
      <div className="rounded-[1.8rem] bg-[#111216] p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#ff2bd6] to-[#8b5cff] text-sm font-bold">MA</div>
          <div>
            <div className="text-sm font-bold">Maya</div>
            <div className="flex items-center gap-1 text-[11px] text-[#36d39a]">
              <span className="size-1.5 rounded-full bg-[#36d39a]" /> online
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {bubbles.map((b) => (
            <div key={b.t} className={`site-rise flex ${b.me ? "justify-end" : ""}`} style={{ animationDelay: `${600 + b.d}ms` }}>
              <span className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${b.me ? "rounded-br-md bg-[#5865f2]" : "rounded-bl-md bg-white/10"}`}>{b.t}</span>
            </div>
          ))}
          <div className="site-rise flex gap-1 pt-1" style={{ animationDelay: "2600ms" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-white/40" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeLanding() {
  return (
    <SiteFrame active="/">
      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-20">
        <div>
          <div className="site-rise inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/15">
            <Sparkles className="size-3.5 text-[#ffd400]" /> New: Watch & Play Together in calls
          </div>
          <h1 className="site-rise mt-5 text-[2.6rem] leading-[1.05] font-black tracking-tight sm:text-6xl" style={{ animationDelay: "80ms" }}>
            Chat, call and create — <span className="site-gradient-text">all in one place.</span>
          </h1>
          <p className="site-rise mt-5 max-w-xl text-base text-white/70 sm:text-lg" style={{ animationDelay: "160ms" }}>
            Nexus brings your friends, servers, HD calls, NexusGram, music releases and games together. Free on web, iPhone, Android and Windows.
          </p>
          <div className="site-rise mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "240ms" }}>
            <a href="/register" className="site-btn inline-flex items-center justify-center gap-2 rounded-full bg-[#5865f2] px-7 py-3.5 text-base font-bold shadow-lg shadow-[#5865f2]/30">
              Create your account <ArrowRight className="size-4" />
            </a>
            <a href="/download" className="site-btn inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-7 py-3.5 text-base font-semibold ring-1 ring-white/15">
              <Download className="size-4" /> Download the app
            </a>
          </div>
          <p className="site-rise mt-4 text-sm text-white/50" style={{ animationDelay: "320ms" }}>
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
              Sign in
            </a>
          </p>
        </div>
        <HeroChat />
      </section>

      {/* live numbers */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/60">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#36d39a] opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-[#36d39a]" />
            </span>
            Live on Nexus right now
          </div>
          <LiveStats />
        </Reveal>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Everything you need</h2>
          <p className="mt-2 max-w-2xl text-white/60">One app instead of five. Here&apos;s what&apos;s inside.</p>
        </Reveal>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 80}>
              <a href={`/features#${slug(f.title)}`} className="site-card block h-full rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/10">
                <div className="grid size-12 place-items-center rounded-2xl text-2xl" style={{ background: `${f.color}26` }}>
                  {f.emoji}
                </div>
                <div className="mt-4 font-bold">{f.title}</div>
                <p className="mt-1 text-sm text-white/60">{f.blurb}</p>
                <div className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: f.color }}>
                  Learn more <ArrowRight className="size-3.5" />
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* about us + artists */}
      <section id="about" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-20 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">About us</h2>
              <p className="mt-2 max-w-2xl text-white/60">Nexus is made by a small independent team and a music label — these are our artists.</p>
            </div>
            <a href="/about" className="site-btn rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold ring-1 ring-white/15">
              More about us →
            </a>
          </div>
        </Reveal>
        <div className="mt-8">
          <ArtistGrid />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5865f2] via-[#8b5cff] to-[#ff2bd6] p-8 text-center sm:p-14">
            <div aria-hidden className="site-float absolute -top-10 -right-10 text-[9rem] opacity-20">
              💬
            </div>
            <h2 className="relative text-3xl font-black tracking-tight sm:text-5xl">Your people are waiting.</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-white/85">Create a free account in under a minute — no phone number needed.</p>
            <div className="relative mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="/register" className="site-btn rounded-full bg-white px-8 py-3.5 font-bold text-black">
                Join Nexus — it&apos;s free
              </a>
              <a href="/contact" className="site-btn rounded-full bg-black/25 px-8 py-3.5 font-semibold ring-1 ring-white/30">
                Questions? Contact us
              </a>
            </div>
          </div>
        </Reveal>
      </section>
    </SiteFrame>
  );
}
