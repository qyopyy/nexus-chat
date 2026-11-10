"use client";

import { useEffect, useState } from "react";

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function AcetatePwa() {
  const [prompt, setPrompt] = useState<BeforeInstall | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/acetate/sw.js", { scope: "/acetate/" }).catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstall);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt || hidden) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void prompt.prompt().then(() => setHidden(true));
      }}
      className="rounded-full border border-[#e4a15a]/40 px-3 py-1 text-xs font-semibold text-[#e4a15a]"
    >
      Install
    </button>
  );
}
