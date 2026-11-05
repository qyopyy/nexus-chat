"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy, Link2, MapPin, Navigation, Radio, Share2, Users, X } from "lucide-react";
import { useApp, openProfileCard, toast } from "@/store/app";
import {
  bumpClear,
  bumpCreateInvite,
  bumpInviteLink,
  bumpListFamily,
  bumpNearby,
  bumpPublish,
  bumpRedeemInvite,
  bumpRemoveFamily,
  type BumpNearby,
  type BumpVisible,
} from "@/lib/bump";
import { formatMeters } from "@/lib/location";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

export default function BumpHub({ mobile }: { mobile?: boolean }) {
  const me = useApp((s) => s.userId);
  const [visible, setVisible] = useState<BumpVisible>("friends");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<BumpNearby[]>([]);
  const [family, setFamily] = useState<string[]>([]);
  const [invite, setInvite] = useState<string | null>(null);
  const [redeem, setRedeem] = useState("");
  const [radius, setRadius] = useState(500);

  const refresh = useCallback(async () => {
    if (!me) return;
    const [n, f] = await Promise.all([bumpNearby(radius), bumpListFamily()]);
    setNearby(n);
    setFamily(f);
  }, [me, radius]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (live) void refresh();
    }, 12_000);
    return () => clearInterval(t);
  }, [refresh, live]);

  // Deep link /?bump=CODE or hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("bump");
    const path = window.location.pathname.match(/^\/b\/([a-z0-9]+)/i)?.[1];
    const code = q || path;
    if (code) {
      setRedeem(code);
      void bumpRedeemInvite(code).then(() => {
        const u = new URL(window.location.href);
        u.searchParams.delete("bump");
        if (u.pathname.startsWith("/b/")) u.pathname = "/";
        window.history.replaceState(null, "", u.pathname + u.search);
        void refresh();
      });
    }
  }, [refresh]);

  async function goLive() {
    setBusy(true);
    haptic.medium();
    const row = await bumpPublish(visible);
    setBusy(false);
    if (row) {
      setLive(true);
      await refresh();
    }
  }

  async function stop() {
    setBusy(true);
    await bumpClear();
    setBusy(false);
    setLive(false);
    setNearby([]);
  }

  async function makeInvite(kind: "family" | "friend" | "nearby") {
    const code = await bumpCreateInvite(kind);
    if (!code) return;
    setInvite(code);
    const url = bumpInviteLink(code);
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied", "success");
    } catch {
      /* ignore */
    }
    if (navigator.share) {
      void navigator.share({ title: "Join my Nexus Bump circle", text: "Find me nearby on Nexus", url }).catch(() => {});
    }
  }

  return (
    <div className={cn("flex h-full flex-col bg-chat", mobile && "pb-safe-2")}>
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-line px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        {mobile && (
          <button type="button" onClick={() => useApp.setState({ hub: null })} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Bump</div>
          <div className="truncate text-[11px] text-sub">Find friends & family nearby — uses Location on iPhone</div>
        </div>
        <MapPin className={cn("size-5", live ? "text-ok" : "text-sub")} />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Radio className="size-4 text-accent" /> Share my bump
          </div>
          <p className="mb-3 text-xs text-sub">
            Location is rounded (~100 m) and auto-expires after 20 minutes. On iPhone, allow <b>Location</b> for Nexus in Settings → Privacy.
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(
              [
                ["friends", "Friends"],
                ["family", "Family"],
                ["everyone", "Everyone nearby"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVisible(id)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", visible === id ? "bg-accent text-white" : "bg-white/5 text-sub")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void goLive()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 min-[400px]:flex-none"
            >
              <Navigation className="size-4" /> {live ? "Refresh location" : "Bump now"}
            </button>
            {live && (
              <button type="button" disabled={busy} onClick={() => void stop()} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
                Stop sharing
              </button>
            )}
          </div>
          <label className="mt-3 block text-[11px] font-semibold text-sub">
            Search radius · {radius} m
            <input type="range" min={100} max={2000} step={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-1 w-full accent-[var(--accent)]" />
          </label>
        </section>

        <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-accent" /> Nearby
            </div>
            <button type="button" onClick={() => void refresh()} className="text-xs font-semibold text-accent">
              Refresh
            </button>
          </div>
          {!nearby.length ? (
            <p className="text-xs text-sub">No one in range yet. Bump with friends nearby, or share an invite link.</p>
          ) : (
            <ul className="space-y-1.5">
              {nearby.map((n) => (
                <li key={n.user_id}>
                  <button
                    type="button"
                    onClick={(e) => openProfileCard(n.user_id, e)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-hover"
                  >
                    <Avatar userId={n.user_id} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        <NameTag userId={n.user_id} />
                      </div>
                      <div className="text-[11px] text-sub">
                        {formatMeters(n.meters)} · {n.visible}
                        {n.label ? ` · ${n.label}` : ""}
                      </div>
                    </div>
                    <MapPin className="size-4 text-ok" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-accent" /> Family circle
          </div>
          {!family.length ? (
            <p className="mb-2 text-xs text-sub">Invite family with a link so you can find each other when Bump is on.</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {family.map((id) => (
                <li key={id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                  <Avatar userId={id} size={32} />
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                    <NameTag userId={id} />
                  </div>
                  <button type="button" aria-label="Remove" onClick={() => void bumpRemoveFamily(id).then(() => refresh())} className="grid size-7 place-items-center rounded-full text-sub hover:bg-white/5 hover:text-dnd">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void makeInvite("family")} className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1.5 text-xs font-bold text-accent">
              <Share2 className="size-3.5" /> Family invite
            </button>
            <button type="button" onClick={() => void makeInvite("friend")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
              <Link2 className="size-3.5" /> Friend invite
            </button>
            <button type="button" onClick={() => void makeInvite("nearby")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
              Nearby invite
            </button>
          </div>
          {invite && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-[11px]">{bumpInviteLink(invite)}</code>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                onClick={() => {
                  void navigator.clipboard.writeText(bumpInviteLink(invite));
                  toast("Copied", "success");
                }}
              >
                <Copy className="size-4" />
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
          <div className="mb-2 text-sm font-semibold">Redeem invite</div>
          <div className="flex gap-2">
            <input
              value={redeem}
              onChange={(e) => setRedeem(e.target.value)}
              placeholder="Code or paste link"
              className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
            />
            <button
              type="button"
              disabled={!redeem.trim()}
              onClick={() => {
                const code = redeem.trim().split("/").pop() || redeem.trim();
                void bumpRedeemInvite(code).then(() => refresh());
              }}
              className="rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export { openBump } from "@/lib/bump";
