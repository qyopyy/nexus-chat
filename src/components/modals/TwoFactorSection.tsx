"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Fingerprint, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import {
  mfaAuthenticatePasskeyFactor,
  mfaChallengeAndVerify,
  mfaEnrollTotp,
  mfaListFactors,
  mfaRegisterPasskeyFactor,
  mfaUnenroll,
  mfaVerifyEnrollment,
  passkeyDelete,
  passkeyList,
  passkeyRegister,
  webAuthnSupported,
  type LinkedPasskey,
  type MfaFactor,
} from "@/lib/mfa";
import { cn } from "@/lib/utils";

/** Account security — Authy/TOTP + passkeys (WebAuthn) via Supabase Auth */
export default function TwoFactorSection() {
  const [totpFactors, setTotpFactors] = useState<MfaFactor[]>([]);
  const [webauthnFactors, setWebauthnFactors] = useState<MfaFactor[]>([]);
  const [passkeys, setPasskeys] = useState<LinkedPasskey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disableId, setDisableId] = useState<string | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const supportsWebAuthn = webAuthnSupported();

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ totp, webauthn }, keys] = await Promise.all([mfaListFactors(), passkeyList()]);
    setTotpFactors(totp.filter((f) => f.status === "verified"));
    setWebauthnFactors(webauthn.filter((f) => f.status === "verified"));
    setPasskeys(keys);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnroll() {
    setBusy(true);
    const data = await mfaEnrollTotp("Authy");
    setBusy(false);
    if (!data?.totp) return;
    setEnrollId(data.id);
    setSecret(data.totp.secret);
    try {
      const url = await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 200, color: { dark: "#111318", light: "#ffffff" } });
      setQr(url);
    } catch {
      setQr(data.totp.qr_code || null);
    }
    setCode("");
  }

  async function confirmEnroll() {
    if (!enrollId || code.trim().length < 6) return;
    setBusy(true);
    const ok = await mfaVerifyEnrollment(enrollId, code.trim());
    setBusy(false);
    if (!ok) return;
    setEnrollId(null);
    setSecret(null);
    setQr(null);
    setCode("");
    await refresh();
  }

  async function confirmDisableTotp() {
    if (!disableId || disableCode.trim().length < 6) return;
    setBusy(true);
    const verified = await mfaChallengeAndVerify(disableId, disableCode.trim());
    if (!verified) {
      setBusy(false);
      return;
    }
    const ok = await mfaUnenroll(disableId);
    setBusy(false);
    if (!ok) return;
    setDisableId(null);
    setDisableCode("");
    await refresh();
  }

  async function removeWebauthnFactor(factor: MfaFactor) {
    setBusy(true);
    // Re-prove possession with the same key before unenrolling when possible.
    const proved = await mfaAuthenticatePasskeyFactor(factor.id);
    if (!proved) {
      setBusy(false);
      return;
    }
    await mfaUnenroll(factor.id);
    setBusy(false);
    await refresh();
  }

  async function linkPasskeyAs2fa() {
    if (!supportsWebAuthn) return;
    setBusy(true);
    const name = passkeyName.trim() || "Passkey";
    await mfaRegisterPasskeyFactor(name);
    setBusy(false);
    setPasskeyName("");
    await refresh();
  }

  async function linkAccountPasskey() {
    if (!supportsWebAuthn) return;
    setBusy(true);
    await passkeyRegister(passkeyName.trim() || undefined);
    setBusy(false);
    setPasskeyName("");
    await refresh();
  }

  async function removeAccountPasskey(id: string) {
    setBusy(true);
    await passkeyDelete(id);
    setBusy(false);
    await refresh();
  }

  const totpOn = totpFactors.length > 0;
  const any2fa = totpOn || webauthnFactors.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-rail p-4">
        <div className="mb-2 flex items-center gap-2">
          {any2fa ? <ShieldCheck className="size-5 text-ok" /> : <ShieldOff className="size-5 text-sub" />}
          <div className="text-sm font-bold">Two-factor authentication</div>
        </div>
        <p className="mb-3 text-xs text-sub">
          Link Authy (or Google Authenticator / 1Password) for a 6-digit code after your password, or a passkey / security key as a second factor.
        </p>

        {loading ? (
          <p className="text-xs text-sub">Checking…</p>
        ) : (
          <div className="space-y-4">
            {/* Authy / TOTP */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-sub uppercase">
                <KeyRound className="size-3.5" /> Authy / authenticator app
              </div>
              {totpOn && !enrollId ? (
                <div className="space-y-2">
                  <div className="rounded-lg bg-ok/15 px-3 py-2 text-xs font-semibold text-ok">
                    Authy linked · {totpFactors.length} authenticator{totpFactors.length === 1 ? "" : "s"}
                  </div>
                  {totpFactors.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-side px-3 py-2">
                      <div className="min-w-0 flex-1 text-sm font-semibold">{f.friendly_name || "Authy"}</div>
                      {disableId === f.id ? (
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                          <input
                            value={disableCode}
                            onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="6-digit code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            className="min-w-0 flex-1 rounded-md bg-rail px-3 py-1.5 text-sm outline-none ring-accent focus:ring-1 sm:w-28 sm:flex-none"
                          />
                          <button type="button" disabled={busy || disableCode.length < 6} onClick={() => void confirmDisableTotp()} className="rounded-md bg-dnd px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                            Confirm off
                          </button>
                          <button type="button" onClick={() => { setDisableId(null); setDisableCode(""); }} className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setDisableId(f.id); setDisableCode(""); }} className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-dnd/30">
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" disabled={busy} onClick={() => void startEnroll()} className="text-xs font-semibold text-accent hover:underline disabled:opacity-40">
                    Add another authenticator
                  </button>
                </div>
              ) : enrollId ? (
                <div className="space-y-3">
                  <p className="text-xs text-sub">Scan this QR in Authy (or any authenticator), then enter the 6-digit code.</p>
                  {qr && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="Authy QR code" className="mx-auto rounded-xl bg-white p-2" width={200} height={200} />
                  )}
                  {secret && (
                    <p className="break-all rounded-lg bg-side px-3 py-2 font-mono text-[11px] text-sub">
                      Manual key: <span className="text-txt">{secret}</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="min-w-0 flex-1 rounded-md bg-side px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
                    />
                    <button type="button" disabled={busy || code.length < 6} onClick={() => void confirmEnroll()} className="rounded-md bg-ok px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                      Verify & link
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (enrollId) void mfaUnenroll(enrollId);
                        setEnrollId(null);
                        setSecret(null);
                        setQr(null);
                        setCode("");
                      }}
                      className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startEnroll()}
                  className={cn("rounded-md bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-2 disabled:opacity-40")}
                >
                  Link Authy
                </button>
              )}
            </div>

            {/* Passkey as MFA factor */}
            <div className="space-y-2 border-t border-white/5 pt-3">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-sub uppercase">
                <Fingerprint className="size-3.5" /> Passkey as 2FA
              </div>
              <p className="text-xs text-sub">Use Face ID, Touch ID, Windows Hello, or a security key after your password.</p>
              {webauthnFactors.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-side px-3 py-2">
                  <div className="min-w-0 flex-1 text-sm font-semibold">{f.friendly_name || "Passkey"}</div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeWebauthnFactor(f)}
                    className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-dnd/30 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {supportsWebAuthn ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    value={passkeyName}
                    onChange={(e) => setPasskeyName(e.target.value.slice(0, 64))}
                    placeholder="Name (optional) — e.g. MacBook"
                    className="min-w-0 flex-1 rounded-md bg-side px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void linkPasskeyAs2fa()}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-2 disabled:opacity-40"
                  >
                    Link passkey for 2FA
                  </button>
                </div>
              ) : (
                <p className="text-xs text-sub">This browser doesn&apos;t support passkeys.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Account passkeys (passwordless sign-in) */}
      <div className="rounded-xl bg-rail p-4">
        <div className="mb-2 flex items-center gap-2">
          <Fingerprint className="size-5 text-accent" />
          <div className="text-sm font-bold">Sign-in passkeys</div>
        </div>
        <p className="mb-3 text-xs text-sub">
          Link a discoverable passkey so you can sign in without typing your password (still works alongside Authy 2FA when enrolled).
        </p>
        {loading ? (
          <p className="text-xs text-sub">Checking…</p>
        ) : (
          <div className="space-y-2">
            {passkeys.length === 0 ? (
              <p className="text-xs text-sub">No sign-in passkeys linked yet.</p>
            ) : (
              passkeys.map((pk) => (
                <div key={pk.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-side px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{pk.friendly_name || "Passkey"}</div>
                    <div className="text-[11px] text-sub">
                      Added {new Date(pk.created_at).toLocaleDateString()}
                      {pk.last_used_at ? ` · last used ${new Date(pk.last_used_at).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeAccountPasskey(pk.id)}
                    className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-dnd/30 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            {supportsWebAuthn && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void linkAccountPasskey()}
                className="rounded-md bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15 disabled:opacity-40"
              >
                Link sign-in passkey
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
