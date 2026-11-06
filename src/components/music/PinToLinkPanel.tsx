"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, Music2 } from "lucide-react";
import { listPinMusicSources, pinSourceToLink, type PinSourceItem } from "@/lib/linkMusicPin";
import { linkbioMine, linkbioSave, openLinkBio } from "@/lib/linkbio";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";

/** Pick a Cutroom / Vault track and pin it as Nexus Link page music. */
export default function PinToLinkPanel({ compact }: { compact?: boolean }) {
  const [items, setItems] = useState<PinSourceItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void listPinMusicSources(20).then(setItems);
  }, []);

  async function pin(item: PinSourceItem) {
    setBusyId(item.id);
    const url = await pinSourceToLink(item);
    if (!url) {
      setBusyId(null);
      return;
    }
    const page = await linkbioMine();
    if (!page) {
      toast("Create a Nexus Link page first", "error");
      setBusyId(null);
      openLinkBio();
      return;
    }
    const saved = await linkbioSave({ music_url: url });
    setBusyId(null);
    if (saved) toast(`Pinned “${item.title}” to your Link page`, "success");
  }

  return (
    <section className={cn("rounded-2xl ring-1 ring-white/10", compact ? "bg-side p-3" : "bg-gradient-to-br from-[#1a0533] to-[#0b1528] p-4 text-white")}>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("grid size-9 place-items-center rounded-xl", compact ? "bg-accent/20 text-accent" : "bg-white/10")}>
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-black", compact ? "text-txt" : "text-white")}>Pin to Nexus Link</div>
          <p className={cn("text-[11px]", compact ? "text-sub" : "text-white/60")}>
            Copy a Cutroom or Vault track onto your /bio page player
          </p>
        </div>
        <button
          type="button"
          onClick={() => openLinkBio()}
          className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", compact ? "bg-white/10 text-sub hover:bg-hover" : "bg-white/10 text-white/80 hover:bg-white/15")}
        >
          Open Link
        </button>
      </div>

      {items === null ? (
        <div className={cn("flex items-center gap-2 py-4 text-xs", compact ? "text-sub" : "text-white/50")}>
          <Loader2 className="size-3.5 animate-spin" /> Loading your tracks…
        </div>
      ) : !items.length ? (
        <p className={cn("py-3 text-xs", compact ? "text-sub" : "text-white/50")}>
          Upload a cut in Cutroom or an audio file in Vault, then pin it here.
        </p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {items.map((it) => (
            <li key={`${it.source}-${it.id}`}>
              <button
                type="button"
                disabled={!!busyId}
                onClick={() => void pin(it)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition disabled:opacity-50",
                  compact ? "hover:bg-hover" : "hover:bg-white/10",
                )}
              >
                <span className={cn("grid size-8 place-items-center rounded-lg text-xs font-bold", it.source === "cutroom" ? "bg-amber-500/20 text-amber-200" : "bg-sky-500/20 text-sky-200")}>
                  {it.source === "cutroom" ? "♩" : "🔒"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-semibold", compact ? "text-txt" : "text-white")}>{it.title}</span>
                  <span className={cn("block truncate text-[10px]", compact ? "text-sub" : "text-white/45")}>
                    {it.source === "cutroom" ? "Cutroom" : "Vault"} · {it.projectTitle}
                  </span>
                </span>
                {busyId === it.id ? (
                  <Loader2 className="size-4 animate-spin opacity-70" />
                ) : (
                  <Music2 className={cn("size-4", compact ? "text-accent" : "text-[#c084fc]")} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
