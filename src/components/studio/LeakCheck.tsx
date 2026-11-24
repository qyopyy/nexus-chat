"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { checkMyEmail, passwordLeakCount, type Breach, type LeakResult } from "@/lib/leakCheck";
import { Card, H } from "./Studio";

export default function LeakCheck() {
  const [accountEmail, setAccountEmail] = useState<string | undefined>();
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setAccountEmail(data.user?.email ?? undefined));
  }, []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LeakResult | null>(null);
  const [password, setPassword] = useState("");
  const [pwn, setPwn] = useState<number | null | undefined>(undefined);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await checkMyEmail(email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The breach check isn't available right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <H>Leak check</H>
      <Card title="Has my email been in a data breach?">
        <p className="text-sm text-sub">Checks known public data breaches (including ones circulated on the dark web) for the email on your Nexus account. Leave the box empty to use it{accountEmail ? ` (${accountEmail})` : ""}.</p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your account email" autoComplete="email" aria-label="Email to check" className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-line/70 focus:ring-accent" />
          <button disabled={busy} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Checking…" : "Check my email"}</button>
        </form>
        <p className="mt-2 text-xs text-sub">Only your own account email can be checked. Searching by someone else&apos;s email or by a full name isn&apos;t offered: names aren&apos;t reliable identifiers in breach data, and the lookup could be used to target other people.</p>
        {error && <p role="alert" className="mt-3 text-sm text-[#f0b232]">{error}</p>}
        {result && !result.configured && <p className="mt-3 text-sm text-[#f0b232]">The breach database isn&apos;t switched on for this Nexus yet. An admin needs to add the HIBP_API_KEY secret.</p>}
        {result?.configured && result.breaches.length === 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm text-[#23a55a]"><ShieldCheck className="size-5" aria-hidden /> Good news: this email wasn&apos;t found in any known breach.</p>
        )}
        {result?.configured && result.breaches.length > 0 && (
          <div className="mt-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#f0b232]"><ShieldAlert className="size-5" aria-hidden /> Found in {result.breaches.length} breach{result.breaches.length === 1 ? "" : "es"}</p>
            <ul className="mt-2 space-y-2">
              {result.breaches.map((b: Breach) => (
                <li key={b.name} className="rounded-xl bg-black/20 p-3 text-sm">
                  <div className="font-semibold">{b.title}{b.date ? <span className="ml-2 text-xs font-normal text-sub">{b.date}</span> : null}</div>
                  {b.data.length > 0 && <p className="mt-1 text-xs text-sub">Exposed: {b.data.join(", ")}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-sub">What to do: change the password on those sites (and anywhere you reused it), use a unique password for each, and turn on two-factor sign-in.</p>
          </div>
        )}
      </Card>
      <Card title="Is this password safe to use?" className="mt-4">
        <p className="text-sm text-sub">Checks whether a password appears in known leaks. Only a short fragment of its hash leaves your device, never the password.</p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); setPwn(undefined); const n = await passwordLeakCount(password); setPwn(n); }}>
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setPwn(undefined); }} placeholder="Password to test" autoComplete="off" aria-label="Password to test" className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-line/70 focus:ring-accent" />
          <button disabled={!password} className="rounded-full border border-line px-5 py-2 text-sm font-semibold disabled:opacity-50">Check password</button>
        </form>
        {pwn === null && <p role="alert" className="mt-3 text-sm text-[#f0b232]">Couldn&apos;t reach the password database. Try again.</p>}
        {typeof pwn === "number" && (pwn === 0
          ? <p className="mt-3 text-sm text-[#23a55a]">Not found in known leaks. Still use a unique password for every site.</p>
          : <p className="mt-3 text-sm text-[#f0b232]">Seen {pwn.toLocaleString()} times in leaks. Don&apos;t use it.</p>)}
      </Card>
    </>
  );
}
