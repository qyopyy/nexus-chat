"use client";

import { useEffect } from "react";
import { sfx } from "@/lib/sounds";
import { prefs } from "@/lib/prefs";

/** Soft click FX for buttons / interactive controls — gated by prefs.buttonFx. */
export default function ButtonFxBoot() {
  useEffect(() => {
    let last = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (prefs().buttonFx === false) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const hit = t.closest("button, [role='button'], a[href], summary, input[type='submit'], input[type='button'], .btn-fx");
      if (!hit) return;
      if (hit.hasAttribute("disabled") || hit.getAttribute("aria-disabled") === "true") return;
      if ((hit as HTMLElement).dataset.noFx === "1") return;
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      sfx.click();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);
  return null;
}
