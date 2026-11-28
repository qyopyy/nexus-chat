"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Ban, Bell, BellOff, Camera, Flame, Loader2, Send, Trash2, UserCheck, UserPlus } from "lucide-react";
import { toast, useApp } from "@/store/app";
import type { GramProfile } from "@/lib/gram";
import { useIsBlocked } from "@/lib/blocks";
import { MESSAGE_MAX, cleanBio, fmtCount, parseTime, timeText, countWord } from "@/lib/snapSocial";
import { blockUser, changePicture, followUser, loadBlocks, loadSnapProfile, markAsked, messageUser, nextReminderText, peopleList, removePicture, setReminder, unblockUser, useLiveStreak, useSocial } from "@/lib/snapSocialNet";
import type { SnapUser } from "@/lib/snapShare";
import SnapFace from "./SnapFace";
import { Sheet } from "./SnapUi";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

// ------------------------------------------------------------------ counts
export function Counts({ posts, followers, following, onFollowers, onFollowing }: { posts?: number; followers: number; following: number; onFollowers: () => void; onFollowing: () => void }) {
  const cell = "flex-1 rounded-2xl bg-white/5 py-2 text-center hover:bg-white/10";
  return (
    <div className="flex gap-2" data-testid="counts">
      {posts !== undefined && (
        <div className={cell + " hover:bg-white/5"}>
          <b className="block text-base">{fmtCount(posts)}</b>
          <span className="text-[11px] text-white/55">{posts === 1 ? "Post" : "Posts"}</span>
        </div>
      )}
      <button type="button" onClick={onFollowers} className={cell}>
        <b className="block text-base" data-testid="followers-count">
          {fmtCount(followers)}
        </b>
        <span className="text-[11px] text-white/55">{followers === 1 ? "Follower" : "Followers"}</span>
      </button>
      <button type="button" onClick={onFollowing} className={cell}>
        <b className="block text-base" data-testid="following-count">
          {fmtCount(following)}
        </b>
        <span className="text-[11px] text-white/55">Following</span>
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ followers / following list
export function PeopleListSheet({ userId, which, onClose, onOpen }: { userId: string; which: "followers" | "following"; onClose: () => void; onOpen: (username: string) => void }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const profiles = useApp((s) => s.profiles);
  useEffect(() => {
    let live = true;
    void peopleList(userId, which)
      .then((r) => live && setIds(r))
      .catch(() => live && setIds([]));
    return () => {
      live = false;
    };
  }, [userId, which]);
  return (
    <Sheet title={which === "followers" ? "Followers" : "Following"} onClose={onClose} z="z-[90]">
      <div className="space-y-1 px-4 pb-4">
        {ids === null && <Loader2 className="mx-auto my-6 size-5 animate-spin text-white/50" />}
        {ids && ids.length === 0 && <p className="px-1 py-3 text-sm text-white/55">{which === "followers" ? "No followers yet." : "Not following anyone yet."}</p>}
        {ids?.map((id) => {
          const p = profiles[id];
          if (!p) return null;
          return (
            <button key={id} type="button" onClick={() => onOpen(p.username)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-white/5">
              <SnapFace url={p.avatar_url} name={p.display_name || p.username} color={p.avatar_color} size={44} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{p.display_name || p.username}</b>
                <span className="block truncate text-xs text-white/55">@{p.username}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ someone else's profile
export default function SnapPerson({ username, onClose, onSnapTo }: { username: string; onClose: () => void; onSnapTo?: (u: SnapUser) => void }) {
  const me = useApp((s) => s.userId);
  const [p, setP] = useState<GramProfile | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [list, setList] = useState<"followers" | "following" | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const blocked = useIsBlocked(p?.id);
  const seq = useRef(0);

  const load = useCallback(
    (name: string) => {
      const my = ++seq.current;
      setP(undefined);
      void loadSnapProfile(name).then((r) => my === seq.current && setP(r));
    },
    [],
  );
  useEffect(() => {
    void loadBlocks();
    load(username);
  }, [username, load]);

  if (next) return <SnapPerson username={next} onClose={() => setNext(null)} onSnapTo={onSnapTo} />;

  const mine = !!p && p.id === me;
  const toggleFollow = async () => {
    if (!p || busy) return;
    const on = !p.is_following;
    setBusy(true);
    setP({ ...p, is_following: on, followers: Math.max(0, p.followers + (on ? 1 : -1)) });
    const ok = await followUser(p.id, on);
    if (!ok) setP((x) => (x ? { ...x, is_following: !on, followers: Math.max(0, x.followers + (on ? -1 : 1)) } : x));
    setBusy(false);
  };

  const send = async () => {
    if (!p || sending) return;
    setSending(true);
    try {
      if (await messageUser(p.id, text)) {
        toast(`Sent to @${p.username}`, "success");
        setText("");
        setMsgOpen(false);
      }
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSending(false);
    }
  };

  const doBlock = async () => {
    if (!p) return;
    setBusy(true);
    if (await blockUser(p.id, `@${p.username}`)) {
      if (p.is_following) await followUser(p.id, false);
      setMsgOpen(false);
      load(p.username);
    }
    setConfirmBlock(false);
    setBusy(false);
  };
  const doUnblock = async () => {
    if (!p) return;
    setBusy(true);
    await unblockUser(p.id, `@${p.username}`);
    setBusy(false);
  };

  return (
    <Sheet title={`@${username}`} onClose={onClose} z="z-[80]">
      <div className="space-y-4 px-4 pb-5">
        {p === undefined && <Loader2 className="mx-auto my-8 size-6 animate-spin text-white/50" />}
        {p === null && <p className="py-6 text-center text-sm text-white/55">This profile isn't available.</p>}
        {p && (
          <>
            <div className="flex items-center gap-3">
              <SnapFace url={p.avatar_url} name={p.display_name || p.username} color={p.avatar_color} size={72} />
              <div className="min-w-0 flex-1">
                <b className="flex items-center gap-1 truncate text-lg">
                  <span className="truncate">{p.display_name || p.username}</span>
                  {p.verified && <BadgeCheck className="size-4 shrink-0 text-sky-400" aria-label="Verified" />}
                </b>
                <span className="block truncate text-sm text-white/55">@{p.username}</span>
                {p.follows_you && !mine && <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">Follows you</span>}
              </div>
            </div>
            {cleanBio(p.bio) && <p className="text-sm text-white/80">{cleanBio(p.bio)}</p>}
            <Counts posts={p.posts} followers={p.followers} following={p.following} onFollowers={() => setList("followers")} onFollowing={() => setList("following")} />

            {!mine && blocked && (
              <div className="space-y-2 rounded-2xl bg-white/5 p-3 text-sm">
                <p className="text-white/70">You blocked @{p.username}. They can't message, call or friend you.</p>
                <button type="button" onClick={() => void doUnblock()} disabled={busy} className="w-full rounded-full bg-white py-2.5 text-sm font-bold text-black disabled:opacity-50">
                  Unblock
                </button>
              </div>
            )}

            {!mine && !blocked && (
              <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleFollow()}
                    disabled={busy}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold disabled:opacity-50 ${p.is_following ? "bg-white/10 text-white" : "bg-white text-black"}`}
                  >
                    {p.is_following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
                    {p.is_following ? "Following" : p.follows_you ? "Follow back" : "Follow"}
                  </button>
                  <button type="button" onClick={() => setMsgOpen((v) => !v)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 py-2.5 text-sm font-bold hover:bg-white/20">
                    <Send className="size-4" />
                    Message
                  </button>
                </div>
                {onSnapTo && (
                  <button
                    type="button"
                    onClick={() => (onSnapTo({ id: p.id, username: p.username, display_name: p.display_name }), onClose())}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white/10 py-2.5 text-sm font-bold hover:bg-white/20"
                  >
                    <Camera className="size-4" />
                    Send my next Snap to them
                  </button>
                )}
                {msgOpen && (
                  <div className="space-y-2 rounded-2xl bg-white/5 p-3">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, MESSAGE_MAX))}
                      rows={3}
                      autoFocus
                      aria-label="Message"
                      placeholder={`Message @${p.username}`}
                      className="w-full resize-none rounded-xl bg-white/10 p-3 text-sm outline-none placeholder:text-white/40"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/40">
                        {text.length}/{MESSAGE_MAX}
                      </span>
                      <button type="button" onClick={() => void send()} disabled={sending || !text.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-40">
                        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                        Send
                      </button>
                    </div>
                  </div>
                )}
                {!confirmBlock ? (
                  <button type="button" onClick={() => setConfirmBlock(true)} className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-rose-300 hover:text-rose-200">
                    <Ban className="size-3.5" />
                    Block @{p.username}
                  </button>
                ) : (
                  <div className="space-y-2 rounded-2xl bg-rose-500/10 p-3 text-sm">
                    <p className="text-rose-100">Block @{p.username}? They won't be able to message, call or friend you, and you'll stop following them.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmBlock(false)} className="flex-1 rounded-full bg-white/10 py-2 text-sm font-bold">
                        Cancel
                      </button>
                      <button type="button" onClick={() => void doBlock()} disabled={busy} className="flex-1 rounded-full bg-rose-500 py-2 text-sm font-bold text-white disabled:opacity-50">
                        Block
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {list && p && <PeopleListSheet userId={p.id} which={list} onClose={() => setList(null)} onOpen={(u) => (setList(null), setNext(u))} />}
    </Sheet>
  );
}

// ------------------------------------------------------------------ change my picture
export function PictureEditor({ name, url, color }: { name: string; url?: string | null; color?: string | null }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      if (await changePicture(f)) toast("New picture is live everywhere on Nexus", "success");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label="Change profile picture" className="relative">
        <SnapFace url={url} name={name} color={color} size={64} />
        <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-white text-black">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}</span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden aria-label="Choose a profile picture" onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-black disabled:opacity-50">
          {busy ? "Uploading…" : "Change picture"}
        </button>
        {url && (
          <button type="button" onClick={() => void removePicture()} disabled={busy} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/55 hover:text-white">
            <Trash2 className="size-3" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ daily reminder + streak
export function ReminderPanel() {
  const s = useSocial();
  const live = useLiveStreak();
  const [busy, setBusy] = useState(false);
  const r = s.reminder;
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await setReminder({ ...r, on: !r.on });
      if (res === "denied") toast("Notifications are blocked. Allow them in your device settings.", "error");
      else if (res === "unsupported") toast("This device can't show reminders here. Install Nexus Snap to your home screen.", "error");
      else if (res === "on") toast(`Daily reminder on, ${nextReminderText({ ...r, on: true })}`, "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const time = async (v: string) => {
    const t = parseTime(v);
    if (!t) return;
    if (r.on) await setReminder({ on: true, ...t });
    else await setReminder({ on: false, ...t });
  };
  return (
    <section className="space-y-2" data-testid="reminder-panel">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45">Daily reminder and streak</h3>
      <div className="flex gap-2">
        <div className="flex-1 rounded-2xl bg-white/5 p-3 text-center">
          <b className="flex items-center justify-center gap-1 text-xl">
            <Flame className={`size-5 ${live.count > 0 ? "text-orange-400" : "text-white/30"}`} />
            {live.count}
          </b>
          <span className="text-[11px] text-white/55">{live.doneToday ? "day streak · done today" : live.atRisk ? "day streak · snap today!" : "day streak"}</span>
        </div>
        <div className="flex-1 rounded-2xl bg-white/5 p-3 text-center">
          <b className="block text-xl">{s.streak.best}</b>
          <span className="text-[11px] text-white/55">best · {countWord(s.streak.total, "Snap")}</span>
        </div>
      </div>
      <div className="space-y-2 rounded-2xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          {r.on ? <Bell className="size-5 shrink-0 text-emerald-300" /> : <BellOff className="size-5 shrink-0 text-white/45" />}
          <div className="min-w-0 flex-1">
            <b className="block text-sm">Remind me every day</b>
            <span className="block text-xs text-white/55">{r.on ? `Next one ${nextReminderText(r)}` : "A friendly nudge to take a Snap and keep your streak."}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={r.on}
            aria-label="Daily reminder"
            onClick={() => void toggle()}
            disabled={busy}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${r.on ? "bg-emerald-400" : "bg-white/20"}`}
          >
            <span className={`absolute top-0.5 size-6 rounded-full bg-white transition-all ${r.on ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        <label className="flex items-center justify-between gap-3 text-xs text-white/65">
          Time
          <input type="time" value={timeText(r.hour, r.minute)} onChange={(e) => void time(e.target.value)} aria-label="Reminder time" className="rounded-lg bg-white/10 px-2 py-1 text-sm text-white" />
        </label>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ camera: streak chip + gentle nudge
export function StreakChip({ onClick }: { onClick: () => void }) {
  const live = useLiveStreak();
  if (live.count <= 0) return null;
  return (
    <button type="button" onClick={onClick} aria-label={`${live.count} day streak`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${live.doneToday ? "bg-orange-400/20 text-orange-200" : "bg-rose-500/25 text-rose-100"}`}>
      <Flame className="size-3.5" />
      {live.count}
    </button>
  );
}

/** One quiet card: first time it offers the daily reminder; later it warns when the streak would end today. */
export function CameraNudge() {
  const s = useSocial();
  const live = useLiveStreak();
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (gone) return null;
  const ask = !s.askedReminder && !s.reminder.on && s.streak.total >= 1;
  const risk = s.reminder.on === false && live.atRisk && live.count >= 2;
  if (!ask && !risk) return null;
  const turnOn = async () => {
    setBusy(true);
    try {
      const res = await setReminder({ ...s.reminder, on: true });
      toast(res === "on" ? "Daily reminder is on" : "Couldn't turn reminders on here", res === "on" ? "success" : "error");
    } finally {
      setBusy(false);
      setGone(true);
    }
  };
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-black/80 p-3 text-sm backdrop-blur" data-testid="nudge">
      <Flame className="size-5 shrink-0 text-orange-400" />
      <div className="min-w-0 flex-1">
        <b className="block">{risk ? `Your ${live.count}-day streak ends tonight` : "Keep going every day?"}</b>
        <span className="block text-xs text-white/65">{risk ? "Take one Snap to keep it. Want a daily reminder?" : "Get one friendly reminder a day to take a Snap."}</span>
      </div>
      <button type="button" onClick={() => void turnOn()} disabled={busy} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50">
        Turn on
      </button>
      <button
        type="button"
        onClick={() => {
          markAsked();
          setGone(true);
        }}
        aria-label="Not now"
        className="shrink-0 text-xs font-semibold text-white/55"
      >
        Later
      </button>
    </div>
  );
}
