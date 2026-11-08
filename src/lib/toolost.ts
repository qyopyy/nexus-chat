"use client";

/** Too Lost delivery (OAuth 2.0 via the `toolost` edge function). Docs: https://developer.toolost.com/docs */
import { supabase, errorText } from "./supabase";
import type { DistTrack } from "./types";

export type TooLostEnv = "sandbox" | "production";
export type TooLostEnvStatus = { client_id: string | null; has_secret: boolean; connected: boolean; connected_at: string | null; expires_at: string | null; account: string | null };
export type TooLostStatus = { env: TooLostEnv; envs: Record<TooLostEnv, TooLostEnvStatus> };

export class TooLostError extends Error {
  constructor(message: string, public detail?: { genres?: string[] }) {
    super(message);
  }
}

export async function toolost<T = any>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("toolost", { body: { action, ...args } });
  if (error) {
    let msg = errorText(error);
    let detail;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
      detail = j?.detail;
    } catch {
      /* not json */
    }
    if (/Failed to send a request|FunctionsFetchError|not found/i.test(msg)) msg = "The Too Lost connector isn't deployed yet";
    throw new TooLostError(msg, detail);
  }
  return data as T;
}

export async function tooLostStatus() {
  const { data, error } = await supabase.rpc("admin_toolost_status");
  if (error) throw new Error(errorText(error));
  return data as TooLostStatus;
}
export async function saveTooLostClient(env: TooLostEnv, clientId: string, secret: string) {
  const { data, error } = await supabase.rpc("admin_set_toolost_client", { p_env: env, p_client_id: clientId, p_client_secret: secret || null });
  if (error) throw new Error(errorText(error));
  return data as TooLostStatus;
}
export async function setTooLostEnv(env: TooLostEnv) {
  const { data, error } = await supabase.rpc("admin_set_toolost_env", { p_env: env });
  if (error) throw new Error(errorText(error));
  return data as TooLostStatus;
}
/** must match REDIRECT in supabase/functions/toolost (SITE_URL) and the URI registered on the Too Lost app */
export const TOOLOST_REDIRECT = () => "https://nexusproject.cc/distro/toolost-callback";

export async function connectTooLost(env: TooLostEnv) {
  const { url } = await toolost<{ url: string }>("auth_url", { env });
  window.location.href = url;
}

export type DeliverStep = { label: string; state: "todo" | "doing" | "done" | "error"; note?: string };

/** create draft → artwork → audio per track → tracklist → submit */
export async function deliverToTooLost(releaseId: string, tracks: DistTrack[], opts: { genre?: string | null; submit: boolean }, onStep: (steps: DeliverStep[]) => void) {
  const steps: DeliverStep[] = [
    { label: "Create Too Lost draft", state: "todo" },
    { label: "Upload artwork", state: "todo" },
    ...tracks.map((t) => ({ label: `Upload audio — ${t.title}`, state: "todo" as const })),
    { label: "Send tracklist & credits", state: "todo" },
    ...(opts.submit ? [{ label: "Submit for review", state: "todo" as const }] : []),
  ];
  const emit = () => onStep(steps.map((s) => ({ ...s })));
  const run = async <T,>(i: number, fn: () => Promise<T>) => {
    steps[i].state = "doing";
    emit();
    try {
      const r = await fn();
      steps[i].state = "done";
      emit();
      return r;
    } catch (e) {
      steps[i].state = "error";
      steps[i].note = (e as Error).message;
      emit();
      throw e;
    }
  };
  const created = await run(0, () => toolost<{ toolost_id: number; genre: string }>("create", { release_id: releaseId, genre: opts.genre || undefined }));
  await run(1, () => toolost("upload_artwork", { release_id: releaseId }));
  const keys: Record<string, string> = {};
  for (const [i, t] of tracks.entries()) {
    const r = await run(2 + i, () => toolost<{ fileKey: string }>("upload_track", { release_id: releaseId, track_id: t.id }));
    keys[t.id] = r.fileKey;
  }
  await run(2 + tracks.length, () => toolost("tracks", { release_id: releaseId, file_keys: keys }));
  if (opts.submit) await run(3 + tracks.length, () => toolost("submit", { release_id: releaseId }));
  return created;
}
