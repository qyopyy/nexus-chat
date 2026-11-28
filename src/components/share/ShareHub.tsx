"use client";

import Link from "next/link";
import { useApp } from "@/store/app";
import DropCenter from "./DropCenter";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-[#111114] p-5 ring-1 ring-white/[.06]">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tile({ href, emoji, title, body }: { href: string; emoji: string; title: string; body: string }) {
  const cls = "flex flex-col gap-1 rounded-3xl bg-gradient-to-br from-[#1c1830] to-[#101018] p-4 ring-1 ring-white/[.08] transition active:scale-[0.98]";
  const inner = (
    <>
      <span className="text-3xl">{emoji}</span>
      <span className="text-lg font-bold">{title}</span>
      <span className="text-[13px] leading-snug text-[#a39e96]">{body}</span>
    </>
  );
  return href.startsWith("/drop") ? (
    <a href={href} className={cls}>{inner}</a>
  ) : (
    <Link href={href} className={cls}>{inner}</Link>
  );
}

/** One place for Phone Link, Nexus Drop and the cloud inbox — built to work on iPhone. */
export default function ShareHub() {
  const userId = useApp((s) => s.userId);

  return (
    <div className="min-h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-3xl px-5 py-8 pb-24">
        <Link href="/" className="text-sm text-[#8d8880]">← Nexus</Link>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#7ee0c6] uppercase">Devices</p>
        <h1 className="mt-1 font-serif text-4xl">Share &amp; Link</h1>
        <p className="mt-2 max-w-xl text-sm text-[#a39e96]">Move files between your phone, computer and friends, and control your phone from your computer.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Tile href="/phone" emoji="📲" title="Phone Link" body="See your iPhone from your computer, send text & links, ring it." />
          <Tile href="/drop/index.html" emoji="🛰️" title="Nexus Drop" body="Direct device-to-device transfer on the same Wi-Fi. No account needed." />
          <Tile href="/iphone" emoji="🧰" title="iPhone tools" body="100 handy phone tools and file checks." />
        </div>

        <div className="mt-6 space-y-4">
          {!userId ? (
            <Card title="Sign in first">
              <p className="text-sm text-[#a39e96]">Cloud drops and Phone Link use your Nexus account. <Link href="/login" className="text-[#7ee0c6] underline">Sign in</Link> and come back.</p>
            </Card>
          ) : (
            <>
              <DropCenter />

              <Card title="Set up on your iPhone">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-[#cfcac1]">
                  <li>Open the Nexus app (or <b>nexusproject.cc</b> in Safari) on your iPhone and sign in to the same account as your computer.</li>
                  <li>On the iPhone open <b>Phone Link</b> above and keep it open for a moment — the iPhone appears as a linked device.</li>
                  <li>On your computer open <b>/phone</b> and pick the iPhone to send notes, links or files to it.</li>
                  <li>To get files onto the iPhone, tap <b>Save</b> in the Inbox above, then choose <b>Save to Files</b> or <b>Save Image</b> in the share sheet.</li>
                  <li>For quick, direct sharing on the same Wi-Fi, open <b>Nexus Drop</b>, create a room, and open the invitation on the other device.</li>
                </ol>
                <p className="mt-3 text-xs text-[#8d8880]">Tip: add Nexus to your Home Screen (Share → Add to Home Screen) so these pages are one tap away. iOS doesn&apos;t let web apps appear in the system Share menu or in Apple AirDrop.</p>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
