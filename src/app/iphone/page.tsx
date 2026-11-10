"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { iphoneTools } from "@/lib/iphoneKit";
import { toast } from "@/store/app";

export default function IphoneToolsPage() {
  const tools = useMemo(() => iphoneTools(), []);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? tools.filter((tool) => `${tool.n} ${tool.label} ${tool.group}`.toLowerCase().includes(needle)) : tools;
  const groups = [...new Set(shown.map((tool) => tool.group))];

  return (
    <div className="min-h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-3xl px-5 py-8 pb-24">
        <Link href="/" className="text-sm text-[#8d8880]">Nexus</Link>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#7ee0c6] uppercase">iPhone</p>
        <h1 className="mt-1 font-serif text-4xl">100 phone tools</h1>
        <p className="mt-2 max-w-xl text-sm text-[#a39e96]">
          Text size, haptics, notes to your computer, Cloud, and a file check. Safari on iPhone does not share battery percentage. The installed Nexus app can, once this build includes it.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools"
          className="mt-5 w-full rounded-2xl bg-[#161616] px-4 py-3 text-sm outline-none placeholder:text-[#8d8880]"
        />
        {groups.map((group) => (
          <section key={group} className="mt-6">
            <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[#8d8880] uppercase">{group}</h2>
            <div className="mt-2 overflow-hidden rounded-2xl bg-[#141414]">
              {shown.filter((tool) => tool.group === group).map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    void Promise.resolve(tool.run()).catch((error: Error) => toast(error.message || "That didn't work", "error"));
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-[16px] active:bg-white/[.06]"
                >
                  <span className="w-8 shrink-0 text-sm text-[#7ee0c6]">{tool.n}</span>
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
