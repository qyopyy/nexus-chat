"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp, toast } from "@/store/app";
import { incomingDrops, openAndClaimDrop, sendDrop, type NexusDrop } from "@/lib/nexusDrop";

const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

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
  const [drops, setDrops] = useState<NexusDrop[]>([]);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setDrops(await incomingDrops());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 20_000);
    const vis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh]);

  const send = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await sendDrop(file, to);
      toast(to.trim() ? `Sent to @${to.trim().replace(/^@/, "")}` : "Sent to your other devices", "success");
      setFile(null);
      if (pick.current) pick.current.value = "";
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

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
              <Card title="Send a file">
                <p className="text-sm text-[#a39e96]">Goes through the cloud, so it works on any network — Wi-Fi, 5G, anywhere. Up to 100 MB. Leave the name empty to send it to your other devices.</p>
                <input ref={pick} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => pick.current?.click()} className="rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold active:bg-white/20">
                    {file ? "Change file" : "Choose a file or photo"}
                  </button>
                  <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="@friend (optional)" autoCapitalize="none" autoCorrect="off" className="min-w-0 flex-1 rounded-full bg-[#141414] px-4 py-2.5 text-sm outline-none" />
                </div>
                {file && (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl bg-black/30 p-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-[#a39e96]">{fmtBytes(file.size)}</span>
                  </div>
                )}
                <button disabled={!file || busy} onClick={() => void send()} className="mt-3 w-full rounded-full bg-[#f4f1ea] py-3 text-sm font-bold text-[#070709] disabled:opacity-40">
                  {busy ? "Sending…" : to.trim() ? `Send to @${to.trim().replace(/^@/, "")}` : "Send to my other devices"}
                </button>
              </Card>

              <Card title="Inbox">
                {err && <p className="mb-2 text-sm text-[#ff8a8a]">{err}</p>}
                {drops.length === 0 ? (
                  <p className="text-sm text-[#8d8880]">Nothing waiting. Files sent to this account show up here.</p>
                ) : (
                  <ul className="space-y-2">
                    {drops.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-black/30 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{d.name}</div>
                          <div className="text-xs text-[#8d8880]">{fmtBytes(d.bytes)} · {ago(d.created_at)}</div>
                        </div>
                        <button type="button" onClick={() => void openAndClaimDrop(d).then(refresh).catch((e: Error) => toast(e.message, "error"))} className="shrink-0 rounded-full bg-[#7ee0c6] px-4 py-2 text-sm font-bold text-[#06201a]">
                          Save
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => void refresh()} className="mt-3 text-xs text-[#8d8880] underline">Refresh</button>
              </Card>

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
