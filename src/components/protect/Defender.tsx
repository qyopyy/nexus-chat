"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast, openModal } from "@/store/app";
import { studioGo } from "@/store/studio";
import { useMyTier, needPlan } from "@/lib/premium";
import { prefillTakedown } from "@/lib/takedown";
import { addWatch, listAlerts, listWatches, removeWatch, scanWatch, setAlert, updateWatch, type DefAlert, type Watch } from "@/lib/protect";
import { cn } from "@/lib/utils";

const LIMIT = [1, 2, 5, 10, 50, 50];

/** Profile Defender — watches Spotify artist profiles for releases that aren't yours */
export default function Defender() {
  const tier = useMyTier();
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [alerts, setAlerts] = useState<DefAlert[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"new" | "all">("new");

  const load = useCallback(async () => {
    const [w, a] = await Promise.all([listWatches(), listAlerts()]);
    setWatches(w);
    setAlerts(a);
  }, []);
  useEffect(() => void load(), [load]);

  const byWatch = (id: string) => watches?.find((w) => w.id === id);
  const shown = alerts.filter((a) => filter === "all" || a.status === "new");
  const limit = LIMIT[Math.min(5, tier)];

  const notMine = async (a: DefAlert) => {
    await setAlert(a.id, "not_mine");
    const w = byWatch(a.watch_id);
    prefillTakedown({
      platform: "spotify",
      work_title: a.item.name ?? "",
      work_artist: w?.name ?? "",
      links: a.item.url ? [a.item.url] : [],
      description: `This release was delivered to my artist profile${w?.name ? ` (${w.name})` : ""} on Spotify, but it is not my music and I did not authorize it. It misleads my listeners and diverts streams. Please remove it from my profile.`,
    });
    studioGo("takedowns");
    toast("Takedown form filled in — check it and send", "info");
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg,#0b3d2a,#0b2a5c 60%,#2a0b5c)" }}>
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/70 uppercase">
          <ShieldCheck className="size-4" /> Profile Defender
        </div>
        <div className="mt-1 text-2xl font-black">Nobody sneaks music onto your profile</div>
        <p className="mt-1 max-w-2xl text-sm text-white/80">
          Paste your Spotify artist link. Nexus checks it every 3 hours and messages you the moment a release you didn&apos;t put out appears — or your name or photo changes. One tap turns it into a takedown notice.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!url.trim()) return;
            setBusy("add");
            try {
              const r = await addWatch(url.trim());
              toast(`Watching ${r.watch.name} — ${r.baseline} existing releases saved as yours`, "success");
              setUrl("");
              void load();
            } catch (err) {
              toast((err as Error).message, "error");
            }
            setBusy(null);
          }}
          className="mt-4 flex flex-wrap gap-2"
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/artist/…" className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none focus:bg-white/20" />
          <button disabled={!!busy} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black disabled:opacity-50">
            {busy === "add" ? "Adding…" : "Protect profile"}
          </button>
        </form>
        <div className="mt-2 text-xs text-white/70">
          {watches?.length ?? 0} of {limit} profile{limit === 1 ? "" : "s"} on your plan
          {tier < 4 && (
            <>
              {" · "}
              <button onClick={() => openModal("premium", needPlan(tier + 1).id)} className="underline">
                protect more
              </button>
            </>
          )}
        </div>
      </div>

      {(watches ?? []).length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {watches!.map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-2xl bg-side p-3">
              {w.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.image} alt="" className="size-12 rounded-full object-cover" />
              ) : (
                <div className="grid size-12 place-items-center rounded-full bg-hover">🎤</div>
              )}
              <div className="min-w-0 flex-1">
                <a href={`https://open.spotify.com/artist/${w.spotify_id}`} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:underline">
                  {w.name ?? w.spotify_id}
                </a>
                <div className="truncate text-xs text-sub">
                  {w.known.length} releases known · checked {w.last_scan ? new Date(w.last_scan).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "never"}
                </div>
              </div>
              <button
                title="Check now"
                disabled={busy === w.id}
                onClick={async () => {
                  setBusy(w.id);
                  try {
                    const r = await scanWatch(w.id);
                    toast(r.alerts ? `${r.alerts} new alert${r.alerts > 1 ? "s" : ""}` : "All clear ✓", r.alerts ? "info" : "success");
                    void load();
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                  setBusy(null);
                }}
                className="grid size-8 place-items-center rounded-full hover:bg-hover"
              >
                <RefreshCw className={cn("size-4", busy === w.id && "animate-spin")} />
              </button>
              <button title={w.alerts_on ? "Mute chat alerts" : "Turn chat alerts on"} onClick={async () => (await updateWatch(w.id, { alerts_on: !w.alerts_on })) && load()} className="grid size-8 place-items-center rounded-full hover:bg-hover">
                {w.alerts_on ? <Bell className="size-4" /> : <BellOff className="size-4 text-sub" />}
              </button>
              <button title="Stop watching" onClick={async () => confirm(`Stop protecting ${w.name}?`) && (await removeWatch(w.id)) && load()} className="grid size-8 place-items-center rounded-full text-sub hover:bg-dnd/15 hover:text-dnd">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-semibold">Alerts</h3>
        <div className="flex rounded-full bg-black/25 p-0.5 text-xs">
          {(["new", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-3 py-1 font-semibold capitalize", filter === f && "bg-active")}>
              {f === "new" ? `Needs review (${alerts.filter((a) => a.status === "new").length})` : "All"}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-sub">{watches?.length ? "Nothing suspicious. 🛡️" : "Add your artist profile above to start."}</p>
      ) : (
        <div className="space-y-2">
          {shown.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 p-3">
              {a.item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.item.image} alt="" className="size-14 rounded-lg object-cover" />
              ) : (
                <div className="grid size-14 place-items-center rounded-lg bg-hover text-2xl">{a.kind === "name" ? "✏️" : a.kind === "image" ? "🖼️" : "⚠️"}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {a.kind === "new_release" ? (
                    <a href={a.item.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {a.item.name}
                    </a>
                  ) : a.kind === "name" ? (
                    `Name changed: “${a.item.from}” → “${a.item.to}”`
                  ) : a.kind === "image" ? (
                    "Profile photo changed"
                  ) : (
                    "Profile is no longer on Spotify"
                  )}
                </div>
                <div className="truncate text-xs text-sub">
                  {byWatch(a.watch_id)?.name} · {a.kind === "new_release" ? `${a.item.type ?? "release"} · ${a.item.release_date ?? ""} · ${a.item.artists ?? ""}` : "profile change"} · found{" "}
                  {new Date(a.created_at).toLocaleDateString([], { dateStyle: "medium" })}
                </div>
              </div>
              {a.status === "new" ? (
                <div className="flex gap-1.5 text-xs">
                  <button onClick={async () => (await setAlert(a.id, "mine")) && load()} className="rounded-full bg-ok px-3 py-1.5 font-semibold text-white">
                    ✓ Mine
                  </button>
                  {a.kind === "new_release" ? (
                    <button onClick={() => void notMine(a)} className="rounded-full bg-dnd px-3 py-1.5 font-semibold text-white">
                      Not mine → takedown
                    </button>
                  ) : (
                    <button onClick={async () => (await setAlert(a.id, "not_mine")) && load()} className="rounded-full bg-hover px-3 py-1.5 font-semibold hover:bg-active">
                      I didn&apos;t do this
                    </button>
                  )}
                </div>
              ) : (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-sub">{a.status === "mine" ? "Yours" : a.status === "not_mine" ? "Reported" : a.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
