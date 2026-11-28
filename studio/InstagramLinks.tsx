"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { listReleases } from "@/lib/dist";
import { listWorks, type ShieldWork } from "@/lib/shield";
import { listIgLinks, linkInstagramToProfile, saveIgLink, type IgLink } from "@/lib/igLinks";
import { igCaption, parseInstagramProfile, parseInstagramSong } from "@/lib/shieldPro";
import { cn } from "@/lib/utils";
import type { DistRelease } from "@/lib/types";
import { Card, H } from "./Studio";

const inp = "w-full min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Copied", "success"), () => toast("Couldn't copy", "error"));

type Item = { key: string; kind: "release" | "work"; id: string; title: string; artist: string };

export default function InstagramLinks() {
  const me = useApp((s) => s.userId);
  const links = useApp((s) => s.profiles[s.userId ?? ""]?.links);
  const igProfile = useMemo(() => links?.find((l) => l.type === "instagram" || /instagram\.com/i.test(l.url)), [links]);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [releases, setReleases] = useState<DistRelease[]>([]);
  const [works, setWorks] = useState<ShieldWork[]>([]);
  const [saved, setSaved] = useState<Record<string, IgLink>>({});
  const [drafts, setDrafts] = useState<Record<string, { song: string; artist: string }>>({});

  const load = useCallback(async () => {
    const [r, w, l] = await Promise.all([listReleases(), listWorks(), listIgLinks()]);
    setReleases(r);
    setWorks(w.filter((x) => x.owner_id === me));
    const map: Record<string, IgLink> = {};
    l.forEach((x) => (map[x.release_id ? `release:${x.release_id}` : `work:${x.work_id}`] = x));
    setSaved(map);
  }, [me]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (igProfile) setHandle(igProfile.url);
  }, [igProfile]);

  const items: Item[] = useMemo(
    () => [
      ...releases.map((r) => ({ key: `release:${r.id}`, kind: "release" as const, id: r.id, title: r.title, artist: r.primary_artist_name ?? "" })),
      ...works.map((w) => ({ key: `work:${w.id}`, kind: "work" as const, id: w.id, title: w.title, artist: w.artist ?? "" })),
    ],
    [releases, works],
  );
  const profileUrl = igProfile?.url ?? null;
  const done = items.filter((i) => saved[i.key]?.instagram_song_url).length;

  const saveProfile = async () => {
    setBusy("profile");
    const p = await linkInstagramToProfile(links, handle);
    setBusy(null);
    if (p) toast(`Instagram @${p.value} added to your Nexus profile`, "success");
  };
  const val = (i: Item) => {
    const s = saved[i.key];
    return drafts[i.key] ?? { song: s?.instagram_song_url ?? "", artist: s?.instagram_artist_url ?? profileUrl ?? "" };
  };
  const set = (i: Item, p: Partial<{ song: string; artist: string }>) => setDrafts((d) => ({ ...d, [i.key]: { ...val(i), ...p } }));
  const save = async (i: Item) => {
    const v = val(i);
    setBusy(i.key);
    const x = await saveIgLink(i.kind === "release" ? { release_id: i.id } : { work_id: i.id }, v.song, v.artist);
    setBusy(null);
    if (!x) return;
    setSaved((m) => ({ ...m, [i.key]: x }));
    setDrafts((d) => {
      const { [i.key]: _drop, ...rest } = d;
      return rest;
    });
    toast("Instagram links saved", "success");
  };

  return (
    <div className="space-y-4">
      <H>Instagram music links</H>
      <Card title="1 · Your Instagram profile">
        <p className="mb-2 text-xs text-sub">Paste your profile link or @handle. It is shown on your Nexus profile and pre-filled as the artist link below.</p>
        <div className="flex gap-2">
          <input className={inp} placeholder="https://instagram.com/yourname or @yourname" value={handle} onChange={(e) => setHandle(e.target.value)} />
          <button disabled={busy === "profile" || !handle.trim()} onClick={() => void saveProfile()} className="shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy === "profile" ? "Saving…" : igProfile ? "Update" : "Link"}
          </button>
        </div>
        {igProfile && (
          <a href={igProfile.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent">
            <Check className="size-3.5" /> Linked: {igProfile.label || igProfile.url} <ExternalLink className="size-3" />
          </a>
        )}
      </Card>

      <Card title={`2 · Song links (${done}/${items.length})`}>
        <div className="mb-3 rounded-xl bg-black/20 p-3 text-xs text-sub">
          <b className="text-text">How to get an Instagram song link:</b> open any Reel that uses your song → tap the song name at the bottom-left → tap <b>Share</b> / <b>⋯ → Copy link</b> → paste it below. It looks like <code>instagram.com/reels/audio/123…</code>. To show your music on your Instagram profile, add it there in the Instagram app (<i>Edit profile → Music</i>, where available) — Instagram offers no way for other apps to do it.
        </div>
        {items.length === 0 && <p className="text-sm text-sub">No releases or protected songs yet.</p>}
        <div className="space-y-2.5">
          {items.map((i) => {
            const v = val(i);
            const s = saved[i.key];
            const songOk = !v.song.trim() || parseInstagramSong(v.song).ok;
            const artOk = !v.artist.trim() || parseInstagramProfile(v.artist).ok;
            const dirty = v.song !== (s?.instagram_song_url ?? "") || v.artist !== (s?.instagram_artist_url ?? "");
            return (
              <div key={i.key} className="rounded-xl bg-black/20 p-3">
                <div className="flex items-center gap-2">
                  <Link2 className={cn("size-4 shrink-0", s?.instagram_song_url ? "text-emerald-400" : "text-faint")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{i.title}</div>
                    <div className="truncate text-[11px] text-sub">
                      {i.kind === "release" ? "Release" : "Protected song"}
                      {i.artist ? ` · ${i.artist}` : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <input className={cn(inp, !songOk && "border-red-400")} placeholder="Instagram song link" value={v.song} onChange={(e) => set(i, { song: e.target.value })} />
                  <input className={cn(inp, !artOk && "border-red-400")} placeholder="Artist profile link" value={v.artist} onChange={(e) => set(i, { artist: e.target.value })} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button disabled={busy === i.key || !dirty || !songOk || !artOk} onClick={() => void save(i)} className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                    {busy === i.key ? "Saving…" : "Save"}
                  </button>
                  {s?.instagram_song_url && (
                    <>
                      <a href={s.instagram_song_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold">
                        <ExternalLink className="size-3" /> Open song
                      </a>
                      <button onClick={() => copy(igCaption({ title: i.title, artist: i.artist, songUrl: s.instagram_song_url, profileUrl: s.instagram_artist_url ?? profileUrl }))} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold">
                        <Copy className="size-3" /> Copy caption
                      </button>
                    </>
                  )}
                  {s?.instagram_artist_url && (
                    <a href={s.instagram_artist_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold">
                      <ExternalLink className="size-3" /> Artist
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
