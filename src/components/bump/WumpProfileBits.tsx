"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Music2, Play, Search, Trash2, Check, Users, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import {
  BUMP_PRIVACY_DEF,
  bumpGetProfile,
  bumpSearchSongs,
  bumpSetPrivacy,
  bumpSetSong,
  bumpSpotifyTrackEmbed,
  bumpViewers,
  type BumpPrivacy,
  type BumpProfile,
  type BumpSong,
  type BumpViewer,
} from "@/lib/bump";
import Avatar from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { Field, Seg, Toggle } from "./WumpSettings";
import { useWumpPlus } from "@/lib/wumpPlus";

/** Playable Spotify embed for one track link (null when the link isn't a track). */
export function WumpTrackPlayer({ url, tall, className }: { url: string | null | undefined; tall?: boolean; className?: string }) {
  const src = bumpSpotifyTrackEmbed(url);
  if (!src) return null;
  return (
    <iframe
      src={src}
      title="Spotify player"
      loading="lazy"
      allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"
      className={cn("w-full rounded-xl border-0", tall ? "h-[152px]" : "h-[80px]", className)}
    />
  );
}

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/** Search Spotify songs, preview them in a playable embed, and set one as the profile song. */
export function WumpSongSearch({
  current,
  onSet,
  autoFocus,
  compact,
}: {
  current?: string | null;
  onSet?: (url: string | null, prof: BumpProfile | null) => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [items, setItems] = useState<BumpSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<BumpSong | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const s = ++seq.current;
    if (dq.trim().length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    void bumpSearchSongs(dq).then((r) => {
      if (s !== seq.current) return;
      setItems(r);
      setLoading(false);
    });
  }, [dq]);

  async function set(url: string | null) {
    setBusy(true);
    const p = await bumpSetSong(url);
    setBusy(false);
    if (p) onSet?.(url, p);
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-xl bg-black/30 px-3 ring-1 ring-transparent focus-within:ring-accent">
        <Search className="size-4 shrink-0 text-sub" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          enterKeyHint="search"
          placeholder="Search Spotify songs…"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
        />
        {q && (
          <button type="button" aria-label="Clear" onClick={() => setQ("")} className="text-sub hover:text-txt">
            <X className="size-4" />
          </button>
        )}
      </label>

      {loading && <p className="px-1 text-[11px] text-sub">Searching…</p>}
      {!loading && dq.trim().length >= 2 && !items.length && <p className="px-1 text-[11px] text-sub">No songs found (Spotify may not be set up yet).</p>}

      {!!items.length && (
        <ul className={cn("space-y-1 overflow-y-auto pr-1", compact ? "max-h-56" : "max-h-72")}>
          {items.map((t) => {
            const isCur = !!current && current.includes(t.id);
            return (
              <li key={t.id}>
                <div className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5", preview?.id === t.id ? "bg-white/10" : "hover:bg-white/5")}>
                  <button type="button" onClick={() => setPreview(preview?.id === t.id ? null : t)} className="relative size-10 shrink-0 overflow-hidden rounded-md bg-white/10" aria-label={`Preview ${t.name}`}>
                    {t.image ? <img src={t.image} alt="" className="size-full object-cover" /> : <Music2 className="m-auto size-5 text-sub" />}
                    <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition hover:opacity-100">
                      <Play className="size-4 fill-white text-white" />
                    </span>
                  </button>
                  <button type="button" onClick={() => setPreview(preview?.id === t.id ? null : t)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-semibold">
                      {t.name}
                      {t.explicit && <span className="ml-1 rounded bg-white/15 px-1 text-[9px] font-bold align-middle">E</span>}
                    </div>
                    <div className="truncate text-[11px] text-sub">{t.artists}</div>
                  </button>
                  <button
                    type="button"
                    disabled={busy || isCur}
                    onClick={() => void set(t.url)}
                    className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold disabled:opacity-60", isCur ? "bg-ok/20 text-ok" : "bg-[#1DB954] text-black")}
                  >
                    {isCur ? "On profile" : "Set"}
                  </button>
                </div>
                {preview?.id === t.id && <WumpTrackPlayer url={t.url} className="mt-1" />}
              </li>
            );
          })}
        </ul>
      )}

      {current && (
        <button type="button" disabled={busy} onClick={() => void set(null)} className="inline-flex items-center gap-1 px-1 text-[11px] font-semibold text-sub hover:text-dnd">
          <Trash2 className="size-3" /> Remove profile song
        </button>
      )}
    </div>
  );
}

const LOCK_COPY: Record<string, { title: string; body: string }> = {
  private: { title: "This profile is private", body: "Only they can see it." },
  friends: { title: "Friends only", body: "Become friends (or follow each other) to see this profile." },
  password: { title: "Password protected", body: "Enter the password they shared with you." },
  wrong_password: { title: "Wrong password", body: "Try again." },
  too_many: { title: "Too many tries", body: "Wait about 10 minutes, then try again." },
};

/** Lock screen for a profile that can't be shown, with the password form when it's password protected. */
export function WumpLockedProfile({ prof, onUnlocked }: { prof: BumpProfile; onUnlocked: (p: BumpProfile) => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(prof.locked || "password");
  const copy = LOCK_COPY[state] || LOCK_COPY.private;
  const pwLock = state === "password" || state === "wrong_password" || state === "too_many";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    const p = await bumpGetProfile(prof.user_id, pw);
    setBusy(false);
    if (!p) return;
    if (p.locked) {
      setState(p.locked);
      setPw("");
    } else onUnlocked(p);
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
      <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
        <Avatar userId={prof.user_id} size={64} />
        <div className="mt-2 text-lg font-extrabold">{prof.display_name}</div>
        <div className="text-xs text-sub">@{prof.username}</div>
        <div className={cn("mt-4 grid size-10 place-items-center rounded-full", state === "wrong_password" || state === "too_many" ? "bg-dnd/20 text-dnd" : "bg-white/10 text-txt")}>
          <Lock className="size-5" />
        </div>
        <div className="mt-2 text-sm font-bold">{copy.title}</div>
        <p className="mt-0.5 text-xs text-sub">{copy.body}</p>
        {pwLock && prof.password_hint && <p className="mt-2 rounded-lg bg-black/25 px-3 py-1.5 text-[11px] text-sub">Hint: {prof.password_hint}</p>}
        {pwLock && state !== "too_many" && (
          <form onSubmit={(e) => void submit(e)} className="mt-3 flex w-full max-w-xs gap-2">
            <label className="flex min-w-0 flex-1 items-center rounded-xl bg-black/30 px-3 ring-1 ring-transparent focus-within:ring-accent">
              <KeyRound className="size-4 shrink-0 text-sub" />
              <input
                type={show ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value.slice(0, 64))}
                autoComplete="off"
                autoFocus
                placeholder="Password"
                className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm outline-none"
              />
              <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="text-sub">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </label>
            <button type="submit" disabled={!pw || busy} className="rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "…" : "Enter"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Owner-only: view counts + who viewed the profile recently. */
export function WumpProfileViews({ prof, onOpen, onUpgrade }: { prof: BumpProfile; onOpen?: (id: string) => void; onUpgrade?: () => void }) {
  const plus = useWumpPlus();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BumpViewer[] | null>(null);
  const profiles = useApp((s) => s.profiles);

  useEffect(() => {
    if (open && !rows && plus?.active) void bumpViewers(50).then(setRows);
  }, [open, rows, plus?.active]);

  if (!prof.is_me) return null;
  return (
    <div className="border-t border-white/5 px-4 py-3">
      <button type="button" onClick={() => (plus && !plus.active ? onUpgrade?.() : setOpen(!open))} className="flex w-full items-center gap-2 text-left">
        <Eye className="size-4 text-accent" />
        <span className="text-sm font-bold">{prof.views ?? 0} profile views</span>
        <span className="text-[11px] text-sub">· {prof.views_7d ?? 0} people this week</span>
        <span className="ml-auto text-[11px] font-semibold text-accent">{plus && !plus.active ? "✦ Who viewed · Plus" : open ? "Hide" : "Who viewed"}</span>
      </button>
      {open && (
        <div className="mt-2">
          {!rows ? (
            <p className="text-xs text-sub">Loading…</p>
          ) : !rows.length ? (
            <p className="text-xs text-sub">No visible viewers in the last 30 days.</p>
          ) : (
            <ul className="space-y-1">
              {rows.map((r) => {
                const u = profiles[r.viewer_id];
                return (
                  <li key={r.viewer_id}>
                    <button type="button" onClick={() => onOpen?.(r.viewer_id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-white/5">
                      <Avatar userId={r.viewer_id} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{u?.display_name || u?.username || "Someone"}</span>
                        <span className="block truncate text-[11px] text-sub">@{u?.username || "user"}</span>
                      </span>
                      {r.is_friend && <Check className="size-3.5 text-ok" />}
                      <span className="text-[10px] text-sub">{ago(r.viewed_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-sub">People who turned on “Browse privately” aren’t listed.</p>
        </div>
      )}
    </div>
  );
}

/** Profile privacy + page password settings (Wump settings tab). */
export function WumpProfilePrivacy({ userId }: { userId: string }) {
  const plus = useWumpPlus();
  const [p, setP] = useState<BumpPrivacy | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [hint, setHint] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    void bumpGetProfile(userId).then((prof) => {
      const priv = prof?.privacy ?? { ...BUMP_PRIVACY_DEF };
      setP(priv);
      setHint(priv.password_hint ?? "");
    });
  }, [userId]);

  async function save(patch: Parameters<typeof bumpSetPrivacy>[0], msg = "Profile privacy saved") {
    setBusy(true);
    const r = await bumpSetPrivacy(patch);
    setBusy(false);
    if (r?.privacy) {
      setP(r.privacy);
      setHint(r.privacy.password_hint ?? "");
      toast(msg, "success");
      return true;
    }
    return false;
  }

  if (!p) return <div className="mx-auto h-40 max-w-xl animate-pulse rounded-2xl bg-side" />;

  return (
    <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Users className="size-4 text-accent" /> Profile privacy
      </div>
      <p className="mb-4 text-xs text-sub">Who can see your profile, hangout spot, song and follows — and who can message you.</p>

      <Field label="Who can see my profile">
        <Seg
          value={p.visibility}
          disabled={busy}
          onChange={(v) => void save({ visibility: v as BumpPrivacy["visibility"] })}
          options={[
            { id: "everyone", label: "Everyone" },
            { id: "friends", label: "Friends" },
            { id: "private", label: "Only me" },
          ]}
        />
      </Field>
      <Field label="Hangout spot on my profile">
        <Seg
          value={p.show_place}
          disabled={busy}
          onChange={(v) => void save({ show_place: v as BumpPrivacy["show_place"] })}
          options={[
            { id: "everyone", label: "Everyone" },
            { id: "friends", label: "Friends" },
            { id: "nobody", label: "Nobody" },
          ]}
        />
      </Field>
      <Field label="Who can message me">
        <Seg
          value={p.dm_from}
          disabled={busy}
          onChange={(v) => void save({ dm_from: v as BumpPrivacy["dm_from"] })}
          options={[
            { id: "everyone", label: "Everyone" },
            { id: "friends", label: "Friends" },
            { id: "nobody", label: "Nobody" },
          ]}
        />
      </Field>
      <Toggle label="Show my profile song" hint="Your Spotify song plays on your profile." checked={p.show_song} disabled={busy} onChange={(v) => void save({ show_song: v })} />
      <Toggle label="Show followers / following" hint="Friends always see them." checked={p.show_follows} disabled={busy} onChange={(v) => void save({ show_follows: v })} />
      <Toggle label="Appear in search" hint="Off: only friends can find you by name." checked={p.searchable} disabled={busy} onChange={(v) => void save({ searchable: v })} />
      <Toggle
        label="Browse privately ✦"
        hint={plus?.active ? "Don’t show up in other people’s “Who viewed” list." : "Wump Plus — stay off other people’s “Who viewed” list."}
        checked={p.hide_my_views}
        disabled={busy || (!plus?.active && !p.hide_my_views)}
        onChange={(v) => void save({ hide_my_views: v })}
      />

      <div className="mt-2 rounded-xl bg-black/20 p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Lock className="size-4 text-accent" /> Password-protected page
          {p.has_password && <span className="rounded-full bg-ok/20 px-2 py-0.5 text-[10px] font-bold text-ok">On</span>}
        </div>
        <p className="mb-3 text-[11px] text-sub">Visitors must enter your custom password to see your profile. Stored hashed — we can’t read it. 8 wrong tries locks a visitor out for 10 minutes.</p>
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center rounded-xl bg-black/30 px-3 ring-1 ring-transparent focus-within:ring-accent">
            <KeyRound className="size-4 shrink-0 text-sub" />
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value.slice(0, 64))}
              autoComplete="new-password"
              placeholder={p.has_password ? "New password" : "Set a password (4–64)"}
              className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm outline-none"
            />
            <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="text-sub">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </label>
          <button
            type="button"
            disabled={busy || pw.length < 4}
            onClick={() => void save({ password: pw, password_hint: hint }, "Page password set").then((ok) => ok && setPw(""))}
            className="rounded-xl bg-accent px-3 text-xs font-bold text-white disabled:opacity-40"
          >
            {p.has_password ? "Change" : "Set"}
          </button>
        </div>
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value.slice(0, 80))}
          onBlur={() => hint !== (p.password_hint ?? "") && p.has_password && void save({ password_hint: hint }, "Hint saved")}
          placeholder="Optional hint shown to visitors"
          className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-xs outline-none ring-1 ring-transparent focus:ring-accent"
        />
        <Toggle
          label="Friends skip the password"
          hint="Friends and mutual follows get straight in."
          checked={p.password_friends_bypass}
          disabled={busy}
          onChange={(v) => void save({ password_friends_bypass: v })}
        />
        {p.has_password && (
          <button type="button" disabled={busy} onClick={() => void save({ password: "" }, "Password removed")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-dnd">
            <Trash2 className="size-3" /> Remove password
          </button>
        )}
      </div>
    </section>
  );
}
