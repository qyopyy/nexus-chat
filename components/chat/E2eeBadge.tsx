"use client";

import { useEffect, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { e2eeUnlocked, hasE2eePin, onE2eeChange, unlockE2eeWithPin } from "@/lib/e2ee";
import { validPin } from "@/lib/e2eePin";
import { toast } from "@/store/app";

/** Small lock next to a DM's name: green = text is end-to-end encrypted, grey = you're set up but they aren't yet */
export default function E2eeBadge({ peerId }: { peerId: string }) {
  const [state, setState] = useState<"off" | "on" | "waiting" | "locked">("off");
  const [ask, setAsk] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    const check = async () => {
      if (!(await e2eeUnlocked())) return !dead && setState(hasE2eePin() ? "locked" : "off");
      const { data } = await supabase.from("e2ee_public_keys").select("user_id").eq("user_id", peerId).maybeSingle();
      if (!dead) setState(data ? "on" : "waiting");
    };
    void check();
    const off = onE2eeChange(() => void check());
    return () => {
      dead = true;
      off();
    };
  }, [peerId]);

  if (state === "off") return null;
  if (state === "locked") {
    const go = async () => {
      setBusy(true);
      try {
        await unlockE2eeWithPin(pin);
        setPin("");
        setAsk(false);
        toast("Unlocked", "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Wrong PIN", "error");
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
        <button type="button" onClick={() => setAsk(true)} aria-label="Encrypted chats are locked. Enter PIN" title="Locked. Enter your PIN" className="shrink-0 text-amber-400">
          <Lock className="size-3.5" aria-hidden />
        </button>
        {ask && (
          <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-6" onClick={() => setAsk(false)}>
            <form
              className="w-full max-w-xs rounded-2xl bg-menu p-5 text-center shadow-2xl ring-1 ring-white/10"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (validPin(pin)) void go();
              }}
            >
              <Lock className="mx-auto size-7 text-amber-400" aria-hidden />
              <div className="mt-2 text-base font-bold">Encrypted chats are locked</div>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="PIN"
                className="mt-3 w-full rounded-lg bg-side px-3 py-2 text-center text-xl tracking-[0.4em] outline-none ring-1 ring-white/10 focus:ring-white/30"
              />
              <button type="submit" disabled={busy || !validPin(pin)} className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Unlock
              </button>
            </form>
          </div>
        )}
      </>
    );
  }
  const on = state === "on";
  const Icon = on ? Lock : LockOpen;
  return (
    <button
      type="button"
      onClick={() => toast(on ? "Messages in this chat are end-to-end encrypted. Photos, videos and files are not." : "They haven't turned on encrypted DMs yet, so messages here are sent normally.", "info")}
      aria-label={on ? "End-to-end encrypted" : "Not end-to-end encrypted yet"}
      title={on ? "End-to-end encrypted text" : "Not encrypted yet"}
      className={on ? "shrink-0 text-[#23a55a]" : "shrink-0 text-sub"}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
