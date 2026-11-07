"use client";

import { useEffect, useState } from "react";
import { Compass, Loader2, Search, Users, X } from "lucide-react";
import { closeModal } from "@/store/app";
import { joinSpace, selectSpace } from "@/lib/data";
import { DISCOVER_TAGS, discoverServers, type DiscoverServer } from "@/lib/discover";
import { cn } from "@/lib/utils";
import VerifiedServerBadge from "@/components/ui/VerifiedServerBadge";
import { FormattedText } from "@/lib/chatFormat";

/** Browse public servers — verified first, then the biggest. Servers opt in from Server hub → Look. */
export default function DiscoverModal() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [list, setList] = useState<DiscoverServer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    const t = setTimeout(() => void discoverServers(q.trim(), tag).then(setList), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, tag]);

  const open = async (s: DiscoverServer) => {
    setBusy(s.id);
    if (s.joined) await selectSpace(s.id);
    else await joinSpace(s.code);
    setBusy(null);
    closeModal();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={closeModal}>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-chat sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative shrink-0 px-5 pt-5 pb-3" style={{ background: "linear-gradient(135deg,#2b2d6e,#5b2a86 55%,#14161c)" }}>
          <button onClick={closeModal} className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-black/30 hover:bg-black/50" aria-label="Close">
            <X className="size-5" />
          </button>
          <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/70 uppercase">
            <Compass className="size-4" /> Discover
          </div>
          <div className="mt-1 text-2xl font-black text-white">Find your community</div>
          <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-black/30 px-3">
            <Search className="size-4 shrink-0 text-white/60" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search servers" className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/50" />
          </label>
          <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto pb-1">
            {["", ...DISCOVER_TAGS].map((t) => (
              <button key={t || "all"} onClick={() => setTag(t)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize", tag === t ? "bg-white text-black" : "bg-black/25 text-white/80 hover:bg-black/40")}>
                {t || "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-safe-4">
          {list === null ? (
            <div className="grid h-40 place-items-center text-sm text-sub">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="grid h-40 place-items-center text-center text-sm text-sub">
              No servers found.
              <br />
              Owners can list theirs in Server hub → Look → “List in Discover”.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((s) => (
                <div key={s.id} className="flex flex-col overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
                  <div
                    className="h-20 bg-cover bg-center"
                    style={s.banner_url ? { backgroundImage: `linear-gradient(180deg,transparent,rgba(0,0,0,.35)),url(${s.banner_url})` } : { background: `linear-gradient(135deg, ${s.icon_color}, #14161c)` }}
                  />
                  <div className="relative flex flex-1 flex-col px-3 pb-3">
                    <div className="-mt-6 mb-1.5 grid size-12 place-items-center overflow-hidden rounded-2xl border-4 border-side text-xs font-black text-white" style={{ background: s.icon_color }}>
                      {s.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.icon_url} alt="" className="size-full object-cover" />
                      ) : (
                        s.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="flex items-center gap-1 font-bold">
                      <span className="truncate">{s.name}</span>
                      {s.verified && <VerifiedServerBadge size={15} />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[12.5px] text-sub">{s.description ? <FormattedText text={s.description} /> : "A Nexus community."}</p>
                    {s.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.tags.map((t) => (
                          <button key={t} onClick={() => setTag(t)} className="rounded-full bg-black/25 px-2 py-px text-[10px] font-semibold text-sub capitalize hover:text-txt">
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto flex items-center gap-2 pt-3">
                      <span className="flex items-center gap-1 text-[12px] text-sub">
                        <Users className="size-3.5" /> {s.members.toLocaleString()}
                      </span>
                      <button
                        disabled={busy === s.id}
                        onClick={() => void open(s)}
                        className={cn("ml-auto rounded-full px-4 py-1.5 text-sm font-bold disabled:opacity-50", s.joined ? "bg-hover" : "bg-accent text-white")}
                      >
                        {busy === s.id ? "…" : s.joined ? "Open" : "Join"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
