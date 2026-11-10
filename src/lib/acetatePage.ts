import { createClient } from "@supabase/supabase-js";

export type AcetateShareInfo = {
  ok: boolean;
  reason?: string;
  password?: boolean;
  listing?: "public" | "unlisted";
  download?: boolean;
  kind?: "track" | "project";
  title?: string;
  note?: string | null;
  owner?: string | null;
  owner_name?: string | null;
  track_count?: number;
  expires_at?: string | null;
};

/** Public share card for metadata. No storage paths. */
export async function acetateShareInfo(token: string): Promise<AcetateShareInfo | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const clean = token.replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (clean.length < 16) return null;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.rpc("acetate_share_info", { p_token: clean });
    if (error || !data) return null;
    return data as AcetateShareInfo;
  } catch {
    return null;
  }
}
