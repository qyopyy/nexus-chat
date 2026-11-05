"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { fetchSiteNotice, type SiteNotice } from "@/lib/privileges";

const DISMISS_KEY = "nexus:notice:dismissedAt";

export default function SiteNoticeBanner() {
  const [notice, setNotice] = useState<SiteNotice | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(() => {
    void fetchSiteNotice().then((n) => {
      setNotice(n);
      if (!n?.active || !n.body.trim()) {
        setHidden(true);
        return;
      }
      try {
        const dismissed = Number(sessionStorage.getItem(DISMISS_KEY) || 0);
        const updated = new Date(n.updated_at).getTime();
        setHidden(dismissed >= updated);
      } catch {
        setHidden(false);
      }
    });
  }, []);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("nexus:notice", on);
    return () => window.removeEventListener("nexus:notice", on);
  }, [load]);

  if (hidden || !notice?.active || !notice.body.trim()) return null;

  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-[#1d9bf0]/30 bg-[#1d9bf0]/15 px-3 py-2 text-sm text-white">
      <Megaphone className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap leading-snug">{notice.body}</p>
      <button
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, String(Date.now()));
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
        className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
