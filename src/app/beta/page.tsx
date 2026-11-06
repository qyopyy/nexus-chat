import type { Metadata } from "next";
import { SITE } from "@/lib/seo";
import { TF_APPS } from "@/lib/testflight";
import { fetchTfLinks } from "./data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join the Nexus beta",
  description: "Get the Nexus iPhone apps early on TestFlight.",
  alternates: { canonical: "/beta" },
  openGraph: { title: "Join the Nexus beta on TestFlight", description: "Get the Nexus iPhone apps before they hit the App Store.", url: "/beta", images: [SITE.ogImage] },
};

/** Public page testers get sent to: one Join button per app that has a TestFlight public link. */
export default async function BetaPage() {
  const links = await fetchTfLinks();
  const apps = TF_APPS.filter((a) => links[a.id]);
  return (
    <main className="min-h-screen bg-[#0b0c0f] text-white">
      <div className="mx-auto max-w-xl px-5 py-12 sm:py-16">
        <a href={SITE.url} className="text-sm font-medium text-white/45 hover:text-white">
          Nexus
        </a>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Join the beta</h1>
        <p className="mt-2 text-white/65">Get the Nexus iPhone apps early. It takes a minute and it&apos;s free.</p>

        <ol className="mt-6 space-y-2 text-sm text-white/75">
          <li className="flex gap-3">
            <b className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs">1</b>
            <span>
              Install{" "}
              <a href="https://apps.apple.com/app/testflight/id899247664" className="font-semibold text-[#5ab0ff] underline-offset-2 hover:underline">
                TestFlight
              </a>{" "}
              from the App Store (Apple&apos;s app for beta testing).
            </span>
          </li>
          <li className="flex gap-3">
            <b className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs">2</b>
            <span>On your iPhone, tap Join below, then Accept and Install.</span>
          </li>
        </ol>

        <div className="mt-8 space-y-3">
          {apps.length === 0 && <div className="rounded-2xl bg-white/5 p-5 text-center text-white/60 ring-1 ring-white/10">No open beta right now — check back soon.</div>}
          {apps.map((a) => (
            <div key={a.id} className="flex items-center gap-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-black" style={{ background: a.color }}>
                {a.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold">{a.name}</div>
                <div className="truncate text-sm text-white/55">{links[a.id]?.note || a.blurb}</div>
              </div>
              <a href={`/beta/${a.id}`} className="shrink-0 rounded-full bg-[#0a84ff] px-5 py-2.5 text-sm font-bold hover:bg-[#0a84ff]/85">
                Join
              </a>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-white/40">Beta spots are limited by Apple. Builds expire after 90 days — TestFlight updates them for you.</p>
      </div>
    </main>
  );
}
