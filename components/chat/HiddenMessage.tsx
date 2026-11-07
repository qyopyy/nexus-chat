"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";
import { usePrefs } from "@/lib/prefs";
import { matchesMutedWord, useIsBlocked } from "@/lib/blocks";

/** collapses a message from someone you blocked, or one that contains a muted word — tap to show */
export default function HiddenMessage({ authorId, content, mine, children }: { authorId: string; content: string | null; mine: boolean; children: React.ReactNode }) {
  const blocked = useIsBlocked(mine ? null : authorId);
  const hideBlocked = usePrefs((s) => s.hideBlocked);
  const words = usePrefs((s) => s.mutedWords);
  const [shown, setShown] = useState(false);
  if (mine || shown) return <>{children}</>;
  const muted = matchesMutedWord(content, words);
  const why = blocked && hideBlocked ? "Message from someone you blocked" : muted ? `Hidden · contains “${muted}”` : null;
  if (!why) return <>{children}</>;
  return (
    <button onClick={() => setShown(true)} className="my-0.5 flex w-fit items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-xs text-sub hover:bg-black/35 hover:text-txt">
      <EyeOff className="size-3.5" /> {why} · <span className="font-semibold text-accent">Show</span>
    </button>
  );
}
