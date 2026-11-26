// Spotify artist journey: claim the profile → get ready for the blue ✓ → grow it.
// Pure logic (no DOM / network) so it can be unit-tested. The checkmark itself is granted by Spotify only;
// this just tracks what's left to do, auto-detecting what it can from the public profile.

export type Phase = "claim" | "badge" | "grow";
export type StepId =
  | "release" | "find" | "request" | "verify" | "approved"
  | "photo" | "bio" | "links" | "pick" | "recent" | "nexuslink" | "lookalikes" | "defender"
  | "pitch" | "canvas" | "countdown" | "merch" | "tour";

export type Signals = {
  /** profile loaded from a Spotify artist link */
  found: boolean;
  hasImage: boolean;
  releases: number;
  /** ISO date of the newest release, if known */
  latestRelease?: string | null;
  lookalikes: number;
  hasNexusLink: boolean;
  defenderWatching: boolean;
};

export type StepDef = {
  id: StepId;
  phase: Phase;
  title: string;
  why: string;
  /** auto-detected from signals when true/false; undefined → manual */
  auto?: (s: Signals, now: number) => boolean;
  action?: { label: string; href?: string; go?: "linkbio" | "defender" | "claims" };
};

export const SFA = "https://artists.spotify.com";
export const CLAIM_URL = `${SFA}/c/team/access/artist`;

const months = (d: string | null | undefined, now: number) => (d ? (now - new Date(d).getTime()) / (30 * 86400_000) : Infinity);

export const STEPS: StepDef[] = [
  { id: "release", phase: "claim", title: "Have a release live on Spotify", why: "You can only claim a profile that exists — it's created when your distributor delivers your first release.", auto: (s) => s.releases > 0 },
  { id: "find", phase: "claim", title: "Find your artist profile link", why: "Open your artist page in Spotify → ••• → Share → Copy link, then paste it in the checker above.", auto: (s) => s.found },
  { id: "request", phase: "claim", title: "Request access in Spotify for Artists", why: "Go to Get access → Artist, paste your link and log in with a personal Spotify account.", action: { label: "Open Spotify for Artists", href: CLAIM_URL } },
  { id: "verify", phase: "claim", title: "Confirm it's you", why: "Spotify asks for your name, a public link (use your Nexus Link page) and your distributor or socials. Answer exactly as on your profile." , action: { label: "Get Nexus Link URL", go: "linkbio" } },
  { id: "approved", phase: "claim", title: "Access approved — you're in", why: "Approval usually takes a few days. Once you're in, the profile is yours to edit and the blue ✓ can appear." },
  { id: "photo", phase: "badge", title: "Profile photo", why: "Upload a clear, high-quality header and profile photo in Spotify for Artists → Profile.", auto: (s) => s.hasImage },
  { id: "bio", phase: "badge", title: "Write your bio", why: "Two or three honest sentences. Matching your socials helps people trust the profile." },
  { id: "links", phase: "badge", title: "Link your socials & website", why: "Add Instagram, TikTok, YouTube and your Nexus Link under Profile → Social links." },
  { id: "pick", phase: "badge", title: "Set an Artist Pick", why: "Pin your newest release or playlist at the top of your profile.", },
  { id: "recent", phase: "badge", title: "Release something in the last 12 months", why: "Active profiles get Release Radar, pitching and Countdown Pages.", auto: (s, now) => months(s.latestRelease, now) < 12 },
  { id: "nexuslink", phase: "badge", title: "Create your Nexus Link page", why: "A real HTTPS page with your name, photo and socials is the best 'website' to show when verifying.", auto: (s) => s.hasNexusLink, action: { label: "Open Nexus Link", go: "linkbio" } },
  { id: "lookalikes", phase: "badge", title: "No look-alike profiles", why: "Claim yours first so fans can tell it apart from copies; report impersonators to Spotify.", auto: (s) => s.found && s.lookalikes === 0 },
  { id: "defender", phase: "badge", title: "Protect it with Profile Defender", why: "Get alerts about releases you didn't make, name/photo changes and look-alikes.", auto: (s) => s.defenderWatching, action: { label: "Open Profile Defender", go: "defender" } },
  { id: "pitch", phase: "grow", title: "Pitch your next release to editors", why: "Pitch in Spotify for Artists at least 7 days before release — 4 weeks ahead is best. Use the pitch planner below." },
  { id: "canvas", phase: "grow", title: "Add Canvas looping videos", why: "3–8 second vertical loops on your tracks; they lift saves and shares." },
  { id: "countdown", phase: "grow", title: "Set up a Countdown Page", why: "Pre-save + countdown for an upcoming release, shareable anywhere." },
  { id: "merch", phase: "grow", title: "Connect merch", why: "Show your store on your profile and Now Playing." },
  { id: "tour", phase: "grow", title: "Add concerts", why: "Sync Songkick / Ticketmaster / Bandsintown so shows appear on your profile." },
];

export const PHASES: { id: Phase; title: string; blurb: string }[] = [
  { id: "claim", title: "1 · Claim your profile", blurb: "Get access through Spotify for Artists" },
  { id: "badge", title: "2 · Checkmark readiness", blurb: "Everything Spotify looks at before showing the ✓" },
  { id: "grow", title: "3 · Grow it", blurb: "Spotify for Artists tools worth switching on" },
];

export type StepState = StepDef & { done: boolean; auto_: boolean };
export type Journey = { steps: StepState[]; done: number; total: number; pct: number; remaining: StepState[]; next: StepState | null; phasePct: Record<Phase, number>; claimed: boolean };

export function computeJourney(signals: Signals, manual: Partial<Record<StepId, boolean>>, now = Date.now()): Journey {
  const steps = STEPS.map<StepState>((d) => {
    const a = d.auto ? d.auto(signals, now) : undefined;
    // auto steps are decided by data; a manual tick can still complete an auto step the API can't see
    return { ...d, auto_: a !== undefined, done: a === true || manual[d.id] === true };
  });
  const done = steps.filter((s) => s.done).length;
  const remaining = steps.filter((s) => !s.done);
  const pctOf = (list: StepState[]) => (list.length ? Math.round((list.filter((s) => s.done).length / list.length) * 100) : 0);
  const phasePct = { claim: pctOf(steps.filter((s) => s.phase === "claim")), badge: pctOf(steps.filter((s) => s.phase === "badge")), grow: pctOf(steps.filter((s) => s.phase === "grow")) };
  const claimed = steps.find((s) => s.id === "approved")?.done === true;
  return { steps, done, total: steps.length, pct: Math.round((done / steps.length) * 100), remaining, next: remaining[0] ?? null, phasePct, claimed };
}

/** accepts an open.spotify.com link, a spotify:artist: URI or a bare 22-char id */
export function parseArtistId(input: string): string | null {
  const t = input.trim();
  const m = t.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]{22})/) ?? t.match(/^spotify:artist:([A-Za-z0-9]{22})$/) ?? t.match(/^([A-Za-z0-9]{22})$/);
  return m?.[1] ?? null;
}

export type PitchWindow = { releaseDate: string; hardDeadline: string; idealDeadline: string; daysLeft: number; status: "ideal" | "ok" | "late" | "past" };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86400_000;
/** Spotify editorial pitching: at least 7 days before release; 4 weeks ahead recommended. */
export function pitchWindow(releaseDate: string, now = Date.now()): PitchWindow | null {
  const t = Date.parse(`${releaseDate}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const today = Date.parse(`${iso(new Date(now))}T00:00:00Z`);
  const daysToRelease = Math.round((t - today) / DAY);
  const status: PitchWindow["status"] = daysToRelease < 0 ? "past" : daysToRelease < 7 ? "late" : daysToRelease < 28 ? "ok" : "ideal";
  return { releaseDate, hardDeadline: iso(new Date(t - 7 * DAY)), idealDeadline: iso(new Date(t - 28 * DAY)), daysLeft: daysToRelease - 7, status };
}

export function pitchTemplate(o: { artist: string; title: string; genre?: string; mood?: string; story?: string }): string {
  return [
    `${o.artist} — "${o.title}"`,
    o.genre ? `Genre: ${o.genre}` : "",
    o.mood ? `Mood: ${o.mood}` : "",
    "",
    `Story: ${o.story?.trim() || "What's the song about, who made it, and why now? Keep it to 2–3 honest sentences — no hype words."}`,
    "",
    "Instruments / culture / moments: list anything that helps editors place it (instruments, language, scene, when to play it).",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

export const storeKey = (artistId: string) => `nexus.spjourney.${artistId}`;
export function readManual(raw: string | null): Partial<Record<StepId, boolean>> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const ids = new Set<string>(STEPS.map((s) => s.id));
    return Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k, v]) => ids.has(k) && v === true)) as Partial<Record<StepId, boolean>>;
  } catch {
    return {};
  }
}

export function journeySummary(artist: string, j: Journey): string {
  const lines = [`${artist} — Spotify checkmark progress: ${j.done}/${j.total} (${j.pct}%)`];
  if (j.remaining.length) lines.push("Remaining:", ...j.remaining.map((s) => `• ${s.title}`));
  else lines.push("All steps done 🎉");
  return lines.join("\n");
}
