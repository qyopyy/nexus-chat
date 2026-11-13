"use client";

import { supabase, errorText } from "./supabase";
import { wildCell, type WildId } from "./wumpWildsPlan";

export { wildCell, wildSpawns, wildSpecies, WILD_SPECIES } from "./wumpWildsPlan";
export type { WildId, WildSpawn } from "./wumpWildsPlan";

export type WildRoom = {
  id: string;
  code: string;
  title: string;
  host_id: string;
  cell_lat: number;
  cell_lng: number;
  expires_at: string;
};

export type WildCatch = { id: string; room_id: string; user_id: string; species: WildId; caught_at: string };
export type WildDex = { species: WildId; caught: number };

export async function wildDex() {
  const { data, error } = await supabase.from("wump_wild_dex").select("species, caught");
  if (error) {
    if (/wump_wild_dex|schema cache|42P01|PGRST205/i.test(error.message)) return [] as WildDex[];
    throw new Error(errorText(error));
  }
  return (data ?? []) as WildDex[];
}

export async function wildCatch(species: WildId, roomId?: string | null) {
  const { error } = await supabase.rpc("wump_wild_catch", { p_species: species, p_room: roomId || null });
  if (error) throw new Error(errorText(error));
}

export async function wildCreateRoom(title: string, lat: number, lng: number) {
  const cell = wildCell(lat, lng);
  const { data, error } = await supabase.rpc("wump_wild_create", { p_title: title, p_lat: cell.lat, p_lng: cell.lng });
  if (error) throw new Error(errorText(error));
  return data as WildRoom;
}

export async function wildJoin(code: string) {
  const { data, error } = await supabase.rpc("wump_wild_join", { p_code: code.trim().toUpperCase() });
  if (error) throw new Error(errorText(error));
  return data as WildRoom;
}

export async function wildLeave(roomId: string) {
  const { error } = await supabase.rpc("wump_wild_leave", { p_room: roomId });
  if (error) throw new Error(errorText(error));
}

export async function wildMyRoom() {
  const { data, error } = await supabase.rpc("wump_wild_mine");
  if (error) {
    if (/wump_wild_mine|schema cache|42P01|PGRST205/i.test(error.message)) return null;
    throw new Error(errorText(error));
  }
  return (data as WildRoom | null) ?? null;
}

export async function wildRoomCatches(roomId: string) {
  const { data, error } = await supabase.from("wump_wild_catches").select("id, room_id, user_id, species, caught_at").eq("room_id", roomId).order("caught_at", { ascending: false }).limit(40);
  if (error) throw new Error(errorText(error));
  return (data ?? []) as WildCatch[];
}

export function subscribeWildRoom(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`wump-wild:${roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "wump_wild_catches", filter: `room_id=eq.${roomId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "wump_wild_members", filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
