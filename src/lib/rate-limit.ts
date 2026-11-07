import { NextResponse } from "next/server";

export type RateLimitResult = { limit: number; remaining: number };

export function createRateLimitHeaders(r: RateLimitResult) {
  return { "RateLimit-Limit": String(r.limit), "RateLimit-Remaining": String(r.remaining) };
}
export function createRateLimitedResponse() {
  return NextResponse.json({ error: "Too many requests" }, { status: 429 });
}
