"use client";

import Link from "next/link";
import { ACETATE } from "@/lib/acetateBrand";
import { AcetateMark } from "./AcetateBits";
import AcetatePwa from "./AcetatePwa";

const POINTS = [
  { title: "Private by default", body: "Demos, alternate mixes, and half-finished songs stay in your library until you make a link." },
  { title: "Every version", body: "Keep the rough, the vocal pass, and the mix that finally sat right — on the same track." },
  { title: "A link, not an account", body: "Public or unlisted. Optional password, expiry, and download. Revoke it when the cut moves on." },
];

export default function AcetateLanding() {
  return (
    <div className="h-full overflow-y-auto bg-[#100e0c] text-[#f3eadf]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <AcetateMark size={34} />
          <span className="font-serif text-xl tracking-wide">Acetate</span>
        </div>
        <div className="flex items-center gap-2">
          <AcetatePwa />
          <Link href="/acetate/app" className="rounded-full bg-[#e4a15a] px-4 py-2 text-sm font-semibold text-[#100e0c]">
            Open library
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 pt-10 pb-24">
        <p className="text-xs font-semibold tracking-[0.28em] text-[#e4a15a] uppercase">Test pressing</p>
        <h1 className="mt-3 max-w-xl font-serif text-5xl leading-[1.05] sm:text-7xl">{ACETATE.tagline}</h1>
        <p className="mt-5 max-w-lg text-lg text-[#a3988c]">{ACETATE.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/acetate/app" className="rounded-full bg-[#f3eadf] px-5 py-3 text-sm font-semibold text-[#100e0c]">
            Sign in with Nexus
          </Link>
          <a href="#how" className="rounded-full border border-[#3c342c] px-5 py-3 text-sm font-semibold text-[#f3eadf]">
            How a cut is shared
          </a>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3" id="how">
          {POINTS.map((point) => (
            <article key={point.title} className="rounded-3xl border border-[#3c342c] bg-[#1a1612] p-5">
              <h2 className="font-serif text-2xl">{point.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#a3988c]">{point.body}</p>
            </article>
          ))}
        </div>
        <section className="mt-14 rounded-3xl border border-[#3c342c] p-6 sm:p-8">
          <h2 className="font-serif text-3xl">5 GB to start. Unlimited when it’s time.</h2>
          <p className="mt-3 max-w-2xl text-[#a3988c]">
            Every Nexus account gets 5 GB of Acetate storage. A Nexus admin can grant lifetime Premium — unlimited storage, no expiry. Paid checkout is ready for a provider, and it does not charge anyone until that exists.
          </p>
          <p className="mt-6 text-sm text-[#a3988c]">
            Same login as Nexus chat. Drop a share link in a DM and it plays inline. While a cut is spinning, your profile says you’re listening on Acetate.
          </p>
        </section>
      </main>
    </div>
  );
}
