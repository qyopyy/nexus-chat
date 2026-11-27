"use client";

// Nexus Drop for Snap, the network half (design in snapDrop.ts).
// Files travel through the existing Nexus Drop cloud inbox (nexusDrop.ts). Realtime rooms are only used to see who is nearby.

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { claimDrop, incomingDrops, openDrop, sendDrop, type NexusDrop } from "@/lib/nexusDrop";
import { uploadVault, type VaultFile } from "@/lib/protect";
import { SNAP_FOLDER } from "@/lib/snap";
import { sendSnapToUser, type SnapUser } from "@/lib/snapShare";
import { cellTopic, dropCell, geohashAround, isHardDropError, nearbyFromPresence, type DropStatus, type NearbyPerson } from "@/lib/snapDrop";

/** Like iOS "Everyone for 10 minutes": being visible switches itself off. */
export const NEARBY_MS = 10 * 60 * 1000;
const RELOCATE_MS = 60 * 1000;

type DropState = {
  nearbyOn: boolean;
  locating: boolean;
  error: string;
  nearby: NearbyPerson[];
  incoming: NexusDrop[];
};

export const useDrop = create<DropState>(() => ({ nearbyOn: false, locating: false, error: "", nearby: [], incoming: [] }));

const me = () => useApp.getState().userId;

// ------------------------------------------------------------------ receiving (the standalone Snap app)
let inbox: RealtimeChannel | null = null;
let inboxUser: string | null = null;
let known = new Set<string>();

const dismissed = new Set<string>();

async function refreshIncoming() {
  try {
    const rows = await incomingDrops();
    const fresh = rows.some((r) => !known.has(r.id));
    known = new Set(rows.map((r) => r.id));
    useDrop.setState({ incoming: rows.filter((r) => !dismissed.has(r.id)) });
    if (fresh) haptic.success();
  } catch {
    /* the inbox is best effort here; the Phone Link panel shows real errors */
  }
}

/** Start watching the Nexus Drop inbox for this account. Safe to call again. */
export function startDrop(userId: string) {
  if (inbox && inboxUser === userId) return;
  stopDrop();
  inboxUser = userId;
  inbox = supabase
    .channel(`snap-drop-inbox:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "nexus_drops", filter: `to_user=eq.${userId}` }, () => void refreshIncoming())
    .subscribe();
  void refreshIncoming();
}

export function stopDrop() {
  if (inbox) void supabase.removeChannel(inbox);
  inbox = null;
  inboxUser = null;
  known = new Set();
  dismissed.clear();
  leaveNearby();
  useDrop.setState({ incoming: [], nearbyOn: false, nearby: [], locating: false, error: "" });
}

/** "Not now": hides the card. The Drop stays in the inbox (up to 24 h) where Phone Link can still open it. */
export function dismissIncoming(id: string) {
  dismissed.add(id);
  useDrop.setState((s) => ({ incoming: s.incoming.filter((d) => d.id !== id) }));
}

/** Short-lived picture/video URL for the card's thumbnail. */
export const previewUrl = (row: NexusDrop) => openDrop(row);

/** Accept: keep it in your own Nexus Drive, then mark the Drop taken. */
export async function acceptToDrive(row: NexusDrop): Promise<VaultFile> {
  const url = await openDrop(row);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't download it. It is still in your Drop inbox.");
  const blob = await res.blob();
  const type = row.mime || blob.type || "application/octet-stream";
  const file = new File([blob], row.name, { type });
  const vault = await uploadVault(file, SNAP_FOLDER, undefined, { kind: type.startsWith("video/") ? "video" : "artwork", note: "Nexus Drop", original: true });
  await claimDrop(row.id).catch(() => {});
  dismissIncoming(row.id);
  return vault;
}

// ------------------------------------------------------------------ sending
/**
 * Nexus Drop to one person (`user` null = your own other screens). First choice is the Drop inbox. If that can't
 * deliver, the Snap is already in your Nexus Drive, so it goes as a Drive link in their DM instead.
 */
export async function dropTo(user: SnapUser | null, file: File, vault: VaultFile, expiresInHours: number | null): Promise<DropStatus> {
  if (!me()) throw new Error("Sign in first.");
  try {
    await sendDrop(file, user?.username);
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!user || isHardDropError(msg)) throw e instanceof Error ? e : new Error("Couldn't send.");
  }
  await sendSnapToUser(user, vault, expiresInHours);
  return "link";
}

// ------------------------------------------------------------------ nearby
const cells = new Map<string, RealtimeChannel>();
const ready = new Set<string>();
let ownCell = "";
let tracked = "";
let relocate: ReturnType<typeof setInterval> | null = null;
let offTimer: ReturnType<typeof setTimeout> | null = null;

function where(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("This device can't tell where it is."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? "Allow location to find people nearby. Nothing is stored." : "Couldn't get your location.")),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  });
}

function recompute() {
  const states: unknown[] = [];
  for (const ch of cells.values()) for (const metas of Object.values(ch.presenceState())) for (const m of metas as unknown[]) states.push(m);
  useDrop.setState({ nearby: nearbyFromPresence(states, me()) });
}

function syncTracking() {
  const uid = me();
  const p = uid ? useApp.getState().profiles[uid] : undefined;
  for (const [cell, ch] of cells) {
    if (!ready.has(cell)) continue;
    if (cell === ownCell && tracked !== cell && uid && p) {
      void ch.track({ id: uid, username: p.username, name: p.display_name || p.username, avatar: p.avatar_url ?? null });
      tracked = cell;
    } else if (cell !== ownCell && tracked === cell) {
      void ch.untrack();
      tracked = "";
    }
  }
}

async function joinCells() {
  const uid = me();
  if (!uid) return;
  const pos = await where();
  ownCell = dropCell(pos.lat, pos.lng);
  const want = new Set(geohashAround(ownCell));
  for (const [cell, ch] of cells) {
    if (want.has(cell)) continue;
    void supabase.removeChannel(ch);
    cells.delete(cell);
    ready.delete(cell);
    if (tracked === cell) tracked = "";
  }
  for (const cell of want) {
    if (cells.has(cell)) continue;
    const ch = supabase.channel(cellTopic(cell), { config: { presence: { key: uid } } });
    cells.set(cell, ch);
    ch.on("presence", { event: "sync" }, recompute).subscribe((st) => {
      if (st === "SUBSCRIBED") {
        ready.add(cell);
        syncTracking();
      }
    });
  }
  syncTracking();
}

function leaveNearby() {
  if (relocate) clearInterval(relocate);
  if (offTimer) clearTimeout(offTimer);
  relocate = null;
  offTimer = null;
  for (const ch of cells.values()) void supabase.removeChannel(ch);
  cells.clear();
  ready.clear();
  ownCell = "";
  tracked = "";
}

/** Switch "nearby" on (look for people and let them see you) for 10 minutes, or off right now. */
export async function setNearby(on: boolean) {
  if (!on) {
    leaveNearby();
    useDrop.setState({ nearbyOn: false, nearby: [], locating: false });
    return;
  }
  if (!me()) return;
  useDrop.setState({ locating: true, error: "" });
  try {
    await joinCells();
  } catch (e) {
    leaveNearby();
    useDrop.setState({ locating: false, nearbyOn: false, error: e instanceof Error ? e.message : "Couldn't turn nearby on." });
    return;
  }
  useDrop.setState({ locating: false, nearbyOn: true });
  if (relocate) clearInterval(relocate);
  if (offTimer) clearTimeout(offTimer);
  relocate = setInterval(() => void joinCells().catch(() => {}), RELOCATE_MS);
  offTimer = setTimeout(() => void setNearby(false), NEARBY_MS);
}
