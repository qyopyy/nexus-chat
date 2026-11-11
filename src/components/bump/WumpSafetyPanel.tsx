"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "@/lib/data";
import {
  inviteSafetyContact,
  removeSafetyContact,
  resolveSafetyCheck,
  respondSafetyContact,
  safetyChecks,
  safetyContacts,
  startSafetyCheck,
  sweepSafetyChecks,
  type SafetyCheck,
  type SafetyContact,
} from "@/lib/wumpSafety";

const WINDOWS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
];

function remaining(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due now";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min left`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

export default function WumpSafetyPanel({ me, friendIds }: { me: string; friendIds: string[] }) {
  const profiles = useApp((s) => s.profiles);
  const [contacts, setContacts] = useState<SafetyContact[]>([]);
  const [checks, setChecks] = useState<SafetyCheck[]>([]);
  const [contactId, setContactId] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState("Heading home");
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    await sweepSafetyChecks();
    const [people, rows] = await Promise.all([safetyContacts(), safetyChecks()]);
    setContacts(people);
    setChecks(rows);
    await loadProfiles(people.flatMap((row) => [row.owner_id, row.contact_id]));
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      setTick((n) => n + 1);
      void refresh();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const mine = contacts.filter((row) => row.owner_id === me);
  const incoming = contacts.filter((row) => row.contact_id === me && row.status === "pending");
  const accepted = mine.filter((row) => row.status === "accepted");
  const active = checks.find((row) => row.user_id === me && row.status === "active") ?? null;
  const missedForMe = checks.filter((row) => row.contact_id === me && row.status === "missed").slice(0, 5);
  const name = (id: string) => profiles[id]?.display_name || profiles[id]?.username || "Friend";

  useEffect(() => {
    if (!active) return;
    const wait = new Date(active.due_at).getTime() - Date.now() + 1000;
    if (wait <= 0) return;
    const timer = window.setTimeout(() => void refresh(), wait);
    return () => window.clearTimeout(timer);
  }, [active, refresh]);

  return (
    <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20">
          <Shield className="size-4" />
        </div>
        <div>
          <div className="text-sm font-bold">Safety check</div>
          <p className="text-[11px] text-sub">Tell one friend you&apos;ll check in. If you don&apos;t, they get a notification. Nothing starts until you choose them.</p>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3 text-sm">
        {incoming.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-bold tracking-wide text-sub uppercase">Requests for you</div>
            {incoming.map((row) => (
              <div key={row.owner_id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{name(row.owner_id)} wants you as a safety contact</span>
                <button type="button" className="text-xs font-semibold text-emerald-300" onClick={() => void respondSafetyContact(row.owner_id, true).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Accept</button>
                <button type="button" className="text-xs text-sub" onClick={() => void respondSafetyContact(row.owner_id, false).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Decline</button>
              </div>
            ))}
          </div>
        )}
        {missedForMe.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {missedForMe.map((row) => (
              <p key={row.id}>{name(row.user_id)} missed a check-in{row.note ? ` · ${row.note}` : ""}.</p>
            ))}
          </div>
        )}
        {active ? (
          <div className="rounded-2xl bg-black/30 px-3 py-3">
            <div className="font-semibold">Check in by {new Date(active.due_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
            <p className="mt-1 text-xs text-sub">{remaining(active.due_at)} · {name(active.contact_id)} is the contact{active.note ? ` · ${active.note}` : ""}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-bold text-emerald-950" onClick={() => void resolveSafetyCheck(active.id, "ok").then(refresh).catch((err: Error) => toast(err.message, "error"))}>I&apos;m here</button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold" onClick={() => void resolveSafetyCheck(active.id, "cancelled").then(refresh).catch((err: Error) => toast(err.message, "error"))}>Cancel</button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!contactId) return toast("Choose a contact who already accepted", "error");
              const due = new Date(Date.now() + minutes * 60_000).toISOString();
              void startSafetyCheck(contactId, due, note).then(refresh).catch((err: Error) => toast(err.message, "error"));
            }}
          >
            <label className="block text-xs text-sub">
              Trusted contact
              <select value={contactId} onChange={(event) => setContactId(event.target.value)} className="mt-1 w-full rounded-xl bg-black/30 px-2 py-1.5 text-sm text-txt">
                <option value="">Choose someone</option>
                {accepted.map((row) => (
                  <option key={row.contact_id} value={row.contact_id}>{name(row.contact_id)}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-1">
              {WINDOWS.map((window) => (
                <button key={window.minutes} type="button" onClick={() => setMinutes(window.minutes)} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${minutes === window.minutes ? "bg-white text-black" : "bg-white/5 text-sub"}`}>{window.label}</button>
              ))}
            </div>
            <input value={note} maxLength={140} onChange={(event) => setNote(event.target.value)} placeholder="Heading home" className="w-full rounded-xl bg-black/30 px-3 py-1.5 text-sm outline-none" />
            <button type="submit" className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-bold text-emerald-950">I&apos;ll check in</button>
          </form>
        )}
        <div>
          <div className="text-[11px] font-bold tracking-wide text-sub uppercase">Your contacts</div>
          {mine.length === 0 && <p className="mt-1 text-xs text-sub">Invite a friend. They have to accept before a check-in can use them.</p>}
          <ul className="mt-1 space-y-1">
            {mine.map((row) => (
              <li key={row.contact_id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{name(row.contact_id)} · {row.status}</span>
                <button type="button" className="text-sub" onClick={() => void removeSafetyContact(me, row.contact_id).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Remove</button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const picked = new FormData(event.currentTarget).get("friend");
              if (typeof picked !== "string" || !picked) return;
              void inviteSafetyContact(picked).then(() => {
                toast("Invite sent", "success");
                return refresh();
              }).catch((err: Error) => toast(err.message, "error"));
            }}
          >
            <select name="friend" className="min-w-0 flex-1 rounded-xl bg-black/30 px-2 py-1.5 text-xs text-txt">
              <option value="">Invite a friend</option>
              {friendIds.filter((id) => !mine.some((row) => row.contact_id === id)).map((id) => (
                <option key={id} value={id}>{name(id)}</option>
              ))}
            </select>
            <button type="submit" className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">Invite</button>
          </form>
        </div>
      </div>
    </section>
  );
}
