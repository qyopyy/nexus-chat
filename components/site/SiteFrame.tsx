"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV } from "./features";

/** shared header + footer + animated background for the public pages */
export default function SiteFrame({ children, active }: { children: React.ReactNode; active?: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // the app shell locks <body> scrolling, so the public pages scroll inside this container
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => setScrolled(el.scrollTop > 8);
    on();
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);
  return (
    <div ref={scroller} className="relative h-full overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-smooth bg-[#0b0c0f] text-white">
      {/* moving colour orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
        <div className="site-orb absolute -top-40 -left-32 size-[34rem] rounded-full bg-[#5865f2]/25 blur-[110px]" />
        <div className="site-orb absolute top-1/3 -right-40 size-[30rem] rounded-full bg-[#ff2bd6]/15 blur-[110px]" style={{ animationDelay: "-5s" }} />
        <div className="site-orb absolute -bottom-40 left-1/4 size-[28rem] rounded-full bg-[#00c2ff]/15 blur-[110px]" style={{ animationDelay: "-9s" }} />
      </div>

      <header className={`sticky top-0 z-30 transition ${scrolled ? "bg-[#0b0c0f]/80 shadow-lg backdrop-blur-xl" : ""}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
            <img src="/icon.png" alt="" className="size-8 rounded-xl" /> Nexus
          </a>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={`rounded-full px-3 py-2 text-sm font-semibold transition ${active === n.href ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href="/login" className="site-btn hidden rounded-full px-4 py-2 text-sm font-semibold text-white/80 hover:text-white sm:block">
              Sign in
            </a>
            <a href="/register" className="site-btn rounded-full bg-white px-4 py-2 text-sm font-bold text-black">
              Get Nexus
            </a>
            <button onClick={() => setOpen(!open)} className="grid size-10 place-items-center rounded-full bg-white/10 md:hidden" aria-label={open ? "Close menu" : "Menu"}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="site-rise mx-3 mb-3 grid gap-1 rounded-2xl bg-[#17181c]/95 p-2 ring-1 ring-white/10 backdrop-blur md:hidden">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={`rounded-xl px-4 py-3 text-base font-semibold ${active === n.href ? "bg-white/10" : "text-white/75 active:bg-white/10"}`}>
                {n.label}
              </a>
            ))}
            <a href="/login" className="rounded-xl px-4 py-3 text-base font-semibold text-white/75 active:bg-white/10">
              Sign in
            </a>
          </nav>
        )}
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 mt-20 border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-white/55 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2 font-bold text-white">
            <img src="/icon.png" alt="" className="size-6 rounded-lg" /> Nexus
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV.slice(1).map((n) => (
              <a key={n.href} href={n.href} className="hover:text-white">
                {n.label}
              </a>
            ))}
            <a href="/privacy" className="hover:text-white">
              Privacy
            </a>
            <a href="/beta" className="hover:text-white">
              iPhone beta
            </a>
          </div>
          <div className="sm:ml-auto">© {new Date().getFullYear()} Nexus Project</div>
        </div>
      </footer>
    </div>
  );
}
