"use client";

/** Beat Battle community songs — charts + audio members upload (their own work) for everyone to play. */
import { supabase, errorText } from "./supabase";
import { toast, useApp } from "@/store/app";
import { loadProfiles } from "./data";

export type BeatSong = {
  id: string;
  owner_id: string;
  title: string;
  credit: string | null;
  difficulty: string;
  chart_path: string;
  inst_path: string;
  voices_path: string | null;
  notes: number;
  bpm: number | null;
  length_ms: number | null;
  color: string | null;
  plays: number;
  hidden: boolean;
  created_at: string;
};

const BUCKET = "beat-songs";
export const beatFileUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

export async function listBeatSongs(sort: "new" | "top" = "new", q = "") {
  let query = supabase.from("beat_songs").select("*").eq("hidden", false).limit(60);
  query = sort === "top" ? query.order("plays", { ascending: false }).order("created_at", { ascending: false }) : query.order("created_at", { ascending: false });
  if (q.trim()) query = query.or(`title.ilike.%${q.trim().replace(/[%,]/g, "")}%,credit.ilike.%${q.trim().replace(/[%,]/g, "")}%`);
  const { data, error } = await query;
  if (error) return [] as BeatSong[];
  const rows = (data ?? []) as BeatSong[];
  if (rows.length) void loadProfiles([...new Set(rows.map((r) => r.owner_id))]);
  return rows;
}

export async function myBeatSongs() {
  const me = useApp.getState().userId;
  if (!me) return [] as BeatSong[];
  const { data } = await supabase.from("beat_songs").select("*").eq("owner_id", me).order("created_at", { ascending: false });
  return (data ?? []) as BeatSong[];
}

const ext = (f: Blob, name: string) => {
  const m = name.toLowerCase().match(/\.(mp3|m4a|ogg|wav|aac|webm)$/);
  if (m) return m[1];
  const t = f.type;
  return t.includes("mp4") || t.includes("m4a") ? "m4a" : t.includes("ogg") ? "ogg" : t.includes("wav") ? "wav" : "mp3";
};

export async function publishBeatSong(input: {
  title: string;
  credit?: string;
  difficulty: string;
  chart: Blob;
  inst: Blob;
  instName: string;
  voices?: Blob | null;
  voicesName?: string;
  notes: number;
  bpm?: number | null;
  lengthMs?: number | null;
  color?: string;
  onStep?: (s: string) => void;
}) {
  const me = useApp.getState().userId;
  if (!me) return null;
  if (input.inst.size > 40 * 1024 * 1024 || (input.voices && input.voices.size > 40 * 1024 * 1024)) {
    toast("Audio files up to 40 MB each", "error");
    return null;
  }
  const dir = `${me}/${crypto.randomUUID()}`;
  const chartPath = `${dir}/chart.json`;
  const instPath = `${dir}/inst.${ext(input.inst, input.instName)}`;
  const voicesPath = input.voices ? `${dir}/voices.${ext(input.voices, input.voicesName ?? "")}` : null;
  const up = async (path: string, blob: Blob, label: string) => {
    input.onStep?.(`Uploading ${label}…`);
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined, upsert: false });
    if (error) throw new Error(`${label}: ${errorText(error)}`);
  };
  try {
    await up(chartPath, new Blob([input.chart], { type: "application/json" }), "chart");
    await up(instPath, input.inst, "Inst");
    if (input.voices && voicesPath) await up(voicesPath, input.voices, "Voices");
    input.onStep?.("Publishing…");
    const { data, error } = await supabase
      .from("beat_songs")
      .insert({
        owner_id: me,
        title: input.title.trim().slice(0, 80),
        credit: input.credit?.trim().slice(0, 120) || null,
        difficulty: input.difficulty.slice(0, 20),
        chart_path: chartPath,
        inst_path: instPath,
        voices_path: voicesPath,
        notes: Math.min(20000, Math.max(0, Math.round(input.notes))),
        bpm: input.bpm ?? null,
        length_ms: input.lengthMs ? Math.round(input.lengthMs) : null,
        color: input.color ?? null,
        rights_confirmed: true,
      })
      .select()
      .single();
    if (error) throw new Error(errorText(error));
    toast("Published to the community list", "success");
    return data as BeatSong;
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([chartPath, instPath, ...(voicesPath ? [voicesPath] : [])]).catch(() => {});
    toast((e as Error).message || "Couldn't publish", "error");
    return null;
  }
}

export async function deleteBeatSong(s: BeatSong) {
  const { error } = await supabase.from("beat_songs").delete().eq("id", s.id);
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  await supabase.storage.from(BUCKET).remove([s.chart_path, s.inst_path, ...(s.voices_path ? [s.voices_path] : [])]).catch(() => {});
  return true;
}

/** staff: take a song down (owner can't undo) */
export async function hideBeatSong(id: string, hidden: boolean) {
  const { error } = await supabase.from("beat_songs").update({ hidden }).eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}

export const countBeatPlay = (id: string) => void supabase.rpc("beat_song_played", { p_id: id });
