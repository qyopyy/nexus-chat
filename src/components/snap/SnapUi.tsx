"use client";

import { X } from "lucide-react";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const a = document.createElement("textarea");
      a.value = text;
      a.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(a);
      a.select();
      const ok = document.execCommand("copy");
      a.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function Act({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="grid place-items-center gap-1 rounded-2xl bg-white/10 py-2.5 text-[11px] font-semibold hover:bg-white/20 disabled:opacity-40">
      {icon}
      {label}
    </button>
  );
}

export function Sheet({ title, onClose, children, z = "z-40" }: { title: string; onClose: () => void; children: React.ReactNode; z?: string }) {
  return (
    <div className={`absolute inset-0 ${z} flex flex-col justify-end bg-black/60`} onClick={onClose}>
      <div className="max-h-[80%] overflow-y-auto rounded-t-3xl bg-[#14141c] pb-safe-2" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#14141c] px-4 py-3">
          <b>{title}</b>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-white/10">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
