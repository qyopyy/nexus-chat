"use client";

import { useEffect, useRef, useState } from "react";

/** Colour swatch that opens the native picker. Dragging in the picker only previews; the colour is saved once you stop (no save spam). */
export default function ColorPick({ value, onCommit, title = "Custom color" }: { value: string; onCommit: (hex: string) => void; title?: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(value);
  useEffect(() => {
    setLocal(value);
    last.current = value;
  }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const commit = (hex: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (hex.toLowerCase() === last.current.toLowerCase()) return;
    last.current = hex;
    onCommit(hex);
  };
  return (
    <label className="relative h-9 w-16 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-sub" title={title} style={{ background: local }}>
      <input
        type="color"
        value={local}
        aria-label={title}
        onChange={(e) => {
          setLocal(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(e.target.value), 700);
        }}
        onBlur={(e) => commit(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span className="pointer-events-none grid size-full place-items-center text-sm font-bold text-white mix-blend-difference">+</span>
    </label>
  );
}
