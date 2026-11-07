"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, RotateCcw } from "lucide-react";
import { useApp } from "@/store/app";
import { useCall, setUserVolume, toggleLocalMute, MAX_USER_VOLUME } from "@/lib/call";
import { openDM } from "@/lib/data";

/** Discord-style per-user menu: User Volume 0–400%, local mute */
export default function VolumeMenu({ userId, x, y, onClose }: { userId: string; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const profile = useApp((s) => s.profiles[userId]);
  const volume = useCall((s) => s.userVolumes[userId] ?? 1);
  const muted = useCall((s) => !!s.localMutes[userId]);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const W = 240;
  const left = Math.min(Math.max(8, x - W), window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - 220);
  const pct = Math.round(volume * 100);

  return createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[70] animate-pop rounded-lg bg-menu p-2 text-sm shadow-2xl"
      style={{ left, top, width: W }}
    >
      <div className="px-2 pt-1 pb-2 font-semibold">{profile?.display_name}</div>
      <div className="rounded-md px-2 py-2 hover:bg-white/5">
        <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-wide text-sub uppercase">
          User Volume
          <span className="text-txt normal-case">{pct}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_USER_VOLUME * 100}
          step={1}
          value={pct}
          onChange={(e) => setUserVolume(userId, Number(e.target.value) / 100)}
          className="vol w-full"
          style={{ ["--fill" as string]: `${pct / MAX_USER_VOLUME}%` }}
        />
      </div>
      <button onClick={() => setUserVolume(userId, 1)} className="flex w-full items-center justify-between rounded px-2 py-1.5 hover:bg-accent hover:text-white">
        Reset Volume <RotateCcw className="size-4" />
      </button>
      <label className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-white/5">
        Mute
        <input type="checkbox" checked={muted} onChange={() => toggleLocalMute(userId)} className="size-4 accent-dnd" />
      </label>
      <div className="my-1 h-px bg-line" />
      <button
        onClick={() => {
          onClose();
          void openDM(userId);
        }}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 hover:bg-accent hover:text-white"
      >
        Message <MessageCircle className="size-4" />
      </button>
    </div>,
    document.body,
  );
}
