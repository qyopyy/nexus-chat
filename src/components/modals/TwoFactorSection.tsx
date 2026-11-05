"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  mfaChallengeAndVerify,
  mfaEnrollTotp,
  mfaListFactors,
  mfaUnenroll,
  mfaVerifyEnrollment,
  type MfaFactor,
} from "@/lib/mfa";
import { cn } from "@/lib/utils";

/** Account security — authenticator app (TOTP) 2FA via Supabase MFA */
export default function TwoFactorSection() {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disableId, setDisableId] = useState<string | null>(null);
  const [disableCode, setDisableCode] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const { totp } = await mfaListFactors();
    setFactors(totp.filter((f) => f.status === "verified"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnroll() {
    setBusy(true);
    const data = await mfaEnrollTotp("Nexus");
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

  async function confirmDisable() {
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

  const enabled = factors.length > 0;

  return (
    <div className="rounded-xl bg-rail p-4">
      <div className="mb-2 flex items-center gap-2">
        {enabled ? <ShieldCheck className="size-5 text-ok" /> : <ShieldOff className="size-5 text-sub" />}
        <div className="text-sm font-bold">Two-factor authentication</div>
      </div>
      <p className="mb-3 text-xs text-sub">
        Protect your account with an authenticator app (Google Authenticator, 1Password, Authy). You’ll enter a 6-digit code after your password when signing in.
      </p>

      {loading ? (
        <p className="text-xs text-sub">Checking…</p>
      ) : enabled && !enrollId ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-ok/15 px-3 py-2 text-xs font-semibold text-ok">2FA is on · {factors.length} authenticator{factors.length === 1 ? "" : "s"}</div>
          {factors.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-side px-3 py-2">
              <div className="min-w-0 flex-1 text-sm font-semibold">{f.friendly_name || "Authenticator"}</div>
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
                  <button type="button" disabled={busy || disableCode.length < 6} onClick={() => void confirmDisable()} className="rounded-md bg-dnd px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                    Confirm off
                  </button>
                  <button type="button" onClick={() => { setDisableId(null); setDisableCode(""); }} className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => { setDisableId(f.id); setDisableCode(""); }} className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-dnd/30">
                  Turn off
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
          <p className="text-xs text-sub">Scan this QR with your authenticator app, then enter the 6-digit code.</p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="2FA QR code" className="mx-auto rounded-xl bg-white p-2" width={200} height={200} />
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
              Verify & enable
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
          Enable 2FA
        </button>
      )}
    </div>
  );
}
