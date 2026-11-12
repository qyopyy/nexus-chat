"use client";

import { useEffect, useState } from "react";
import { toast, useApp } from "@/store/app";
import { getDeviceLocation } from "@/lib/location";
import { loadProfiles } from "@/lib/data";
import {
  subscribeWildRoom,
  wildCatch,
  wildCreateRoom,
  wildDex,
  wildJoin,
  wildLeave,
  wildMyRoom,
  wildRoomCatches,
  wildSpecies,
  wildSpawns,
  type WildCatch,
  type WildDex,
  type WildRoom,
  type WildSpawn,
} from "@/lib/wumpWilds";

/** Catch original Wump creatures on your block, then invite friends with a code. */
export default function WumpWilds({ me }: { me: string }) {
  const profiles = useApp((s) => s.profiles);
  const [open, setOpen] = useState(false);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [spawns, setSpawns] = useState<WildSpawn[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const [aim, setAim] = useState<WildSpawn | null>(null);
  const [ring, setRing] = useState(1.6);
  const [dex, setDex] = useState<WildDex[]>([]);
  const [room, setRoom] = useState<WildRoom | null>(null);
  const [catches, setCatches] = useState<WildCatch[]>([]);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("Wilds");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void wildDex().then((rows) => live && setDex(rows)).catch((error: Error) => live && setNote(error.message));
    void wildMyRoom().then((row) => live && setRoom(row)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open]);

  useEffect(() => {
    if (!here) return;
    setSpawns(wildSpawns(here.lat, here.lng));
    const timer = window.setInterval(() => setSpawns(wildSpawns(here.lat, here.lng)), 30_000);
    return () => window.clearInterval(timer);
  }, [here]);

  useEffect(() => {
    if (!aim) return;
    let frame = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) % 1400) / 1400;
      setRing(1.7 - t * 1.35);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [aim]);

  useEffect(() => {
    if (!room) return;
    let live = true;
    const load = () => {
      void wildRoomCatches(room.id).then((rows) => {
        if (!live) return;
        setCatches(rows);
        void loadProfiles(rows.map((row) => row.user_id));
      }).catch((error: Error) => setNote(error.message));
    };
    load();
    const stop = subscribeWildRoom(room.id, load);
    return () => {
      live = false;
      stop();
    };
  }, [room]);

  async function locate() {
    setBusy(true);
    setNote(null);
    try {
      const loc = await getDeviceLocation({ highAccuracy: true });
      setHere({ lat: loc.lat, lng: loc.lng });
    } catch {
      setNote("Location is off. Wilds only uses it on this phone until you open a room.");
    } finally {
      setBusy(false);
    }
  }

  async function throwRing() {
    if (!aim) return;
    const hit = ring > 0.72 && ring < 1.12;
    const spawn = aim;
    setAim(null);
    setGone((ids) => [...ids, spawn.id]);
    if (!hit) {
      toast(`${spawn.name} slipped away`, "info");
      return;
    }
    try {
      await wildCatch(spawn.species, room?.id);
      setDex((rows) => {
        const current = rows.find((row) => row.species === spawn.species);
        if (!current) return [...rows, { species: spawn.species, caught: 1 }];
        return rows.map((row) => (row.species === spawn.species ? { ...row, caught: row.caught + 1 } : row));
      });
      toast(`Caught ${spawn.name}`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save that catch", "error");
    }
  }

  async function createRoom() {
    if (!here) return;
    setBusy(true);
    try {
      const row = await wildCreateRoom(title, here.lat, here.lng);
      setRoom(row);
      toast(`Room code ${row.code}`, "success");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't open a room");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    setBusy(true);
    try {
      const row = await wildJoin(code);
      setRoom(row);
      setHere({ lat: row.cell_lat, lng: row.cell_lng });
      toast("You're in the room", "success");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't join");
    } finally {
      setBusy(false);
    }
  }

  const visible = spawns.filter((spawn) => !gone.includes(spawn.id));

  return (
    <section className="mt-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 text-left">
        <span className="text-lg" aria-hidden>🪨</span>
        <span className="flex-1">
          <span className="block text-sm font-bold">Wilds</span>
          <span className="block text-xs text-sub">Catch creatures on this block with friends</span>
        </span>
        <span className="text-xs text-sub">{open ? "Hide" : "Play"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-sub">These are Wump creatures. A room shares the street block with friends who have the code, not your exact pin.</p>
          {note && <p className="text-sm text-amber-200">{note}</p>}
          {!here && (
            <button type="button" disabled={busy} onClick={() => void locate()} className="rounded-full bg-sky-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              Look around
            </button>
          )}
          {here && (
            <ul className="space-y-2">
              {visible.map((spawn) => (
                <li key={spawn.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
                  <span className="text-2xl" aria-hidden>{spawn.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{spawn.name}</span>
                    <span className="block text-xs text-sub">{spawn.meters < 40 ? "Right here" : `${spawn.meters} m`} · {wildSpecies(spawn.species)?.line}</span>
                  </span>
                  <button
                    type="button"
                    disabled={spawn.meters > 130}
                    onClick={() => setAim(spawn)}
                    className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold disabled:opacity-40"
                  >
                    {spawn.meters > 130 ? "Too far" : "Catch"}
                  </button>
                </li>
              ))}
              {visible.length === 0 && <li className="text-sm text-sub">The block is quiet. Check again in a few minutes.</li>}
            </ul>
          )}
          <div>
            <p className="text-xs font-bold tracking-wide text-sub uppercase">Your field notes</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {dex.length === 0 && <span className="text-sm text-sub">Nothing caught yet.</span>}
              {dex.map((row) => {
                const species = wildSpecies(row.species);
                return (
                  <span key={row.species} className="rounded-full bg-black/30 px-2 py-1 text-xs">
                    {species?.emoji} {species?.name} ×{row.caught}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <p className="text-sm font-bold">Friend room</p>
            {room ? (
              <>
                <p className="mt-1 text-sm">Code <span className="font-mono tracking-widest">{room.code}</span> · {room.title}</p>
                <p className="text-xs text-sub">Only friends of the host can join. The code lasts 6 hours.</p>
                <button type="button" className="mt-2 text-xs text-sky-200" onClick={() => void navigator.clipboard.writeText(room.code).then(() => toast("Code copied", "success"))}>Copy code</button>
                <ul className="mt-2 space-y-1 text-sm">
                  {catches.map((row) => (
                    <li key={row.id}>
                      {profiles[row.user_id]?.display_name || profiles[row.user_id]?.username || "Friend"} caught {wildSpecies(row.species)?.name}
                    </li>
                  ))}
                  {catches.length === 0 && <li className="text-sub">No shared catches yet.</li>}
                </ul>
                <button type="button" className="mt-2 text-xs text-sub" onClick={() => void wildLeave(room.id).then(() => setRoom(null))}>Leave room</button>
              </>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block text-xs text-sub">
                  Room name
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={40} className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1 text-sm" />
                </label>
                <button type="button" disabled={!here || busy} onClick={() => void createRoom()} className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
                  Invite friends
                </button>
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void joinRoom(); }}>
                  <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Invite code" maxLength={6} className="min-w-0 flex-1 rounded-lg bg-black/30 px-2 py-1 font-mono text-sm tracking-widest" />
                  <button type="submit" disabled={code.trim().length < 6 || busy} className="rounded-full bg-white/10 px-3 text-sm font-semibold disabled:opacity-40">Join</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
      {aim && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-6" onClick={() => setAim(null)}>
          <div className="w-full max-w-xs rounded-3xl bg-[#121826] p-5 text-center text-white" onClick={(event) => event.stopPropagation()}>
            <p className="text-4xl">{aim.emoji}</p>
            <p className="mt-1 font-bold">{aim.name}</p>
            <p className="text-xs text-white/60">Tap when the ring sits on the creature</p>
            <button type="button" onClick={() => void throwRing()} className="relative mx-auto mt-4 grid size-40 place-items-center" aria-label="Throw">
              <span className="absolute size-16 rounded-full bg-white/10 text-3xl">{aim.emoji}</span>
              <span className="absolute rounded-full border-4 border-sky-300" style={{ width: `${ring * 64}px`, height: `${ring * 64}px` }} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
