"use client";

import Link from "next/link";
import { AcetateMark } from "@/components/acetate/AcetateBits";
import DistributionPanelCard from "./DistributionPanelCard";

/** Public Acetate landing for the distribution panel. */
export default function DistributionPanelPage() {
  return (
    <div className="h-full overflow-y-auto bg-[#100e0c] text-[#f3eadf]">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-5">
        <Link href="/acetate" className="flex items-center gap-2.5">
          <AcetateMark size={32} />
          <span className="font-serif text-xl tracking-wide">Acetate</span>
        </Link>
        <Link href="/acetate/app" className="text-sm font-semibold text-[#e4a15a]">
          Library
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-16">
        <p className="text-xs font-semibold tracking-[0.28em] text-[#e4a15a] uppercase">Acetate</p>
        <h1 className="mt-2 font-serif text-5xl leading-none">Distribution</h1>
        <p className="mt-3 text-[#a3988c]">
          The panel is where a release goes out: account, catalog, and splits. Acetate stays the private library. This page only opens the panel.
        </p>
        <div className="mt-6">
          <DistributionPanelCard tone="acetate" />
        </div>
      </main>
    </div>
  );
}
