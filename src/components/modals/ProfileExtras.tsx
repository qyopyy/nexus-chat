"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useApp, toast, openModal } from "@/store/app";
import { NEED, gate, useMyTier } from "@/lib/premium";
import { updateMyProfile, uploadBanner } from "@/lib/data";
import { PLATFORMS, linkLabel, normalizeLink, platformById, spotifyEmbed } from "@/lib/links";
import type { ProfileLink } from "@/lib/types";
import { cn } from "@/lib/utils";
import SpotifyConnect from "@/components/music/SpotifyConnect";
import { BORDERS, BorderRing, EFFECTS, EffectCanvas, THEMES, themeBg } from "@/components/profile/ProfileFx";

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
      <ProfileStyle />
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

/** animated background, border and theme for your profile card */
function ProfileStyle() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const [preview, setPreview] = useState(0);
  const tier = useMyTier();
  if (!me) return null;
  const locked = (id: string) => tier < NEED.flair && id !== "none";
  const tryPick = (id: string, fn: () => void) => (locked(id) ? void gate(NEED.flair, "Profile animations, borders and themes") : fn());
  const chip = (on: boolean) => cn("rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95", on ? "bg-accent text-white" : "bg-rail hover:bg-hover");
  return (
    <div>
      <Label>Profile animation, border & theme</Label>
      {tier < NEED.flair && (
        <button onClick={() => openModal("premium", "lighting")} className="mb-3 flex w-full items-center gap-2 rounded-xl bg-[#ffd400]/10 px-3 py-2 text-left text-sm ring-1 ring-[#ffd400]/30">
          ⚡ <span className="flex-1">These are Nexus Lighting perks — tap to get Lighting ($3.99/mo). You can preview them for free.</span>
        </button>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs text-sub">Background animation — plays when someone opens your profile</div>
            <div className="flex flex-wrap gap-1.5">
              {EFFECTS.map((e) => (
                <button key={e.id} onClick={() => tryPick(e.id, () => (void updateMyProfile({ profile_effect: e.id === "none" ? null : e.id }, true), setPreview((n) => n + 1)))} className={chip((me.profile_effect ?? "none") === e.id)}>
                  {e.emoji} {e.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs text-sub">Animated border</div>
            <div className="flex flex-wrap gap-1.5">
              {BORDERS.map((b) => (
                <button key={b.id} onClick={() => tryPick(b.id, () => void updateMyProfile({ profile_border: b.id === "none" ? null : b.id }, true))} className={chip((me.profile_border ?? "none") === b.id)}>
                  {b.css && <span className="mr-1 inline-block size-3 rounded-full align-[-1px]" style={{ background: b.css }} />}
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs text-sub">Card theme</div>
            <div className="flex flex-wrap gap-1.5">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => tryPick(t.id, () => void updateMyProfile({ profile_theme: t.id === "none" ? null : t.id }, true))} className={chip((me.profile_theme ?? "none") === t.id)}>
                  {t.bg && <span className="mr-1 inline-block size-3 rounded-full align-[-1px] ring-1 ring-white/20" style={{ background: t.bg }} />}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-sub">
            <span>Preview</span>
            <button onClick={() => setPreview((n) => n + 1)} className="font-semibold text-accent">
              Replay
            </button>
          </div>
          <div className={cn("relative rounded-2xl", me.profile_border && me.profile_border !== "none" && "p-[2px]")}>
            <BorderRing border={me.profile_border} />
            <div className={cn("relative h-56 overflow-hidden rounded-2xl", !themeBg(me.profile_theme) && "bg-menu")} style={themeBg(me.profile_theme) ? { background: themeBg(me.profile_theme) } : undefined}>
              <EffectCanvas key={preview} effect={me.profile_effect} accent={me.avatar_color} seed={String(preview)} />
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-center">
                <div className="grid size-16 place-items-center rounded-full text-2xl font-bold text-white" style={{ background: me.avatar_color }}>
                  {me.avatar_url ? <img src={me.avatar_url} alt="" className="size-full rounded-full object-cover" /> : me.display_name.slice(0, 1)}
                </div>
                <div className="font-bold">{me.display_name}</div>
                <div className="text-xs text-sub">
                  👁 {(me.view_count ?? 0).toLocaleString()} views · ❤ {(me.like_count ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
