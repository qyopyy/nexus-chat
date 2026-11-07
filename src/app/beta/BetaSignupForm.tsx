"use client";

import { useEffect, useState } from "react";

type AppOpt = { id: string; name: string };
const FN = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/testflight-invite`;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Email invite: first name, last name, email → Apple sends a TestFlight invite to that address. */
export default function BetaSignupForm({ apps }: { apps: AppOpt[] }) {
  const [app, setApp] = useState(apps[0]?.id ?? "nexus");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "invited" | "pending" | "already">(null);
  const [err, setErr] = useState("");
  const [spots, setSpots] = useState<{ taken: number; limit: number } | null>(null);

  useEffect(() => {
    let off = false;
    void fetch(`${FN.replace("/functions/v1/testflight-invite", "")}/rest/v1/rpc/testflight_spots`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ p_app: app }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !off && j && setSpots(j))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [app]);

  if (apps.length === 0) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch(FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ action: "signup", app, email, first_name: first, last_name: last, website: hp }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; already?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "Something went wrong — try again.");
      setDone(j.already ? "already" : j.status === "invited" ? "invited" : "pending");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="rounded-2xl bg-[#0a84ff]/15 p-5 ring-1 ring-[#0a84ff]/40">
        <div className="text-lg font-bold">{done === "already" ? "You're already in 🎉" : "You're on the list 🎉"}</div>
        <p className="mt-1 text-sm text-white/75">
          {done === "invited"
            ? `Apple is emailing ${email} a TestFlight invite. Open it on your iPhone and tap “View in TestFlight”.`
            : done === "already"
              ? `${email} was already invited — look for the email from TestFlight, or use the Join button below.`
              : `Your invite will be emailed to ${email} shortly. In the meantime you can also tap Join below.`}
        </p>
      </div>
    );

  const field = "w-full rounded-xl bg-white/[.07] px-3.5 py-3 text-[15px] text-white ring-1 ring-white/10 outline-none placeholder:text-white/35 focus:ring-2 focus:ring-[#0a84ff]";
  return (
    <form onSubmit={submit} className="relative space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-bold">Get an invite by email</div>
        {spots && (
          <div className="text-xs text-white/55 tabular-nums">
            {spots.taken.toLocaleString()} / {spots.limit.toLocaleString()} spots
          </div>
        )}
      </div>
      {apps.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {apps.map((a) => (
            <button key={a.id} type="button" onClick={() => setApp(a.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${app === a.id ? "bg-white text-black" : "bg-white/10 text-white/80"}`}>
              {a.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input required value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" autoComplete="given-name" maxLength={60} className={field} />
        <input required value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" autoComplete="family-name" maxLength={60} className={field} />
      </div>
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (use your Apple ID email)" autoComplete="email" inputMode="email" maxLength={254} className={field} />
      {/* honeypot — hidden from people, bots fill it */}
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} name="website" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {err && <div className="rounded-lg bg-[#ff453a]/15 px-3 py-2 text-sm text-[#ff8a80]">{err}</div>}
      <button disabled={busy} className="w-full rounded-full bg-[#0a84ff] py-3 font-bold disabled:opacity-60">
        {busy ? "Sending…" : "Send me the invite"}
      </button>
      <p className="text-[11px] text-white/45">Apple sends the invite from TestFlight. We only use your details for the beta invite.</p>
    </form>
  );
}
