"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Music2, Pause, Play, Send, Trash2, Upload, Users, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { bumpSpotifyTrackEmbed } from "@/lib/bump";
import { getBumpTrackBlob, pauseBumpMusic, useBumpMusic } from "@/lib/bumpMusic";
import {
  WUMP_TRACK_TOKEN,
  deleteWumpTrack,
  getWumpTrack,
  myWumpTracks,
  shareSpotifyToFriends,
  shareWumpTrack,
  sharedWithMe,
  uploadWumpTrack,
  wumpTrackUrl,
  type WumpTrack,
} from "@/lib/wumpShare";
import Avatar from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { WumpSongSearch, WumpTrackPlayer } from "./WumpProfileBits";

const fmtDur = (s?: number | null) => (s && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

/** One shared/own song with a play button (signed URL, single active player at a time). */
let activeAudio: HTMLAudioElement | null = null;
export function WumpTrackRow({ t, right }: { t: WumpTrack; right?: React.ReactNode }) {
  const owner = useApp((s) => s.profiles[t.owner_id]);
  const me = useApp((s) => s.userId);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      ref.current?.pause();
    },
    [],
  );

  async function toggle() {
    if (playing) {
      ref.current?.pause();
      return;
    }
    setBusy(true);
    const url = await wumpTrackUrl(t);
    setBusy(false);
    if (!url) return toast("Couldn't load this song", "error");
    if (!ref.current) {
      ref.current = new Audio();
      ref.current.onpause = () => setPlaying(false);
      ref.current.onended = () => setPlaying(false);
      ref.current.onplay = () => setPlaying(true);
    }
    if (activeAudio && activeAudio !== ref.current) activeAudio.pause();
    activeAudio = ref.current;
    pauseBumpMusic();
    if (ref.current.src !== url) ref.current.src = url;
    void ref.current.play().catch(() => toast("Tap again to play", "info"));
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/5">
      <button type="button" onClick={() => void toggle()} className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white" aria-label={playing ? "Pause" : "Play"}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4 fill-white" /> : <Play className="ml-0.5 size-4 fill-white" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{t.title}</div>
        <div className="truncate text-[11px] text-sub">
          {[t.artist, t.owner_id !== me ? `from @${owner?.username ?? "friend"}` : null, fmtDur(t.duration)].filter(Boolean).join(" · ")}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Message body → text plus inline players for Spotify links and shared songs. */
export function WumpMessageBody({ body }: { body: string }) {
  const spotify = body.match(/https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/[A-Za-z0-9]+[^\s]*/)?.[0] ?? null;
  const tok = body.match(WUMP_TRACK_TOKEN)?.[1] ?? null;
  const text = body
    .replace(WUMP_TRACK_TOKEN, "")
    .replace(spotify && bumpSpotifyTrackEmbed(spotify) ? spotify : "\u0000", "")
    .trim();
  return (
    <>
      {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
      {spotify && bumpSpotifyTrackEmbed(spotify) && <WumpTrackPlayer url={spotify} className="mt-1.5 w-[260px] max-w-full" />}
      {tok && <SharedTrackInline id={tok} />}
    </>
  );
}
function SharedTrackInline({ id }: { id: string }) {
  const [t, setT] = useState<WumpTrack | null | undefined>(undefined);
  useEffect(() => {
    void getWumpTrack(id).then(setT);
  }, [id]);
  if (t === undefined) return <div className="mt-1.5 h-12 w-[240px] animate-pulse rounded-xl bg-black/20" />;
  if (!t) return <div className="mt-1 text-[11px] opacity-70">Song no longer available</div>;
  return (
    <div className="mt-1.5 w-[260px] max-w-full rounded-xl bg-black/20">
      <WumpTrackRow t={t} />
    </div>
  );
}

function FriendPicker({ friendIds, onSend, onClose, busy }: { friendIds: string[]; onSend: (ids: string[]) => void; onClose: () => void; busy?: boolean }) {
  const profiles = useApp((s) => s.profiles);
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <div className="mt-2 rounded-xl bg-black/25 p-2">
      <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-bold tracking-wide text-sub uppercase">
        <Users className="size-3.5" /> Send to friends
        <button type="button" onClick={onClose} className="ml-auto text-sub hover:text-txt" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {!friendIds.length ? (
        <p className="px-1 py-2 text-xs text-sub">Add friends first.</p>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
          {friendIds.map((id) => {
            const on = sel.has(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (on) n.delete(id);
                      else n.add(id);
                      return n;
                    })
                  }
                  className={cn("flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left", on ? "bg-emerald-500/15" : "hover:bg-white/5")}
                >
                  <Avatar userId={id} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">{profiles[id]?.display_name || profiles[id]?.username || "Friend"}</span>
                  <span className={cn("grid size-5 place-items-center rounded-full border", on ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20")}>{on && <Check className="size-3" />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" disabled={!sel.size || busy} onClick={() => onSend([...sel])} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-40">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send{sel.size ? ` to ${sel.size}` : ""}
      </button>
    </div>
  );
}

/** Music tab section: upload your songs, send them (or Spotify tracks) to friends, and play what friends sent you. */
export default function WumpShareMusic({ friendIds }: { friendIds: string[] }) {
  const lib = useBumpMusic((s) => s.tracks);
  const [mine, setMine] = useState<WumpTrack[]>([]);
  const [inbox, setInbox] = useState<WumpTrack[]>([]);
  const [tab, setTab] = useState<"inbox" | "mine" | "spotify">("inbox");
  const [uploading, setUploading] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [spot, setSpot] = useState<{ url: string; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void myWumpTracks().then(setMine);
    void sharedWithMe().then(setInbox);
  }, []);

  async function upload(file: Blob, name: string) {
    setUploading(name);
    const t = await uploadWumpTrack(file, name);
    setUploading(null);
    if (t) {
      setMine((m) => [t, ...m]);
      setTab("mine");
      setPicker(t.id);
      toast("Uploaded — pick friends to send it to", "success");
    }
  }

  return (
    <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Music2 className="size-4 text-emerald-400" /> Share music with friends
      </div>
      <p className="mb-3 text-xs text-sub">Send your own songs or any Spotify track — friends can play them right in Wump.</p>

      <div className="mb-3 flex gap-1">
        {(
          [
            ["inbox", `Sent to me${inbox.length ? ` · ${inbox.length}` : ""}`],
            ["mine", `My uploads${mine.length ? ` · ${mine.length}` : ""}`],
            ["spotify", "Spotify"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", tab === id ? "bg-emerald-600 text-white" : "bg-white/5 text-sub")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "inbox" &&
        (!inbox.length ? (
          <p className="text-xs text-sub">Nothing yet — songs your friends send show up here (and in your Wump chat).</p>
        ) : (
          <div className="space-y-0.5">
            {inbox.map((t) => (
              <WumpTrackRow key={t.id} t={t} />
            ))}
          </div>
        ))}

      {tab === "mine" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!uploading} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} {uploading ? `Uploading ${uploading.slice(0, 20)}…` : "Upload a song"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f, f.name);
              }}
            />
          </div>
          {lib.length > 0 && (
            <details className="rounded-xl bg-black/20 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-sub">Share from my Wump library ({lib.length})</summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {lib.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <button
                      type="button"
                      disabled={!!uploading}
                      onClick={() =>
                        void getBumpTrackBlob(t.id).then((b) => {
                          if (b) void upload(b.type ? b : new Blob([b], { type: t.mime || "audio/mpeg" }), t.name);
                          else toast("File missing on this device", "error");
                        })
                      }
                      className="rounded-full bg-white/10 px-2 py-0.5 font-semibold"
                    >
                      Upload
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!mine.length ? (
            <p className="text-xs text-sub">Upload a song (up to 50 MB) to send it to friends. Only people you share with can play it.</p>
          ) : (
            mine.map((t) => (
              <div key={t.id}>
                <WumpTrackRow
                  t={t}
                  right={
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setPicker(picker === t.id ? null : t.id)} className="grid size-8 place-items-center rounded-full bg-white/10 text-emerald-300" aria-label="Send to friends">
                        <Send className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => confirm(`Delete “${t.title}”? Friends won't be able to play it anymore.`) && void deleteWumpTrack(t).then((ok) => ok && setMine((m) => m.filter((x) => x.id !== t.id)))}
                        className="grid size-8 place-items-center rounded-full text-sub hover:bg-white/10 hover:text-dnd"
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  }
                />
                {picker === t.id && (
                  <FriendPicker
                    friendIds={friendIds}
                    busy={sending}
                    onClose={() => setPicker(null)}
                    onSend={(ids) => {
                      setSending(true);
                      void shareWumpTrack(t.id, ids).finally(() => {
                        setSending(false);
                        setPicker(null);
                      });
                    }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "spotify" && (
        <div>
          {!spot ? (
            <>
              <p className="mb-2 text-xs text-sub">Find a song, tap Set to pick it, then choose friends.</p>
              <SpotifyPick onPick={(url, label) => setSpot({ url, label })} />
            </>
          ) : (
            <>
              <WumpTrackPlayer url={spot.url} />
              <FriendPicker
                friendIds={friendIds}
                busy={sending}
                onClose={() => setSpot(null)}
                onSend={(ids) => {
                  setSending(true);
                  void shareSpotifyToFriends(spot.url, spot.label, ids).finally(() => {
                    setSending(false);
                    setSpot(null);
                  });
                }}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Spotify search without touching the profile song. */
function SpotifyPick({ onPick }: { onPick: (url: string, label: string) => void }) {
  return <WumpSongSearch compact pickOnly onPick={onPick} />;
}
