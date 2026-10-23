"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** iOS large title that collapses into a compact sticky bar while scrolling */
export default function LargeTitle({
  title,
  right,
  left,
  scroller,
}: {
  title: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => setCompact(el.scrollTop > 36);
    on();
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [scroller]);

  return (
    <>
      <div
        className={cn(
          "sticky top-0 z-20 flex h-12 items-center justify-between px-2 transition-colors duration-200",
          compact ? "border-b border-white/[.07] bg-rail/85 backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <div className="flex min-w-16 items-center">{left}</div>
        <div className={cn("text-[17px] font-semibold transition-opacity duration-200", compact ? "opacity-100" : "opacity-0")}>{title}</div>
        <div className="flex min-w-16 items-center justify-end">{right}</div>
      </div>
      <h1 className="px-4 pt-0 pb-2 text-[34px] leading-tight font-extrabold tracking-tight">{title}</h1>
    </>
  );
}
