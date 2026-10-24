// Nexus — disappearing messages. Called every 15 minutes by pg_cron (x-push-secret header).
// Removes messages older than their chat's timer, including their attachment files.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  const { data: cfg } = await admin.from("push_config").select("secret").eq("id", 1).maybeSingle();
  if (!cfg?.secret || req.headers.get("x-push-secret") !== cfg.secret) return new Response("forbidden", { status: 403 });

  let removed = 0;
  let files = 0;
  for (let round = 0; round < 10; round++) {
    const { data: rows, error } = await admin.rpc("expired_messages", { p_limit: 1000 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!rows?.length) break;
    // attachment files: sb://<bucket>/<path>
    const byBucket = new Map<string, string[]>();
    for (const r of rows as { id: string; attachment_url: string | null }[]) {
      const m = r.attachment_url?.match(/^sb:\/\/([^/]+)\/(.+)$/);
      if (m) byBucket.set(m[1], [...(byBucket.get(m[1]) ?? []), m[2]]);
    }
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 500) {
        const { data } = await admin.storage.from(bucket).remove(paths.slice(i, i + 500));
        files += data?.length ?? 0;
      }
    }
    const ids = (rows as { id: string }[]).map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error: e2 } = await admin.from("messages").delete().in("id", ids.slice(i, i + 200));
      if (e2) return Response.json({ error: e2.message, removed }, { status: 500 });
      removed += Math.min(200, ids.length - i);
    }
    if (rows.length < 1000) break;
  }
  return Response.json({ removed, files });
});
