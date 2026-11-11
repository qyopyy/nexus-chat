"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { joinListenRoom, roomPlayhead, roomQueueItem, roomSnapshot, subscribeRoom, syncListenRoom, endListenRoom, type RoomSnapshot } from "@/lib/acetateRooms";
import { needsSeek } from "@/lib/syncMath";
import { fmtTime } from "@/lib/acetateAudio";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { AcetateMark } from "./AcetateBits";

export default function AcetateRoom({ token }: { token: string }) {
  const clean = token.replace(/[^a-f0-9]/gi, "").slice(0, 64);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const userId = useApp((s) => s.userId);

  async function refresh(roomId: string) {
    const next = await roomSnapshot(roomId);
    setSnap(next);
    if (next.track?.path) {
      const item = await roomQueueItem(next.track);
      setUrl(item?.url ?? null);
    }
  }

  useEffect(() => {
    let live = true;
    let stop = () => {};
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) {
        if (live) setError("Sign in to join this room.");
        return;
      }
      useApp.setState({ userId: id });
      try {
        const joined = await joinListenRoom(clean);
        if (!live) return;
        if (!joined.ok || !joined.id) {
          setError("This listen link is closed.");
          return;
        }
        setSnap(joined);
        if (joined.track) {
          const item = await roomQueueItem(joined.track);
          if (live) setUrl(item?.url ?? null);
        }
        const unsub = subscribeRoom(joined.id, () => {
          void refresh(joined.id!).catch(() => undefined);
        });
        if (!live) unsub();
        else stop = unsub;
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't join");
      }
    });
    return () => {
      live = false;
      stop();
    };
  }, [clean]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url || !snap?.ok) return;
    if (audio.src !== url) {
      audio.src = url;
      const at = roomPlayhead(snap);
      if (at > 0.4) audio.currentTime = at;
    } else if (needsSeek(audio.currentTime, roomPlayhead(snap))) {
      audio.currentTime = roomPlayhead(snap);
    }
    if (snap.playing) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [url, snap]);

  const host = snap?.role === "host";
  const members = snap?.members ?? [];

  return (
    <div className="h-full overflow-y-auto bg-[#100e0c] text-[#f3eadf]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/acetate/app" className="flex items-center gap-2">
          <AcetateMark size={28} />
          <span className="font-serif text-xl">Listen together</span>
        </Link>
        <span className="text-xs tracking-[0.16em] text-[#a3988c] uppercase">{host ? "Host" : "Guest"}</span>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16">
        {error && <p className="text-[#d4653a]">{error}</p>}
        {!userId && !error && <p className="text-sm text-[#a3988c]">Checking your session…</p>}
        {snap?.ok && (
          <>
            <h1 className="font-serif text-4xl">{snap.track?.title || snap.title}</h1>
            <p className="mt-1 text-sm text-[#a3988c]">{snap.track?.artist} · {snap.playing ? "Playing" : "Paused"}</p>
            <audio ref={audioRef} className="mt-4 w-full" controls={host} />
            <p className="mt-2 text-xs text-[#a3988c]">{fmtTime(roomPlayhead(snap))}</p>
            {host && snap.id && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-full bg-[#e4a15a] text-[#100e0c]"
                  onClick={() => void syncListenRoom(snap.id!, snap.track_id || snap.track?.id || "", audioRef.current?.currentTime || 0, !snap.playing, (snap.queue as string[]) || [])}
                >
                  {snap.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
                </button>
                <button type="button" className="rounded-full border border-[#3c342c] px-4 text-sm" onClick={() => void endListenRoom(snap.id!).then(() => setError("Room ended."))}>
                  End room
                </button>
              </div>
            )}
            {!host && <p className="mt-3 text-sm text-[#a3988c]">The host controls play, pause, and which cut is on. Your player follows them.</p>}
            {snap.track?.lyrics && <pre className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">{snap.track.lyrics}</pre>}
            <h2 className="mt-6 font-serif text-2xl">In the room</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {members.map((member) => (
                <li key={member.user_id}>
                  {member.display_name || member.username || member.user_id.slice(0, 8)} · {member.role}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
