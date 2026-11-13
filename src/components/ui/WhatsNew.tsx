"use client";

import { useEffect, useState } from "react";
import type { ReleaseNote } from "@/lib/releaseNotes";

/** One-time sheet for a release, plus a window event so Settings can open it again. */
export default function WhatsNew({
  release,
  storageKey,
  openEvent,
}: {
  release: ReleaseNote;
  storageKey: string;
  openEvent: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) !== release.version) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [release.version, storageKey]);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(openEvent, show);
    return () => window.removeEventListener(openEvent, show);
  }, [openEvent]);

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, release.version);
    } catch {
      /* private mode */
    }
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 p-3 sm:place-items-center" onClick={dismiss}>
      <div
        role="dialog"
        aria-labelledby="whats-new-title"
        className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-3xl bg-chat p-5 text-txt shadow-2xl ring-1 ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">What's new</p>
        <h2 id="whats-new-title" className="mt-1 text-2xl font-black">
          {release.app} {release.version}
        </h2>
        <ul className="mt-4 space-y-3">
          {release.items.map((item) => (
            <li key={item.title}>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-0.5 text-sm text-sub">{item.body}</p>
            </li>
          ))}
        </ul>
        <button type="button" onClick={dismiss} className="mt-5 w-full rounded-full bg-accent py-2.5 text-sm font-bold text-white">
          Continue
        </button>
      </div>
    </div>
  );
}
