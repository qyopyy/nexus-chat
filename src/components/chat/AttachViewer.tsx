"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { downloadAttachment } from "@/lib/downloadAttachment";
import { haptic } from "@/lib/haptics";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  url: string;
  name?: string | null;
  onClose: () => void;
};

export default function AttachViewer({ open, url, name, onClose }: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const filename = name?.trim() || "image.jpg";

  async function save() {
    if (busy) return;
    setBusy(true);
    haptic.light();
    const ok = await downloadAttachment(url, filename);
    setBusy(false);
    toast(ok ? "Saved" : "Opened download", ok ? "success" : "info");
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[96] flex flex-col bg-black/92 pt-safe backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={filename}
      onClick={onClose}
    >
      <header
        className="flex shrink-0 items-center gap-1.5 px-2 py-2 min-[400px]:gap-2 min-[400px]:px-3 min-[400px]:py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{filename}</div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-sm font-semibold text-white hover:bg-white/25 disabled:opacity-50",
          )}
          aria-label="Download"
        >
          <Download className="size-4" />
          {busy ? "…" : "Download"}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 pb-safe-3 min-[400px]:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename}
          draggable={false}
          className="max-h-full max-w-full object-contain select-none"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
}

/** Compact download control for non-image attachments in the bubble. */
export function AttachDownloadButton({
  url,
  name,
  className,
  label = "Download",
}: {
  url: string;
  name?: string | null;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      title={label}
      aria-label={label}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        haptic.light();
        void downloadAttachment(url, name?.trim() || "download").then((ok) => {
          setBusy(false);
          toast(ok ? "Saved" : "Opened download", ok ? "success" : "info");
        });
      }}
    >
      <Download className="size-4" />
      {busy ? "…" : null}
    </button>
  );
}
