"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Plus, RefreshCw, ShieldCheck, Trash2, CircleX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { sp, type SpArtist, type SpTrack } from "@/lib/music";
import { spotifyArtistId } from "@/lib/links";
import { WATCH_LABEL, platformOf, type WatchPlatform } from "@/lib/releaseWatch";

type Tab = "check" | "watch" | "appeal";

/**
 * Takedown protection — keep releases live on Spotify, Apple Music & other stores:
 *  1. check a release for the things that get music removed (before you deliver it)
 *  2. watch your live releases and get flagged the moment one disappears
 *  3. appeal kit with ready-to-send messages if something is taken down
 */
export default function TakedownShield() {
  const [tab, setTab] = useState<Tab>("check");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-side p-1">
        {(
          [
            ["check", "Check a release"],
            ["watch", "Watch my releases"],
            ["appeal", "If it gets removed"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("flex-1 rounded-lg py-2 text-sm font-semibold", tab === id ? "bg-accent text-white" : "text-sub hover:text-txt")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "check" && <PreCheck />}
      {tab === "watch" && <Watch />}
      {tab === "appeal" && <Appeal />}
    </div>
  );
}

// ───────────────────────── 1. pre-release check ─────────────────────────
type Level = "high" | "medium" | "ok";
type Finding = { level: Level; title: string; fix: string };

const STORE_WORDS = /\b(official|official audio|official video|lyrics?|lyric video|hd|hq|4k|free download|explicit|clean version|spotify|apple music|tiktok|itunes|youtube|amazon|new single|out now|music video)\b/i;
const DERIVED = /\b(sped[ -]?up|slowed|reverb|nightcore|8d|daycore|remix|edit|bootleg|mashup|flip|cover|tribute|karaoke|instrumental of)\b/i;

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div>
      <div className="mb-1 text-sm font-semibold">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", value === v ? "bg-accent text-white ring-accent" : "bg-rail text-sub ring-transparent hover:text-txt")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreCheck() {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [feats, setFeats] = useState("");
  const [profile, setProfile] = useState("");
  const [isrc, setIsrc] = useState("");
  const [samples, setSamples] = useState<"none" | "cleared" | "uncleared">("none");
  const [cover, setCover] = useState<"no" | "licensed" | "unlicensed">("no");
  const [beat, setBeat] = useState<"own" | "licensed" | "unlicensed">("own");
  const [ai, setAi] = useState<"none" | "assist" | "clone">("none");
  const [dupe, setDupe] = useState<"no" | "yes">("no");
  const [promo, setPromo] = useState<"none" | "ads" | "guaranteed">("none");
  const [art, setArt] = useState<{ w: number; h: number; type: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Finding[] | null>(null);

  const pickArt = (f: File | undefined) => {
    if (!f) return setArt(null);
    const img = new Image();
    img.onload = () => {
      setArt({ w: img.naturalWidth, h: img.naturalHeight, type: f.type, size: f.size });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => toast("Couldn't read that image", "error");
    img.src = URL.createObjectURL(f);
  };

  const run = async () => {
    if (!title.trim() || !artist.trim()) return toast("Add the song title and your artist name", "error");
    setBusy(true);
    const out: Finding[] = [];
    const add = (level: Level, t: string, fix: string) => out.push({ level, title: t, fix });

    // rights
    if (samples === "uncleared") add("high", "Uses a sample that isn't cleared", "Get written clearance (master + publishing) or replace the sample. Uncleared samples are the #1 reason releases get removed.");
    if (cover === "unlicensed") add("high", "Cover song without a mechanical license", "Get a mechanical license (e.g. through your distributor's cover-song option or a licensing service) and credit the original songwriters.");
    if (beat === "unlicensed") add("high", "Beat without a license", "Buy a lease/exclusive and keep the contract. Free “type beats” usually don't allow streaming releases — the producer's Content ID will claim it.");
    if (ai === "clone") add("high", "AI voice that sounds like a real artist", "Stores remove releases that imitate a real artist's voice or name. Use your own voice or a fully original AI voice, and don't reference the artist.");
    if (dupe === "yes") add("high", "Same audio already released elsewhere", "Take down the other version first (or deliver from one distributor only). Duplicate content gets flagged and can get your account suspended.");
    if (promo === "guaranteed") add("high", "Guaranteed-stream / playlist promo", "Services that promise streams often use bots. Spotify removes tracks and withholds royalties for artificial streaming. Stop it and use real ads instead.");
    if (ai === "assist") add("medium", "AI-assisted production", "Disclose AI use if your distributor asks, and make sure you have rights to everything the AI tool generated.");
    if (samples === "cleared" || cover === "licensed" || beat === "licensed") add("ok", "Licenses in place", "Keep the contracts/receipts handy — you'll need them if anyone files a claim.");

    // metadata
    const t = title.trim();
    if (STORE_WORDS.test(t)) add("medium", "Title contains words stores reject", "Remove words like “Official”, “Lyrics”, “HD”, store names or “Out now” from the title.");
    if (/\b(feat\.?|ft\.?|featuring|prod\.?( by)?)\b/i.test(t)) add("medium", "Featured artist / producer written in the title", "Put featured artists in the featured-artist field and producers in credits — not in the title.");
    if (t.length > 6 && t === t.toUpperCase() && /[A-Z]/.test(t)) add("medium", "Title is ALL CAPS", "Use normal capitalization unless the official name is stylized that way.");
    if (/\p{Extended_Pictographic}/u.test(t)) add("medium", "Emoji in the title", "Remove emojis — most stores reject them.");
    if (DERIVED.test(t) && samples !== "cleared" && cover !== "licensed") add("high", "Looks like a remix / sped-up / cover of a song", "Only release edits of songs you own or have licensed. Otherwise the original label's Content ID will remove it.");

    // artist names (impersonation is a top takedown reason)
    const names = [artist.trim(), ...feats.split(/[,&]/).map((x) => x.trim()).filter(Boolean)];
    const mine = spotifyArtistId(profile);
    for (const [i, n] of names.entries()) {
      try {
        const r = await sp<{ items: SpArtist[] }>("search", { q: n, type: "artist" });
        const exact = (r.items ?? []).find((a) => a.name.toLowerCase() === n.toLowerCase());
        if (exact && (exact.followers ?? 0) >= 5000 && exact.id !== mine) {
          add(
            i === 0 ? "high" : "medium",
            i === 0 ? `“${n}” is already a big artist on Spotify (${(exact.followers ?? 0).toLocaleString()} followers)` : `Featuring “${n}” — that's an existing artist`,
            i === 0
              ? "Use a unique artist name, or if this IS you, paste your Spotify artist link above so it maps to your profile. Releasing under a famous name gets removed for impersonation."
              : `Only credit ${n} if they're really on the song and agreed to it — crediting a famous artist who isn't on the track gets releases removed.`,
          );
        } else if (i === 0 && exact && exact.id === mine) add("ok", "Artist profile matches", "Ask your distributor to deliver to this exact Spotify profile ID so it lands on the right page.");
      } catch {
        /* Spotify lookup unavailable — skip */
      }
    }
    if (profile.trim() && !mine) add("medium", "That isn't a Spotify artist link", "Paste the link from Spotify → your profile → ⋯ → Share → Copy link to artist.");

    // ISRC re-use
    const code = isrc.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code) {
      if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(code)) add("medium", "ISRC format looks wrong", "An ISRC is 12 characters, e.g. QT6HV2600001.");
      else {
        try {
          const r = await sp<{ source: string | null; tracks: SpTrack[] }>("isrc", { isrc: code });
          const other = (r.tracks ?? []).find((x) => x.name.toLowerCase() !== t.toLowerCase());
          if (other) add("high", `ISRC already used for “${other.name}” by ${other.artists.map((a) => a.name).join(", ")}`, "Each recording needs its own ISRC. Generate a new one — reused ISRCs cause rejections and mix-ups with someone else's song.");
          else if ((r.tracks ?? []).length) add("ok", "ISRC already belongs to this song", "Fine for re-deliveries of the same recording.");
        } catch {
          /* lookup unavailable */
        }
      }
    }

    // cover art
    if (art) {
      if (art.w !== art.h) add("medium", `Cover art isn't square (${art.w}×${art.h})`, "Make it exactly square, e.g. 3000×3000.");
      if (Math.min(art.w, art.h) < 3000) add("medium", `Cover art is ${art.w}×${art.h}`, "Most stores want at least 3000×3000 px.");
      if (!/jpe?g|png/.test(art.type)) add("medium", "Cover art format", "Use JPG or PNG.");
      if (art.size > 10 * 1024 * 1024) add("medium", "Cover art file is over 10 MB", "Export it smaller (JPG, high quality).");
    } else add("medium", "Cover art not checked", "Add your cover to check size. Also make sure it has no logos, brand names, website links, social handles, store badges or photos of other people you don't have permission to use.");

    const order: Record<Level, number> = { high: 0, medium: 1, ok: 2 };
    out.sort((a, b) => order[a.level] - order[b.level]);
    if (!out.some((f) => f.level !== "ok")) out.unshift({ level: "ok", title: "No takedown risks found", fix: "Keep your licenses, project files and split sheet — they're your proof if anyone files a claim." });
    setFound(out);
    setBusy(false);
  };

  const highs = found?.filter((f) => f.level === "high").length ?? 0;
  const meds = found?.filter((f) => f.level === "medium").length ?? 0;
  const inp = "w-full rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60";
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" className={inp} />
        <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Your artist name" className={inp} />
        <input value={feats} onChange={(e) => setFeats(e.target.value)} placeholder="Featured artists (comma separated)" className={inp} />
        <input value={isrc} onChange={(e) => setIsrc(e.target.value)} placeholder="ISRC (optional)" className={cn(inp, "font-mono uppercase")} />
        <input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="Your Spotify artist link (optional)" className={cn(inp, "sm:col-span-2")} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-side px-3 py-2.5 text-sm">
        <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => pickArt(e.target.files?.[0])} />
        <span className="font-semibold">Cover art</span>
        <span className="flex-1 text-right text-sub">{art ? `${art.w}×${art.h} · ${(art.size / 1024 / 1024).toFixed(1)} MB` : "choose image…"}</span>
      </label>
      <div className="space-y-3 rounded-2xl bg-side p-3">
        <Choice label="Samples" value={samples} onChange={setSamples} options={[["none", "No samples"], ["cleared", "Cleared / licensed"], ["uncleared", "Not cleared"]]} />
        <Choice label="Is it a cover of someone else's song?" value={cover} onChange={setCover} options={[["no", "No, original"], ["licensed", "Yes, licensed"], ["unlicensed", "Yes, no license"]]} />
        <Choice label="The beat" value={beat} onChange={setBeat} options={[["own", "Made it myself"], ["licensed", "Leased / bought"], ["unlicensed", "Free / no license"]]} />
        <Choice label="AI" value={ai} onChange={setAi} options={[["none", "No AI"], ["assist", "AI-assisted, original"], ["clone", "AI voice of a real artist"]]} />
        <Choice label="Already released somewhere else (other distributor / account)?" value={dupe} onChange={setDupe} options={[["no", "No"], ["yes", "Yes"]]} />
        <Choice label="Promotion" value={promo} onChange={setPromo} options={[["none", "None"], ["ads", "Real ads (Meta, TikTok, Marquee)"], ["guaranteed", "Guaranteed streams / playlist service"]]} />
      </div>
      <button onClick={() => void run()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-bold text-white hover:bg-accent-2 disabled:opacity-60">
        {busy ? <RefreshCw className="size-4 animate-spin" /> : <ShieldCheck className="size-5" />} Check for takedown risks
      </button>
      {found && (
        <div className="space-y-2">
          <div className={cn("rounded-xl p-3 text-sm font-bold", highs ? "bg-dnd/15 text-dnd" : meds ? "bg-idle/15 text-idle" : "bg-ok/15 text-ok")}>
            {highs ? `${highs} thing${highs > 1 ? "s" : ""} could get this removed — fix before releasing.` : meds ? `Low takedown risk · ${meds} thing${meds > 1 ? "s" : ""} could get it rejected or delayed.` : "Looks safe to release ✓"}
          </div>
          {found.map((f, i) => (
            <div key={i} className="flex gap-2.5 rounded-xl bg-side p-3">
              {f.level === "high" ? <CircleX className="mt-0.5 size-5 shrink-0 text-dnd" /> : f.level === "medium" ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-idle" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />}
              <div className="min-w-0">
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs text-sub">{f.fix}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── 2. watch releases ─────────────────────────
type Watched = { id: string; url: string; platform: WatchPlatform; label: string | null; title: string | null; status: "unknown" | "live" | "missing"; last_checked: string | null; last_live: string | null };

function Watch() {
  const [rows, setRows] = useState<Watched[]>([]);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("release_watch").select("id,url,platform,label,title,status,last_checked,last_live").order("created_at", { ascending: false });
    setRows((data as Watched[]) ?? []);
    return (data as Watched[]) ?? [];
  }, []);

  const checkOne = async (w: Watched) => {
    try {
      const r = await fetch(`/api/music/availability?url=${encodeURIComponent(w.url)}`);
      const j = (await r.json()) as { status: Watched["status"]; title: string | null };
      const now = new Date().toISOString();
      const patch: Partial<Watched> = { status: j.status, last_checked: now, ...(j.title ? { title: j.title.slice(0, 200) } : {}), ...(j.status === "live" ? { last_live: now } : {}) };
      await supabase.from("release_watch").update(patch).eq("id", w.id);
      return { ...w, ...patch, wentMissing: w.status === "live" && j.status === "missing" };
    } catch {
      return { ...w, wentMissing: false };
    }
  };
  const checkAll = useCallback(async (list: Watched[]) => {
    if (!list.length) return;
    setBusy(true);
    const res = [];
    for (let i = 0; i < list.length; i += 4) res.push(...(await Promise.all(list.slice(i, i + 4).map(checkOne))));
    setBusy(false);
    setRows(res);
    const gone = res.filter((r) => r.wentMissing);
    if (gone.length) toast(`⚠️ ${gone.length} release${gone.length > 1 ? "s" : ""} went missing — see “If it gets removed”`, "error");
  }, []);

  useEffect(() => {
    void load().then((list) => {
      const stale = list.filter((w) => !w.last_checked || Date.now() - new Date(w.last_checked).getTime() > 6 * 3600_000);
      if (stale.length) void checkAll(list);
    });
  }, [load, checkAll]);

  const add = async () => {
    const v = val.trim();
    const isIsrc = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(v.replace(/[-\s]/g, ""));
    const url = isIsrc ? `https://api.deezer.com/track/isrc:${v.replace(/[-\s]/g, "").toUpperCase()}` : v;
    const platform = platformOf(url);
    if (!platform) return toast("Paste a Spotify, Apple Music, YouTube, Deezer, SoundCloud or TIDAL link — or an ISRC", "error");
    const { data, error } = await supabase.from("release_watch").insert({ url, platform }).select("id,url,platform,label,title,status,last_checked,last_live").single();
    if (error) return toast(error.code === "23505" ? "Already watching that" : error.message, "error");
    setVal("");
    const checked = await checkOne(data as Watched);
    setRows((r) => [checked, ...r]);
  };
  const remove = async (id: string) => {
    await supabase.from("release_watch").delete().eq("id", id);
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const missing = rows.filter((r) => r.status === "missing").length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-sub">Add your release links (or ISRCs). Nexus checks they're still live and warns you the moment one disappears, so you can appeal fast.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-2"
      >
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="open.spotify.com/track/… · music.apple.com/… · ISRC" className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
        <button className="flex items-center gap-1 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-2">
          <Plus className="size-4" /> Watch
        </button>
      </form>
      {rows.length > 0 && (
        <div className="flex items-center justify-between text-xs text-sub">
          <span>
            {rows.length} watched · {missing ? <b className="text-dnd">{missing} missing</b> : <b className="text-ok">all live</b>}
          </span>
          <button onClick={() => void checkAll(rows)} disabled={busy} className="flex items-center gap-1 font-semibold hover:text-txt disabled:opacity-50">
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> Check now
          </button>
        </div>
      )}
      <div className="space-y-1.5">
        {rows.map((w) => {
          const meta = WATCH_LABEL[w.platform];
          return (
            <div key={w.id} className={cn("flex items-center gap-2.5 rounded-xl bg-side p-2.5", w.status === "missing" && "ring-1 ring-dnd/60")}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-black text-white" style={{ background: meta.color }}>
                {meta.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{w.title || w.label || w.url.replace(/^https:\/\//, "")}</div>
                <div className="text-[11px] text-sub">
                  {meta.name} · {w.last_checked ? `checked ${new Date(w.last_checked).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "not checked yet"}
                  {w.status === "missing" && w.last_live && ` · last seen ${new Date(w.last_live).toLocaleDateString()}`}
                </div>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", w.status === "live" ? "bg-ok/20 text-ok" : w.status === "missing" ? "bg-dnd/20 text-dnd" : "bg-white/10 text-sub")}>{w.status === "unknown" ? "?" : w.status}</span>
              <a href={w.url.startsWith("https://api.deezer.com") ? `https://www.deezer.com/search/${encodeURIComponent(w.url.split("isrc:")[1] ?? "")}` : w.url} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-md text-sub hover:bg-hover" aria-label="Open">
                <ExternalLink className="size-3.5" />
              </a>
              <button onClick={() => void remove(w.id)} className="grid size-7 place-items-center rounded-md text-sub hover:bg-hover hover:text-dnd" aria-label="Stop watching">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── 3. appeal kit ─────────────────────────
function Appeal() {
  const [kind, setKind] = useState<"why" | "appeal" | "counter" | "streams" | "profile">("why");
  const [f, setF] = useState({ name: "", artist: "", email: "", address: "", title: "", isrc: "", upc: "", links: "", distributor: "", claimant: "", proof: "" });
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const rel = `“${f.title || "[song title]"}” by ${f.artist || "[artist]"}${f.isrc ? ` (ISRC ${f.isrc})` : ""}${f.upc ? ` (UPC ${f.upc})` : ""}`;
  const sig = `${f.name || "[your full name]"}\n${f.email || "[email]"}`;

  const TEXT: Record<typeof kind, { label: string; subject: string; body: string }> = {
    why: {
      label: "Ask why it was removed",
      subject: `Removal reason request — ${f.title || "release"}`,
      body: `Hello ${f.distributor || "[distributor]"} support,\n\nMy release ${rel} was removed from one or more stores. Could you tell me:\n\n1. Which store(s) removed it and on what date\n2. The exact reason given (copyright claim, metadata, artificial streaming, duplicate content, other)\n3. If it's a claim, who filed it and what content it refers to\n4. What I need to send to get it restored\n\nI own the rights to this release and can provide proof right away.\n\nThank you,\n${sig}`,
    },
    appeal: {
      label: "Appeal to your distributor",
      subject: `Appeal — please restore ${f.title || "my release"}`,
      body: `Hello ${f.distributor || "[distributor]"} support,\n\nI'm appealing the removal of ${rel}.\n\nI am the rightful owner of this recording and composition. Proof attached:\n${f.proof || "- Project files / stems with timestamps\n- Beat lease or exclusive contract\n- Sample clearance / mechanical license (if any)\n- Signed split sheet"}\n\nStore links: ${f.links || "[links]"}\n\nPlease review the evidence and restore the release, and let me know if you need anything else.\n\nThank you,\n${sig}`,
    },
    counter: {
      label: "Counter-notice (false copyright claim)",
      subject: `DMCA counter-notification — ${f.title || "release"}`,
      body: `To the designated agent,\n\nThis is a counter-notification under 17 U.S.C. § 512(g).\n\n1. Material removed: ${rel}\n   Location before removal: ${f.links || "[links]"}\n2. Claim filed by: ${f.claimant || "[claimant, if known]"}\n\nI swear, under penalty of perjury, that I have a good faith belief that the material was removed or disabled as a result of mistake or misidentification of the material to be removed or disabled.\n\nI consent to the jurisdiction of the Federal District Court for the judicial district in which my address is located (or, if outside the United States, any judicial district in which the service provider may be found), and I will accept service of process from the person who provided the original notification or an agent of that person.\n\nName: ${f.name || "[full legal name]"}\nAddress: ${f.address || "[full address]"}\nEmail: ${f.email || "[email]"}\nDate: ${today}\n\nSignature: ${f.name || "[type your full name]"}`,
    },
    streams: {
      label: "Flagged for artificial streams",
      subject: `Artificial streaming flag — ${f.title || "release"}`,
      body: `Hello ${f.distributor || "[distributor]"} support,\n\nMy release ${rel} was flagged for artificial streaming. I did not buy streams or use bots.\n\nWhat I've done to promote it:\n${f.proof || "- [e.g. TikTok posts, Meta ads with receipts, Instagram stories, a real playlist curator — list them]"}\n\nIf a third party sent fake streams to my song, I had no part in it. Please share any data you have (dates, countries, sources) so I can find where they came from, and restore the release.\n\nThank you,\n${sig}`,
    },
    profile: {
      label: "Released on the wrong artist profile",
      subject: `Wrong artist profile — ${f.title || "release"}`,
      body: `Hello ${f.distributor || "[distributor]"} support,\n\nMy release ${rel} appeared on the wrong artist profile.\n\nCorrect profile: ${f.links || "[your Spotify / Apple artist link]"}\n\nPlease move it to the correct profile (or remove it from the wrong one and redeliver with my artist ID). I'll avoid any name confusion on future releases.\n\nThank you,\n${sig}`,
    },
  };
  const cur = TEXT[kind];
  const inp = "w-full rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60";
  return (
    <div className="space-y-3">
      <ol className="space-y-1 rounded-2xl bg-side p-3 text-sm">
        <li>
          <b>1.</b> Don&apos;t re-upload the same song right away — it can count as duplicate content.
        </li>
        <li>
          <b>2.</b> Ask your distributor for the exact reason, then appeal with proof.
        </li>
        <li>
          <b>3.</b> Someone falsely claimed your song? Send a counter-notice.
        </li>
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TEXT) as (typeof kind)[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", kind === k ? "bg-accent text-white" : "bg-side text-sub hover:text-txt")}>
            {TEXT[k].label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.name} onChange={upd("name")} placeholder="Your full name" className={inp} />
        <input value={f.email} onChange={upd("email")} placeholder="Email" className={inp} />
        <input value={f.artist} onChange={upd("artist")} placeholder="Artist name" className={inp} />
        <input value={f.title} onChange={upd("title")} placeholder="Song / release title" className={inp} />
        <input value={f.isrc} onChange={upd("isrc")} placeholder="ISRC" className={inp} />
        <input value={f.upc} onChange={upd("upc")} placeholder="UPC" className={inp} />
        <input value={f.distributor} onChange={upd("distributor")} placeholder="Distributor (e.g. Tunearo)" className={inp} />
        {kind === "counter" && <input value={f.claimant} onChange={upd("claimant")} placeholder="Who filed the claim" className={inp} />}
        {kind === "counter" && <input value={f.address} onChange={upd("address")} placeholder="Full address (required for counter-notices)" className={cn(inp, "sm:col-span-2")} />}
        <input value={f.links} onChange={upd("links")} placeholder={kind === "profile" ? "Your correct artist profile link" : "Store links"} className={cn(inp, "sm:col-span-2")} />
        {(kind === "appeal" || kind === "streams") && <textarea value={f.proof} onChange={upd("proof")} rows={3} placeholder={kind === "appeal" ? "Your proof (one per line)" : "How you promoted it (one per line)"} className={cn(inp, "sm:col-span-2")} />}
      </div>
      <div className="rounded-2xl bg-side p-3">
        <div className="mb-1 text-xs font-bold text-sub">Subject: {cur.subject}</div>
        <pre className="max-h-72 overflow-y-auto font-sans text-sm whitespace-pre-wrap">{cur.body}</pre>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(`${cur.subject}\n\n${cur.body}`);
              toast("Copied", "success");
            }}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-2"
          >
            <Copy className="size-4" /> Copy
          </button>
          <a href={`mailto:?subject=${encodeURIComponent(cur.subject)}&body=${encodeURIComponent(cur.body)}`} className="flex items-center gap-1.5 rounded-md bg-hover px-3 py-2 text-sm font-semibold hover:bg-active">
            <Check className="size-4" /> Open in Mail
          </a>
        </div>
        {kind === "counter" && <p className="mt-2 text-[11px] text-faint">Only send a counter-notice if you really own the rights — it's a legal statement, and the claimant can take it to court. Not legal advice.</p>}
      </div>
    </div>
  );
}
