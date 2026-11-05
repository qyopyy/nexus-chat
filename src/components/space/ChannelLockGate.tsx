"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useApp } from "@/store/app";
import { myUnlocks, unlockChannel } from "@/lib/spaceExtras";
import { openConversation } from "@/lib/data";

/** Blocks viewing a password-protected room until the member unlocks it. */
export default function ChannelLockGate({ spaceId }: { spaceId: string }) {
  const me = useApp((s) => s.userId);
  const members = useApp((s) => s.spaceMembers[spaceId] ?? []);
  const channels = useApp((s) => s.channels[spaceId] ?? []);
  const conversationId = useApp((s) => s.conversationId);
  const [unlocks, setUnlocks] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const myRole = members.find((m) => m.user_id === me)?.role;
  const staff = myRole === "owner" || myRole === "admin";
  const channel = channels.find((c) => c.id === conversationId);
  const needsLock = !!channel && !!channel.password_hash && !staff && !unlocks.has(channel.id);

  useEffect(() => {
    void myUnlocks(spaceId).then(setUnlocks);
  }, [spaceId, conversationId]);

  if (!needsLock || !channel) return null;

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-chat/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-side p-6 text-center shadow-2xl">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/20 text-accent">
          <Lock className="size-7" />
        </div>
        <h3 className="mt-3 text-xl font-black">Private room</h3>
        <p className="mt-1 text-sm text-sub">
          #{channel.name} is password-protected. Enter the room password to join the conversation.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && document.getElementById("unlock-btn")?.click()}
          placeholder="Room password"
          className="mt-4 w-full rounded-xl bg-rail px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/50"
          autoFocus
        />
        <button
          id="unlock-btn"
          disabled={busy || !password.trim()}
          onClick={async () => {
            setBusy(true);
            const ok = await unlockChannel(channel.id, password.trim());
            setBusy(false);
            if (ok) {
              setUnlocks((s) => new Set(s).add(channel.id));
              setPassword("");
              openConversation(channel.id, spaceId);
            }
          }}
          className="mt-3 w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-40"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
        <button onClick={() => useApp.setState({ conversationId: null, mobileSidebar: true })} className="mt-2 w-full py-2 text-sm text-sub hover:text-txt">
          Back to channels
        </button>
      </div>
    </div>
  );
}
