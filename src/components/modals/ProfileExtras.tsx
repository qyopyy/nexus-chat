"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { updateMyProfile, uploadBanner } from "@/lib/data";
import { PLATFORMS, linkLabel, normalizeLink, platformById, spotifyEmbed } from "@/lib/links";
import type { ProfileLink } from "@/lib/types";
import { cn } from "@/lib/utils";
import SpotifyConnect from "@/components/music/SpotifyConnect";

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">{children}</div>;

/** Banner image, social link rows, Spotify profile song, forum name — part of My Account */
export default function ProfileExtras() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const bannerInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [plat, setPlat] = useState("x");
  const [linkText, setLinkText] = useState("");
  const [song, setSong] = useState(me?.profile_song ?? "");
  const [forum, setForum] = useState(me?.forum_name ?? "");
  if (!me) return null;
  const links = me.links ?? [];

  const addLink = async () => {
    const l = normalizeLink(linkText, plat);
    if (!l) return toast("That link doesn't look right", "error");
    if (links.length >= 10) return toast("Up to 10 links", "error");
    await updateMyProfile({ links: [...links, l] });
    setLinkText("");
  };
  const removeLink = (i: number) => void updateMyProfile({ links: links.filter((_, j) => j !== i) });
  const move = (i: number, d: number) => {
    const next = [...links];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    void updateMyProfile({ links: next }, true);
  };

  return (
    <div className="space-y-6">
      {/* banner image */}
      <div>
        <Label>Profile background image</Label>
        <div
          className="relative h-28 overflow-hidden rounded-xl bg-rail bg-cover bg-center"
          style={me.banner_url ? { backgroundImage: `url("${me.banner_url}")` } : undefined}
        >
          {!me.banner_url && <div className="grid size-full place-items-center text-sm text-sub">No image — your banner color is used</div>}
          <div className="absolute right-2 bottom-2 flex gap-2">
            {me.banner_url && (
              <button onClick={() => void updateMyProfile({ banner_url: null })} className="rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/75">
                Remove
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => bannerInput.current?.click()}
              className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-2 disabled:opacity-50"
            >
              <ImagePlus className="size-3.5" /> {busy ? "Uploading…" : me.banner_url ? "Change" : "Upload"}
            </button>
          </div>
        </div>
        <input
          ref={bannerInput}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            await uploadBanner(f);
            setBusy(false);
          }}
        />
        <p className="mt-1 text-xs text-sub">Wide images look best (e.g. 1500×500). GIFs animate. Up to 8 MB.</p>
      </div>

      {/* social links */}
      <div>
        <Label>Links ({links.length}/10)</Label>
        <div className="space-y-1.5">
          {links.map((l, i) => (
            <LinkEditRow key={`${l.url}${i}`} link={l} onRemove={() => removeLink(i)} onUp={i > 0 ? () => move(i, -1) : undefined} onDown={i < links.length - 1 ? () => move(i, 1) : undefined} />
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select value={plat} onChange={(e) => setPlat(e.target.value)} className="rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60">
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addLink()}
            placeholder={plat === "website" ? "yourdomain.com" : "@handle or full link"}
            className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
          />
          <button onClick={() => void addLink()} disabled={!linkText.trim()} className="flex items-center justify-center gap-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-40">
            <Plus className="size-4" /> Add
          </button>
        </div>
      </div>

      {/* profile song */}
      <div>
        <Label>Spotify song on your profile</Label>
        <div className="flex gap-2">
          <input
            value={song}
            onChange={(e) => setSong(e.target.value)}
            placeholder="Paste a Spotify track, album or playlist link"
            className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
          />
          <button
            onClick={() => {
              const v = song.trim();
              if (v && !spotifyEmbed(v)) return toast("Paste an open.spotify.com link", "error");
              void updateMyProfile({ profile_song: v || null });
            }}
            disabled={song.trim() === (me.profile_song ?? "")}
            className="rounded-md bg-ok px-3 py-2 text-sm font-semibold text-white hover:bg-ok/85 disabled:opacity-40"
          >
            Save
          </button>
        </div>
        {spotifyEmbed(me.profile_song) && (
          <iframe src={spotifyEmbed(me.profile_song)!} title="Profile song" loading="lazy" allow="encrypted-media" className="mt-2 h-[80px] w-full rounded-xl border-0" />
        )}
      </div>

      {/* forum name */}
      <div>
        <Label>Music forum username</Label>
        <div className="flex gap-2">
          <input
            value={forum}
            onChange={(e) => setForum(e.target.value.replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 24))}
            placeholder="Name shown on artist pages & posts"
            className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
          />
          <button
            onClick={() => {
              const v = forum.trim();
              if (v && v.length < 2) return toast("At least 2 characters", "error");
              void updateMyProfile({ forum_name: v || null });
            }}
            disabled={forum.trim() === (me.forum_name ?? "")}
            className="rounded-md bg-ok px-3 py-2 text-sm font-semibold text-white hover:bg-ok/85 disabled:opacity-40"
          >
            Save
          </button>
        </div>
        <p className="mt-1 text-xs text-sub">A separate identity for the music hub — artists use it next to their artist page.</p>
      </div>

      <div>
        <Label>Spotify account</Label>
        <SpotifyConnect />
      </div>
    </div>
  );
}

function LinkEditRow({ link, onRemove, onUp, onDown }: { link: ProfileLink; onRemove: () => void; onUp?: () => void; onDown?: () => void }) {
  const p = platformById(link.type);
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-rail px-2 py-1.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: p.color }}>
        {p.glyph}
      </span>
      <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{linkLabel(link)}</span>
        <span className="block truncate text-[11px] text-sub">{link.url}</span>
      </a>
      <div className="flex shrink-0 items-center">
        <button onClick={onUp} disabled={!onUp} className={cn("px-1.5 text-sub", onUp ? "hover:text-txt" : "opacity-30")} aria-label="Move up">
          ↑
        </button>
        <button onClick={onDown} disabled={!onDown} className={cn("px-1.5 text-sub", onDown ? "hover:text-txt" : "opacity-30")} aria-label="Move down">
          ↓
        </button>
        <button onClick={onRemove} className="grid size-8 place-items-center rounded-md text-sub hover:bg-dnd/15 hover:text-dnd" aria-label="Remove link">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
