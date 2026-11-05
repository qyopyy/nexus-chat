"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Search, ShieldAlert, Zap } from "lucide-react";
import { toast } from "@/store/app";
import { NEED, gate } from "@/lib/premium";
import { cn } from "@/lib/utils";
import { spotifyConfig, spotifyTakedownLookup, type TakedownLookup } from "@/lib/music";
import {
  PLATFORM,
  emptyContact,
  loadContact,
  mailtoUrl,
  noticeText,
  problems,
  saveContact,
  saveTakedown,
  sendCode,
  sendDirect,
  sendStatus,
  verifyCode,
  type Contact,
  type Draft,
} from "@/lib/takedown";

const inp = "w-full min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

/**
 * Instant Spotify takedown for rights holders.
 * Spotify's developer API cannot force-delete catalog tracks — this tool resolves the
 * track with your Spotify keys and files an official copyright notice in one flow.
 */
export default function SpotifyTakedown() {
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState<TakedownLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [contact, setContact] = useState<Contact>(() => loadContact());
  const [signature, setSignature] = useState(() => loadContact().name || "");
  const [original, setOriginal] = useState("");
  const [agree, setAgree] = useState([false, false, false]);
  const [srv, setSrv] = useState<{ configured: boolean; test: boolean; verified: string[] }>({ configured: false, test: false, verified: [] });
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    void spotifyConfig().then((c) => setConfigured(c.configured));
    void sendStatus().then(setSrv);
  }, []);

  const draft: Draft | null = useMemo(() => {
    if (!hit) return null;
    return {
      platform: "spotify",
      work_title: hit.work_title,
      work_artist: hit.work_artist,
      isrc: hit.isrc,
      upc: hit.upc,
      original_url: original.trim() || null,
      infringing: hit.infringing,
      description: hit.description,
      contact,
      signature: signature.trim() || contact.name,
      shield_work: null,
    };
  }, [hit, contact, signature, original]);

  const issues = draft ? problems(draft) : ["Resolve a Spotify track first"];
  const ready = !!draft && issues.length === 0 && agree.every(Boolean);
  const myEmail = contact.email.trim().toLowerCase();
  const verified = srv.verified.includes(myEmail);

  const setC = (p: Partial<Contact>) => {
    setContact((c) => {
      const next = { ...c, ...p };
      saveContact(next);
      return next;
    });
  };

  const lookup = async () => {
    const q = query.trim();
    if (!q) return toast("Paste a Spotify track link or ISRC", "error");
    if (!configured) return toast("Spotify API keys aren't on the server yet", "error");
    setLooking(true);
    setHit(null);
    try {
      const isUrl = /spotify\.com|spotify:/i.test(q);
      const data = await spotifyTakedownLookup(isUrl ? { url: q } : { isrc: q });
      setHit(data);
      if (!signature && contact.name) setSignature(contact.name);
      toast("Track resolved — review and send the notice", "success");
    } catch (e) {
      toast((e as Error).message || "Couldn't resolve that on Spotify", "error");
    } finally {
      setLooking(false);
    }
  };

  const sendNexus = async (skipVerify = false) => {
    if (!gate(NEED.takedown, "Takedown notices")) return;
    if (!draft || !ready) return toast(`Missing: ${issues[0] ?? "the three statements"}`, "error");
    if (!srv.configured) {
      window.location.href = mailtoUrl(draft);
      toast("Email app opened with the Spotify notice — press Send there", "success");
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
      const r = await saveTakedown(draft, null, { status: "draft" });
      if (!r) return;
      const res = await sendDirect(r.id);
      toast(res.to === "test" ? "Sent (test mode)" : "Sent to Spotify copyright — check your inbox for the copy", "success");
      setAgree([false, false, false]);
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
      await sendNexus(true);
    } catch (e) {
      setBusy(false);
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[#1DB954]/35 bg-gradient-to-br from-[#1DB954]/15 via-side to-side p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#1DB954] text-black">
          <Zap className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black">Instant Spotify takedown</h3>
            <span className="rounded-full bg-[#1DB954]/25 px-2 py-0.5 text-[10px] font-black tracking-wide text-[#1DB954] uppercase">Beta</span>
          </div>
          <p className="mt-1 text-sm text-sub">
            Paste an infringing Spotify track link. Nexus uses your Spotify developer keys to pull title, artist, ISRC and UPC, then files an official copyright notice to Spotify&apos;s agent — usually within a minute.
          </p>
          <p className="mt-1.5 text-xs text-sub">
            Spotify does not expose a delete API for third-party apps. Removal still goes through Spotify&apos;s copyright process after they receive your verified notice.
          </p>
        </div>
      </div>

      {!configured && (
        <div className="rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">
          Spotify API keys are missing on the server. Add <code className="text-xs">SPOTIFY_CLIENT_ID</code> / <code className="text-xs">SPOTIFY_CLIENT_SECRET</code> as Supabase Edge Function secrets.
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void lookup()}
          placeholder="https://open.spotify.com/track/… or ISRC"
          className={cn(inp, "flex-1")}
          aria-label="Spotify track URL or ISRC"
        />
        <button
          onClick={() => void lookup()}
          disabled={looking || !configured}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"
        >
          {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Resolve
        </button>
      </div>

      {hit && (
        <div className="space-y-3 rounded-2xl bg-black/25 p-3 sm:p-4">
          <div className="flex gap-3">
            {(hit.track?.album?.image || hit.album?.image) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(hit.track?.album?.image || hit.album?.image)!} alt="" className="size-16 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-black">{hit.work_title}</div>
              <div className="truncate text-sm text-sub">{hit.work_artist}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-sub">
                {hit.isrc && <span className="rounded-full bg-white/10 px-2 py-0.5">ISRC {hit.isrc}</span>}
                {hit.upc && <span className="rounded-full bg-white/10 px-2 py-0.5">UPC {hit.upc}</span>}
              </div>
              {hit.infringing[0] && (
                <a href={hit.infringing[0]} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1DB954] hover:underline">
                  Open on Spotify <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Your name</span>
              <input
                className={inp}
                value={contact.name}
                onChange={(e) => {
                  setC({ name: e.target.value });
                  setSignature(e.target.value);
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Email (verified before send)</span>
              <input className={inp} type="email" value={contact.email} onChange={(e) => setC({ email: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Phone</span>
              <input className={inp} value={contact.phone} onChange={(e) => setC({ phone: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Country</span>
              <input className={inp} value={contact.country} onChange={(e) => setC({ country: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-sub">Mailing address</span>
              <input className={inp} value={contact.address} onChange={(e) => setC({ address: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-sub">Authorized original (optional — your official release link)</span>
              <input className={inp} value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="https://open.spotify.com/track/… (your legit copy)" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-sub">Signature</span>
              <input className={inp} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Full legal name" />
            </label>
          </div>

          <div className="space-y-2 text-sm">
            {[
              "I have a good faith belief this use is not authorized by the copyright owner, its agent, or the law.",
              "Under penalty of perjury, I am the owner or an authorized agent of an exclusive right that is allegedly infringed.",
              "I understand Spotify may share my contact details and this notice with the uploader.",
            ].map((t, i) => (
              <label key={i} className="flex items-start gap-2">
                <input type="checkbox" checked={agree[i]} onChange={(e) => setAgree((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1" />
                <span className="text-sub">{t}</span>
              </label>
            ))}
          </div>

          {issues.length > 0 && <p className="text-xs text-[#ff8a8c]">Still needed: {issues.join(" · ")}</p>}

          {codeFor ? (
            <div className="flex flex-col gap-2 rounded-xl bg-black/30 p-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-xs text-sub">Code sent to {codeFor}</span>
                <input className={inp} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" />
              </label>
              <button onClick={() => void confirmCode()} disabled={busy || code.length < 6} className="rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">
                Verify & send
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void sendNexus()}
                disabled={busy || !ready}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-3 text-sm font-black text-black disabled:opacity-50 sm:flex-none"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                Send notice to Spotify now
              </button>
              <a
                href={PLATFORM.spotify.form}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15"
              >
                Spotify report form <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}

          {draft && (
            <details className="rounded-xl bg-black/20 p-3 text-xs text-sub">
              <summary className="cursor-pointer font-semibold text-txt">Preview notice</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono">{noticeText(draft)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
