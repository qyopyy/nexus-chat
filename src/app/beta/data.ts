import type { TfApp, TfLink } from "@/lib/testflight";

const base = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** public read of the TestFlight invite links (anon, RLS allows select) */
export async function fetchTfLinks(): Promise<Partial<Record<TfApp, TfLink>>> {
  if (!base() || !key()) return {};
  try {
    const r = await fetch(`${base()}/rest/v1/testflight_links?select=app,url,note,opens,updated_at`, {
      headers: { apikey: key(), Authorization: `Bearer ${key()}` },
      cache: "no-store",
    });
    if (!r.ok) return {};
    const rows = (await r.json()) as TfLink[];
    const out: Partial<Record<TfApp, TfLink>> = {};
    for (const row of rows) out[row.app] = row;
    return out;
  } catch {
    return {};
  }
}

export async function countOpen(app: TfApp) {
  if (!base() || !key()) return;
  try {
    await fetch(`${base()}/rest/v1/rpc/testflight_open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key(), Authorization: `Bearer ${key()}` },
      body: JSON.stringify({ p_app: app }),
      cache: "no-store",
    });
  } catch {
    /* counting is best-effort */
  }
}
