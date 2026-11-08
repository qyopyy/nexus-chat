"use client";

import { useEffect, useState } from "react";
import { Ban, BellOff, BellRing, Moon, Music, Trash2 } from "lucide-react";
import { loadWatchlist, setWatch, setWatchNotify, sp, type SpArtist, type Watch } from "@/lib/music";
import { toast, useApp } from "@/store/app";
import { CONNECTION_GROUPS, normalizeLink, platformById } from "@/lib/links";
import type { ProfileLink } from "@/lib/types";
import { loadProfiles, updateMyProfile } from "@/lib/data";

const NO_LINKS: ProfileLink[] = [];
import { setPref, usePrefs } from "@/lib/prefs";
import { loadBlocks, unblockUser, useBlocks } from "@/lib/blocks";
import { NOTIF_DEFAULTS, deleteMyAccount, fromHHMM, getNotifPrefs, saveNotifPrefs, toHHMM, type NotifPrefs } from "@/lib/adminTools";
import { Label, Toggle } from "./settingsUi";
import Avatar from "@/components/ui/Avatar";

/* ───────────── Privacy → blocked people ───────────── */
export function BlockedPeople() {
  const ids = useBlocks((s) => s.ids);
  const loaded = useBlocks((s) => s.loaded);
  const profiles = useApp((s) => s.profiles);
  const list = Object.keys(ids);
  const hideBlocked = usePrefs((s) => s.hideBlocked);
  useEffect(() => {
    void loadBlocks(true);
  }, []);
  useEffect(() => {
    const missing = list.filter((id) => !profiles[id]);
    if (missing.length) void loadProfiles(missing);
  }, [list.join(","), profiles]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Label>Blocked people</Label>
      <p className="mb-2 text-sm text-sub">Blocked people can&apos;t DM you, call you or send friend requests. Block someone from their profile card.</p>
      {!loaded ? (
        <div className="h-14 animate-pulse rounded-xl bg-side" />
      ) : list.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-side p-3 text-sm text-sub">
          <Ban className="size-4" /> You haven&apos;t blocked anyone.
        </div>
      ) : (
        <div className="max-h-72 divide-y divide-line/60 overflow-y-auto rounded-xl bg-side">
          {list.map((id) => {
            const p = profiles[id];
            return (
              <div key={id} className="flex items-center gap-3 px-3 py-2">
                <Avatar userId={id} size={32} plain />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p?.display_name ?? "Someone"}</div>
                  <div className="truncate text-xs text-sub">@{p?.username ?? "…"}</div>
                </div>
                <button onClick={() => void unblockUser(id, p?.display_name)} className="rounded-md bg-hover px-3 py-1.5 text-xs font-semibold hover:bg-active">
                  Unblock
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Toggle label="Hide their messages in servers & groups" hint="Shows a “Message from someone you blocked” line you can tap to reveal." checked={hideBlocked} onChange={(v) => setPref("hideBlocked", v)} />
    </>
  );
}

/* ───────────── Privacy → muted words ───────────── */
export function MutedWords() {
  const words = usePrefs((s) => s.mutedWords);
  const [draft, setDraft] = useState("");
  const add = () => {
    const next = draft
      .split(/[,\n]/)
      .map((w) => w.trim().slice(0, 40))
      .filter(Boolean)
      .filter((w) => !words.some((x) => x.toLowerCase() === w.toLowerCase()));
    if (next.length) setPref("mutedWords", [...words, ...next].slice(0, 200));
    setDraft("");
  };
  return (
    <>
      <Label>Muted words</Label>
      <p className="mb-2 text-sm text-sub">Messages with these words or phrases are folded away for you (tap to show). Saved on this device — nobody else knows.</p>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="spoiler, crypto, …"
          className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
        />
        <button onClick={add} disabled={!draft.trim()} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </div>
      {words.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {words.map((w) => (
            <button key={w} onClick={() => setPref("mutedWords", words.filter((x) => x !== w))} className="flex items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-xs font-semibold hover:bg-dnd/20 hover:text-dnd" title="Remove">
              {w} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ───────────── Notifications → what & when ───────────── */
export function NotificationPrefsBlock() {
  const me = useApp((s) => s.userId);
  const [p, setP] = useState<NotifPrefs | null>(null);
  useEffect(() => {
    if (me) void getNotifPrefs(me).then(setP);
  }, [me]);
  if (!me) return null;
  if (!p) return <div className="mt-4 h-40 animate-pulse rounded-xl bg-side" />;
  const save = async (patch: Partial<NotifPrefs>) => {
    const prev = p;
    const next = { ...p, ...patch };
    setP(next);
    if (!(await saveNotifPrefs(me, next))) setP(prev);
  };
  return (
    <div className="mt-6">
      <Label>Notify me about</Label>
      <Toggle label="Direct messages" checked={p.dms} onChange={(v) => void save({ dms: v })} />
      <Toggle label="Group chats" checked={p.groups} onChange={(v) => void save({ groups: v })} />
      <Toggle label="@mentions in servers" hint="Includes @everyone from server owners and admins." checked={p.mentions} onChange={(v) => void save({ mentions: v })} />
      <Toggle label="Incoming calls" checked={p.calls} onChange={(v) => void save({ calls: v })} />
      <Toggle label="Show message text" hint="Off shows just “New message” on your lock screen." checked={p.previews} onChange={(v) => void save({ previews: v })} />
      {p.wump_live !== undefined && (
        <Toggle label="Friends going Live on Wump" hint="When a friend or family member starts sharing their location." checked={p.wump_live} onChange={(v) => void save({ wump_live: v })} />
      )}

      <div className="mt-6 rounded-xl bg-side p-4">
        <div className="flex items-center gap-2 font-medium">
          <Moon className="size-4 text-accent" /> Quiet hours
        </div>
        <p className="mt-1 text-sm text-sub">No notifications during these hours, every day ({p.tz.replace(/_/g, " ")} time).</p>
        <Toggle label="Turn on quiet hours" checked={p.quiet_enabled} onChange={(v) => void save({ quiet_enabled: v, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || p.tz })} />
        <div className={p.quiet_enabled ? "" : "pointer-events-none opacity-40"}>
          <div className="flex items-center gap-3 py-3">
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-sub">
              From
              <input type="time" value={toHHMM(p.quiet_start)} onChange={(e) => void save({ quiet_start: fromHHMM(e.target.value) })} className="rounded-md bg-rail px-2 py-2 text-sm text-txt outline-none" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-sub">
              Until
              <input type="time" value={toHHMM(p.quiet_end)} onChange={(e) => void save({ quiet_end: fromHHMM(e.target.value) })} className="rounded-md bg-rail px-2 py-2 text-sm text-txt outline-none" />
            </label>
          </div>
          <Toggle label="Let calls ring through" hint="Calls still notify you during quiet hours." checked={p.quiet_allow_calls} onChange={(v) => void save({ quiet_allow_calls: v })} />
        </div>
      </div>
      {JSON.stringify({ ...p, wump_live: undefined }) !== JSON.stringify({ ...NOTIF_DEFAULTS, tz: p.tz, wump_live: undefined }) && (
        <button onClick={() => void save({ ...NOTIF_DEFAULTS, tz: p.tz, ...(p.wump_live !== undefined ? { wump_live: true } : {}) })} className="mt-3 text-sm text-sub hover:text-txt">
          Reset to defaults
        </button>
      )}
    </div>
  );
}

/* ───────────── Data & Advanced → delete account ───────────── */
export function DeleteAccountBlock() {
  const uname = useApp((s) => (s.userId ? s.profiles[s.userId]?.username : null));
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-6 rounded-xl border border-dnd/40 p-4">
      <div className="flex items-center gap-2 font-semibold text-dnd">
        <Trash2 className="size-4" /> Delete account
      </div>
      <p className="mt-1 text-sm text-sub">Permanently deletes your profile, messages access and servers you own (with no other members). This can&apos;t be undone — download your data first.</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-3 rounded-md bg-dnd/15 px-4 py-2 text-sm font-semibold text-dnd hover:bg-dnd/25">
          Delete my account…
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-sm">
            Type <b className="font-mono">{uname}</b> to confirm
          </label>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="w-full rounded-md bg-rail px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-dnd/60" />
          <div className="flex gap-2">
            <button onClick={() => (setOpen(false), setTyped(""))} className="rounded-md bg-hover px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button
              disabled={busy || !uname || typed.trim().toLowerCase() !== uname.toLowerCase()}
              onClick={async () => {
                setBusy(true);
                await deleteMyAccount(typed.trim());
                setBusy(false);
              }}
              className="rounded-md bg-dnd px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Connections → every other platform ───────────── */
export function MoreConnections() {
  const links = useApp((s) => (s.userId ? (s.profiles[s.userId]?.links ?? NO_LINKS) : NO_LINKS));
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const byType = (id: string) => links.findIndex((l) => l.type === id);
  const save = async (id: string) => {
    const l = normalizeLink(text, id);
    if (!l) return toast("That doesn't look like a username or link", "error");
    if (l.type !== id && id !== "website" && l.type !== "website") return toast(`That link is for ${platformById(l.type).label}, not ${platformById(id).label}`, "error");
    const i = byType(id);
    const next = i >= 0 ? links.map((x, j) => (j === i ? { ...x, url: l.url, type: id } : x)) : [...links, { ...l, type: id }];
    if (next.length > 30) return toast("Up to 30 connections", "error");
    setBusy(true);
    await updateMyProfile({ links: next });
    setBusy(false);
    setOpen(null);
    setText("");
  };
  const remove = async (id: string) => {
    const i = byType(id);
    if (i < 0) return;
    await updateMyProfile({ links: links.filter((_, j) => j !== i) });
  };
  return (
    <div className="mt-6">
      <Label>More connections</Label>
      <p className="mb-3 text-sm text-sub">Add your other accounts — they show as buttons on your profile. {links.length}/30 used.</p>
      <div className="space-y-5">
        {CONNECTION_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-2 text-[11px] font-bold tracking-wide text-faint uppercase">{g.label}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.ids.map((id) => {
                const p = platformById(id);
                const linked = byType(id) >= 0;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setOpen(open === id ? null : id);
                      setText(linked ? links[byType(id)].url : "");
                    }}
                    className={`flex min-h-12 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition active:scale-[.98] ${open === id ? "bg-active ring-2 ring-accent" : "bg-side hover:bg-hover"}`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-black text-white" style={{ background: p.color }}>
                      {p.glyph}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    {linked && <span className="size-2 shrink-0 rounded-full bg-ok" title="Connected" />}
                  </button>
                );
              })}
            </div>
            {open && g.ids.includes(open) && (
              <div className="mt-2 animate-pop rounded-xl bg-side p-3 ring-1 ring-line">
                <div className="mb-2 text-sm font-semibold">{platformById(open).label}</div>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void save(open)}
                    placeholder={platformById(open).fromHandle ? "@username or link" : "Paste your profile link"}
                    className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
                  />
                  <button disabled={busy || !text.trim()} onClick={() => void save(open)} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {byType(open) >= 0 ? "Update" : "Connect"}
                  </button>
                </div>
                {byType(open) >= 0 && (
                  <button onClick={() => void remove(open).then(() => setOpen(null))} className="mt-2 text-xs font-semibold text-dnd">
                    Disconnect
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Notifications → new-release alerts from Nexus Bot ───────────── */
export function ArtistAlertsBlock() {
  const [list, setList] = useState<Watch[] | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SpArtist[]>([]);
  const load = () => void loadWatchlist().then(setList);
  useEffect(load, []);
  useEffect(() => {
    const s = q.trim();
    if (!s) return setFound([]);
    const t = setTimeout(() => {
      sp<{ items: SpArtist[] }>("search", { q: s, type: "artist" })
        .then((r) => setFound(r.items.slice(0, 6)))
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const following = new Set((list ?? []).map((w) => w.spotify_id));
  return (
    <div className="mt-6 rounded-xl bg-side p-4">
      <div className="flex items-center gap-2 font-medium">
        <Music className="size-4 text-[#1DB954]" /> New release alerts
      </div>
      <p className="mt-1 mb-3 text-sm text-sub">Follow artists and Nexus Bot sends you a message the moment they drop a single or album on Spotify.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an artist to follow…" className="w-full rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
      {found.length > 0 && (
        <div className="mt-2 space-y-1">
          {found.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 rounded-lg bg-black/20 p-2">
              {a.image ? <img src={a.image} alt="" className="size-9 rounded-full object-cover" /> : <div className="grid size-9 place-items-center rounded-full bg-hover">🎤</div>}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</span>
              <button
                disabled={following.has(a.id)}
                onClick={async () => {
                  if (await setWatch({ id: a.id, name: a.name, image: a.image }, true)) {
                    setQ("");
                    load();
                  }
                }}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:bg-white/10 disabled:text-sub"
              >
                {following.has(a.id) ? "Following" : "Follow"}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-1">
        {list === null ? (
          <div className="h-10 animate-pulse rounded-lg bg-black/20" />
        ) : list.length === 0 ? (
          <p className="py-2 text-sm text-sub">You&apos;re not following any artists yet.</p>
        ) : (
          list.map((w) => (
            <div key={w.spotify_id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
              {w.image_url ? <img src={w.image_url} alt="" className="size-9 rounded-full object-cover" /> : <div className="grid size-9 place-items-center rounded-full bg-hover">🎤</div>}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{w.name}</span>
              <button
                onClick={async () => {
                  if (await setWatchNotify(w.spotify_id, w.notify === false)) setList((l) => (l ?? []).map((x) => (x.spotify_id === w.spotify_id ? { ...x, notify: w.notify === false } : x)));
                }}
                className={`grid size-8 place-items-center rounded-full ${w.notify === false ? "bg-white/5 text-sub" : "bg-accent/20 text-accent"}`}
                aria-label={w.notify === false ? "Turn alerts on" : "Turn alerts off"}
                title={w.notify === false ? "Alerts off" : "Alerts on"}
              >
                {w.notify === false ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
              </button>
              <button
                onClick={async () => {
                  if (await setWatch({ id: w.spotify_id, name: w.name, image: w.image_url }, false)) load();
                }}
                className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-sub hover:bg-hover hover:text-dnd"
              >
                Unfollow
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
