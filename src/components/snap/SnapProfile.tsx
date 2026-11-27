"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Music2, Search, Trash2 } from "lucide-react";
import { toast, useApp } from "@/store/app";
import { clearMySound, getSounds, searchTracks, setMySound } from "@/lib/snapSoundsNet";
import { cleanQuery, embedUrl, soundHours, timeLeftLabel, type Sound, type SoundPick } from "@/lib/snapSounds";
import SnapFace from "./SnapFace";
import { Sheet } from "./SnapUi";

/** Your Nexus Snap profile: picture, username and the Spotify sound on your profile (24 hours, 48 for VIP and staff). */
export default function SnapProfile({ onClose }: { onClose: () => void }) {
  const me = useApp((s) => s.userId);
  const p = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const hours = soundHours(p?.site_role);
  const [sound, setSound] = useState<Sound | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SoundPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const seq = useRef(0);

  useEffect(() => {
    if (!me) return;
    void getSounds([me]).then((m) => setSound(m[me] ?? null));
  }, [me]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // search as you type (Spotify through the Nexus proxy)
  useEffect(() => {
    const query = cleanQuery(q);
    const my = ++seq.current;
    if (!query) {
      setResults([]);
      setBusy(false);
      setErr("");
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      searchTracks(query)
        .then((r) => {
          if (my !== seq.current) return;
          setResults(r);
          setErr(r.length ? "" : "No songs found.");
        })
        .catch((e) => my === seq.current && setErr(e instanceof Error ? e.message : "Couldn't search."))
        .finally(() => my === seq.current && setBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const choose = async (r: SoundPick) => {
    setSaving(r.track_id);
    try {
      const s = await setMySound(r);
      setSound(s);
      setQ("");
      toast(`Sound is on your profile for ${hours} hours`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't set the sound.", "error");
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    try {
      await clearMySound();
      setSound(null);
      toast("Sound removed");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove it.", "error");
    }
  };

  const embed = sound ? embedUrl(sound.track_id) : null;

  return (
    <Sheet title="Your profile" onClose={onClose} z="z-[60]">
      <div className="space-y-4 px-4 pb-4">
        <div className="flex items-center gap-3">
          <SnapFace url={p?.avatar_url} name={p?.display_name || p?.username} color={p?.avatar_color} size={56} />
          <div className="min-w-0">
            <b className="block truncate text-base">{p?.display_name || p?.username || "You"}</b>
            <span className="block truncate text-sm text-white/55">@{p?.username ?? "…"}</span>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45">Sound on your profile</h3>
          {sound ? (
            <div className="space-y-2 rounded-2xl bg-white/5 p-3">
              <div className="flex items-center gap-3">
                {sound.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sound.cover_url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/10">
                    <Music2 className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{sound.title}</b>
                  <span className="block truncate text-xs text-white/55">{sound.artist}</span>
                  <span className="block text-[11px] text-emerald-300">{timeLeftLabel(sound.expires_at, now)}</span>
                </div>
                <button type="button" onClick={() => void remove()} aria-label="Remove sound" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                  <Trash2 className="size-4" />
                </button>
              </div>
              {embed && <iframe src={embed} title="Your sound" loading="lazy" allow="autoplay; clipboard-write; encrypted-media" className="h-[80px] w-full rounded-xl border-0" />}
            </div>
          ) : (
            <p className="rounded-2xl bg-white/5 p-3 text-sm text-white/55">No sound yet. Pick a song below and it plays on your profile.</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45">Add a sound · lasts {hours} hours{hours > 24 ? " (VIP and staff)" : ""}</h3>
          <label className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5">
            <Search className="size-4 shrink-0 text-white/50" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Spotify" aria-label="Search Spotify" maxLength={100} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40" />
            {busy && <Loader2 className="size-4 animate-spin text-white/50" />}
          </label>
          {err && <p className="px-1 text-xs text-rose-300">{err}</p>}
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.track_id}>
                <button type="button" onClick={() => void choose(r)} disabled={!!saving} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-white/10 disabled:opacity-50">
                  {r.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/10">
                      <Music2 className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{r.title}</b>
                    <span className="block truncate text-xs text-white/55">{r.artist}</span>
                  </span>
                  {saving === r.track_id ? <Loader2 className="size-4 animate-spin" /> : <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-black">Use</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
