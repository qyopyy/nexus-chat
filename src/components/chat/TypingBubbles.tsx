"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { useChat } from "@/store/chat";
import { useChatFx, type LiveStyle, type TypingStyle } from "@/lib/chatFx";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

/** animated "is typing" indicator in the chosen style */
export function TypingAnim({ style, className }: { style: TypingStyle; className?: string }) {
  switch (style) {
    case "dots":
      return (
        <span className={cn("inline-flex items-center gap-1", className)}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2 animate-bounce rounded-full bg-current opacity-80" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </span>
      );
    case "wave":
      return (
        <span className={cn("inline-flex items-center gap-1", className)}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="size-2 rounded-full bg-gradient-to-br from-[#ff2bd6] to-[#00e5ff] animate-[typwave_1.1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 110}ms` }} />
          ))}
        </span>
      );
    case "pulse":
      return (
        <span className={cn("relative inline-grid size-7 place-items-center", className)}>
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />
          <span className="relative flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full bg-accent animate-[typfade_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </span>
        </span>
      );
    case "keys":
      return (
        <span className={cn("inline-grid grid-cols-5 gap-[3px] rounded-md bg-black/30 p-1", className)}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="h-2 w-2.5 rounded-[2px] bg-white/25 animate-[typkey_1.6s_steps(1)_infinite]" style={{ animationDelay: `${(i * 370) % 1600}ms` }} />
          ))}
        </span>
      );
    case "pencil":
      return (
        <span className={cn("relative inline-block h-6 w-14", className)}>
          <svg viewBox="0 0 56 24" className="absolute inset-0">
            <path d="M2 16 C10 6, 16 22, 24 12 S38 8, 44 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="animate-[typdraw_1.6s_ease-in-out_infinite]" strokeDasharray="70" />
          </svg>
          <span className="absolute -top-0.5 animate-[typpen_1.6s_ease-in-out_infinite] text-sm">✏️</span>
        </span>
      );
    case "orbit":
      return (
        <span className={cn("relative inline-block size-6 animate-spin [animation-duration:1.2s]", className)}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute top-1/2 left-1/2 size-1.5 rounded-full bg-accent" style={{ transform: `rotate(${i * 120}deg) translate(9px) `, opacity: 1 - i * 0.28 }} />
          ))}
        </span>
      );
    case "equalizer":
      return (
        <span className={cn("inline-flex h-5 items-end gap-[3px]", className)}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="w-1 rounded-full bg-gradient-to-t from-[#8b5cff] to-[#00e5ff] animate-[typeq_.9s_ease-in-out_infinite]" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
      );
  }
}

const LIVE_CLASS: Record<LiveStyle, string> = {
  pop: "animate-[livepop_.28s_cubic-bezier(.2,1.6,.4,1)]",
  glow: "animate-[liveglow_.9s_ease-out]",
  blur: "animate-[liveblur_.35s_ease-out]",
  matrix: "animate-[livematrix_.6s_steps(4)]",
  rainbow: "",
  plain: "",
};

/** someone's draft, appearing letter by letter */
export function LiveText({ text, style }: { text: string; style: LiveStyle }) {
  return (
    <span className={cn("break-words whitespace-pre-wrap", style === "rainbow" && "animate-[liverainbow_3s_linear_infinite] bg-[linear-gradient(90deg,#ff2bd6,#ffb02e,#36d39a,#00e5ff,#8b5cff,#ff2bd6)] bg-[length:200%_100%] bg-clip-text text-transparent", style === "matrix" && "font-mono")}>
      {[...text].map((ch, i) => (
        <span key={i} className={cn("inline-block", ch === " " && "w-[.28em]", LIVE_CLASS[style])}>
          {ch === " " ? " " : ch}
        </span>
      ))}
      <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-[blink_1s_steps(1)_infinite] bg-current align-baseline" />
    </span>
  );
}

/** bottom-of-chat bubbles for everyone typing (with their live words if they share them) */
export default function TypingBubbles() {
  const typing = useChat((s) => s.typing);
  const live = useChat((s) => s.live);
  const fx = useChatFx();
  const profiles = useApp((s) => s.profiles);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const ids = [...new Set([...Object.entries(typing).filter(([, e]) => e > now).map(([id]) => id), ...Object.keys(live)])].slice(0, 4);
  if (!ids.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-1.5 pb-1">
      {ids.map((id) => {
        const lv = live[id];
        return (
          <div key={id} className="flex animate-[typin_.25s_ease-out] items-end gap-2">
            <Avatar userId={id} size={28} plain />
            <div className={cn("max-w-[75%] rounded-2xl rounded-bl-md px-3.5 py-2", lv ? "bg-side/90 ring-1 ring-accent/30" : "bg-side")}>
              {lv ? (
                <>
                  <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                    {profiles[id]?.display_name ?? "Someone"} <TypingAnim style={fx.style} className="scale-75" />
                  </div>
                  <div className="text-[15px] text-txt">
                    <LiveText text={lv.text} style={fx.liveStyle} />
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 py-0.5 text-sub" title={`${profiles[id]?.display_name ?? "Someone"} is typing`}>
                  <TypingAnim style={fx.style} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
