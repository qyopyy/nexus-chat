"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail, Sparkles, Ticket, User } from "lucide-react";
import { supabase, errorText } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { linkbioInviteCheck, linkbioInviteRedeem } from "@/lib/linkbio";

type Mode = "login" | "register";

/** Nexus Link auth — register requires an invite code. */
export default function LinkBioAuth({ initialMode = "login" }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw new Error(err.message === "Invalid login credentials" ? "Wrong email or password." : err.message);
        return;
      }

      const code = invite.trim().toUpperCase();
      if (code.length < 4) throw new Error("Invite code required to join Nexus Link.");
      const check = await linkbioInviteCheck(code);
      if (!check.ok) throw new Error(check.error || "Invalid invite code.");

      const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
      if (cleanUser.length < 2) throw new Error("Username needs at least 2 letters or numbers.");
      if (password.length < 8) throw new Error("Password needs at least 8 characters.");
      if (password !== confirm) throw new Error("Passwords don't match.");

      const { error: signErr } = await supabase.functions.invoke("signup", {
        body: {
          email: email.trim(),
          password,
          username: cleanUser,
          display_name: displayName.trim() || cleanUser,
          website: honeypot.current?.value ?? "",
        },
      });
      if (signErr) {
        let msg = errorText(signErr);
        const ctx = (signErr as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json().catch(() => null);
          if (body?.error) msg = body.error;
        }
        throw new Error(msg);
      }

      const { error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginErr) throw loginErr;

      const redeemed = await linkbioInviteRedeem(code);
      if (!redeemed?.ok) throw new Error("Could not redeem invite. Contact support.");
      setInfo("Welcome to Nexus Link — invite redeemed.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0a0214] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(168,85,247,.35),transparent_50%),radial-gradient(ellipse_at_80%_100%,rgba(88,28,135,.4),transparent_45%)]" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-3xl border border-white/10 bg-black/50 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#a855f7] to-[#4c1d95]">
            <Sparkles className="size-5 text-white" />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight text-white">Nexus Link</div>
            <div className="text-xs text-white/50">Link in bio · invite only for new accounts</div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-white/5 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
              className={cn("rounded-lg py-2 text-sm font-bold capitalize transition", mode === m ? "bg-[#a855f7] text-white" : "text-white/55 hover:text-white")}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === "register" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/55 uppercase">Invite code</span>
              <span className="relative flex items-center">
                <Ticket className="pointer-events-none absolute left-3 size-4 text-white/35" />
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                  required
                  placeholder="NEXUS999"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-3 pl-10 text-sm text-white outline-none focus:border-[#a855f7]"
                />
              </span>
            </label>
          )}

          {mode === "register" && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/55 uppercase">Username</span>
                <span className="relative flex items-center">
                  <User className="pointer-events-none absolute left-3 size-4 text-white/35" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-3 pl-10 text-sm text-white outline-none focus:border-[#a855f7]"
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/55 uppercase">Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 48))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-[#a855f7]"
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/55 uppercase">Email</span>
            <span className="relative flex items-center">
              <Mail className="pointer-events-none absolute left-3 size-4 text-white/35" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-3 pl-10 text-sm text-white outline-none focus:border-[#a855f7]"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/55 uppercase">Password</span>
            <span className="relative flex items-center">
              <Lock className="pointer-events-none absolute left-3 size-4 text-white/35" />
              <input
                type={show ? "text" : "password"}
                required
                minLength={mode === "register" ? 8 : 6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-11 pl-10 text-sm text-white outline-none focus:border-[#a855f7]"
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 text-white/40 hover:text-white" aria-label="Toggle password">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </label>

          {mode === "register" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/55 uppercase">Confirm password</span>
              <span className="relative flex items-center">
                <KeyRound className="pointer-events-none absolute left-3 size-4 text-white/35" />
                <input
                  type={show ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-3 pl-10 text-sm text-white outline-none focus:border-[#a855f7]"
                />
              </span>
            </label>
          )}

          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
            <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-[#ff8a8c]">{error}</p>}
        {info && <p className="mt-4 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-[#7ee2a8]">{info}</p>}

        <button disabled={busy} className="mt-5 w-full rounded-xl bg-[#a855f7] py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/25 disabled:opacity-60">
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account with invite"}
        </button>

        <p className="mt-4 text-center text-[11px] text-white/40">
          Existing Nexus accounts can log in without an invite. New Link registrations need a code from an admin.
        </p>
      </form>
    </div>
  );
}
