"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Stats = { members: number; messages: number; servers: number; messages_24h: number };

/** animated number that counts up when it changes */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const dur = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

/** live public numbers for the homepage — refreshes every 30 s */
export default function LiveStats({ compact }: { compact?: boolean }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void supabase.rpc("public_stats").then(({ data }) => {
        if (alive && data) setS(data as Stats);
      });
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const items: [string, number | undefined, string][] = [
    ["Messages sent", s?.messages, "from-[#5865f2] to-[#8b5cff]"],
    ["Members", s?.members, "from-[#ff2bd6] to-[#ff7a59]"],
    ["Messages today", s?.messages_24h, "from-[#00c2ff] to-[#36d39a]"],
    ["Servers", s?.servers, "from-[#ffd400] to-[#ff9f1c]"],
  ];
  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
      {items.map(([label, v, g], i) => (
        <div key={label} className="site-rise rounded-2xl bg-white/[.05] p-4 ring-1 ring-white/10 backdrop-blur sm:p-5" style={{ animationDelay: `${i * 90}ms` }}>
          <div className={`bg-gradient-to-r ${g} bg-clip-text text-2xl font-black tabular-nums text-transparent sm:text-4xl`}>{v === undefined ? "—" : <CountUp value={v} />}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-white/60 sm:text-sm">
            {i === 0 && <span className="size-1.5 animate-pulse rounded-full bg-[#36d39a]" />}
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
