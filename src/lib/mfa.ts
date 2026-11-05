"use client";

import { supabase, errorText } from "./supabase";
import { toast } from "@/store/app";

export type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
};

export async function mfaAssurance() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return null;
  return data;
}

/** True when password sign-in succeeded but a TOTP challenge is still required. */
export async function mfaNeedsChallenge() {
  const aal = await mfaAssurance();
  return !!aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2";
}

export async function mfaListFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    toast(errorText(error) || "Couldn't load 2FA factors", "error");
    return { totp: [] as MfaFactor[], all: [] as MfaFactor[] };
  }
  return {
    totp: (data?.totp ?? []) as MfaFactor[],
    all: (data?.all ?? []) as MfaFactor[],
  };
}

export async function mfaEnrollTotp(friendlyName = "Nexus") {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error) {
    toast(errorText(error) || "Couldn't start 2FA setup", "error");
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
  toast("Two-factor authentication is on", "success");
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

export async function mfaUnenroll(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    toast(errorText(error) || "Couldn't turn off 2FA", "error");
    return false;
  }
  toast("Two-factor authentication turned off", "info");
  return true;
}
