"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint } from "lucide-react";
import { toast } from "@/store/app";
import { studioGo } from "@/store/studio";
import { loadProfiles } from "@/lib/data";
import { isLive, listWorks, type ShieldWork } from "@/lib/shield";
import { claimsAgainstMe, disputeClaim, myClaims, setClaim, setWorkPolicy, type Claim } from "@/lib/protect";
import { cn } from "@/lib/utils";
import NameTag from "@/components/ui/NameTag";

const STATUS: Record<Claim["status"], { label: string; cls: string }> = {
  open: { label: "Claimed", cls: "bg-[#f0b232]/20 text-[#f0b232]" },
  released: { label: "Released", cls: "bg-white/10 text-sub" },
  disputed: { label: "Disputed", cls: "bg-[#ed4245]/20 text-[#ff8a8c]" },
  upheld: { label: "Upheld", cls: "bg-[#23a55a]/20 text-[#57f287]" },
};
const WHERE: Record<string, string> = { chat: "Chat", video: "Video", space: "Space", release: "Release", send: "Distribution" };

/** Content ID — every Shield 360 song becomes a reference file; matches either block the upload or create a claim */
export default function ContentId() {
  const [works, setWorks] = useState<ShieldWork[] | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [mine, setMine] = useState<Claim[]>([]);
  const [tab, setTab] = useState<"claims" | "refs" | "against">("claims");

  const load = useCallback(async () => {
    const [w, c, a] = await Promise.all([listWorks(), myClaims(), claimsAgainstMe()]);
    setWorks(w);
    setClaims(c);
    setMine(a);
    void loadProfiles([...c, ...a].flatMap((x) => [x.uploader_id, x.owner_id]).filter(Boolean) as string[]);
  }, []);
  useEffect(() => void load(), [load]);

  const titles = useMemo(() => Object.fromEntries((works ?? []).map((w) => [w.id, w.title])), [works]);
  const open = claims.filter((c) => c.status === "open" || c.status === "disputed").length;
  const tracking = (works ?? []).filter((w) => w.content_id !== false).length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg,#5c0b0b,#5c0b4a 55%,#1b0b5c)" }}>
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/70 uppercase">
          <Fingerprint className="size-4" /> Content ID
        </div>
        <div className="mt-1 text-2xl font-black">Know everywhere your music is used</div>
        <p className="mt-1 max-w-2xl text-sm text-white/80">
          Every song in Shield 360 is a reference file. When someone uploads it in a chat, video, space or release, Content ID either <b>blocks</b> it or lets it through and files a <b>claim</b> for you — you get a
          Nexus Bot message either way.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Reference songs", works?.length ?? 0],
            ["Content ID on", tracking],
            ["Open claims", open],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/10 p-3">
              <div className="text-2xl font-black tabular-nums">{v}</div>
              <div className="text-xs text-white/70">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex rounded-full bg-black/25 p-0.5 text-sm">
        {(
          [
            ["claims", `Claims (${claims.length})`],
            ["refs", "Reference songs"],
            ["against", `On my uploads (${mine.length})`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex-1 rounded-full py-1.5 font-semibold", tab === k && "bg-active")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "claims" &&
        (claims.length === 0 ? (
          <p className="py-8 text-center text-sm text-sub">No claims yet. When someone uses one of your songs, it shows up here.</p>
        ) : (
          <div className="space-y-2">
            {claims.map((c) => (
              <div key={c.id} className="rounded-xl border border-line/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">🎵 {titles[c.work_id] ?? "Song"}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
                </div>
                <div className="mt-0.5 text-xs text-sub">
                  {WHERE[c.context] ?? c.context} upload by {c.uploader_id ? <NameTag userId={c.uploader_id} badges={false} /> : "a deleted user"} · match {Math.min(100, Math.round((c.score / 300) * 100))}% ·{" "}
                  {new Date(c.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </div>
                {c.dispute_note && <div className="mt-1.5 rounded-lg bg-dnd/10 px-2.5 py-1.5 text-xs">Dispute: {c.dispute_note}</div>}
                {(c.status === "open" || c.status === "disputed") && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <button onClick={async () => (await setClaim(c.id, "upheld")) && load()} className="rounded-full bg-ok px-3 py-1 font-semibold text-white">
                      Uphold claim
                    </button>
                    <button onClick={async () => (await setClaim(c.id, "released")) && load()} className="rounded-full bg-hover px-3 py-1 font-semibold hover:bg-active">
                      Release (it&apos;s fine)
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

      {tab === "refs" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-sub">
            <span className="flex-1">Add reference songs in Shield 360 — release tracks are added automatically.</span>
            <button onClick={() => studioGo("shield")} className="rounded-full bg-accent px-3 py-1.5 font-semibold text-white">
              Shield 360
            </button>
          </div>
          {(works ?? []).map((w) => (
            <RefRow key={w.id} w={w} onChange={(x) => setWorks((l) => (l ?? []).map((y) => (y.id === x.id ? x : y)))} />
          ))}
          {works?.length === 0 && <p className="py-6 text-center text-sm text-sub">No reference songs yet.</p>}
        </div>
      )}

      {tab === "against" &&
        (mine.length === 0 ? (
          <p className="py-8 text-center text-sm text-sub">None of your uploads have been claimed. 👍</p>
        ) : (
          <div className="space-y-2">
            {mine.map((c) => (
              <div key={c.id} className="rounded-xl border border-line/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    Your {WHERE[c.context]?.toLowerCase() ?? c.context} upload matched a song by <NameTag userId={c.owner_id} badges={false} />
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
                </div>
                <div className="mt-0.5 text-xs text-sub">{new Date(c.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
                {c.status === "open" && (
                  <button
                    onClick={async () => {
                      const note = prompt("Why is this claim wrong? (e.g. I own it, I have a license, it's my original)");
                      if (note?.trim() && (await disputeClaim(c.id, note.trim()))) {
                        toast("Dispute sent to the rights owner", "success");
                        void load();
                      }
                    }}
                    className="mt-2 rounded-full bg-hover px-3 py-1 text-xs font-semibold hover:bg-active"
                  >
                    Dispute
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function RefRow({ w, onChange }: { w: ShieldWork; onChange: (w: ShieldWork) => void }) {
  const policy = w.policy ?? "block";
  const blocking = policy === "block" && isLive(w);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{w.title}</div>
        <div className="truncate text-xs text-sub">
          {w.artist ?? "—"} · {blocking ? "🚫 blocking uploads" : w.content_id !== false ? "🎯 tracking & claiming" : "off"}
          {policy === "block" && !isLive(w) && " (unlocked → tracking)"}
        </div>
      </div>
      <div className="flex rounded-full bg-black/25 p-0.5 text-xs">
        {(
          [
            ["block", "Block"],
            ["track", "Track & claim"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={async () => {
              const x = await setWorkPolicy(w.id, { policy: k });
              if (x) onChange(x);
            }}
            className={cn("rounded-full px-3 py-1 font-semibold", policy === k && "bg-active")}
          >
            {l}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          className="size-4"
          checked={w.content_id !== false}
          onChange={async (e) => {
            const x = await setWorkPolicy(w.id, { content_id: e.target.checked });
            if (x) onChange(x);
          }}
        />
        Content ID
      </label>
    </div>
  );
}
