"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prefs, usePrefs } from "@/lib/prefs";
import { sfx } from "@/lib/sounds";
import { isNexusDesktop, triggerDiscordoEgg } from "@/lib/desktop";
import { pickWelcomeFact } from "@/lib/welcomeFacts";
import { cn } from "@/lib/utils";
import { NexusCredit } from "@/components/ui/NexusCredit";

const SESSION_KEY = "nexus.welcome.shown";

type Props = {
  /** Display name under “Welcome back” */
  name?: string | null;
  /** Force show (tests); default once per session when pref on */
  force?: boolean;
};

/**
 * Discord-style launch splash — soft chime, logo, “Welcome back”, and a tip/fun fact underneath.
 * Type `discordo` on the splash (desktop .exe / .dmg) for the easter egg.
 */
export default function WelcomeSplash({ name, force }: Props) {
  const enabled = usePrefs((s) => s.welcomeSplash !== false);
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [egg, setEgg] = useState(false);
  const [fact, setFact] = useState(() => pickWelcomeFact(false));
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
    setFact(pickWelcomeFact(false));
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
          setFact(pickWelcomeFact(true));
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
    // A bit longer so the tip under the greeting is readable (Discord-style)
    const auto = window.setTimeout(dismiss, egg ? 4800 : 3800);
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
        "fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center bg-[#1e1f22] px-6 select-none",
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
      <div className={cn("relative flex max-w-md flex-col items-center gap-5", egg && "animate-[welcomePop_.5s_ease-out]")}>
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

        {/* Discord-style tip / fun fact under the greeting */}
        <div
          className={cn(
            "w-full max-w-sm rounded-2xl bg-white/[.06] px-4 py-3 text-center ring-1 ring-white/10",
            egg && "ring-[#5865f2]/40",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-bold tracking-[0.14em] text-white/40 uppercase">{egg ? "Easter egg" : "Did you know"}</div>
          <p className="mt-1.5 text-[13px] leading-snug text-white/75 sm:text-sm">{fact}</p>
          <button
            type="button"
            className="mt-2 text-[11px] font-semibold text-accent hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              try {
                sessionStorage.removeItem(egg ? "nexus.welcome.eggFact" : "nexus.welcome.fact");
              } catch {
                /* ignore */
              }
              setFact(pickWelcomeFact(egg));
            }}
          >
            Another tip
          </button>
        </div>

        <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-white/10">
          <div className={cn("h-full rounded-full bg-white/70", egg ? "bg-[#5865f2] animate-[welcomeBarEgg_4.4s_linear]" : "animate-[welcomeBar_3.5s_linear]")} />
        </div>
        <p className="text-[11px] text-white/35">Tap to continue{isNexusDesktop() ? " · type discordo" : ""}</p>
        <NexusCredit className="pointer-events-auto mt-3 text-[12px] text-white/45" />
      </div>
    </div>,
    document.body,
  );
}
