"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Search } from "lucide-react";
import { toast } from "@/store/app";
import { studioGo } from "@/store/studio";
import { addWatch, fmtNum, spotifyProfile, type SpotifyProfile } from "@/lib/protect";
import { cn } from "@/lib/utils";

const CLAIM = "https://artists.spotify.com/c/team/access/artist";

/** Spotify ✓ Verified Artist checker: stats, readiness, how to get (and keep) the checkmark */
export default function Checkmark() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [p, setP] = useState<SpotifyProfile | null>(null);
  const [seen, setSeen] = useState<"yes" | "no" | null>(null);

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setSeen(null);
    try {
      setP(await spotifyProfile(url.trim()));
    } catch (err) {
      toast((err as Error).message, "error");
    }
    setBusy(false);
  };

  const monthsSince = (d?: string | null) => (d ? (Date.now() - new Date(d).getTime()) / (30 * 86400_000) : 999);
  const checks = p
    ? [
        { ok: !!p.image, label: "Profile picture", tip: "Upload one in Spotify for Artists once you've claimed the profile." },
        { ok: p.releases > 0, label: `Own releases on the profile (${p.releases})`, tip: "Release at least one single or album as the primary artist." },
        { ok: monthsSince(p.latest?.release_date) < 12, label: p.latest ? `Recent release (${p.latest.release_date})` : "Recent release", tip: "Active profiles get more out of Spotify for Artists: Release Radar, pitching, Countdown Pages." },
        { ok: (p.listeners ?? 0) > 0, label: `Listeners (${fmtNum(p.listeners)} monthly)`, tip: "Anyone can claim with 0 listeners — but stats only show once people listen." },
        { ok: p.lookalikes.length === 0, label: p.lookalikes.length ? `${p.lookalikes.length} look-alike profile${p.lookalikes.length > 1 ? "s" : ""} found` : "No look-alike profiles", tip: "Verified profiles are easier for fans to tell apart from copies — claim yours first." },
      ]
    : [];
  const score = checks.length ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg,#0d3b24,#1DB954 60%,#0a6e3a)" }}>
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/80 uppercase">
          <BadgeCheck className="size-4" /> Spotify checkmark
        </div>
        <div className="mt-1 text-2xl font-black">Get the blue ✓ Verified Artist badge</div>
        <p className="mt-1 max-w-2xl text-sm text-white/85">
          Spotify shows the checkmark on profiles that are claimed through Spotify for Artists — it can&apos;t be bought or added by any app. Check a profile here to see its stats, what&apos;s missing and how to claim it.
        </p>
        <form onSubmit={check} className="mt-4 flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/artist/…" className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-2.5 text-sm text-white placeholder-white/60 outline-none focus:bg-white/20" />
          <button disabled={busy} className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black disabled:opacity-50">
            <Search className="size-4" /> {busy ? "Checking…" : "Check"}
          </button>
        </form>
      </div>

      {p && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-side p-4">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="size-24 rounded-full object-cover shadow-xl" />
            ) : (
              <div className="grid size-24 place-items-center rounded-full bg-hover text-4xl">🎤</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-2xl font-black">
                {p.name}
                {seen === "yes" && <BadgeCheck className="size-7 text-[#4cb3ff]" aria-label="Verified" />}
              </div>
              <div className="text-sm text-sub">{p.genres.slice(0, 4).join(" · ") || "No genres yet"}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {[
                  ["Monthly listeners", fmtNum(p.listeners)],
                  ["Releases", String(p.releases)],
                  ["Features", String(p.appears_on)],
                  ["Deezer fans", fmtNum(p.fans)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-black/25 px-3 py-1.5">
                    <div className="text-[11px] text-sub">{k}</div>
                    <div className="font-bold tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-bold text-black">
              <ExternalLink className="size-4" /> Open on Spotify
            </a>
          </div>

          <div className="rounded-2xl bg-side p-4">
            <div className="font-semibold">Is there a blue ✓ next to “{p.name}” on the Spotify profile?</div>
            <p className="text-xs text-sub">Spotify doesn&apos;t share this through its public API, so take a quick look (open the profile in the Spotify app or web player).</p>
            <div className="mt-2 flex gap-2">
              {(["yes", "no"] as const).map((v) => (
                <button key={v} onClick={() => setSeen(v)} className={cn("rounded-full px-4 py-1.5 text-sm font-bold", seen === v ? "bg-accent text-white" : "bg-hover hover:bg-active")}>
                  {v === "yes" ? "Yes, it's verified" : "No checkmark"}
                </button>
              ))}
            </div>
            {seen === "yes" && (
              <div className="mt-3 rounded-xl bg-[#1DB954]/10 p-3 text-sm">
                ✅ Verified. Keep it safe: add the profile to <b>Profile Defender</b> so you hear about releases you didn&apos;t put out, name or photo changes, look-alike profiles and strange listener spikes.
                <button
                  onClick={async () => {
                    try {
                      await addWatch(p.url);
                      toast("Profile Defender is watching it", "success");
                    } catch (e) {
                      toast((e as Error).message, "error");
                    }
                  }}
                  className="mt-2 block rounded-full bg-[#1DB954] px-4 py-1.5 font-bold text-black"
                >
                  Protect with Profile Defender
                </button>
              </div>
            )}
            {seen === "no" && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="font-semibold">How to get the checkmark</div>
                <ol className="list-inside list-decimal space-y-1">
                  <li>Open Spotify for Artists → Get access → Artist, and paste the artist link.</li>
                  <li>Verify with your website or socials. Through a preferred distributor it&apos;s often approved instantly.</li>
                  <li>Once you&apos;re in, the ✓ appears on the profile — then add a photo, bio and Artist Pick.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <a href={CLAIM} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#1DB954] px-4 py-2 font-bold text-black">
                    <ExternalLink className="size-4" /> Claim on Spotify for Artists
                  </a>
                  <button onClick={() => studioGo("claims")} className="rounded-full bg-hover px-4 py-2 font-semibold hover:bg-active">
                    Let the label help
                  </button>
                </div>
                <p className="text-xs text-sub">Already claimed by someone else? Ask that team&apos;s Admin to invite you, or contact Spotify for Artists support.</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-side p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 font-semibold">Profile health</div>
              <div className="text-2xl font-black tabular-nums" style={{ color: score >= 80 ? "#23a55a" : score >= 50 ? "#f0b232" : "#ed4245" }}>
                {score}%
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              {checks.map((c) => (
                <div key={c.label} className="flex gap-2 text-sm">
                  <span className={c.ok ? "text-ok" : "text-idle"}>{c.ok ? "✓" : "!"}</span>
                  <div>
                    <div>{c.label}</div>
                    {!c.ok && <div className="text-xs text-sub">{c.tip}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {p.lookalikes.length > 0 && (
            <div className="rounded-2xl bg-side p-4">
              <div className="font-semibold">🎭 Profiles with a similar name</div>
              <p className="text-xs text-sub">Could be impersonators, or simply different artists. Profile Defender can keep an eye on new ones.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {p.lookalikes.map((l) => (
                  <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-black/20 p-2 hover:bg-black/30">
                    {l.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.image} alt="" className="size-10 rounded-full object-cover" />
                    ) : (
                      <div className="grid size-10 place-items-center rounded-full bg-hover">?</div>
                    )}
                    <span className="truncate text-sm font-semibold">{l.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
