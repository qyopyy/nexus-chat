"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prefs, usePrefs } from "@/lib/prefs";
import { sfx } from "@/lib/sounds";
import { isNexusDesktop, triggerDiscordoEgg } from "@/lib/desktop";
import { cn } from "@/lib/utils";

const SESSION_KEY = "nexus.welcome.shown";

type Props = {
  /** Display name under “Welcome back” */
  name?: string | null;
  /** Force show (tests); default once per session when pref on */
  force?: boolean;
};

/**
 * Discord-style launch splash — soft chime, logo, “Welcome back”.
 * Type `discordo` on the splash (desktop .exe / .dmg) for the easter egg.
 */
export default function WelcomeSplash({ name, force }: Props) {
  const enabled = usePrefs((s) => s.welcomeSplash !== false);
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [egg, setEgg] = useState(false);
  const typed = useRef("");
  const closed = useRef(false);

  useEffect(() => {
    if (!enabled && !force) return;
    if (!force) {
      try {
        if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      } catch {
        /* private mode */
      }
    }
    setShow(true);
    // Chime after a tick so AudioContext can unlock on first paint
    const t = window.setTimeout(() => {
      if (prefs().welcomeSplash !== false) sfx.welcome();
    }, 180);
    return () => clearTimeout(t);
  }, [enabled, force]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ch = e.key.length === 1 ? e.key.toLowerCase() : "";
      if (!ch) return;
      typed.current = (typed.current + ch).slice(-16);
      if (typed.current.includes("discordo")) {
        typed.current = "";
        if (!egg) {
          setEgg(true);
          sfx.discordo();
          if (isNexusDesktop()) triggerDiscordoEgg();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, egg]);

  function dismiss() {
    if (closed.current) return;
    closed.current = true;
    setLeaving(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    window.setTimeout(() => setShow(false), 420);
  }

  useEffect(() => {
    if (!show) return;
    const auto = window.setTimeout(dismiss, egg ? 4200 : 2600);
    return () => clearTimeout(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, egg]);

  if (!show || typeof document === "undefined") return null;

  const title = egg ? "Discordo" : "Nexus";
  const line = egg ? "you found the easter egg ✨" : name ? `Welcome back, ${name}` : "Welcome back";

  return createPortal(
    <div
      role="dialog"
      aria-label={line}
      aria-modal
      onClick={dismiss}
      className={cn(
        "fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center bg-[#1e1f22] select-none",
        leaving ? "animate-[welcomeOut_.4s_ease-in_forwards]" : "animate-[welcomeIn_.45s_ease-out]",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-80",
          egg
            ? "bg-[radial-gradient(ellipse_at_center,#5865f244,transparent_55%),radial-gradient(ellipse_at_80%_20%,#eb459e33,transparent_40%)]"
            : "bg-[radial-gradient(ellipse_at_center,#5865f22e,transparent_55%)]",
        )}
      />
      <div className={cn("relative flex flex-col items-center gap-5", egg && "animate-[welcomePop_.5s_ease-out]")}>
        <div
          className={cn(
            "grid size-[88px] place-items-center rounded-[28px] text-4xl font-black text-white shadow-[0_12px_40px_rgba(88,101,242,.45)]",
            egg ? "bg-[#5865f2] rotate-[-6deg]" : "bg-accent",
          )}
          aria-hidden
        >
          {egg ? "D" : "N"}
        </div>
        <div className="text-center">
          <div className={cn("text-2xl font-extrabold tracking-tight text-white sm:text-3xl", egg && "text-[#5865f2]")}>{title}</div>
          <div className="mt-1.5 text-sm font-medium text-white/65 sm:text-base">{line}</div>
          {egg && isNexusDesktop() && <div className="mt-2 text-xs font-semibold text-[#eb459e]">desktop exclusive · window title flipped</div>}
        </div>
        <div className="mt-2 h-1 w-28 overflow-hidden rounded-full bg-white/10">
          <div className={cn("h-full rounded-full bg-white/70", egg ? "bg-[#5865f2] animate-[welcomeBarEgg_3.8s_linear]" : "animate-[welcomeBar_2.4s_linear]")} />
        </div>
        <p className="mt-4 text-[11px] text-white/35">Tap to continue{isNexusDesktop() ? " · type discordo" : ""}</p>
      </div>
    </div>,
    document.body,
  );
}
