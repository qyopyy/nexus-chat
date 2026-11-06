"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Copy, ExternalLink, Search } from "lucide-react";
import { toast, useApp } from "@/store/app";
import { studioGo } from "@/store/studio";
import { addWatch, fmtNum, spotifyProfile, type SpotifyProfile } from "@/lib/protect";
import { linkbioMine, openLinkBio, publicLinkBioUrl } from "@/lib/linkbio";
import { SOCIAL_VERIFY, SOCIAL_VERIFY_LIST, linkVerifyReadiness, type SocialVerifyPlatform } from "@/lib/linkVerify";
import { cn } from "@/lib/utils";

const CLAIM = "https://artists.spotify.com/c/team/access/artist";

type Tab = "spotify" | SocialVerifyPlatform;

/** Verification hub: Spotify ✓ + TikTok / Snapchat / Facebook with Nexus Link as eligible website */
export default function Checkmark() {
  const [tab, setTab] = useState<Tab>("spotify");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("spotify")}
          className={cn("rounded-full px-4 py-2 text-sm font-bold", tab === "spotify" ? "bg-[#1DB954] text-black" : "bg-hover hover:bg-active")}
        >
          🟢 Spotify
        </button>
        {SOCIAL_VERIFY_LIST.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setTab(p.id)}
            className={cn("rounded-full px-4 py-2 text-sm font-bold", tab === p.id ? "text-black" : "bg-hover hover:bg-active")}
            style={tab === p.id ? { background: p.color, color: p.id === "snapchat" ? "#111" : "#fff" } : undefined}
          >
            {p.emoji} {p.short}
          </button>
        ))}
      </div>
      {tab === "spotify" ? <SpotifyCheckmark /> : <SocialVerifyPanel platform={tab} />}
    </div>
  );
}

function SocialVerifyPanel({ platform }: { platform: SocialVerifyPlatform }) {
  const cfg = SOCIAL_VERIFY[platform];
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : null));
  const [bioUrl, setBioUrl] = useState<string | null>(null);
  const [page, setPage] = useState<Awaited<ReturnType<typeof linkbioMine>>>(null);

  useEffect(() => {
    void linkbioMine().then((p) => {
      setPage(p);
      if (p?.username) setBioUrl(publicLinkBioUrl(p.username));
      else if (me?.username) setBioUrl(`${typeof window !== "undefined" ? window.location.origin : ""}/bio/${me.username}`);
    });
  }, [me?.username]);

  const checks = useMemo(() => (page ? linkVerifyReadiness(page) : null), [page]);
  const score = checks ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) : null;

  const copyUrl = async () => {
    if (!bioUrl) return toast("Create a Nexus Link page first", "error");
    try {
      await navigator.clipboard.writeText(bioUrl);
      toast("Nexus Link copied — paste as Website", "success");
    } catch {
      toast(bioUrl, "info");
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl p-5 text-white" style={{ background: `linear-gradient(135deg,#0a0a0a,${cfg.color}99 55%,#111)` }}>
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/80 uppercase">
          <BadgeCheck className="size-4" /> {cfg.badge} · Nexus Link eligible
        </div>
        <div className="mt-1 text-2xl font-black">{cfg.name}</div>
        <p className="mt-1 max-w-2xl text-sm text-white/85">{cfg.eligible}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-black text-black"
          >
            <Copy className="size-4" /> Copy Nexus Link as Website
          </button>
          <a
            href={cfg.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-4 py-2.5 text-sm font-bold ring-1 ring-white/25"
          >
            <ExternalLink className="size-4" /> {cfg.applyLabel}
          </a>
          <button type="button" onClick={() => openLinkBio()} className="rounded-full bg-black/40 px-4 py-2.5 text-sm font-bold ring-1 ring-white/25">
            Open Nexus Link dashboard
          </button>
        </div>
        {bioUrl && <p className="mt-3 font-mono text-xs text-white/70 break-all">{bioUrl}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl bg-side p-4">
          <div className="text-xs font-bold text-sub uppercase">Requirements</div>
          <ul className="space-y-1.5 text-sm">
            {cfg.reqs.map((r) => (
              <li key={r} className="flex gap-2">
                <span style={{ color: cfg.color }}>✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs font-bold text-sub uppercase">How to apply</div>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {cfg.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>

        <div className="space-y-3 rounded-2xl bg-side p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 font-semibold">Nexus Link readiness</div>
            {score != null && (
              <div className="text-2xl font-black tabular-nums" style={{ color: score >= 80 ? "#23a55a" : score >= 50 ? "#f0b232" : "#ed4245" }}>
                {score}%
              </div>
            )}
          </div>
          {!page ? (
            <div className="rounded-xl bg-black/25 p-3 text-sm">
              No Nexus Link page yet. Create one, then paste it as Website on {cfg.short}.
              <button type="button" onClick={() => openLinkBio()} className="mt-2 block rounded-full bg-accent px-4 py-1.5 font-bold text-white">
                Set up Nexus Link
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {checks!.map((c) => (
                <div key={c.label} className="flex gap-2 text-sm">
                  <span className={c.ok ? "text-ok" : "text-idle"}>{c.ok ? "✓" : "!"}</span>
                  <div>
                    <div>{c.label}</div>
                    {!c.ok && <div className="text-xs text-sub">{c.tip}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-black/20 p-3 text-xs text-sub">
            {cfg.tips.map((t) => (
              <div key={t}>• {t}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Spotify ✓ Verified Artist checker: stats, readiness, how to get (and keep) the checkmark */
function SpotifyCheckmark() {
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
          Spotify shows the checkmark on profiles that are claimed through Spotify for Artists — it can&apos;t be bought or added by any app. Check a profile here to see its stats, what&apos;s missing and how to claim it. Use your Nexus Link as the website when they ask.
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
                  <li>Verify with your website or socials — paste your Nexus Link (/bio/…) as Website.</li>
                  <li>Once you&apos;re in, the ✓ appears on the profile — then add a photo, bio and Artist Pick.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <a href={CLAIM} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#1DB954] px-4 py-2 font-bold text-black">
                    <ExternalLink className="size-4" /> Claim on Spotify for Artists
                  </a>
                  <button onClick={() => studioGo("claims")} className="rounded-full bg-hover px-4 py-2 font-semibold hover:bg-active">
                    Let the label help
                  </button>
                  <button onClick={() => openLinkBio()} className="rounded-full bg-hover px-4 py-2 font-semibold hover:bg-active">
                    Get Nexus Link URL
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
