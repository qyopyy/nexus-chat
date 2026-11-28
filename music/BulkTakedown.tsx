"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Layers, Loader2, Search, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { toast } from "@/store/app";
import { NEED, gate } from "@/lib/premium";
import { cn } from "@/lib/utils";
import { sp, spotifyConfig, spotifyTakedownLookup, type SpAlbum, type SpArtist } from "@/lib/music";
import { PLATFORM, emptyContact, loadContact, mailtoUrl, noticeText, problems, saveContact, saveTakedown, sendCode, sendDirect, sendStatus, verifyCode, type Contact, type Draft } from "@/lib/takedown";
import { deleteContactRow, hydrateContact, listContacts, saveContactRow, type SavedContact } from "@/lib/takedownContacts";
import { parseArtistId } from "@/lib/spotifyJourney";
import { EVIDENCE, REASONS as REASON_LIST, buildStatement, type EvidenceId, type ReasonId } from "@/lib/noticeCopy";
import NoticeStrength from "./NoticeStrength";
import DistributorNotify from "./DistributorNotify";
import type { NoticeLike } from "@/lib/noticeCopy";
import { MAX_LINKS, MAX_LOOKUPS, buildBulkDraft, bulkProblems, parseBulkInput, pickedWorks, selectAll, type BulkKind, type BulkWork } from "@/lib/takedownBulk";

const inp = "w-full min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
const STATEMENTS = [
  "I have a good faith belief this use is not authorized by the copyright owner, its agent, or the law.",
  "Under penalty of perjury, I am the owner or an authorized agent of an exclusive right that is allegedly infringed.",
  "I understand Spotify may share my contact details and this notice with the uploader.",
];
type Hit = { key: string; input: string; work?: BulkWork; error?: string };
type Found = { artist: SpArtist; releases: SpAlbum[] };

/** One notice, many works: paste many songs, tick releases, or take on a whole artist profile. */
export default function BulkTakedown() {
  const [tab, setTab] = useState<BulkKind>("songs");
  const [configured, setConfigured] = useState(true);
  const [contact, setContact] = useState<Contact>(() => loadContact());
  const [signature, setSignature] = useState(() => loadContact().name || "");
  const [saved, setSaved] = useState<SavedContact[]>([]);
  const [saveLabel, setSaveLabel] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [reason, setReason] = useState<ReasonId>("reupload");
  const [firstReleased, setFirstReleased] = useState("");
  const [matching, setMatching] = useState("");
  const [evidence, setEvidence] = useState<EvidenceId[]>([]);
  const [edited, setEdited] = useState(false);
  const [statement, setStatement] = useState("");
  const [original, setOriginal] = useState("");
  const [agree, setAgree] = useState([false, false, false]);
  const [ownsAll, setOwnsAll] = useState(false);
  const [typedArtist, setTypedArtist] = useState("");
  const [srv, setSrv] = useState<{ configured: boolean; test: boolean; verified: string[] }>({ configured: false, test: false, verified: [] });
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // songs
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [looking, setLooking] = useState(false);
  // releases / artist
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<SpArtist[]>([]);
  const [found, setFound] = useState<Found | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void spotifyConfig().then((c) => setConfigured(c.configured));
    void sendStatus().then(setSrv);
    void listContacts().then((l) => {
      setSaved(l);
      const d = l.find((x) => x.is_default) ?? l[0];
      if (d && !loadContact().name) {
        setContact(d.contact);
        setSignature(d.contact.name);
      }
    });
    void hydrateContact();
  }, []);

  const setC = (p: Partial<Contact>) =>
    setContact((c) => {
      const next = { ...c, ...p };
      saveContact(next);
      if (p.name !== undefined) setSignature(p.name);
      return next;
    });

  const switchTab = (t: BulkKind) => {
    setTab(t);
    setReason(t === "artist" ? "impersonation" : "reupload");
    setEdited(false);
    setOwnsAll(false);
    setTypedArtist("");
    setAgree([false, false, false]);
    if (found) setPicked(selectAll(found.releases.map((r) => r.id ?? ""), t === "artist"));
  };

  // ---------------------------------------------------------------- songs: resolve a pasted list
  const resolveList = async () => {
    const p = parseBulkInput(text);
    const todo = [...p.links.map((u) => ({ url: u })), ...p.isrcs.map((i) => ({ isrc: i }))];
    if (!todo.length) return toast("Paste Spotify track/album links or ISRCs, one per line", "error");
    if (!configured) return toast("Spotify API keys aren't on the server yet", "error");
    const run = todo.slice(0, MAX_LOOKUPS);
    if (todo.length > run.length) toast(`Resolving the first ${MAX_LOOKUPS} — do the rest in a second notice`, "info");
    setLooking(true);
    setHits([]);
    const out: Hit[] = new Array(run.length);
    let next = 0;
    const worker = async () => {
      while (next < run.length) {
        const i = next++;
        const inp0 = run[i]!;
        const input = "url" in inp0 ? inp0.url! : inp0.isrc!;
        try {
          const r = await spotifyTakedownLookup(inp0);
          out[i] = { key: input, input, work: { key: input, title: r.work_title, artist: r.work_artist, isrc: r.isrc, upc: r.upc, label: r.album?.label ?? null, urls: r.infringing } };
        } catch (e) {
          out[i] = { key: input, input, error: (e as Error).message || "Couldn't resolve" };
        }
        setHits(out.filter(Boolean));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setHits(out);
    setPicked(Object.fromEntries(out.filter((h) => h.work).map((h) => [h.key, true])));
    setLooking(false);
    if (p.ignored.length) toast(`Skipped ${p.ignored.length} item(s) that aren't Spotify links or ISRCs`, "info");
  };

  // ---------------------------------------------------------------- releases / artist: load a catalog
  const loadArtist = useCallback(
    async (id: string) => {
      setLooking(true);
      setFound(null);
      setChoices([]);
      try {
        const r = await sp<{ artist: SpArtist; releases: SpAlbum[] }>("artist", { id });
        setFound({ artist: r.artist, releases: r.releases });
        setPicked(selectAll(r.releases.map((x) => x.id ?? ""), tab === "artist"));
      } catch (e) {
        toast((e as Error).message || "Couldn't load that artist", "error");
      }
      setLooking(false);
    },
    [tab],
  );
  const findArtist = async () => {
    const s = q.trim();
    if (!s) return toast("Paste an artist link or type a name", "error");
    if (!configured) return toast("Spotify API keys aren't on the server yet", "error");
    const id = parseArtistId(s);
    if (id) return void loadArtist(id);
    setLooking(true);
    try {
      const r = await sp<{ items: SpArtist[] }>("search", { q: s, type: "artist" });
      setChoices(r.items.slice(0, 6));
      if (!r.items.length) toast("No artists found", "info");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setLooking(false);
  };

  // ---------------------------------------------------------------- the notice
  const works: BulkWork[] = useMemo(() => {
    if (tab === "songs") return hits.filter((h) => h.work && picked[h.key]).map((h) => h.work!);
    if (!found) return [];
    return pickedWorks(found.releases, picked, found.artist.name);
  }, [tab, hits, found, picked]);

  const profileUrl = tab === "artist" ? found?.artist.url ?? null : null;
  const owner = contact.role === "agent" ? contact.company.trim() || contact.name.trim() : contact.company.trim() || contact.name.trim();
  useEffect(() => {
    if (edited) return;
    setStatement(buildStatement({ reason, owner, platform: "Spotify", count: works.length || 1, firstReleased, originalUrl: original, matching, evidence }));
  }, [edited, reason, owner, works.length, firstReleased, original, matching, evidence]);
  const draft = useMemo(
    () => (works.length ? buildBulkDraft({ kind: tab, works, profileUrl, artistName: found?.artist.name, statement, original, contact, signature }) : null),
    [tab, works, profileUrl, found, statement, original, contact, signature],
  );
  const issues = useMemo(() => {
    const b = bulkProblems({ kind: tab, works, profileUrl, artistName: found?.artist.name, typedArtist, ownsAll, contact, signature });
    const extra = draft ? problems(draft as unknown as Draft).filter((x) => !b.some((y) => y.toLowerCase().includes(x.toLowerCase().slice(0, 8)))) : [];
    return [...b, ...extra.filter((x) => !/^(Your |Phone|Postal|Country|Signature|Company)/.test(x))];
  }, [tab, works, profileUrl, found, typedArtist, ownsAll, contact, signature, draft]);
  const ready = !!draft && issues.length === 0 && agree.every(Boolean);
  const myEmail = contact.email.trim().toLowerCase();
  const verified = srv.verified.includes(myEmail);

  const send = async (skipVerify = false) => {
    if (!gate(NEED.takedown, "Takedown notices")) return;
    if (!draft || !ready) return toast(`Missing: ${issues[0] ?? "the three statements"}`, "error");
    if (!srv.configured) {
      window.location.href = mailtoUrl(draft as unknown as Draft);
      toast("Email app opened with the notice — press Send there", "success");
      return;
    }
    setBusy(true);
    try {
      if (!verified && !skipVerify) {
        await sendCode(myEmail);
        setCodeFor(myEmail);
        setCode("");
        toast(`We emailed a 6-digit code to ${myEmail}`, "success");
        return;
      }
      const r = await saveTakedown(draft as unknown as Draft, null, { status: "draft" });
      if (!r) return;
      const res = await sendDirect(r.id);
      toast(res.to === "test" ? "Sent (test mode)" : `One notice covering ${works.length} item${works.length === 1 ? "" : "s"} sent to Spotify — check your inbox for the copy`, "success");
      setAgree([false, false, false]);
      setOwnsAll(false);
      setTypedArtist("");
    } catch (e) {
      const err = e as Error & { need_verify?: boolean };
      if (err.need_verify) {
        setSrv((x) => ({ ...x, verified: x.verified.filter((v) => v !== myEmail) }));
        toast("Please verify your email again", "info");
      } else toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const confirmCode = async () => {
    if (!codeFor) return;
    setBusy(true);
    try {
      await verifyCode(codeFor, code);
      setSrv((x) => ({ ...x, verified: [...x.verified, codeFor] }));
      setCodeFor(null);
      setBusy(false);
      toast("Email verified — sending to Spotify…", "success");
      await send(true);
    } catch (e) {
      setBusy(false);
      toast((e as Error).message, "error");
    }
  };

  // ---------------------------------------------------------------- saved claimant details
  const saveDetails = async () => {
    const hit = saved.find((s) => s.label.toLowerCase() === saveLabel.trim().toLowerCase());
    const r = await saveContactRow(saveLabel || contact.company || contact.name, contact, makeDefault, hit?.id);
    if (!r) return;
    setSaved((l) => [...l.filter((x) => x.id !== r.id).map((x) => (r.is_default ? { ...x, is_default: false } : x)), r]);
    toast("Claim details saved to your account", "success");
  };
  const useSaved = (s: SavedContact) => {
    setContact(s.contact);
    setSignature(s.contact.name);
    saveContact(s.contact);
    setSaveLabel(s.label);
  };
  const dropSaved = async (s: SavedContact) => {
    if (await deleteContactRow(s.id)) setSaved((l) => l.filter((x) => x.id !== s.id));
  };

  const releases = found?.releases.filter((r) => r.id) ?? [];
  const nPicked = releases.filter((r) => picked[r.id!]).length;
  const tabs: [BulkKind, string, React.ReactNode][] = [
    ["songs", "Many songs", <Layers key="a" className="size-4" />],
    ["releases", "Tick releases", <ShieldAlert key="b" className="size-4" />],
    ["artist", "Whole artist", <UserRound key="c" className="size-4" />],
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-[#1DB954]/35 bg-gradient-to-br from-[#1DB954]/10 via-side to-side p-4 sm:p-5">
      <div>
        <h3 className="text-lg font-black">Bulk Spotify takedown</h3>
        <p className="mt-1 text-sm text-sub">
          Take down many songs, tick the releases you want gone, or file against an entire artist profile — all in <b className="text-txt">one</b> official notice (up to {MAX_LINKS} links). Only for music you own or are authorized to act for.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => switchTab(id)} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold", tab === id ? "bg-[#1DB954] text-black" : "bg-hover hover:bg-active")}>
            {icon} {label}
          </button>
        ))}
      </div>

      {!configured && <div className="rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">Spotify API keys are missing on the server, so links can&apos;t be resolved yet.</div>}

      {tab === "songs" ? (
        <div className="space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"One per line:\nhttps://open.spotify.com/track/…\nhttps://open.spotify.com/album/…\nQT6HV2600001  (ISRC)"} className={cn(inp, "font-mono text-xs")} aria-label="Spotify links or ISRCs" />
          <button onClick={() => void resolveList()} disabled={looking || !configured} className="inline-flex items-center gap-2 rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">
            {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Resolve all (up to {MAX_LOOKUPS})
          </button>
          {hits.length > 0 && (
            <ul className="divide-y divide-white/5 rounded-xl bg-black/25">
              <li className="flex items-center gap-2 px-3 py-2 text-xs text-sub">
                <input type="checkbox" checked={hits.filter((h) => h.work).every((h) => picked[h.key])} onChange={(e) => setPicked(Object.fromEntries(hits.filter((h) => h.work).map((h) => [h.key, e.target.checked])))} aria-label="Select all" />
                {works.length} of {hits.filter((h) => h.work).length} selected
              </li>
              {hits.map((h) => (
                <li key={h.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input type="checkbox" disabled={!h.work} checked={!!h.work && !!picked[h.key]} onChange={(e) => setPicked((p) => ({ ...p, [h.key]: e.target.checked }))} />
                  {h.work ? (
                    <span className="min-w-0 flex-1 truncate">
                      <b>{h.work.title}</b> <span className="text-sub">— {h.work.artist}{h.work.isrc ? ` · ${h.work.isrc}` : ""}</span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[#ff8a8c]">
                      {h.input} — {h.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void findArtist()} placeholder="Artist link (open.spotify.com/artist/…) or name" className={cn(inp, "flex-1")} aria-label="Artist link or name" />
            <button onClick={() => void findArtist()} disabled={looking || !configured} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">
              {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find
            </button>
          </div>
          {choices.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((a) => (
                <button key={a.id} onClick={() => void loadArtist(a.id)} className="flex items-center gap-2 rounded-xl bg-black/25 p-2 text-left hover:bg-black/35">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.image ? <img src={a.image} alt="" className="size-10 rounded-full object-cover" /> : <span className="grid size-10 place-items-center rounded-full bg-hover">🎤</span>}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.name}</span>
                    <span className="block text-xs text-sub">{a.followers != null ? `${a.followers.toLocaleString()} followers` : "artist"}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {found && (
            <div className="space-y-2 rounded-xl bg-black/25 p-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {found.artist.image ? <img src={found.artist.image} alt="" className="size-12 rounded-full object-cover" /> : <span className="grid size-12 place-items-center rounded-full bg-hover">🎤</span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-black">{found.artist.name}</div>
                  <a href={found.artist.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1DB954] hover:underline">
                    Open profile <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="flex gap-1.5 text-xs">
                  <button onClick={() => setPicked(selectAll(releases.map((r) => r.id!), true))} className="rounded-full bg-hover px-3 py-1 font-bold hover:bg-active">
                    All
                  </button>
                  <button onClick={() => setPicked(selectAll(releases.map((r) => r.id!), false))} className="rounded-full bg-hover px-3 py-1 font-bold hover:bg-active">
                    None
                  </button>
                </div>
              </div>
              {tab === "artist" && <p className="text-xs text-sub">The profile page itself is included in the notice, plus every ticked release. Untick anything that is genuinely yours.</p>}
              <p className="text-xs text-sub">
                {nPicked} of {releases.length} releases ticked (Spotify returns the {releases.length} newest albums & singles — add older ones with “Many songs”).
              </p>
              <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto rounded-lg bg-black/20">
                {releases.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <input type="checkbox" checked={!!picked[r.id!]} onChange={(e) => setPicked((p) => ({ ...p, [r.id!]: e.target.checked }))} aria-label={`Take down ${r.name}`} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.image && <img src={r.image} alt="" className="size-9 rounded object-cover" />}
                    <span className="min-w-0 flex-1 truncate">
                      <b>{r.name}</b>
                      <span className="text-sub"> · {r.type} · {r.release_date}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {works.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-black/25 p-3 sm:p-4">
          <div className="text-sm font-semibold">
            {works.length} item{works.length === 1 ? "" : "s"} in this notice{profileUrl ? " + the artist profile" : ""}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-sub">Saved claim details:</span>
            {saved.length === 0 && <span className="text-xs text-sub">none yet — fill in below and save</span>}
            {saved.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-3 text-xs">
                <button onClick={() => useSaved(s)} className="font-semibold">
                  {s.label}
                  {s.is_default ? " ★" : ""}
                </button>
                <button onClick={() => void dropSaved(s)} className="grid size-5 place-items-center rounded-full hover:bg-white/15" aria-label={`Delete ${s.label}`}>
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Your full name</span>
              <input className={inp} value={contact.name} onChange={(e) => setC({ name: e.target.value })} autoComplete="name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Company / label (optional)</span>
              <input className={inp} value={contact.company} onChange={(e) => setC({ company: e.target.value })} autoComplete="organization" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">I am the…</span>
              <select className={inp} value={contact.role} onChange={(e) => setC({ role: e.target.value === "agent" ? "agent" : "owner" })}>
                <option value="owner">rights owner</option>
                <option value="agent">authorized agent</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Email (verified before send)</span>
              <input className={inp} type="email" value={contact.email} onChange={(e) => setC({ email: e.target.value })} autoComplete="email" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Phone</span>
              <input className={inp} value={contact.phone} onChange={(e) => setC({ phone: e.target.value })} autoComplete="tel" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Country</span>
              <input className={inp} value={contact.country} onChange={(e) => setC({ country: e.target.value })} autoComplete="country-name" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-sub">Postal address</span>
              <input className={inp} value={contact.address} onChange={(e) => setC({ address: e.target.value })} autoComplete="street-address" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-sub">Signature (type your full name)</span>
              <input className={inp} value={signature} onChange={(e) => setSignature(e.target.value)} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/20 p-2.5 text-xs">
            <input className={cn(inp, "max-w-48 py-1.5")} value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} placeholder="Label, e.g. My label" aria-label="Saved details label" />
            <label className="flex items-center gap-1.5 text-sub">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> default
            </label>
            <button onClick={() => void saveDetails()} className="rounded-full bg-hover px-3 py-1.5 font-bold hover:bg-active">
              Save claim details &amp; address
            </button>
            <span className="text-sub">Stored on your account, only you can read them.</span>
          </div>

          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-sub">What is the problem?</span>
                <select className={inp} value={reason} onChange={(e) => { setReason(e.target.value as ReasonId); setEdited(false); }}>
                  {REASON_LIST.filter((r) => (tab === "artist" ? r.profile : !r.profile)).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-sub">When did you first release it? (date)</span>
                <input className={inp} value={firstReleased} onChange={(e) => { setFirstReleased(e.target.value); setEdited(false); }} placeholder="2026-03-01" />
              </label>
              {reason === "sample" && (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-sub">Where does it match? (optional)</span>
                  <input className={inp} value={matching} onChange={(e) => { setMatching(e.target.value); setEdited(false); }} placeholder="0:12–0:48 of the infringing track" />
                </label>
              )}
            </div>
            <div>
              <span className="mb-1 block text-xs text-sub">Proof you can provide if asked</span>
              <div className="flex flex-wrap gap-1.5">
                {EVIDENCE.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { setEvidence((v) => (v.includes(e.id) ? v.filter((x) => x !== e.id) : [...v, e.id])); setEdited(false); }}
                    className={cn("rounded-full px-3 py-1 text-xs font-semibold", evidence.includes(e.id) ? "bg-[#1DB954] text-black" : "bg-hover hover:bg-active")}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs text-sub">
                <span>Statement (written for you — edit freely)</span>
                {edited && (
                  <button type="button" onClick={() => setEdited(false)} className="font-semibold text-[#1DB954]">
                    Rewrite it
                  </button>
                )}
              </span>
              <textarea className={inp} rows={5} value={statement} onChange={(e) => { setStatement(e.target.value); setEdited(true); }} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Your authorized release (optional)</span>
            <input className={inp} value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="https://open.spotify.com/… (your legit copy)" />
          </label>

          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ownsAll} onChange={(e) => setOwnsAll(e.target.checked)} className="mt-1" />
              <span>
                I own — or am authorized to act for the owner of — <b>every</b> item above. I checked that none of them is someone else&apos;s music.
              </span>
            </label>
            {tab === "artist" && found && (
              <label className="block">
                <span className="mb-1 block text-xs text-sub">
                  Whole-profile notice: type <b className="text-txt">{found.artist.name}</b> to confirm
                </span>
                <input className={inp} value={typedArtist} onChange={(e) => setTypedArtist(e.target.value)} />
              </label>
            )}
            {STATEMENTS.map((t, i) => (
              <label key={i} className="flex items-start gap-2">
                <input type="checkbox" checked={agree[i]} onChange={(e) => setAgree((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1" />
                <span className="text-sub">{t}</span>
              </label>
            ))}
            <p className="text-xs text-sub">Knowingly filing a false notice can make you liable for damages (17 U.S.C. § 512(f)). Don&apos;t use this on music you don&apos;t control.</p>
          </div>

          <NoticeStrength draft={draft as unknown as NoticeLike | null} works={works.length} hasEvidence={evidence.length > 0} />

          {issues.length > 0 && <p className="text-xs text-[#ff8a8c]">Still needed: {issues.join(" · ")}</p>}

          {codeFor ? (
            <div className="flex flex-col gap-2 rounded-xl bg-black/30 p-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-xs text-sub">Code sent to {codeFor}</span>
                <input className={inp} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" />
              </label>
              <button onClick={() => void confirmCode()} disabled={busy || code.length < 6} className="rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">
                Verify &amp; send
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void send()} disabled={busy || !ready} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-3 text-sm font-black text-black disabled:opacity-50 sm:flex-none">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                Send one notice for {works.length} item{works.length === 1 ? "" : "s"}
              </button>
              <a href={PLATFORM.spotify.form} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15">
                Spotify report form <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}

          {draft && (
            <DistributorNotify
              draft={draft as unknown as Draft}
              labels={works.map((w) => w.label)}
              isrc={works.length === 1 ? works[0]!.isrc : works.find((w) => w.isrc)?.isrc}
              titles={works.length === 1 ? `“${works[0]!.title}”` : `${works.length} recordings (${works.slice(0, 3).map((w) => `“${w.title}”`).join(", ")}${works.length > 3 ? " …" : ""})`}
            />
          )}

          {draft && (
            <details className="rounded-xl bg-black/20 p-3 text-xs text-sub">
              <summary className="cursor-pointer font-semibold text-txt">Preview notice</summary>
              <pre className="mt-2 max-h-64 overflow-auto font-mono whitespace-pre-wrap">{noticeText(draft as unknown as Draft)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
