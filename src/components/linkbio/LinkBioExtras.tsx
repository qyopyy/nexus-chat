"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Music2, X } from "lucide-react";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { linkbioSaveExtras, type LinkBioPage } from "@/lib/linkbio";
import { connectSpotify, refreshLink, setShare, syncNow, useSpotifyUser } from "@/lib/spotifyUser";

const box = "mb-4 rounded-xl bg-black/25 p-3 ring-1 ring-white/10";
const input = "min-w-0 rounded-xl bg-black/40 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-[#a855f7]";

/** ISO → value for <input type="datetime-local"> in the viewer's timezone */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Settings → "Listening on Spotify" card + release countdown */
export default function LinkBioExtras({ page, onPage }: { page: LinkBioPage; onPage: (p: LinkBioPage) => void }) {
  const sp = useSpotifyUser();
  const [busy, setBusy] = useState(false);
  const [cdAt, setCdAt] = useState(toLocalInput(page.countdown_at));
  const [cdLabel, setCdLabel] = useState(page.countdown_label ?? "");
  const [cdUrl, setCdUrl] = useState(page.countdown_url ?? "");

  useEffect(() => {
    void refreshLink();
  }, []);
  useEffect(() => {
    setCdAt(toLocalInput(page.countdown_at));
    setCdLabel(page.countdown_label ?? "");
    setCdUrl(page.countdown_url ?? "");
  }, [page.countdown_at, page.countdown_label, page.countdown_url]);

  const saveExtras = async (patch: Parameters<typeof linkbioSaveExtras>[0]) => {
    setBusy(true);
    const next = await linkbioSaveExtras(patch);
    if (next) onPage(next);
    setBusy(false);
  };

  const showNp = page.show_now_playing !== false;
  const np = page.now_playing;

  return (
    <>
      <div className={box}>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white/60 uppercase">
          <Music2 className="size-4 text-[#1DB954]" /> Listening on Spotify
        </div>
        {!sp.loaded ? (
          <p className="text-sm text-white/50">Checking Spotify…</p>
        ) : !sp.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-white/60">Connect Spotify and your page shows the song you&apos;re playing — live, with album art and a progress bar.</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await connectSpotify(`${window.location.pathname}${window.location.search}`);
                } catch (e) {
                  toast((e as Error).message, "error");
                }
              }}
              className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-bold text-black"
            >
              Connect Spotify
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {sp.me?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sp.me.image} alt="" className="size-7 rounded-full object-cover" />
              ) : (
                <span className="grid size-7 place-items-center rounded-full bg-[#1DB954] text-xs font-black text-black">♫</span>
              )}
              <span className="min-w-0 flex-1 truncate">
                Connected as <b>{sp.me?.name ?? "Spotify"}</b>
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showNp && sp.share}
                disabled={busy}
                onChange={async (e) => {
                  const on = e.target.checked;
                  if (on && !sp.share) await setShare(true);
                  await saveExtras({ show_now_playing: on });
                  if (on) void syncNow(true);
                }}
              />
              Show what I&apos;m listening to on my Nexus Link
            </label>
            {!sp.share && showNp && (
              <p className="text-[11px] text-amber-300/80">Sharing is off in Nexus Settings → Connections, so nothing shows yet. Tick the box above to turn it on.</p>
            )}
            {np ? (
              <div className="flex items-center gap-2 rounded-lg bg-[#1DB954]/10 px-2 py-1.5 text-xs ring-1 ring-[#1DB954]/30">
                {np.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={np.image} alt="" className="size-8 rounded object-cover" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  Now: <b>{np.title}</b> — {np.artist}
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-white/40">Nothing playing right now — the card appears on your page while music plays and updates every ~15 s.</p>
            )}
          </div>
        )}
      </div>

      <div className={box}>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white/60 uppercase">
          <CalendarClock className="size-4 text-[#c084fc]" /> Release countdown
        </div>
        <p className="mb-2 text-[11px] text-white/45">A live countdown at the top of your page — turns into your link (pre-save, stream) when it hits zero.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="datetime-local" value={cdAt} onChange={(e) => setCdAt(e.target.value)} className={input} />
          <input value={cdLabel} maxLength={60} onChange={(e) => setCdLabel(e.target.value)} placeholder="New single “City Lights”" className={input} />
          <input value={cdUrl} onChange={(e) => setCdUrl(e.target.value.trim())} placeholder="https://… pre-save / stream link (optional)" className={cn(input, "sm:col-span-2")} />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy || !cdAt || (!!cdUrl && !/^https:\/\//i.test(cdUrl))}
            onClick={() => void saveExtras({ countdown_at: fromLocalInput(cdAt), countdown_label: cdLabel, countdown_url: cdUrl })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#a855f7] px-3 py-2 text-sm font-bold disabled:opacity-40"
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save countdown
          </button>
          {page.countdown_at && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveExtras({ countdown_at: null, countdown_label: null, countdown_url: null })}
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
            >
              <X className="size-4" /> Remove
            </button>
          )}
        </div>
      </div>
    </>
  );
}
