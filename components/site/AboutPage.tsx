"use client";

import SiteFrame from "./SiteFrame";
import Reveal from "./Reveal";
import LiveStats from "./LiveStats";
import ArtistGrid from "./ArtistGrid";

const VALUES = [
  { e: "🫶", t: "People first", d: "No algorithmic feed deciding who you hear from. Your chats are yours." },
  { e: "🔒", t: "Private by default", d: "You choose who can DM you, see you online or find your location." },
  { e: "🎧", t: "Made for creators", d: "Built by a music label — releasing and protecting music is part of the app." },
  { e: "🚀", t: "Always shipping", d: "New features land every week, straight to every device." },
];

export default function AboutPage() {
  return (
    <SiteFrame active="/about">
      <section className="mx-auto max-w-4xl px-4 pt-12 text-center sm:px-6 sm:pt-20">
        <h1 className="site-rise text-4xl font-black tracking-tight sm:text-6xl">
          About <span className="site-gradient-text">us</span>
        </h1>
        <p className="site-rise mx-auto mt-5 max-w-2xl text-white/65 sm:text-lg" style={{ animationDelay: "100ms" }}>
          Nexus started as a place for friends and artists to hang out, make music and play games together. Today it&apos;s a full social app — chat, HD calls,
          NexusGram, music tools and games — run by a small independent team.
        </p>
      </section>
      <section className="mx-auto mt-12 max-w-5xl px-4 sm:px-6">
        <LiveStats />
      </section>
      <section id="artists" className="mx-auto mt-16 max-w-6xl scroll-mt-24 px-4 sm:px-6">
        <Reveal>
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Our artists</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-white/60">The people making music with Nexus.</p>
        </Reveal>
        <div className="mt-8">
          <ArtistGrid />
        </div>
      </section>
      <section className="mx-auto mt-16 grid max-w-5xl gap-3 px-4 sm:grid-cols-2 sm:px-6">
        {VALUES.map((v, i) => (
          <Reveal key={v.t} delay={i * 80}>
            <div className="site-card h-full rounded-2xl bg-white/[.04] p-6 ring-1 ring-white/10">
              <div className="text-4xl">{v.e}</div>
              <div className="mt-3 text-lg font-bold">{v.t}</div>
              <p className="mt-1 text-white/60">{v.d}</p>
            </div>
          </Reveal>
        ))}
      </section>
      <section className="mx-auto mt-14 max-w-5xl px-4 text-center sm:px-6">
        <Reveal>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <a href="/register" className="site-btn rounded-full bg-[#5865f2] px-8 py-3.5 font-bold">
              Join Nexus
            </a>
            <a href="/contact" className="site-btn rounded-full bg-white/10 px-8 py-3.5 font-semibold ring-1 ring-white/15">
              Talk to us
            </a>
          </div>
        </Reveal>
      </section>
    </SiteFrame>
  );
}
