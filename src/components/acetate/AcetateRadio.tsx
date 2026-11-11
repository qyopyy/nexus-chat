"use client";

import { useEffect, useState } from "react";
import { addComment, loadTrackDetail, reportAcetateError, type AcetateComment } from "@/lib/acetate";
import { loadRadio, playRadio, type RadioShelf, type RadioTrack } from "@/lib/acetateRadio";
import { useAcetatePlayer } from "@/lib/acetatePlayer";

function Shelf({ title, rows, onPlay }: { title: string; rows: RadioTrack[]; onPlay: (rows: RadioTrack[]) => void }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-serif text-2xl">{title}</h2>
        {rows.length > 0 && (
          <button type="button" className="rounded-full bg-[#f4f1ea] px-3 py-1 text-xs font-semibold text-[#070709]" onClick={() => onPlay(rows)}>
            Play
          </button>
        )}
      </div>
      {rows.length === 0 && <p className="text-sm text-[#8d8880]">Nothing here yet.</p>}
      <ul className="space-y-2">
        {rows.map((track) => (
          <li key={`${title}-${track.id}`} className="rounded-2xl border border-[#3c342c] px-3 py-2">
            <div className="font-semibold">{track.title}</div>
            <div className="text-xs text-[#a3988c]">{track.owner_name} · {track.likes} likes{track.token || track.mine ? "" : " · private, no public link"}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AcetateRadio() {
  const [shelf, setShelf] = useState<RadioShelf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<AcetateComment[]>([]);
  const [body, setBody] = useState("");
  const trackId = useAcetatePlayer((s) => s.queue[s.index]?.trackId ?? null);
  const lyrics = useAcetatePlayer((s) => s.queue[s.index]?.lyrics ?? null);

  useEffect(() => {
    void loadRadio().then(setShelf).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!trackId) return;
    void loadTrackDetail(trackId).then((detail) => setComments(detail.comments)).catch(() => setComments([]));
  }, [trackId]);

  async function play(rows: RadioTrack[]) {
    setError(null);
    try {
      await playRadio(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start radio");
    }
  }

  return (
    <section>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-[#7ee0c6] uppercase">Radio</p>
      <h1 className="font-serif text-3xl">From likes and follows</h1>
      <p className="mt-1 text-sm text-[#a3988c]">Public cuts play through their share link. Your own likes play from the library.</p>
      {error && <p className="mt-3 text-sm text-[#d4653a]">{error}</p>}
      {shelf && (
        <>
          <Shelf title="Liked" rows={shelf.likes} onPlay={(rows) => void play(rows)} />
          <Shelf title="Following" rows={shelf.following} onPlay={(rows) => void play(rows)} />
        </>
      )}
      {lyrics && <pre className="mt-4 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-[#1a1612] p-3 text-sm">{lyrics}</pre>}
      {trackId && (
        <section className="mt-4">
          <h2 className="font-serif text-2xl">Comments</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-xl bg-[#1a1612] px-3 py-2">
                <span className="text-[#a3988c]">{Math.floor(comment.at_seconds)}s · </span>
                {comment.body}
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addComment(trackId, 0, body)
                .then(() => {
                  setBody("");
                  return loadTrackDetail(trackId);
                })
                .then((detail) => setComments(detail.comments))
                .catch(reportAcetateError);
            }}
          >
            <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="Comment on this cut" className="min-w-0 flex-1 rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
            <button type="submit" className="rounded-full bg-[#e4a15a] px-3 text-sm font-semibold text-[#100e0c]">Post</button>
          </form>
        </section>
      )}
    </section>
  );
}
