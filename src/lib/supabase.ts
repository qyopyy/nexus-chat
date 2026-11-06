import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

// Placeholder values keep the module importable when env vars are missing;
// the UI shows a setup screen in that case instead of making calls.
export const supabase: SupabaseClient = createClient(
  url || "http://localhost:54321",
  key || "missing-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      // Opt into passkeys / WebAuthn (Authy TOTP uses MFA; passkeys use this flag).
      experimental: { passkey: true },
    },
    realtime: { params: { eventsPerSecond: 40 } },
  },
);

export function errorText(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}
