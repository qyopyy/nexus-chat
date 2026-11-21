// Deploy with --no-verify-jwt: Spotify callback/public pages are anonymous.
// Owner operations explicitly validate the Supabase JWT and MFA in the handler.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
import { createPresaveHandler } from "./handler.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(createPresaveHandler({ db, env: (name: string) => Deno.env.get(name) }));
