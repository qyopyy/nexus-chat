"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { checkPin, lockoutLeft, shouldRelock } from "@/lib/snapPrefs";
import { getPin, savePin, setPrefs } from "@/lib/snapPrefsStore";

/**
 * Screen lock + privacy veil. Locks on open and after the app was away for 30 s; the veil hides the picture the
 * moment the app leaves the screen (so the app switcher doesn't show your camera or Drive).
 */
export default function SnapLock({ lockOn, veilOn }: { lockOn: boolean; veilOn: boolean }) {
  const [locked, setLocked] = useState(() => lockOn && !!getPin());
  const [veil, setVeil] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const lockRef = useRef(lockOn);
  lockRef.current = lockOn;

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        if (veilOn || lockRef.current) setVeil(true);
      } else {
        setVeil(false);
        if (lockRef.current && getPin() && shouldRelock(hiddenAt.current, Date.now())) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
    };
  }, [veilOn]);

  if (!locked && !veil) return null;
  if (!locked) return <div className="fixed inset-0 z-[300] grid place-items-center bg-black" aria-hidden />;
  return <Keypad onOpen={() => setLocked(false)} />;
}

function Keypad({ onOpen }: { onOpen: () => void }) {
  const [pin, setPin] = useState("");
  const [fails, setFails] = useState(0);
  const [lastFail, setLastFail] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [msg, setMsg] = useState("");
  const wait = Math.ceil(lockoutLeft(fails, lastFail, now) / 1000);

  useEffect(() => {
    if (!wait) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [wait]);

  const submit = useCallback(
    async (p: string) => {
      if (lockoutLeft(fails, lastFail, Date.now())) return;
      if (await checkPin(p, getPin())) return onOpen();
      const n = fails + 1;
      setFails(n);
      setLastFail(Date.now());
      setNow(Date.now());
      setPin("");
      setMsg(n % 5 === 0 ? "Too many tries. Wait 30 seconds." : "Wrong PIN");
    },
    [fails, onOpen],
  );

  const press = (d: string) => {
    if (wait) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
    setMsg("");
  };

  const forgot = async () => {
    // the lock lives on this device only: signing out removes it, then you sign in again
    savePin(null);
    setPrefs({ appLock: false });
    await supabase.auth.signOut();
    onOpen();
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-5 bg-black px-6 text-white" role="dialog" aria-label="Nexus Snap is locked">
      <Lock className="size-8 text-white/70" />
      <b className="tracking-wide">NEXUS SNAP IS LOCKED</b>
      <div className="flex h-4 gap-2" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={`size-3 rounded-full ${i < pin.length ? "bg-white" : "bg-white/25"}`} />
        ))}
      </div>
      <p className="h-4 text-xs text-rose-300">{wait ? `Wait ${wait}s` : msg}</p>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="grid size-16 place-items-center rounded-full bg-white/10 text-xl font-semibold active:bg-white/25">
            {d}
          </button>
        ))}
        <button type="button" onClick={() => void submit(pin)} disabled={pin.length < 4 || !!wait} className="grid size-16 place-items-center rounded-full text-sm font-bold text-white/70 disabled:opacity-30">
          OK
        </button>
        <button type="button" onClick={() => press("0")} className="grid size-16 place-items-center rounded-full bg-white/10 text-xl font-semibold active:bg-white/25">
          0
        </button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete digit" className="grid size-16 place-items-center rounded-full text-white/70">
          <Delete className="size-6" />
        </button>
      </div>
      <button type="button" onClick={() => void forgot()} className="text-xs text-white/50 underline">
        Forgot PIN? Sign out
      </button>
    </div>
  );
}
