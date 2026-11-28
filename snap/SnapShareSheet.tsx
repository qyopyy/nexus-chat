"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "@/store/app";
import { findSnapUser, sendSnapToUser, type SnapUser } from "@/lib/snapShare";
import { searchUsers } from "@/lib/music";
import type { VaultFile } from "@/lib/protect";
import { Sheet } from "./SnapUi";

/** "Send to a Nexus user": type a username or an email, or tap a suggestion. The link lands in your DM with them. */
export default function SnapShareSheet({ file, expiry, onClose, z }: { file: VaultFile; expiry: number | null; onClose: () => void; z?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SnapUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const s = q.trim().replace(/^@+/, "");
    if (s.length < 2 || s.includes("@")) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      void searchUsers(s).then((r) => live && setHits(r.map((u) => ({ id: u.id, username: u.username, display_name: u.display_name ?? null }))));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const send = async (user: SnapUser | null) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const u = user ?? (await findSnapUser(q));
      await sendSnapToUser(u, file, expiry);
      toast(`Sent to @${u.username}`, "success");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Send to a Nexus user" onClose={onClose} z={z}>
      <form
        className="flex gap-2 px-4 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(null);
        }}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setErr("");
          }}
          placeholder="@username or email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
        />
        <button type="submit" disabled={busy || !q.trim()} aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-black disabled:opacity-40">
          <Send className="size-4" />
        </button>
      </form>
      {err && <p className="px-4 pb-3 text-xs text-rose-300">{err}</p>}
      {hits.map((u) => (
        <button key={u.id} type="button" disabled={busy} onClick={() => void send(u)} className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-left hover:bg-white/5 disabled:opacity-50">
          <span className="grid size-9 place-items-center rounded-full bg-white/15 text-sm font-bold uppercase">{u.username[0]}</span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-sm">{u.display_name || u.username}</b>
            <span className="block truncate text-xs text-white/50">@{u.username}</span>
          </span>
          <span className="text-xs font-bold text-white/70">Send</span>
        </button>
      ))}
      <p className="px-4 pb-4 pt-2 text-[11px] text-white/40">They get a private link in your chat. Pick &quot;Link lasts&quot; on the camera to set how long it works.</p>
    </Sheet>
  );
}
