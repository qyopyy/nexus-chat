"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, CalendarDays, CalendarPlus, Crown, Gauge, Hash, Image as ImageIcon, Link2, MapPin, ScrollText, Shield, Trash2, Trophy, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { createEvent, deleteEvent, events, icsFor, leaderboard, levelOf, rsvp, setInfo, setRole, setSlowmode, xpFor, type Rsvp, type SpaceEvent, type XpRow } from "@/lib/serverHub";
import { loadEventReminders, scheduleEventReminder, useEventReminders } from "@/lib/eventReminders";
import { deleteChannel, setAnnouncementChannel, setChannel } from "@/lib/spaceExtras";
import { download } from "@/lib/dsp";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { InvitesPanel, LookPanel, RolesPanel } from "./ServerStudio";
import type { Conversation, SpaceMember } from "@/lib/types";

type Tab = "home" | "look" | "invites" | "roles" | "events" | "levels" | "members" | "channels";
const EMPTY_M: SpaceMember[] = [];
const EMPTY_C: Conversation[] = [];

/** server hub: welcome, look, invites, roles, events, XP, members, channel tools */
export default function ServerHub({ spaceId, onClose, initial = "home" }: { spaceId: string; onClose: () => void; initial?: Tab }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const me = useApp((s) => s.userId);
  const members = useApp((s) => s.spaceMembers[spaceId] ?? EMPTY_M);
  const myRole = members.find((m) => m.user_id === me)?.role ?? (space?.owner_id === me ? "owner" : "member");
  const staff = myRole === "owner" || myRole === "admin";
  const [tab, setTab] = useState<Tab>(initial);
  if (!space) return null;
  const tabs: [Tab, string, React.ReactNode][] = [
    ["home", "Welcome", <ScrollText key="h" className="size-4" />],
    ["look", "Look", <ImageIcon key="lk" className="size-4" />],
    ["invites", "Invites", <Link2 key="i" className="size-4" />],
    ["roles", "Roles", <Shield key="r" className="size-4" />],
    ["events", "Events", <CalendarDays key="e" className="size-4" />],
    ["levels", "Levels", <Trophy key="l" className="size-4" />],
    ["members", "Members", <Crown key="m" className="size-4" />],
    ...(staff ? ([["channels", "Channels", <Gauge key="c" className="size-4" />]] as [Tab, string, React.ReactNode][]) : []),
  ];
  const headerBg = space.banner_url
    ? undefined
    : `linear-gradient(135deg, ${space.icon_color}88, transparent)`;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-chat sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative shrink-0 overflow-hidden px-5 pt-5 pb-3" style={{ background: headerBg }}>
          {space.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={space.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
          )}
          <div className="relative">
            <button onClick={onClose} className="absolute top-0 right-0 grid size-8 place-items-center rounded-full bg-black/30 hover:bg-black/50" aria-label="Close">
              <X className="size-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center overflow-hidden rounded-2xl text-sm font-black text-white" style={{ background: space.icon_color }}>
                {space.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={space.icon_url} alt="" className="size-full object-cover" />
                ) : (
                  space.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest text-sub uppercase">Server hub</div>
                <div className="text-2xl font-black">{space.name}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
              {tabs.map(([id, label, icon]) => (
                <button key={id} onClick={() => setTab(id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold", tab === id ? "bg-white text-black" : "bg-black/20 hover:bg-black/30")}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-safe-4">
          {tab === "home" && <Home spaceId={spaceId} staff={staff} />}
          {tab === "look" && <LookPanel spaceId={spaceId} staff={staff} />}
          {tab === "invites" && <InvitesPanel spaceId={spaceId} staff={staff} owner={myRole === "owner"} />}
          {tab === "roles" && <RolesPanel spaceId={spaceId} staff={staff} />}
          {tab === "events" && <Events spaceId={spaceId} staff={staff} />}
          {tab === "levels" && <Levels spaceId={spaceId} />}
          {tab === "members" && <Members spaceId={spaceId} owner={myRole === "owner"} />}
          {tab === "channels" && staff && <Channels spaceId={spaceId} />}
        </div>
      </div>
    </div>
  );
}

function Home({ spaceId, staff }: { spaceId: string; staff: boolean }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const members = useApp((s) => s.spaceMembers[spaceId] ?? EMPTY_M);
  const channels = useApp((s) => s.channels[spaceId] ?? EMPTY_C);
  const [edit, setEdit] = useState(false);
  const [w, setW] = useState(space?.welcome ?? "");
  const [r, setR] = useState(space?.rules ?? "");
  useEffect(() => {
    if (!space) return;
    setW(space.welcome ?? "");
    setR(space.rules ?? "");
  }, [space?.id, space?.welcome, space?.rules]);
  if (!space) return <p className="text-sm text-sub">Server not found.</p>;
  if (edit)
    return (
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Welcome message</span>
          <textarea value={w} onChange={(e) => setW(e.target.value)} maxLength={1000} className="min-h-24 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Hey, welcome! Here's what this server is about…" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Rules (one per line)</span>
          <textarea value={r} onChange={(e) => setR(e.target.value)} maxLength={3000} className="min-h-32 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" placeholder={"Be kind\nNo spam\nKeep it on topic"} />
        </label>
        <div className="flex gap-2">
          <button onClick={async () => (await setInfo(spaceId, w, r)) && (setEdit(false), toast("Saved", "success"))} className="flex-1 rounded-full bg-accent py-2.5 font-bold text-white">
            Save
          </button>
          <button onClick={() => setEdit(false)} className="rounded-full bg-hover px-5 font-semibold">
            Cancel
          </button>
        </div>
      </div>
    );
  const rules = (space.rules ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const code = space.vanity_code || space.invite_code;
  const shareUrl =
    typeof location !== "undefined" ? `${location.origin}/i/${encodeURIComponent(code)}` : `https://nexusproject.cc/i/${encodeURIComponent(code)}`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("Invite link copied — embeds show your banner", "success");
    } catch {
      toast(shareUrl, "info");
    }
  };
  const nativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: space.name, text: space.description || `Join ${space.name} on Nexus`, url: shareUrl });
        return;
      }
    } catch {
      /* cancelled */
    }
    await copyInvite();
  };
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-side">
        <div
          className="relative h-28 bg-cover bg-center"
          style={
            space.banner_url || space.background_url
              ? {
                  backgroundImage: `linear-gradient(180deg, transparent, rgba(20,22,28,.95)), url(${space.banner_url || space.background_url})`,
                }
              : { background: `linear-gradient(135deg, ${space.icon_color}99, #14161c)` }
          }
        />
        <div className="relative -mt-8 px-4 pb-4">
          <div className="mb-2 grid size-14 place-items-center overflow-hidden rounded-2xl border-4 border-side text-sm font-black text-white" style={{ background: space.icon_color }}>
            {space.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={space.icon_url} alt="" className="size-full object-cover" />
            ) : (
              space.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="text-[10px] font-bold tracking-widest text-accent uppercase">Share preview · embeds</div>
          <div className="text-lg font-black">{space.name}</div>
          <p className="mt-0.5 line-clamp-2 text-xs text-sub">{space.description || space.welcome || "Join this Nexus server"}</p>
          <p className="mt-2 truncate font-mono text-[11px] text-faint">{shareUrl.replace(/^https?:\/\//, "")}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void copyInvite()} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-sm font-bold text-white">
              <Link2 className="size-4" /> Copy link
            </button>
            <button onClick={() => void nativeShare()} className="rounded-full bg-hover px-4 py-2.5 text-sm font-semibold">
              Share
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-side px-2 py-3">
          <div className="text-lg font-black">{members.length || "—"}</div>
          <div className="text-[10px] font-bold tracking-wide text-sub uppercase">Members</div>
        </div>
        <div className="rounded-2xl bg-side px-2 py-3">
          <div className="text-lg font-black">{channels.filter((c) => c.kind === "text").length}</div>
          <div className="text-[10px] font-bold tracking-wide text-sub uppercase">Text</div>
        </div>
        <div className="rounded-2xl bg-side px-2 py-3">
          <div className="text-lg font-black">{channels.filter((c) => c.kind === "voice").length}</div>
          <div className="text-[10px] font-bold tracking-wide text-sub uppercase">Voice</div>
        </div>
      </div>
      <div className="rounded-2xl bg-side p-4">
        <div className="text-3xl">👋</div>
        <p className="mt-2 whitespace-pre-wrap">{space.welcome || "No welcome message yet."}</p>
      </div>
      <div>
        <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Rules</div>
        {rules.length ? (
          <ol className="space-y-1.5">
            {rules.map((x, i) => (
              <li key={i} className="flex gap-3 rounded-xl bg-side px-3 py-2 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-white">{i + 1}</span>
                <span className="pt-0.5">{x}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-sub">No rules set.</p>
        )}
      </div>
      {staff && (
        <button onClick={() => setEdit(true)} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold">
          Edit welcome &amp; rules
        </button>
      )}
    </div>
  );
}

function Events({ spaceId, staff }: { spaceId: string; staff: boolean }) {
  const me = useApp((s) => s.userId);
  const spaceName = useApp((s) => s.spaces.find((x) => x.id === spaceId)?.name ?? "Nexus");
  const reminders = useEventReminders((s) => s.reminders);
  const [data, setData] = useState<{ list: SpaceEvent[]; rsvps: Rsvp[] } | null>(null);
  const [form, setForm] = useState(false);
  const [f, setF] = useState({ title: "", description: "", location: "", starts_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16) });
  const load = useCallback(() => void events(spaceId).then(setData), [spaceId]);
  useEffect(load, [load]);
  useEffect(() => {
    loadEventReminders();
  }, []);
  const inp = "w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <div className="space-y-3">
      {staff && !form && (
        <button onClick={() => setForm(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3 font-semibold text-sub hover:border-accent hover:text-txt">
          <CalendarPlus className="size-5" /> Schedule an event
        </button>
      )}
      {form && (
        <div className="space-y-2 rounded-2xl bg-side p-3">
          <input className={inp} placeholder="Event name (listening party, game night…)" value={f.title} maxLength={100} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className={inp} type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
          <input className={inp} placeholder="Where? (#voice-channel or a link)" value={f.location} maxLength={200} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <textarea className={cn(inp, "min-h-16")} placeholder="Details" value={f.description} maxLength={1000} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="flex gap-2">
            <button
              disabled={!f.title.trim()}
              onClick={async () => {
                if (await createEvent(spaceId, f)) {
                  setForm(false);
                  setF({ ...f, title: "", description: "", location: "" });
                  load();
                }
              }}
              className="flex-1 rounded-full bg-accent py-2 font-bold text-white disabled:opacity-50"
            >
              Create event
            </button>
            <button onClick={() => setForm(false)} className="rounded-full bg-hover px-4 font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}
      {data === null ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : data.list.length === 0 ? (
        <p className="py-6 text-center text-sm text-sub">No upcoming events.</p>
      ) : (
        data.list.map((e) => {
          const rs = data.rsvps.filter((x) => x.event_id === e.id);
          const mine = rs.find((x) => x.user_id === me)?.status ?? null;
          const start = new Date(e.starts_at);
          const live = start.getTime() <= Date.now() && Date.now() - start.getTime() < 3 * 3600000;
          const reminded = reminders.some((r) => r.eventId === e.id);
          return (
            <div key={e.id} className="overflow-hidden rounded-2xl bg-side">
              <div className="flex gap-3 p-3">
                <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-accent/15 py-1.5 text-center text-accent">
                  <div className="text-[11px] font-bold uppercase">{start.toLocaleDateString([], { month: "short" })}</div>
                  <div className="text-2xl leading-none font-black">{start.getDate()}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold">{e.title}</span>
                    {live && <span className="rounded bg-dnd px-1.5 text-[10px] font-black text-white">LIVE</span>}
                  </div>
                  <div className="text-xs text-sub">
                    {start.toLocaleString([], { weekday: "long", hour: "2-digit", minute: "2-digit" })}
                    {e.location && (
                      <span className="ml-2 inline-flex items-center gap-0.5">
                        <MapPin className="size-3" /> {e.location}
                      </span>
                    )}
                  </div>
                  {e.description && <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap">{e.description}</p>}
                  <div className="mt-2 flex items-center gap-1">
                    <span className="flex -space-x-1.5">
                      {rs.slice(0, 6).map((x) => (
                        <Avatar key={x.user_id} userId={x.user_id} size={20} plain />
                      ))}
                    </span>
                    <span className="text-xs text-sub">
                      {rs.filter((x) => x.status === "going").length} going · {rs.filter((x) => x.status === "maybe").length} maybe
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-line/50 px-3 py-2">
                {(["going", "maybe"] as const).map((st) => (
                  <button key={st} onClick={async () => (await rsvp(e.id, mine === st ? null : st)) && load()} className={cn("rounded-full px-3 py-1 text-sm font-bold", mine === st ? "bg-accent text-white" : "bg-hover")}>
                    {st === "going" ? "✅ Going" : "🤔 Maybe"}
                  </button>
                ))}
                <button onClick={() => download(new Blob([icsFor(e, spaceName)], { type: "text/calendar" }), `${e.title}.ics`)} className="rounded-full bg-hover px-3 py-1 text-sm font-semibold">
                  📅 Add to calendar
                </button>
                <button
                  type="button"
                  disabled={reminded}
                  onClick={() =>
                    scheduleEventReminder({
                      eventId: e.id,
                      title: e.title,
                      spaceName,
                      startsAt: e.starts_at,
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
                    reminded ? "bg-accent/20 text-accent" : "bg-hover",
                  )}
                >
                  {reminded ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
                  {reminded ? "Reminder set" : "Remind me"}
                </button>
                {(staff || e.created_by === me) && (
                  <button onClick={async () => confirm("Delete this event?") && (await deleteEvent(e.id)) && load()} className="ml-auto grid size-8 place-items-center rounded-full text-dnd hover:bg-dnd/10" aria-label="Delete event">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Levels({ spaceId }: { spaceId: string }) {
  const me = useApp((s) => s.userId);
  const [rows, setRows] = useState<XpRow[] | null>(null);
  useEffect(() => void leaderboard(spaceId).then(setRows), [spaceId]);
  const mine = rows?.find((r) => r.user_id === me);
  const lvl = levelOf(mine?.xp ?? 0);
  const pct = mine ? ((mine.xp - xpFor(lvl)) / Math.max(1, xpFor(lvl + 1) - xpFor(lvl))) * 100 : 0;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#8b5cff]/40 to-[#ff2bd6]/20 p-4">
        <div className="flex items-center gap-3">
          {me && <Avatar userId={me} size={48} plain />}
          <div className="flex-1">
            <div className="text-sm text-sub">Your level here</div>
            <div className="text-3xl font-black">Level {lvl}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold tabular-nums">{(mine?.xp ?? 0).toLocaleString()} XP</div>
            <div className="text-xs text-sub">{mine?.messages ?? 0} messages</div>
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/30">
          <div className="h-full rounded-full bg-gradient-to-r from-[#ffb02e] to-[#ff2bd6]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-xs text-sub">{(xpFor(lvl + 1) - (mine?.xp ?? 0)).toLocaleString()} XP to level {lvl + 1} · chat to earn 8–15 XP per minute</div>
      </div>
      {rows === null ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : (
        rows.map((r, i) => (
          <div key={r.user_id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", r.user_id === me ? "bg-accent/15" : "bg-side")}>
            <span className="w-7 text-center text-lg font-black">{["🥇", "🥈", "🥉"][i] ?? <span className="text-sm text-sub">{i + 1}</span>}</span>
            <Avatar userId={r.user_id} size={32} plain />
            <span className="min-w-0 flex-1 truncate">
              <NameTag userId={r.user_id} badges={false} />
            </span>
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-black">Lv {levelOf(r.xp)}</span>
            <span className="w-20 text-right text-sm text-sub tabular-nums">{r.xp.toLocaleString()} XP</span>
          </div>
        ))
      )}
    </div>
  );
}

function Members({ spaceId, owner }: { spaceId: string; owner: boolean }) {
  const members = useApp((s) => s.spaceMembers[spaceId] ?? EMPTY_M);
  const presence = useApp((s) => s.presence);
  const order = { owner: 0, admin: 1, member: 2 } as Record<string, number>;
  const sorted = [...members].sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || Number(!!presence[b.user_id]) - Number(!!presence[a.user_id]));
  return (
    <div className="space-y-1">
      {sorted.map((m) => (
        <div key={m.user_id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-hover">
          <div className="relative">
            <Avatar userId={m.user_id} size={34} plain />
            {presence[m.user_id] && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-ok ring-2 ring-chat" />}
          </div>
          <span className="min-w-0 flex-1 truncate">
            <NameTag userId={m.user_id} badges={false} />
          </span>
          {m.role === "owner" ? (
            <span className="flex items-center gap-1 text-xs font-bold text-[#f0b232]">
              <Crown className="size-3.5" /> Owner
            </span>
          ) : owner ? (
            <select value={m.role} onChange={(e) => void setRole(spaceId, m.user_id, e.target.value as "admin" | "member")} className="rounded-lg bg-hover px-2 py-1 text-xs font-semibold">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          ) : (
            m.role === "admin" && <span className="text-xs font-bold text-accent">Admin</span>
          )}
        </div>
      ))}
      <p className="pt-2 text-xs text-sub">Admins can edit the welcome &amp; rules, schedule events and set slow mode. Only the owner can change roles.</p>
    </div>
  );
}

function Channels({ spaceId }: { spaceId: string }) {
  const channels = useApp((s) => s.channels[spaceId] ?? EMPTY_C);
  const opts: [number, string][] = [
    [0, "Off"],
    [5, "5s"],
    [10, "10s"],
    [30, "30s"],
    [60, "1m"],
    [300, "5m"],
    [900, "15m"],
    [3600, "1h"],
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-sub">Slow mode, topics, announcements, NSFW, private/password rooms, and delete.</p>
      {channels.map((c) => (
        <div key={c.id} className="space-y-2 rounded-2xl bg-side p-3">
          <div className="flex items-center gap-2">
            <Hash className="size-4 text-sub" />
            <input
              defaultValue={c.name ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) void setChannel(c.id, spaceId, { name: v });
              }}
              className="min-w-0 flex-1 rounded-lg bg-rail px-2 py-1 text-sm font-semibold outline-none"
            />
            {c.kind === "text" && (
              <select value={c.slowmode ?? 0} onChange={(e) => void setSlowmode(c.id, Number(e.target.value), spaceId)} className="rounded-lg bg-hover px-2 py-1 text-xs">
                {opts.map(([v, l]) => (
                  <option key={v} value={v}>
                    Slow {l}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => {
                if (confirm(`Delete #${c.name}?`)) void deleteChannel(c.id, spaceId);
              }}
              className="rounded-lg p-1.5 text-dnd hover:bg-dnd/15"
              aria-label="Delete channel"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <input
            defaultValue={c.topic ?? ""}
            placeholder="Topic / description"
            onBlur={(e) => {
              if ((e.target.value.trim() || null) !== (c.topic ?? null)) void setChannel(c.id, spaceId, { topic: e.target.value });
            }}
            className="w-full rounded-lg bg-rail px-2 py-1.5 text-xs outline-none"
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {c.kind === "text" && (
              <label className="flex items-center gap-1.5 font-semibold text-accent">
                <input type="checkbox" checked={!!c.is_announcement} onChange={(e) => void setAnnouncementChannel(c.id, spaceId, e.target.checked)} />
                Announcements
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!c.nsfw} onChange={(e) => void setChannel(c.id, spaceId, { nsfw: e.target.checked })} />
              NSFW
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!c.is_private || !!c.password_hash}
                onChange={(e) => void setChannel(c.id, spaceId, { is_private: e.target.checked, clearPassword: !e.target.checked })}
              />
              Private room
            </label>
            {(c.is_private || c.password_hash) && (
              <input
                type="password"
                placeholder={c.password_hash ? "Set new password…" : "Set password…"}
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    void setChannel(c.id, spaceId, { password: e.target.value.trim(), is_private: true });
                    e.target.value = "";
                  }
                }}
                className="rounded-lg bg-rail px-2 py-1 outline-none"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** shown once per server: the welcome + rules, with an "I agree" button */
export function WelcomeGate({ spaceId }: { spaceId: string }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const me = useApp((s) => s.userId);
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      setSeen(!!localStorage.getItem(`nexus:welcomed:${spaceId}`));
    } catch {
      setSeen(true);
    }
  }, [spaceId]);
  if (seen || !space || space.owner_id === me || (!space.welcome && !space.rules)) return null;
  const done = () => {
    try {
      localStorage.setItem(`nexus:welcomed:${spaceId}`, "1");
    } catch {
      /* private mode */
    }
    setSeen(true);
  };
  const rules = (space.rules ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md animate-pop overflow-hidden rounded-3xl bg-chat">
        <div className="p-6 text-center" style={{ background: `linear-gradient(160deg, ${space.icon_color}88, transparent)` }}>
          <div className="text-5xl">👋</div>
          <div className="mt-2 text-2xl font-black">Welcome to {space.name}</div>
          {space.welcome && <p className="mt-2 text-sm whitespace-pre-wrap text-txt/90">{space.welcome}</p>}
        </div>
        {rules.length > 0 && (
          <ol className="max-h-64 space-y-1.5 overflow-y-auto px-5 py-3">
            {rules.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="font-black text-accent">{i + 1}.</span> {x}
              </li>
            ))}
          </ol>
        )}
        <div className="p-5 pt-2">
          <button onClick={done} className="w-full rounded-full bg-accent py-3 font-bold text-white">
            {rules.length ? "I agree — let's go" : "Let's go"}
          </button>
        </div>
      </div>
    </div>
  );
}
