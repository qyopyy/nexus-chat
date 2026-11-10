"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, MapPinned, X } from "lucide-react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import {
  pingMeetups,
  subscribeWumpMeetups,
  wumpCancelMeetup,
  wumpCreateMeetup,
  wumpListMeetups,
  wumpPlaceEvents,
  wumpRsvp,
  wumpShareEta,
  type WumpMeetup,
  type WumpPlaceEvent,
} from "@/lib/wumpTogether";
import { clampEta, inviteCountLabel, meetupsEventName, minutesLabel, placesEventName, pollMs, rsvpWord, validMeetup } from "@/lib/hundred";

function whenLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Meetups with a shared ETA, plus your own arrive/leave history.
 * Meetup coordinates are the spot you pick (shared only with invitees).
 */
export default function WumpTogetherPanel({
  me,
  myLat,
  myLng,
  placeName,
  friendIds,
}: {
  me: string;
  myLat: number | null;
  myLng: number | null;
  placeName?: string | null;
  friendIds: string[];
}) {
  const profiles = useApp((s) => s.profiles);
  const [meetups, setMeetups] = useState<WumpMeetup[]>([]);
  const [events, setEvents] = useState<WumpPlaceEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [m, e] = await Promise.all([wumpListMeetups(), wumpPlaceEvents()]);
    setMeetups(m);
    setEvents(e);
  }, []);

  useEffect(() => {
    void refresh();
    const onPing = () => void refresh();
    window.addEventListener(meetupsEventName(), onPing);
    window.addEventListener(placesEventName(), onPing);
    const unsub = subscribeWumpMeetups(() => void refresh());
    const t = setInterval(() => void refresh(), pollMs(false));
    return () => {
      window.removeEventListener(meetupsEventName(), onPing);
      window.removeEventListener(placesEventName(), onPing);
      unsub();
      clearInterval(t);
    };
  }, [refresh]);

  async function create() {
    if (myLat == null || myLng == null || !validMeetup(title || "Meet up", myLat, myLng)) return;
    setBusy(true);
    const row = await wumpCreateMeetup({
      title: title || "Meet up",
      lat: myLat,
      lng: myLng,
      placeName,
      note,
      invite: picked,
    });
    setBusy(false);
    if (!row) return;
    setTitle("");
    setNote("");
    setPicked([]);
    setOpen(false);
    pingMeetups();
    void refresh();
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-xl bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20">
          <Flag className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight">Meetups</div>
          <div className="text-[11px] text-sub">
            {meetups.length ? `${meetups.length} active · ETA uses your Live pin` : "Drop a pin and invite friends"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-sub hover:bg-white/10 hover:text-txt"
        >
          {open ? "Close" : "New"}
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-b border-white/5 bg-black/20 px-4 py-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder={placeName ? `Meet at ${placeName}` : "Coffee, park, after class…"}
            className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-amber-400"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            placeholder="Note (optional)"
            className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-amber-400"
          />
          <p className="text-[11px] text-sub">
            {myLat != null && myLng != null
              ? "Uses the spot currently on your map. Invitees see this point — not your whole trail."
              : "Go Live or wait for the map to get a fix, then drop the meetup."}
          </p>
          {friendIds.length > 0 && (
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {friendIds.slice(0, 24).map((id) => {
                const on = picked.includes(id);
                const name = profiles[id]?.display_name || profiles[id]?.username || "Friend";
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPicked((prev) => (on ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 30)))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      on ? "bg-amber-400 text-amber-950" : "bg-white/5 text-sub hover:bg-white/10",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            disabled={busy || myLat == null || myLng == null}
            onClick={() => void create()}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950 disabled:opacity-50"
          >
            <MapPinned className="size-3.5" />
            {busy ? "Sending…" : inviteCountLabel(picked.length)}
          </button>
        </div>
      )}

      {meetups.length > 0 && (
        <ul className="divide-y divide-white/5">
          {meetups.map((m) => {
            const host = profiles[m.host_id]?.display_name || profiles[m.host_id]?.username || "Friend";
            const mine = m.host_id === me;
            const going = m.members.filter((x) => x.status === "going");
            return (
              <li key={m.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{m.title}</div>
                    <div className="truncate text-[11px] text-sub">
                      {mine ? "You" : host}
                      {m.place_name ? ` · ${m.place_name}` : ""} · {whenLabel(m.starts_at)}
                      {m.my_eta_min != null ? ` · your ETA ${minutesLabel(clampEta(m.my_eta_min))}` : ""}
                    </div>
                  </div>
                  {mine && (
                    <button
                      type="button"
                      onClick={() => void wumpCancelMeetup(m.id).then(() => void refresh())}
                      className="grid size-7 place-items-center rounded-full text-sub hover:bg-white/10 hover:text-dnd"
                      aria-label="End meetup"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                {m.note && <p className="text-[11px] text-sub">{m.note}</p>}
                <div className="flex flex-wrap gap-1">
                  {going.slice(0, 6).map((g) => (
                    <span key={g.user_id} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                      {profiles[g.user_id]?.display_name || profiles[g.user_id]?.username || "Going"}
                      {g.eta_min != null ? ` · ${g.eta_min}m` : ""}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["going", "maybe", "no"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void wumpRsvp(m.id, st).then(() => void refresh())}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-bold capitalize",
                        m.my_status === st ? "bg-white text-black" : "bg-white/5 text-sub hover:bg-white/10",
                      )}
                    >
                      {rsvpWord(st)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void wumpShareEta(m.id).then(() => void refresh())}
                    className="rounded-full bg-amber-400/90 px-2.5 py-1 text-[11px] font-bold text-amber-950"
                  >
                    Share ETA
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {events.length > 0 && (
        <div className="border-t border-white/5 px-4 py-3">
          <div className="mb-1.5 text-[10px] font-bold tracking-wide text-sub uppercase">Arrive & leave</div>
          <ul className="space-y-1">
            {events.slice(0, 5).map((ev) => (
              <li key={ev.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-txt">
                  {ev.kind === "arrive" ? "Arrived at" : "Left"} {ev.place_name}
                </span>
                <span className="shrink-0 text-sub">{whenLabel(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
