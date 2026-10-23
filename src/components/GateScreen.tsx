"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

export default function GateScreen() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Wrong password");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-bg relative grid h-full place-items-center overflow-hidden p-4">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <form
        onSubmit={submit}
        className={`relative w-full max-w-sm animate-pop rounded-3xl border border-white/10 bg-black/40 p-8 text-center shadow-2xl backdrop-blur-xl ${shake ? "animate-shake" : ""}`}
      >
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-linear-to-br from-accent to-blurple shadow-lg shadow-accent/30">
          <Lock className="size-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">This space is private</h1>
        <p className="mt-1 mb-6 text-sm text-white/60">Enter the site password to continue to Nexus.</p>
        <div className="relative">
          <input
            autoFocus
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Site password"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-white outline-none placeholder:text-white/40 focus:border-accent focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-white/50 hover:text-white"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-dnd">{error}</p>}
        <button
          disabled={busy || !password}
          className="mt-5 w-full rounded-xl bg-accent py-3 font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-2 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
