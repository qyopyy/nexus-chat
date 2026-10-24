"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast, openModal } from "@/store/app";
import { supabase, errorText } from "@/lib/supabase";
import { listReleases } from "@/lib/dist";
import { loadProfiles } from "@/lib/data";
import { sp } from "@/lib/music";
import { useCanReview, useMyTier } from "@/lib/premium";
import { cn } from "@/lib/utils";
import NameTag from "@/components/ui/NameTag";
import type { DistRelease } from "@/lib/types";

type Platform = "spotify" | "apple" | "youtube";
type Claim = {
  id: number;
  user_id: string;
  platform: Platform;
  artist_name: string;
  profile_url: string | null;
  channel_url: string | null;
  topic_url: string | null;
  release_id: string | null;
  socials: string | null;
  role: string;
  note: string | null;
  status: "submitted" | "in_progress" | "needs_info" | "approved" | "rejected" | "cancelled";
  staff_note: string | null;
  created_at: string;
  updated_at: string;
};

const P: Record<Platform, { name: string; short: string; color: string; emoji: string; self: string; selfLabel: string; steps: string[]; reqs: string[]; profileHint?: string; profileRe?: RegExp }> = {
  spotify: {
    name: "Spotify for Artists",
    short: "Spotify",
    color: "#1DB954",
    emoji: "🟢",
    self: "https://artists.spotify.com/c/team/access/artist",
    selfLabel: "Claim on Spotify for Artists",
    reqs: ["Your music is live on Spotify (you have an artist profile)", "The profile isn't already claimed — if it is, ask its Admin to invite you", "Only one claim request per profile can be open at a time"],
    steps: ["Open Spotify for Artists and choose “Get access → Artist”", "Paste your Spotify artist link", "Add your website or socials so Spotify can verify you", "Distributor-delivered profiles are often approved right away; otherwise Spotify reviews it by hand"],
    profileHint: "https://open.spotify.com/artist/…",
    profileRe: /open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/[A-Za-z0-9]+/,
  },
  apple: {
    name: "Apple Music for Artists",
    short: "Apple Music",
    color: "#FA243C",
    emoji: "🔴",
    self: "https://artists.apple.com/",
    selfLabel: "Request access on Apple Music for Artists",
    reqs: ["Music live on Apple Music for at least 5 business days", "You're the primary artist on at least one album (featured artists can't claim)", "Claimed by the artist or their manager — a label rep works with the artist"],
    steps: ["Sign in at Apple Music for Artists with your Apple Account", "Tap “Request Artist Access” and paste your Apple Music artist link", "Pick one of your albums to confirm it's you", "Choose your role and add your distributor and social links to speed it up"],
    profileHint: "https://music.apple.com/…/artist/…",
    profileRe: /music\.apple\.com\/.+\/artist\//,
  },
  youtube: {
    name: "YouTube Official Artist Channel",
    short: "YouTube OAC",
    color: "#FF0033",
    emoji: "▶️",
    self: "https://support.google.com/youtube/answer/7336634",
    selfLabel: "YouTube's OAC guide",
    reqs: [
      "One channel for one artist or band, named exactly like the artist",
      "At least one official release delivered to YouTube Music by your distributor (an “Artist – Topic” channel exists)",
      "No Community Guidelines strikes; real music content on the channel (videos, lyric videos, visualizers)",
      "Requested through the label / distributor — that's this form",
    ],
    steps: ["Make sure your releases went to YouTube Music and the “Artist – Topic” channel shows them", "Check the channel and the Topic channel use the exact same artist name", "Send the request below — the label submits it to the distributor", "YouTube merges the Topic channel into your channel and adds the ♪ badge"],
  },
};

const STATUS: Record<Claim["status"], { label: string; cls: string }> = {
  submitted: { label: "Sent to the label", cls: "bg-[#f0b232]/20 text-[#f0b232]" },
  in_progress: { label: "In progress", cls: "bg-[#5865f2]/25 text-[#a5b0ff]" },
  needs_info: { label: "Needs info", cls: "bg-[#ed4245]/20 text-[#ff8a8c]" },
  approved: { label: "Approved", cls: "bg-[#23a55a]/20 text-[#57f287]" },
  rejected: { label: "Not approved", cls: "bg-white/10 text-sub" },
  cancelled: { label: "Cancelled", cls: "bg-white/10 text-sub" },
};

/** Studio → Profile claims: Spotify for Artists, Apple Music for Artists, YouTube Official Artist Channel */
export default function ProfileClaims() {
  const reviewer = useCanReview();
  const tier = useMyTier();
  const [tab, setTab] = useState<Platform | "queue">("spotify");
  const [mine, setMine] = useState<Claim[]>([]);
  const [queue, setQueue] = useState<Claim[]>([]);
  const [releases, setReleases] = useState<DistRelease[]>([]);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("profile_claims").select("*").order("created_at", { ascending: false }).limit(300);
    const all = (data ?? []) as Claim[];
    setMine(all.filter((c) => c.user_id === u.user?.id));
    setQueue(all.filter((c) => ["submitted", "in_progress", "needs_info"].includes(c.status)));
    void loadProfiles(all.map((c) => c.user_id));
  }, []);
  useEffect(() => {
    void load();
    void listReleases().then(setReleases);
  }, [load]);

  const live = releases.filter((r) => r.status === "live");

  return (
    <div className="space-y-4">
      <p className="text-sm text-sub">Get the keys to your artist profiles: stats, profile pictures, bios, Canvas, pitching — and the ♪ Official Artist Channel badge on YouTube. Claim them yourself in a few minutes, or let the label do it with you.</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(P) as Platform[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-full px-4 py-2 text-sm font-bold", tab === k ? "text-black" : "bg-hover hover:bg-active")} style={tab === k ? { background: P[k].color, color: k === "spotify" ? "#000" : "#fff" } : undefined}>
            {P[k].emoji} {P[k].short}
          </button>
        ))}
        {reviewer && (
          <button onClick={() => setTab("queue")} className={cn("rounded-full px-4 py-2 text-sm font-bold", tab === "queue" ? "bg-accent text-white" : "bg-hover hover:bg-active")}>
            Claims queue {queue.length > 0 && <span className="ml-1 rounded-full bg-dnd px-1.5 text-xs text-white">{queue.length}</span>}
          </button>
        )}
      </div>

      {tab === "queue" ? (
        <Queue rows={queue} onChange={load} />
      ) : (
        <PlatformPanel key={tab} p={tab} tier={tier} live={live} releases={releases} open={mine.find((c) => c.platform === tab && ["submitted", "in_progress", "needs_info"].includes(c.status)) ?? null} onSent={load} />
      )}

      {mine.length > 0 && (
        <div className="rounded-2xl bg-side p-4">
          <div className="mb-2 font-semibold">Your requests</div>
          <div className="space-y-2">
            {mine.map((c) => (
              <div key={c.id} className="rounded-xl border border-line/70 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {P[c.platform].emoji} {P[c.platform].name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sub">· {c.artist_name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
                </div>
                {c.staff_note && <div className="mt-1 rounded-lg bg-black/20 px-2.5 py-1.5 text-xs">Label: {c.staff_note}</div>}
                <div className="mt-1 flex items-center gap-2 text-xs text-sub">
                  #{c.id} · {new Date(c.created_at).toLocaleDateString([], { dateStyle: "medium" })}
                  {(c.status === "submitted" || c.status === "needs_info") && (
                    <button
                      onClick={async () => {
                        const { error } = await supabase.rpc("cancel_profile_claim", { p_id: c.id });
                        if (error) toast(errorText(error), "error");
                        else void load();
                      }}
                      className="underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformPanel({ p, tier, live, releases, open, onSent }: { p: Platform; tier: number; live: DistRelease[]; releases: DistRelease[]; open: Claim | null; onSent: () => void }) {
  const cfg = P[p];
  const [v, setV] = useState({ artist: "", profile: "", channel: "", topic: "", release: "", socials: "", role: "artist", note: "" });
  const [preview, setPreview] = useState<{ name: string; image: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const inp = "w-full min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

  // Spotify: confirm the profile link points at a real artist
  useEffect(() => {
    if (p !== "spotify" || !cfg.profileRe?.test(v.profile)) return setPreview(null);
    const t = setTimeout(() => {
      sp<{ kind: string; artist?: { name: string; image: string | null } }>("reverse", { url: v.profile })
        .then((r) => {
          if (r.artist) {
            setPreview({ name: r.artist.name, image: r.artist.image });
            setV((x) => (x.artist ? x : { ...x, artist: r.artist!.name }));
          }
        })
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [p, v.profile, cfg.profileRe]);

  const checks =
    p === "youtube"
      ? [
          { ok: live.length > 0, text: live.length ? `${live.length} live release${live.length > 1 ? "s" : ""} delivered through Nexus` : "No live release through Nexus yet (needed for the Topic channel)" },
          { ok: /youtube\.com\/(@|channel\/|c\/)/.test(v.channel), text: "Artist channel link" },
          { ok: !v.topic || /youtube\.com\/(@|channel\/)/.test(v.topic), text: "Topic channel link (optional but speeds it up)" },
        ]
      : [{ ok: !!cfg.profileRe?.test(v.profile), text: `${cfg.short} artist link` }];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-2xl bg-side p-4">
        <div className="text-lg font-black" style={{ color: cfg.color }}>
          {cfg.emoji} {cfg.name}
        </div>
        <div>
          <div className="mb-1 text-xs font-bold text-sub uppercase">Requirements</div>
          <ul className="space-y-1 text-sm">
            {cfg.reqs.map((r) => (
              <li key={r} className="flex gap-2">
                <span style={{ color: cfg.color }}>✓</span> {r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-xs font-bold text-sub uppercase">{p === "youtube" ? "How it works" : "Claim it yourself"}</div>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {cfg.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <a href={cfg.self} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold" style={{ background: cfg.color, color: p === "spotify" ? "#000" : "#fff" }}>
          <ExternalLink className="size-4" /> {cfg.selfLabel}
        </a>
      </div>

      <div className="space-y-3 rounded-2xl bg-side p-4">
        <div className="font-semibold">{p === "youtube" ? "Request your Official Artist Channel" : "Let the label help"}</div>
        {open ? (
          <div className="rounded-xl bg-black/25 p-3 text-sm">
            You already have an open request (#{open.id}) — <b>{STATUS[open.status].label}</b>. Nexus Bot messages you when it moves.
          </div>
        ) : tier < 3 ? (
          <div className="rounded-xl bg-black/25 p-3 text-sm">
            Label-assisted claims come with the 🎵 Music Distribution plan. You can still claim Spotify and Apple Music yourself with the button on the left.
            <button onClick={() => openModal("premium", "dist")} className="mt-2 block rounded-full bg-[#1DB954] px-4 py-1.5 font-bold text-black">
              See plans
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const { error } = await supabase.rpc("submit_profile_claim", {
                p_platform: p,
                p_artist: v.artist,
                p_profile: v.profile || null,
                p_channel: v.channel || null,
                p_topic: v.topic || null,
                p_release: v.release || null,
                p_socials: v.socials || null,
                p_role: v.role,
                p_note: v.note || null,
              });
              setBusy(false);
              if (error) return toast(errorText(error), "error");
              toast("Request sent — the label will take it from here", "success");
              onSent();
            }}
            className="space-y-2.5"
          >
            {p !== "youtube" && (
              <label className="block">
                <span className="mb-1 block text-xs text-sub">{cfg.short} artist link *</span>
                <input className={inp} value={v.profile} placeholder={cfg.profileHint} onChange={(e) => setV({ ...v, profile: e.target.value.trim() })} />
              </label>
            )}
            {preview && (
              <div className="flex items-center gap-2 rounded-xl bg-black/25 p-2 text-sm">
                {preview.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.image} alt="" className="size-9 rounded-full object-cover" />
                )}
                Found <b>{preview.name}</b> on Spotify ✓
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Artist name (exactly as on the platform) *</span>
              <input className={inp} value={v.artist} onChange={(e) => setV({ ...v, artist: e.target.value })} />
            </label>
            {p === "youtube" && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs text-sub">Your YouTube artist channel *</span>
                  <input className={inp} value={v.channel} placeholder="https://youtube.com/@yourname" onChange={(e) => setV({ ...v, channel: e.target.value.trim() })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-sub">“Artist – Topic” channel (if you can find it)</span>
                  <input className={inp} value={v.topic} placeholder="https://youtube.com/channel/UC…" onChange={(e) => setV({ ...v, topic: e.target.value.trim() })} />
                </label>
              </>
            )}
            {releases.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs text-sub">One of your releases (helps verify you)</span>
                <select className={cn(inp, "bg-side")} value={v.release} onChange={(e) => setV({ ...v, release: e.target.value })}>
                  <option value="">—</option>
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} — {r.primary_artist_name} ({r.status})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Website & socials (Instagram, TikTok…)</span>
              <input className={inp} value={v.socials} onChange={(e) => setV({ ...v, socials: e.target.value })} />
            </label>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(["artist", "manager", "label"] as const).map((r) => (
                <button type="button" key={r} onClick={() => setV({ ...v, role: r })} className={cn("rounded-full px-3 py-1 font-semibold", v.role === r ? "bg-accent text-white" : "bg-hover")}>
                  I&apos;m the {r}
                </button>
              ))}
            </div>
            <textarea className={cn(inp, "min-h-16")} value={v.note} placeholder="Anything the label should know (optional)" onChange={(e) => setV({ ...v, note: e.target.value })} />
            <ul className="space-y-0.5 text-xs">
              {checks.map((c) => (
                <li key={c.text} className={c.ok ? "text-ok" : "text-sub"}>
                  {c.ok ? "✓" : "○"} {c.text}
                </li>
              ))}
            </ul>
            <button disabled={busy || !checks[0].ok && p !== "youtube" || (p === "youtube" && !checks[1].ok)} className="w-full rounded-full py-2.5 text-sm font-black disabled:opacity-40" style={{ background: cfg.color, color: p === "spotify" ? "#000" : "#fff" }}>
              {busy ? "Sending…" : "Send to the label"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Queue({ rows, onChange }: { rows: Claim[]; onChange: () => void }) {
  if (!rows.length) return <p className="rounded-2xl bg-side p-6 text-center text-sm text-sub">No open claim requests. 🎉</p>;
  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.id} className="rounded-2xl bg-side p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">
              #{c.id} {P[c.platform].emoji} {P[c.platform].name}
            </span>
            <span className="min-w-0 flex-1 truncate">— {c.artist_name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
          </div>
          <div className="mt-1 text-xs text-sub">
            by <NameTag userId={c.user_id} badges={false} /> · {c.role} · {new Date(c.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </div>
          <div className="mt-2 grid gap-1 text-xs">
            {[
              ["Profile", c.profile_url],
              ["Channel", c.channel_url],
              ["Topic channel", c.topic_url],
              ["Socials", c.socials],
              ["Note", c.note],
            ]
              .filter(([, x]) => x)
              .map(([k, x]) => (
                <div key={k} className="flex gap-2">
                  <span className="w-24 shrink-0 text-sub">{k}</span>
                  {/^https?:\/\//.test(x!) ? (
                    <a href={x!} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">
                      {x}
                    </a>
                  ) : (
                    <span className="break-words">{x}</span>
                  )}
                </div>
              ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ["in_progress", "Working on it", "bg-[#5865f2] text-white"],
                ["needs_info", "Needs info", "bg-hover"],
                ["approved", "Approved ✓", "bg-ok text-white"],
                ["rejected", "Reject", "bg-dnd/15 text-dnd"],
              ] as const
            ).map(([s, l, cls]) => (
              <button
                key={s}
                onClick={async () => {
                  const note = s === "needs_info" || s === "rejected" ? prompt("Message to the artist") : s === "approved" ? prompt("Message (optional)", "Access granted — check your email from the platform") : null;
                  if ((s === "needs_info" || s === "rejected") && note === null) return;
                  const { error } = await supabase.rpc("set_profile_claim", { p_id: c.id, p_status: s, p_note: note || null });
                  if (error) toast(errorText(error), "error");
                  else onChange();
                }}
                className={cn("rounded-full px-3 py-1 font-semibold", cls)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
