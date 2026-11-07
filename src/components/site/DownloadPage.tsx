"use client";

import { useEffect, useState } from "react";
import { Globe, Monitor, Smartphone, TabletSmartphone } from "lucide-react";
import SiteFrame from "./SiteFrame";
import Reveal from "./Reveal";

const RELEASES = "https://github.com/qyopyy/nexus-chat/releases";

type Os = "ios" | "android" | "windows" | "mac" | "other";
function detect(): Os {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh/i.test(ua)) return "mac";
  return "other";
}

const OPTIONS: { os: Os; icon: React.ReactNode; name: string; note: string; href: string; cta: string; color: string }[] = [
  { os: "ios", icon: <TabletSmartphone className="size-7" />, name: "iPhone & iPad", note: "Beta through Apple TestFlight — one tap to join.", href: "/testflight", cta: "Join the beta", color: "#ffffff" },
  { os: "android", icon: <Smartphone className="size-7" />, name: "Android", note: "Download the APK from the latest release and open it.", href: RELEASES, cta: "Download APK", color: "#36d39a" },
  { os: "windows", icon: <Monitor className="size-7" />, name: "Windows", note: "Desktop app (.exe) with notifications and tray icon.", href: RELEASES, cta: "Download for Windows", color: "#00c2ff" },
  { os: "mac", icon: <Monitor className="size-7" />, name: "macOS", note: "Desktop app (.dmg) for Apple silicon and Intel.", href: RELEASES, cta: "Download for Mac", color: "#c0c0c8" },
  { os: "other", icon: <Globe className="size-7" />, name: "Web", note: "Works in any modern browser — install it as an app from the menu.", href: "/login", cta: "Open Nexus", color: "#8b5cff" },
];

export default function DownloadPage() {
  const [os, setOs] = useState<Os>("other");
  useEffect(() => setOs(detect()), []);
  const mine = OPTIONS.find((o) => o.os === os) ?? OPTIONS[4];
  return (
    <SiteFrame active="/download">
      <section className="mx-auto max-w-5xl px-4 pt-12 text-center sm:px-6 sm:pt-20">
        <div className="site-float mx-auto mb-6 size-24 overflow-hidden rounded-[1.8rem] shadow-[0_20px_60px_-15px_rgba(139,92,255,.7)]">
          <img src="/icon-512.png" alt="Nexus" className="size-full" />
        </div>
        <h1 className="site-rise text-4xl font-black tracking-tight sm:text-6xl">Get Nexus everywhere</h1>
        <p className="site-rise mx-auto mt-4 max-w-xl text-white/65 sm:text-lg" style={{ animationDelay: "100ms" }}>
          One account on every device. Apps update themselves automatically.
        </p>
        <a href={mine.href} className="site-rise site-btn mt-8 inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-lg font-bold text-black" style={{ animationDelay: "180ms" }}>
          {mine.icon} {mine.cta}
        </a>
        <div className="site-rise mt-2 text-sm text-white/45" style={{ animationDelay: "220ms" }}>
          Recommended for your device · {mine.name}
        </div>
      </section>

      <section className="mx-auto mt-14 grid max-w-5xl gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {OPTIONS.map((o, i) => (
          <Reveal key={o.os} delay={i * 70}>
            <a href={o.href} className={`site-card flex h-full flex-col rounded-2xl bg-white/[.04] p-5 ring-1 ${o.os === os ? "ring-[#5865f2]" : "ring-white/10"}`}>
              <div className="flex items-center gap-3" style={{ color: o.color }}>
                {o.icon}
                <span className="text-lg font-bold text-white">{o.name}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-white/60">{o.note}</p>
              <span className="mt-4 text-sm font-bold" style={{ color: o.color }}>
                {o.cta} →
              </span>
            </a>
          </Reveal>
        ))}
      </section>
    </SiteFrame>
  );
}
