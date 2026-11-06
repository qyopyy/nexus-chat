"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";

export type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
};

export type LinkedPasskey = {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
};

function rp() {
  if (typeof window === "undefined") return {};
  const host = window.location.hostname;
  // Apex / production host — keep stable; changing RP ID invalidates existing passkeys.
  const rpId =
    host === "localhost" || host === "127.0.0.1"
      ? host
      : host.endsWith(".nexusproject.cc") || host === "nexusproject.cc"
        ? "nexusproject.cc"
        : host.replace(/^www\./, "");
  return { rpId, rpOrigins: [window.location.origin] };
}

export async function mfaAssurance() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return null;
  return data;
}

/** True when password sign-in succeeded but an AAL2 challenge is still required. */
export async function mfaNeedsChallenge() {
  const aal = await mfaAssurance();
  return !!aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2";
}

export async function mfaListFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    toast(errorText(error) || "Couldn't load 2FA factors", "error");
    return { totp: [] as MfaFactor[], webauthn: [] as MfaFactor[], all: [] as MfaFactor[] };
  }
  const all = (data?.all ?? []) as MfaFactor[];
  const totp = (data?.totp ?? all.filter((f) => f.factor_type === "totp")) as MfaFactor[];
  const webauthn = all.filter((f) => f.factor_type === "webauthn");
  return { totp, webauthn, all };
}

/** Enroll Authy / Google Authenticator / 1Password TOTP. */
export async function mfaEnrollTotp(friendlyName = "Authy") {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error) {
    toast(errorText(error) || "Couldn't start authenticator setup", "error");
    return null;
  }
  return data as {
    id: string;
    type: string;
    totp: { qr_code: string; secret: string; uri: string };
  };
}

export async function mfaVerifyEnrollment(factorId: string, code: string) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    toast(errorText(challenge.error) || "Couldn't start verification", "error");
    return false;
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.replace(/\s/g, ""),
  });
  if (error) {
    toast(errorText(error) || "Invalid authenticator code", "error");
    return false;
  }
  toast("Authenticator linked", "success");
  return true;
}

export async function mfaChallengeAndVerify(factorId: string, code: string) {
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ""),
  });
  if (error) {
    toast(errorText(error) || "Invalid authenticator code", "error");
    return false;
  }
  return !!data;
}

/** Register a passkey / security key as an MFA (AAL2) factor. */
export async function mfaRegisterPasskeyFactor(friendlyName = "Passkey") {
  try {
    const { data, error } = await supabase.auth.mfa.webauthn.register({
      friendlyName,
      webauthn: rp(),
    });
    if (error) {
      toast(errorText(error) || "Couldn't register passkey for 2FA", "error");
      return false;
    }
    toast("Passkey linked for 2FA", "success");
    return !!data;
  } catch (e) {
    toast(errorText(e) || "Passkey registration cancelled", "error");
    return false;
  }
}

/** Complete an MFA challenge with a linked WebAuthn / passkey factor. */
export async function mfaAuthenticatePasskeyFactor(factorId: string) {
  try {
    const { data, error } = await supabase.auth.mfa.webauthn.authenticate({
      factorId,
      webauthn: rp(),
    });
    if (error) {
      toast(errorText(error) || "Passkey verification failed", "error");
      return false;
    }
    return !!data;
  } catch (e) {
    toast(errorText(e) || "Passkey cancelled", "error");
    return false;
  }
}

export async function mfaUnenroll(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    toast(errorText(error) || "Couldn't remove 2FA method", "error");
    return false;
  }
  toast("2FA method removed", "info");
  return true;
}

function asPasskeyList(data: unknown): LinkedPasskey[] {
  if (Array.isArray(data)) return data as LinkedPasskey[];
  if (data && typeof data === "object" && Array.isArray((data as { passkeys?: unknown }).passkeys)) {
    return (data as { passkeys: LinkedPasskey[] }).passkeys;
  }
  return [];
}

/** Passwordless / account-linked passkeys (discoverable credentials). */
export async function passkeyList(): Promise<LinkedPasskey[]> {
  try {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) return [];
    return asPasskeyList(data);
  } catch {
    return [];
  }
}

export async function passkeyRegister(friendlyName?: string) {
  try {
    const { data, error } = await supabase.auth.registerPasskey();
    if (error) {
      const msg = errorText(error);
      if (/passkey_disabled|disabled/i.test(msg)) {
        toast("Passkeys aren't enabled on this project yet. Ask an admin to turn them on in Authentication → Passkeys.", "error");
      } else {
        toast(msg || "Couldn't link passkey", "error");
      }
      return null;
    }
    const linked = data as LinkedPasskey;
    if (friendlyName?.trim() && linked?.id) {
      await supabase.auth.passkey.update({ passkeyId: linked.id, friendlyName: friendlyName.trim().slice(0, 120) });
      linked.friendly_name = friendlyName.trim().slice(0, 120);
    }
    toast("Passkey linked to your account", "success");
    return linked;
  } catch (e) {
    toast(errorText(e) || "Passkey cancelled", "error");
    return null;
  }
}

export async function passkeyDelete(passkeyId: string) {
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  if (error) {
    toast(errorText(error) || "Couldn't remove passkey", "error");
    return false;
  }
  toast("Passkey removed", "info");
  return true;
}

export async function passkeyRename(passkeyId: string, friendlyName: string) {
  const { error } = await supabase.auth.passkey.update({ passkeyId, friendlyName });
  if (error) {
    toast(errorText(error) || "Couldn't rename passkey", "error");
    return false;
  }
  return true;
}

export async function signInWithPasskey() {
  try {
    const { data, error } = await supabase.auth.signInWithPasskey();
    if (error) {
      const msg = errorText(error);
      if (/passkey_disabled|disabled/i.test(msg)) {
        toast("Passkey sign-in isn't enabled yet.", "error");
      } else {
        toast(msg || "Passkey sign-in failed", "error");
      }
      return false;
    }
    return !!data?.session;
  } catch (e) {
    toast(errorText(e) || "Passkey sign-in cancelled", "error");
    return false;
  }
}

export function webAuthnSupported() {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}
