"use client";

import { supabase } from "./supabase";

export type GuardVerdict = {
  url: string;
  final_url: string;
  host: string;
  verdict: "safe" | "suspicious" | "danger";
  score: number;
  tracker: boolean;
  blocked_by: string[];
  hops: string[];
  reasons: { level: "info" | "warn" | "bad"; text: string }[];
  scanned_at: string;
};

export type GuardWatch = {
  id: string;
  url: string;
  verdict: GuardVerdict["verdict"];
  score: number;
  alerts_on: boolean;
  last_scan: string | null;
  details: GuardVerdict | null;
};

/** Link Shield — checks a link against malware/phishing DNS filters + scam heuristics. */
export async function scanLink(url: string): Promise<GuardVerdict> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(`${base}/functions/v1/guard`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key ?? "" },
    body: JSON.stringify({ action: "scan", url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Scan failed — try again.");
  return data as GuardVerdict;
}

export async function watchList(): Promise<GuardWatch[]> {
  const { data, error } = await supabase.from("guard_watch").select("id,url,verdict,score,alerts_on,last_scan,details").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GuardWatch[];
}

export async function watchAdd(v: GuardVerdict, userId: string) {
  const { error } = await supabase
    .from("guard_watch")
    .upsert({ owner_id: userId, url: v.url, verdict: v.verdict, score: v.score, details: v, last_scan: v.scanned_at }, { onConflict: "owner_id,url" });
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Watchlist is full (25 links). Remove one first." : error.message);
}

export async function watchRemove(id: string) {
  const { error } = await supabase.from("guard_watch").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function watchAlerts(id: string, on: boolean) {
  const { error } = await supabase.from("guard_watch").update({ alerts_on: on }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function watchRescan(w: GuardWatch): Promise<GuardVerdict> {
  const v = await scanLink(w.url);
  await supabase.from("guard_watch").update({ verdict: v.verdict, score: v.score, details: v, last_scan: v.scanned_at }).eq("id", w.id);
  return v;
}

/** Manual protection steps the app can't verify (iOS settings) — remembered on this device. */
export const MANUAL_KEY = "nexus:guard:v1";
export function loadManual(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}
export function saveManual(m: Record<string, boolean>) {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(m));
  } catch {
    /* private mode */
  }
}
