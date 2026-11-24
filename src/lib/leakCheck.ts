"use client";

import { supabase } from "./supabase";

export type Breach = { name: string; title: string; domain: string; date: string | null; data: string[]; verified: boolean; sensitive: boolean };
export type LeakResult = { configured: boolean; checked_at?: string; breaches: Breach[] };

/** Checks the signed-in member's own account email against known data breaches. */
export async function checkMyEmail(email?: string): Promise<LeakResult> {
  const { data, error } = await supabase.functions.invoke("leak-check", { body: { email: email?.trim() || undefined } });
  if (error) {
    // functions.invoke hides the JSON body of non-2xx replies in `context`
    const ctx = (error as { context?: Response }).context;
    let message = "The breach check isn't available right now.";
    try { const body = await ctx?.json(); if (body?.error) message = String(body.error); } catch { /* keep the generic text */ }
    throw new Error(message);
  }
  if (data && data.configured === false) return { configured: false, breaches: [] };
  return { configured: true, checked_at: data?.checked_at, breaches: Array.isArray(data?.breaches) ? data.breaches : [] };
}

async function sha1Upper(text: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * How many times a password appears in known leaks. Only the first five characters of its SHA-1 hash
 * leave the device (k-anonymity), never the password itself. Returns null if the service can't be reached.
 */
export async function passwordLeakCount(password: string): Promise<number | null> {
  if (!password) return null;
  const hash = await sha1Upper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true" } });
    if (!response.ok) return null;
    for (const line of (await response.text()).split("\n")) {
      const [candidate, count] = line.trim().split(":");
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}
