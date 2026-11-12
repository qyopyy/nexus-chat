"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { asPeaks, fmtTime } from "@/lib/acetateAudio";
import { commentOnShare, downloadShare, openShare, recordListen, shareInfo, type SharedOpen, type SharedTrack } from "@/lib/acetate";
import { CONVERT_MAX_BYTES, convertLimitMessage } from "@/lib/acetateConvert";
import { featureFlags, loadFeatureFlags } from "@/lib/featureFlags";
import AcetateConvert from "./AcetateConvert";
import { updateMyProfile } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { AcetateMark, Waveform } from "./AcetateBits";

export default function AcetateListen({ token }: { token: string }) {
  const clean = token.replace(/[^a-f0-9]/gi, "").slice(0, 64);
  const [infoTitle, setInfoTitle] = useState("Acetate");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<SharedOpen | null>(null);
  const [index, setIndex] = useState(0);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [comment, setComment] = useState("");
  const [guest, setGuest] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [canConvert, setCanConvert] = useState(featureFlags().format_convert);
  const [convertFile, setConvertFile] = useState<File | null>(null);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentRef = useRef(0);
  const track: SharedTrack | null = opened?.tracks[index] ?? null;
  const version = useMemo(() => {
    if (!track) return null;
    return track.versions.find((v) => v.id === versionId) ?? track.versions[0] ?? null;
  }, [track, versionId]);

  useEffect(() => {
    void loadFeatureFlags().then((flags) => setCanConvert(flags.format_convert));
  }, []);

  useEffect(() => {
    let live = true;
    const pending = shareInfo(clean);
    const timed = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    void Promise.race([pending, timed])
      .then((info) => {
        if (!live) return;
        if (!info?.ok) {
          setError(info?.reason === "expired" ? "This link has expired." : info ? "This link isn't available." : "Couldn't reach Acetate. Check your connection and try again.");
          return;
        }
        setInfoTitle(info.title || "Acetate");
        setNeedsPassword(!!info.password);
        if (!info.password) void unlock("");
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      if (data.session?.user.id) {
        useApp.setState({ userId: data.session.user.id });
        setSignedIn(true);
      }
    });
    return () => {
      live = false;
    };
    // unlock is stable enough for the initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean]);

  async function unlock(pw: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await openShare(clean, pw);
      setOpened(data);
      setNeedsPassword(false);
      setPassword(pw);
      setIndex(0);
      setVersionId(data.tracks[0]?.versions[0]?.id ?? null);
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open this link");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !version?.url) return;
    if (audio.getAttribute("data-key") !== version.id) {
      audio.src = version.url;
      audio.setAttribute("data-key", version.id);
      setCurrent(0);
    }
    audio.volume = volume;
    if (playing) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [version, playing, volume]);

  useEffect(() => {
    if (!playing || !track) return;
    void recordListen(track.id, clean, password).catch(() => undefined);
  }, [playing, track, clean, password]);

  useEffect(() => {
    if (!playing || !track || !signedIn) return;
    const push = () => {
      if (!useApp.getState().userId) return;
      void updateMyProfile(
        {
          now_playing: {
            title: track.title,
            artist: opened?.owner_name || opened?.owner || "Acetate",
            album: opened?.kind === "project" ? opened.title : null,
            url: window.location.href,
            image: track.art || opened?.art || null,
            at: new Date().toISOString(),
            source: "acetate",
            progress_ms: Math.round(currentRef.current * 1000),
            duration_ms: version?.duration ? Math.round(version.duration * 1000) : undefined,
          },
        },
        true,
      );
    };
    push();
    const timer = window.setInterval(push, 20000);
    return () => window.clearInterval(timer);
  }, [playing, track, opened, version, signedIn]);

  function goto(next: number) {
    const row = opened?.tracks[next];
    if (!row) {
      setPlaying(false);
      return;
    }
    setIndex(next);
    setVersionId(row.versions[0]?.id ?? null);
    setPlaying(true);
  }

  async function postComment() {
    if (!track || !opened) return;
    setBusy(true);
    try {
      await commentOnShare({
        token: clean,
        password,
        trackId: track.id,
        versionId: version?.id,
        at: current,
        body: comment,
        guest,
      });
      setComment("");
      const data = await openShare(clean, password, false);
      setOpened(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't comment");
    } finally {
      setBusy(false);
    }
  }

  const duration = version?.duration || audioRef.current?.duration || 0;
  const peaks = asPeaks(version?.peaks);

  return (
    <div className="h-full overflow-y-auto bg-[#100e0c] text-[#f3eadf]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/acetate" className="flex items-center gap-2">
          <AcetateMark size={28} />
          <span className="font-serif text-xl">Acetate</span>
        </Link>
        {opened && <span className="text-xs tracking-[0.2em] text-[#a3988c] uppercase">{opened.listing === "public" ? "Public link" : "Unlisted"}</span>}
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16">
        <p className="text-sm text-[#a3988c]">{opened?.owner_name || opened?.owner || "A private cut"}</p>
        <h1 className="mt-1 font-serif text-4xl">{opened?.title || infoTitle}</h1>
        {opened?.note && <p className="mt-3 text-[#a3988c]">{opened.note}</p>}
        {!opened && !error && <p className="mt-6 text-sm text-[#a3988c]">Opening this cut…</p>}
        {error && <p className="mt-4 text-sm text-[#d4653a]">{error}</p>}

        {needsPassword && !opened && (
          <form
            className="mt-6 max-w-sm space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock(password);
            }}
          >
            <label className="block text-sm text-[#a3988c]">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-[#3c342c] bg-[#1a1612] px-4 py-3 outline-none focus:border-[#e4a15a]"
              />
            </label>
            <button type="submit" disabled={busy} className="rounded-full bg-[#e4a15a] px-5 py-2.5 font-semibold text-[#100e0c] disabled:opacity-50">
              Play
            </button>
          </form>
        )}

        {opened && track && (
          <section className="mt-6 rounded-3xl border border-[#3c342c] bg-[#1a1612] p-4">
            <audio
              ref={audioRef}
              preload="metadata"
              onTimeUpdate={(e) => {
                currentRef.current = e.currentTarget.currentTime;
                setCurrent(e.currentTarget.currentTime);
              }}
              onEnded={() => goto(index + 1)}
            />
            <div className="flex items-center gap-3">
              {(track.art || opened.art) && <img src={track.art || opened.art || ""} alt="" className="size-16 rounded-xl object-cover" />}
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{track.title}</div>
            <div className="text-sm text-[#a3988c]">
              {version?.label || (version ? `Version ${version.version}` : "No audio yet")} · {fmtTime(current)} / {fmtTime(duration)}
            </div>
            {track && "lyrics" in track && (track as { lyrics?: string | null }).lyrics && (
              <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-[#f3eadf]">{(track as { lyrics?: string | null }).lyrics}</pre>
            )}
              </div>
            </div>
            <div className="mt-4">
              <Waveform
                peaks={peaks}
                tall
                progress={duration ? current / duration : 0}
                markers={(track.comments ?? []).map((c) => (duration ? c.at / duration : 0))}
                onSeek={(ratio) => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  audio.currentTime = ratio * (duration || 0);
                  setCurrent(audio.currentTime);
                }}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" aria-label="Previous" onClick={() => (current > 2 ? (audioRef.current!.currentTime = 0) : goto(index - 1))} className="grid size-10 place-items-center rounded-full hover:bg-white/5">
                <SkipBack className="size-4" />
              </button>
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)} className="grid size-12 place-items-center rounded-full bg-[#e4a15a] text-[#100e0c]">
                {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
              </button>
              <button type="button" aria-label="Next" onClick={() => goto(index + 1)} className="grid size-10 place-items-center rounded-full hover:bg-white/5">
                <SkipForward className="size-4" />
              </button>
              <label className="ml-auto flex w-28 items-center gap-2 text-[11px] text-[#a3988c]">
                <span className="sr-only">Volume</span>
                <input type="range" min={0} max={1} step={0.01} value={volume} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} className="w-full accent-[#e4a15a]" />
              </label>
              {track.versions.length > 1 && (
                <select
                  value={version?.id ?? ""}
                  onChange={(e) => setVersionId(e.target.value)}
                  className="ml-auto rounded-full border border-[#3c342c] bg-transparent px-3 py-1.5 text-sm"
                >
                  {track.versions.map((v) => (
                    <option key={v.id} value={v.id} className="bg-[#1a1612]">
                      {v.label || `Version ${v.version}`}
                    </option>
                  ))}
                </select>
              )}
              {opened.download && version && (
                <button
                  type="button"
                  className="rounded-full border border-[#3c342c] px-3 py-1.5 text-sm"
                  onClick={() => {
                    void downloadShare(clean, version.id, password).then((file) => {
                      const a = document.createElement("a");
                      a.href = file.url;
                      a.download = file.name;
                      a.click();
                    }).catch((e: Error) => setError(e.message));
                  }}
                >
                  Download
                </button>
              )}
              {opened.download && canConvert && version && (
                <button
                  type="button"
                  className="rounded-full border border-[#3c342c] px-3 py-1.5 text-sm"
                  onClick={() => {
                    if (Number(version.bytes) > CONVERT_MAX_BYTES) {
                      setConvertNote(convertLimitMessage(Number(version.bytes)));
                      return;
                    }
                    void downloadShare(clean, version.id, password).then(async (file) => {
                      const res = await fetch(file.url);
                      if (!res.ok) throw new Error("Couldn't download that file");
                      const blob = await res.blob();
                      setConvertFile(new File([blob], file.name, { type: blob.type || "application/octet-stream" }));
                      setConvertNote(null);
                    }).catch((e: Error) => setConvertNote(e.message));
                  }}
                >
                  Convert
                </button>
              )}
            </div>
            {opened.download && canConvert && convertFile && (
              <div className="mt-4">
                <AcetateConvert source={convertFile} sourceLabel={track.title} />
              </div>
            )}
            {opened.download && convertNote && <p className="mt-2 text-sm text-[#a3988c]">{convertNote}</p>}
          </section>
        )}

        {opened && opened.tracks.length > 1 && (
          <ol className="mt-4 space-y-1">
            {opened.tracks.map((row, i) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => goto(i)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${i === index ? "bg-[#2a241c]" : "hover:bg-white/5"}`}
                >
                  <span className="w-6 text-sm text-[#a3988c]">{i + 1}</span>
                  <span className="truncate">{row.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {opened && track && (
          <section className="mt-8">
            <h2 className="font-serif text-2xl">Notes on the timeline</h2>
            <ul className="mt-3 space-y-2">
              {(track.comments ?? []).map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      audio.currentTime = note.at;
                      setCurrent(note.at);
                      setPlaying(true);
                    }}
                    className="w-full rounded-2xl border border-[#3c342c] px-3 py-2 text-left hover:border-[#e4a15a]/40"
                  >
                    <span className="text-xs font-semibold text-[#e4a15a]">{fmtTime(note.at)} · {note.name}</span>
                    <span className="mt-0.5 block text-sm">{note.body}</span>
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void postComment();
              }}
            >
              {!signedIn && (
                <input
                  value={guest}
                  onChange={(e) => setGuest(e.target.value)}
                  placeholder="Your name"
                  maxLength={40}
                  className="w-full rounded-2xl border border-[#3c342c] bg-transparent px-4 py-2 outline-none"
                />
              )}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={`Comment at ${fmtTime(current)}`}
                maxLength={500}
                className="min-h-20 w-full rounded-2xl border border-[#3c342c] bg-transparent px-4 py-3 outline-none"
              />
              <button type="submit" disabled={busy || !comment.trim()} className="rounded-full bg-[#f3eadf] px-4 py-2 text-sm font-semibold text-[#100e0c] disabled:opacity-40">
                Post at {fmtTime(current)}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
