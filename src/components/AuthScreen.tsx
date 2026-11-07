"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AtSign, Eye, EyeOff, Fingerprint, Link2, Lock, Mail, MessageCircle, MonitorUp, Palette, ShieldCheck, User, Video } from "lucide-react";
import { supabase, errorText } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { NexusCredit, copyNexusAppLink } from "@/components/ui/NexusCredit";
import {
  mfaAuthenticatePasskeyFactor,
  mfaChallengeAndVerify,
  mfaListFactors,
  mfaNeedsChallenge,
  signInWithPasskey,
  webAuthnSupported,
  type MfaFactor,
} from "@/lib/mfa";
import { signInWithApple } from "@/lib/appleAuth";

export type AuthMode = "login" | "register" | "forgot" | "mfa";

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = [
  { label: "Too weak", color: "bg-dnd" },
  { label: "Weak", color: "bg-dnd" },
  { label: "Okay", color: "bg-idle" },
  { label: "Good", color: "bg-ok" },
  { label: "Strong", color: "bg-ok" },
];

function Field({
  icon,
  label,
  right,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode; label: string; right?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/60 uppercase">{label}</span>
      <span className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-white/40">{icon}</span>
        <input
          {...props}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-11 pl-10 text-white outline-none transition placeholder:text-white/30 focus:border-accent focus:bg-white/[.07] focus:ring-2 focus:ring-accent/30"
        />
        {right && <span className="absolute right-3">{right}</span>}
      </span>
    </label>
  );
}

export default function AuthScreen({ initialMode = "login" }: { initialMode?: AuthMode }) {
  const [mode, setModeState] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const honeypot = useRef<HTMLInputElement>(null);
  const passkeysOk = webAuthnSupported();

  const activeMfa = mfaFactors.find((f) => f.id === mfaFactorId) || null;
  const mfaIsPasskey = activeMfa?.factor_type === "webauthn";

  async function loadMfaFactors() {
    const { totp, webauthn } = await mfaListFactors();
    const verified = [...webauthn, ...totp].filter((f) => f.status === "verified");
    setMfaFactors(verified);
    const preferred = verified.find((f) => f.factor_type === "webauthn") || verified[0] || null;
    setMfaFactorId(preferred?.id ?? null);
    return verified;
  }

  useEffect(() => {
    if (initialMode !== "mfa") return;
    setModeState("mfa");
    void loadMfaFactors();
  }, [initialMode]);

  const setMode = (m: AuthMode) => {
    setModeState(m);
    setError(null);
    setInfo(null);
    if (m !== "forgot" && m !== "mfa") window.history.replaceState(null, "", `/${m}`);
  };

  const pwScore = useMemo(() => strength(password), [password]);
  const cleanUser = username.toLowerCase().replace(/[^a-z0-9_.]/g, "");

  async function enterMfaIfNeeded() {
    if (!(await mfaNeedsChallenge())) {
      window.history.replaceState(null, "", "/");
      return;
    }
    const verified = await loadMfaFactors();
    if (!verified.length) {
      window.history.replaceState(null, "", "/");
      return;
    }
    setMfaCode("");
    setMode("mfa");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "mfa") {
        if (!mfaFactorId) throw new Error("No 2FA method available.");
        if (mfaIsPasskey) {
          const ok = await mfaAuthenticatePasskeyFactor(mfaFactorId);
          if (!ok) throw new Error("Passkey verification failed.");
        } else {
          if (mfaCode.trim().length < 6) throw new Error("Enter the 6-digit code from Authy or your authenticator app.");
          const ok = await mfaChallengeAndVerify(mfaFactorId, mfaCode.trim());
          if (!ok) throw new Error("Invalid authenticator code.");
        }
        window.history.replaceState(null, "", "/");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
        await enterMfaIfNeeded();
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setInfo("If that email has an account, a reset link is on its way.");
      } else {
        if (cleanUser.length < 1) throw new Error("Pick a username.");
        if (password.length < 8) throw new Error("Password needs at least 8 characters.");
        if (password !== confirm) throw new Error("Passwords don't match.");
        if (!agree) throw new Error("Please accept the community rules.");
        const { error } = await supabase.functions.invoke("signup", {
          body: {
            email: email.trim(),
            password,
            username: cleanUser,
            display_name: displayName.trim() || cleanUser,
            website: honeypot.current?.value ?? "",
          },
        });
        if (error) {
          let msg = errorText(error);
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json().catch(() => null);
            if (body?.error) msg = body.error;
          }
          throw new Error(msg);
        }
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (loginErr) throw loginErr;
        await enterMfaIfNeeded();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const eye = (
    <button type="button" onClick={() => setShow((v) => !v)} className="text-white/40 hover:text-white" aria-label={show ? "Hide password" : "Show password"}>
      {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );

  return (
    <div className="auth-bg relative flex h-full overflow-y-auto">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />

      {/* hero */}
      <section className="relative hidden flex-1 flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-linear-to-br from-accent to-blurple shadow-lg shadow-accent/30">
            <MessageCircle className="size-6 text-white" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-white">Nexus</span>
        </div>
        <div className="max-w-lg">
          <h1 className="text-5xl leading-tight font-extrabold text-white">
            Your crew.
            <br />
            <span className="bg-linear-to-r from-accent via-[#b06cff] to-[#ff73fa] bg-clip-text text-transparent">One place.</span>
          </h1>
          <p className="mt-4 text-lg text-white/60">Chat like Telegram, hang out like Discord — voice, video and screen share with your friends.</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              [<Video key="v" className="size-5" />, "HD video calls"],
              [<MonitorUp key="m" className="size-5" />, "Screen share with audio"],
              [<Palette key="p" className="size-5" />, "Themes & custom CSS"],
              [<ShieldCheck key="s" className="size-5" />, "Roles, badges & mods"],
            ].map(([icon, text], i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/80 backdrop-blur">
                <span className="text-accent">{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </div>
        <div className="relative h-28">
          <div className="absolute left-0 animate-[orb_6s_ease-in-out_infinite_alternate] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2 text-white backdrop-blur">
            yo, you joining voice? 🎧
          </div>
          <div className="absolute top-12 left-40 rounded-2xl rounded-br-md bg-accent px-4 py-2 text-white shadow-lg">sharing my screen now 🔥</div>
        </div>
      </section>

      {/* form */}
      <section className="relative flex w-full items-center justify-center p-4 lg:w-[520px] lg:p-10">
        <form onSubmit={submit} className="relative w-full max-w-md animate-pop rounded-3xl border border-white/10 bg-black/45 p-8 shadow-2xl backdrop-blur-2xl">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-accent to-blurple">
              <MessageCircle className="size-5 text-white" />
            </div>
            <span className="text-xl font-extrabold text-white">Nexus</span>
          </div>

          {mode === "login" || mode === "register" ? (
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-white/5 p-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("rounded-lg py-2 text-sm font-semibold transition", mode === m ? "bg-white text-black shadow" : "text-white/60 hover:text-white")}
                >
                  {m === "login" ? "Log in" : "Create account"}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                if (mode === "mfa") await supabase.auth.signOut();
                setMfaFactorId(null);
                setMfaFactors([]);
                setMfaCode("");
                setMode("login");
              }}
              className="mb-5 flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
            >
              <ArrowLeft className="size-4" /> Back to login
            </button>
          )}

          <h2 className="text-2xl font-bold text-white">
            {mode === "login" ? "Welcome back!" : mode === "register" ? "Join the crew" : mode === "mfa" ? "Two-factor check" : "Reset your password"}
          </h2>
          <p className="mt-1 mb-6 text-sm text-white/55">
            {mode === "login"
              ? "We're so excited to see you again!"
              : mode === "register"
                ? "It takes less than a minute."
                : mode === "mfa"
                  ? mfaIsPasskey
                    ? "Confirm with your linked passkey or security key."
                    : "Open Authy (or your authenticator) and enter the 6-digit code."
                  : "We'll email you a link to set a new one."}
          </p>

          <div className="space-y-4">
            {mode === "mfa" ? (
              <>
                {mfaFactors.length > 1 && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold tracking-wide text-white/60 uppercase">Method</span>
                    <select
                      value={mfaFactorId ?? ""}
                      onChange={(e) => {
                        setMfaFactorId(e.target.value);
                        setMfaCode("");
                      }}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    >
                      {mfaFactors.map((f) => (
                        <option key={f.id} value={f.id} className="bg-black text-white">
                          {f.factor_type === "webauthn"
                            ? `Passkey · ${f.friendly_name || "Security key"}`
                            : `Authy · ${f.friendly_name || "Authenticator"}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!mfaIsPasskey && (
                  <Field
                    icon={<ShieldCheck className="size-5" />}
                    label="Authy / authenticator code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                  />
                )}
              </>
            ) : (
              <Field
                icon={<Mail className="size-5" />}
                label="Email"
                type="email"
                required
                autoComplete={mode === "login" ? "username webauthn" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            )}
            {mode === "register" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field icon={<User className="size-5" />} label="Display name" value={displayName} maxLength={32} onChange={(e) => setDisplayName(e.target.value)} placeholder="Martin" />
                <Field
                  icon={<AtSign className="size-5" />}
                  label="Username"
                  required
                  value={username}
                  maxLength={32}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                  placeholder="martin"
                />
              </div>
            )}
            {(mode === "login" || mode === "register") && (
              <div>
                <Field
                  icon={<Lock className="size-5" />}
                  label="Password"
                  type={show ? "text" : "password"}
                  required
                  minLength={mode === "register" ? 8 : 6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  right={eye}
                />
                {mode === "register" && password && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className={cn("h-1 flex-1 rounded-full transition", i < pwScore ? STRENGTH[pwScore].color : "bg-white/10")} />
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-white/50">{STRENGTH[pwScore].label}</div>
                  </div>
                )}
                {mode === "login" && (
                  <button type="button" onClick={() => setMode("forgot")} className="mt-2 text-sm text-accent hover:underline">
                    Forgot your password?
                  </button>
                )}
              </div>
            )}
            {mode === "register" && (
              <>
                <Field icon={<Lock className="size-5" />} label="Confirm password" type={show ? "text" : "password"} required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                {/* Honeypot for bots — keep visually hidden and unused by real users */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0" tabIndex={-1}>
                  <label>
                    Website
                    <input ref={honeypot} type="text" name="website" autoComplete="off" tabIndex={-1} defaultValue="" />
                  </label>
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-sm text-white/60">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
                  I&apos;ll be respectful and follow the community rules. Staff can time out or ban accounts.
                </label>
              </>
            )}
          </div>

          {error && <p className="mt-4 rounded-xl bg-dnd/15 px-3 py-2 text-sm text-[#ff8a8c]">{error}</p>}
          {info && <p className="mt-4 rounded-xl bg-ok/15 px-3 py-2 text-sm text-[#7ee2a8]">{info}</p>}

          <button
            disabled={busy}
            className="mt-6 w-full rounded-xl bg-accent py-3 font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-2 disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Log In"
                : mode === "register"
                  ? "Create Account"
                  : mode === "mfa"
                    ? mfaIsPasskey
                      ? "Continue with passkey"
                      : "Verify & continue"
                    : "Send reset link"}
          </button>

          {(mode === "login" || mode === "register") && (
            <>
              <div className="my-4 flex items-center gap-3 text-[11px] font-semibold tracking-wide text-white/35 uppercase">
                <span className="h-px flex-1 bg-white/10" />
                or
                <span className="h-px flex-1 bg-white/10" />
              </div>
              {mode === "login" && passkeysOk && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    const ok = await signInWithPasskey();
                    setBusy(false);
                    if (ok) await enterMfaIfNeeded();
                    else setError("Passkey sign-in failed or was cancelled.");
                  }}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
                >
                  <Fingerprint className="size-5" />
                  Continue with passkey
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const r = await signInWithApple();
                  setBusy(false);
                  if (!r.ok) setError(r.error || "Apple sign-in failed");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-black transition hover:bg-white/90 disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M16.365 12.73c-.03-2.02 1.65-2.99 1.73-3.04-0.94-1.38-2.41-1.57-2.93-1.59-1.25-.13-2.44.74-3.07.74-.63 0-1.61-.72-2.65-.7-1.36.02-2.62.79-3.32 2.01-1.42 2.46-.36 6.1 1.02 8.1.67.98 1.48 2.08 2.53 2.04 1.02-.04 1.41-.66 2.65-.66 1.23 0 1.58.66 2.66.64 1.1-.02 1.8-1 2.47-1.98.77-1.13 1.09-2.22 1.11-2.28-.02-.01-2.13-.82-2.16-3.28zM14.5 5.95c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.98 1.56-.86 2.48.91.07 1.84-.46 2.39-1.14z"
                  />
                </svg>
                Continue with Apple
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => void copyNexusAppLink()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <Link2 className="size-4" /> Share Nexus app link
          </button>
          <NexusCredit className="mt-5 text-[13px] text-white/55" support />
        </form>
      </section>
    </div>
  );
}

export function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-bg grid h-full place-items-center p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return setError("At least 8 characters.");
          if (pw !== confirm) return setError("Passwords don't match.");
          setBusy(true);
          const { error } = await supabase.auth.updateUser({ password: pw });
          setBusy(false);
          if (error) return setError(error.message);
          onDone();
        }}
        className="w-full max-w-sm animate-pop space-y-4 rounded-3xl border border-white/10 bg-black/45 p-8 backdrop-blur-2xl"
      >
        <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
        <Field icon={<Lock className="size-5" />} label="New password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <Field icon={<Lock className="size-5" />} label="Confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        {error && <p className="text-sm text-[#ff8a8c]">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-accent py-3 font-semibold text-white hover:bg-accent-2 disabled:opacity-60">
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
