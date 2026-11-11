"use client";

import { useEffect, useState } from "react";
import { endListenRoom, hostRoomId, rememberHostRoom, startListenRoom, subscribeRoom, roomSnapshot, type RoomSnapshot } from "@/lib/acetateRooms";
import { useAcetatePlayer } from "@/lib/acetatePlayer";
import { reportAcetateError } from "@/lib/acetate";

export default function ListenTogetherButton() {
  const queue = useAcetatePlayer((s) => s.queue);
  const index = useAcetatePlayer((s) => s.index);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = hostRoomId();
    if (!id) return;
    let stop = () => {};
    void roomSnapshot(id)
      .then((next) => {
        if (!next.ok) {
          rememberHostRoom(null);
          return;
        }
        setSnap(next);
        stop = subscribeRoom(id, () => {
          void roomSnapshot(id).then(setSnap).catch(() => undefined);
        });
      })
      .catch(() => rememberHostRoom(null));
    return () => stop();
  }, [open]);

  const item = queue[index];
  const link = snap?.token ? `${window.location.origin}/acetate/room/${snap.token}` : "";

  return (
    <div className="relative">
      <button
        type="button"
        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${snap?.ok ? "text-[#e4a15a]" : "hover:bg-white/5"}`}
        onClick={() => setOpen((v) => !v)}
      >
        Together
      </button>
      {open && (
        <div className="absolute right-0 bottom-10 z-20 w-72 rounded-2xl border border-[#3c342c] bg-[#1a1612] p-3 text-sm shadow-xl">
          <p className="text-xs text-[#a3988c]">Anyone with the link hears what you hear. You stay the host.</p>
          {!snap?.ok && (
            <button
              type="button"
              disabled={!item}
              className="mt-2 rounded-full bg-[#e4a15a] px-3 py-1.5 text-xs font-semibold text-[#100e0c] disabled:opacity-40"
              onClick={() => {
                void startListenRoom(item?.title || "Listen together", queue.map((row) => row.trackId), item.trackId)
                  .then(setSnap)
                  .catch(reportAcetateError);
              }}
            >
              Start a room
            </button>
          )}
          {snap?.ok && (
            <>
              <p className="mt-2 text-xs">{(snap.members ?? []).length} here · {snap.playing ? "playing" : "paused"}</p>
              <button
                type="button"
                className="mt-2 block w-full truncate rounded-xl bg-white/5 px-2 py-1 text-left text-xs"
                onClick={() => void navigator.clipboard.writeText(link)}
              >
                Copy invite
              </button>
              <button
                type="button"
                className="mt-2 text-xs text-[#d4653a]"
                onClick={() => {
                  if (!snap.id) return;
                  void endListenRoom(snap.id).then(() => setSnap(null)).catch(reportAcetateError);
                }}
              >
                End room
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
