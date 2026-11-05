"use client";

import { useEffect, useRef } from "react";
import { FlappyFrameHeader } from "./ui";

/** Solo flight — upgraded HTML engine, posts score/coins back when the run ends. */
export default function FlappySolo({
  birdId,
  onBack,
  onResult,
  mobile,
}: {
  birdId: string;
  onBack: () => void;
  onResult: (score: number, coins: number) => void;
  mobile?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; score?: number; coins?: number };
      if (d?.type !== "flappy-happy-over" || done.current) return;
      done.current = true;
      onResult(Math.max(0, Math.floor(d.score ?? 0)), Math.max(0, Math.floor(d.coins ?? 0)));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onResult]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#090d16] text-white">
      <FlappyFrameHeader title="Solo flight" onBack={onBack} mobile={mobile} onFull={() => void box.current?.requestFullscreen?.().catch(() => {})} />
      <div ref={box} className="relative min-h-0 flex-1">
        <iframe
          ref={frame}
          src={`/games/flappy-happy.html?bird=${encodeURIComponent(birdId)}&embed=1&autostart=1`}
          title="Flappy Happy Solo"
          allow="fullscreen; autoplay"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
    </div>
  );
}
