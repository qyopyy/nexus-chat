"use client";

import { useEffect, useState } from "react";
import { Ban, Moon, Trash2 } from "lucide-react";
import { useApp } from "@/store/app";
import { loadProfiles } from "@/lib/data";
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
      {JSON.stringify(p) !== JSON.stringify({ ...NOTIF_DEFAULTS, tz: p.tz }) && (
        <button onClick={() => void save({ ...NOTIF_DEFAULTS, tz: p.tz })} className="mt-3 text-sm text-sub hover:text-txt">
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
