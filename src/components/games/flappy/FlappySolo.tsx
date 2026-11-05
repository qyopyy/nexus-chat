"use client";

import { useEffect, useMemo, useRef } from "react";
import { FlappyFrameHeader } from "./ui";
import type { Equipped } from "./catalog";

/** Solo flight — upgraded HTML engine, posts score/coins back when the run ends. */
export default function FlappySolo({
  birdId,
  equipped,
  onBack,
  onResult,
  mobile,
}: {
  birdId: string;
  equipped?: Equipped;
  onBack: () => void;
  onResult: (score: number, coins: number) => void;
  mobile?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const done = useRef(false);

  const src = useMemo(() => {
    const q = new URLSearchParams({ bird: birdId, embed: "1", autostart: "1" });
    const fit = equipped ? Object.values(equipped).filter(Boolean).join(",") : "";
    if (fit) q.set("fit", fit);
    return `/games/flappy-happy.html?${q.toString()}`;
  }, [birdId, equipped]);

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
        <iframe ref={frame} src={src} title="Flappy Happy Solo" allow="fullscreen; autoplay" allowFullScreen className="absolute inset-0 size-full border-0" />
      </div>
    </div>
  );
}
