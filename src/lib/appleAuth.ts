"use client";

/**
 * Sign in with Apple — native Capacitor plugin when available, else Supabase OAuth.
 * Requires Apple provider enabled in the Supabase dashboard.
 */

import { supabase, errorText } from "./supabase";
import { isNativeApp } from "./useMobile";

type AppleSignInPlugin = {
  authorize: (opts?: {
    clientId?: string;
    redirectURI?: string;
    scopes?: string;
    state?: string;
    nonce?: string;
  }) => Promise<{
    response: {
      identityToken?: string;
      authorizationCode?: string;
      user?: string;
      email?: string;
      givenName?: string;
      familyName?: string;
    };
  }>;
};

function applePlugin(): AppleSignInPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: { Plugins?: { SignInWithApple?: AppleSignInPlugin }; isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.SignInWithApple ?? null;
}

export function appleSignInAvailable() {
  return true; // OAuth always offered; native used when plugin present
}

export async function signInWithApple(): Promise<{ ok: true } | { ok: false; error: string }> {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname.startsWith("/bump") || window.location.pathname.startsWith("/wump") ? "/wump/app" : "/"}`
      : "https://nexusproject.cc/";

  const native = applePlugin();
  if (native && isNativeApp()) {
    try {
      const { response } = await native.authorize({ scopes: "email name" });
      const token = response.identityToken;
      if (!token) return { ok: false, error: "Apple didn’t return an identity token" };
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token,
      });
      if (error) return { ok: false, error: errorText(error) || error.message };
      return { ok: true };
    } catch (e) {
      // Fall through to browser OAuth if native fails (e.g. unsigned Sideloadly)
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(msg)) return { ok: false, error: "Apple sign-in cancelled" };
    }
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo,
      skipBrowserRedirect: false,
    },
  });
  if (error) return { ok: false, error: errorText(error) || error.message };
  return { ok: true };
}
