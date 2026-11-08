/** Shared server helpers for the Wump map API routes (search / directions / nearby). Fixed upstream hosts only. */
import { NextResponse } from "next/server";

export const WUMP_UA = "NexusWump/1.0 (https://nexusproject.cc; wump-map@nexusproject.cc)";

export function wumpJson(body: unknown, status = 200, maxAge = 300) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` : "no-store", "Access-Control-Allow-Origin": "*" },
  });
}

export function coord(v: string | null): [number, number] | null {
  if (!v) return null;
  const [a, b] = v.split(",").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return [a, b];
}

export async function getJson<T>(url: string, init: RequestInit = {}, timeout = 9000): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "User-Agent": WUMP_UA, Accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeout), cache: "no-store" });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return (await r.json()) as T;
}

export type WumpSearchResult = { id: string; name: string; address: string | null; kind: string | null; lat: number; lng: number };
export type WumpRoute = { mode: "walk" | "bike" | "drive"; distance: number; duration: number; coords: [number, number][]; steps: { text: string; distance: number }[] };
export type WumpPoi = { id: string; name: string; kind: string; lat: number; lng: number; address: string | null; open: string | null; website: string | null };
