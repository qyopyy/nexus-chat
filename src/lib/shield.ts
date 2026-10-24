"use client";

// Nexus Shield 360 — our own audio-fingerprint content protection (in the spirit of Audible Magic / DistroLock).
// Fingerprints are spectral-peak landmark pairs (the technique music recognition apps use), computed in the browser:
//   8 kHz mono → STFT (1024 / hop 512 ≈ 64 ms) → strongest peak per band per frame → anchor/target pairs
//   hash = f1(9 bits) | f2(9 bits) | Δt(6 bits), stored with the anchor's frame time.
// Matching counts hashes that line up at the same time offset, so it survives re-encoding, volume changes and cuts.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { clipFromMedia, decodeFile, decodeLimit, fft, resample } from "./audio";

export const SR = 8000;
const N = 1024;
const HOP = 512;
const BANDS = [
  [6, 16],
  [16, 32],
  [32, 64],
  [64, 128],
  [128, 256],
  [256, 480],
] as const; // bins (≈ 47 Hz … 3.75 kHz)
const FAN = 3;
const DT_MAX = 40;

export type Print = { h: number[]; t: number[] };

/** landmark fingerprint of mono 8 kHz audio; frameBase = where this chunk starts in the file (frames) */
export function fingerprint(x: Float32Array, frameBase = 0): Print {
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
  const hann = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const avg = new Float64Array(BANDS.length).fill(-10);
  const peaks: { f: number; b: number; m: number }[][] = [];
  for (let fr = 0; fr < frames; fr++) {
    const o = fr * HOP;
    for (let i = 0; i < N; i++) {
      re[i] = x[o + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    const row: { f: number; b: number; m: number }[] = [];
    BANDS.forEach(([lo, hi], bi) => {
      let best = -1;
      let bm = -Infinity;
      for (let k = lo; k < hi; k++) {
        const m = Math.log(re[k] * re[k] + im[k] * im[k] + 1e-12);
        if (m > bm) ((bm = m), (best = k));
      }
      // keep peaks that stand out from this band's running level
      if (bm > avg[bi] + 0.6 && bm > -14) row.push({ f: best, b: bi, m: bm });
      avg[bi] = avg[bi] * 0.92 + bm * 0.08;
    });
    peaks.push(row);
  }
  const h: number[] = [];
  const t: number[] = [];
  for (let fr = 0; fr < peaks.length; fr++) {
    for (const a of peaks[fr]) {
      let made = 0;
      for (let d = 2; d <= DT_MAX && made < FAN && fr + d < peaks.length; d++) {
        for (const b of peaks[fr + d]) {
          if (Math.abs(b.b - a.b) > 1) continue;
          h.push(((a.f & 511) << 15) | ((b.f & 511) << 6) | (d & 63));
          t.push(fr + frameBase);
          if (++made >= FAN) break;
        }
      }
    }
  }
  return { h, t };
}

/** drop landmarks that repeat a lot (steady drums/loops) — they match everything and identify nothing */
export function distinctive(p: Print, maxRepeats = 4): Print {
  const n = new Map<number, number>();
  for (const h of p.h) n.set(h, (n.get(h) ?? 0) + 1);
  const h: number[] = [];
  const t: number[] = [];
  p.h.forEach((x, i) => {
    if ((n.get(x) ?? 0) <= maxRepeats) {
      h.push(x);
      t.push(p.t[i]);
    }
  });
  return { h, t };
}

const isMedia = (f: File) => f.type.startsWith("audio/") || f.type.startsWith("video/") || /\.(wav|flac|mp3|m4a|aac|ogg|opus|aiff?|mp4|mov|webm|mkv)$/i.test(f.name);

async function sha256(file: Blob) {
  if (file.size > 400 * 1024 * 1024) return null;
  const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pcmFromWav(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = (bytes.length - 44) / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = v.getInt16(44 + i * 2, true) / 32768;
  return x;
}

/** sample a few 10 s windows (start of the hook-ish parts) of a file to check */
async function queryPrint(file: File): Promise<Print | null> {
  try {
    if (file.size <= decodeLimit()) {
      const buf = await decodeFile(file);
      const d = buf.duration;
      const len = Math.min(10, d);
      const starts = d <= 32 ? [0] : [d * 0.2, d * 0.5, d * 0.75].map((s) => Math.min(s, d - len));
      const out: Print = { h: [], t: [] };
      for (const s of starts) {
        const [x] = await resample(buf, SR, 1, s, len);
        const p = fingerprint(x, Math.round((s * SR) / HOP));
        out.h.push(...p.h);
        out.t.push(...p.t);
      }
      return trim(distinctive(out, 8), 12000);
    }
    // too big to decode on this device: listen to one 12 s stretch
    const x = pcmFromWav(await clipFromMedia(file, 12));
    return trim(distinctive(fingerprint(x, 0), 8), 12000);
  } catch {
    return null; // undecodable → can't fingerprint
  }
}
const trim = (p: Print, max: number): Print => {
  if (p.h.length <= max) return p;
  const step = p.h.length / max;
  const h: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < max; i++) {
    const j = Math.floor(i * step);
    h.push(p.h[j]);
    t.push(p.t[j]);
  }
  return { h, t };
};

export type ShieldHit = { work_id: string; title: string; artist: string | null; owner_id: string; score: number };

/**
 * Check a file before it's uploaded anywhere in Nexus. Returns the protected song it matches (upload must stop) or null.
 * `as` = check on behalf of another user (admins sending a member's release).
 */
export async function shieldCheck(file: File | Blob, context: "chat" | "video" | "release" | "space" | "tool" | "send", as?: string): Promise<ShieldHit | null> {
  const f = file instanceof File ? file : new File([file], "audio", { type: file.type });
  if (!isMedia(f)) return null;
  const [print, hash] = await Promise.all([queryPrint(f), sha256(f).catch(() => null)]);
  if (!print?.h.length && !hash) return null;
  const { data, error } = await supabase.rpc("shield_check", { p_hashes: print?.h ?? [], p_times: print?.t ?? [], p_context: context, p_as: as ?? null, p_sha256: hash });
  if (error) return null; // fail open on network errors — distribution is re-checked by admins
  const hit = ((data ?? []) as ShieldHit[])[0] ?? null;
  if (hit && context !== "tool") void supabase.rpc("shield_log", { p_work: hit.work_id, p_context: context, p_score: hit.score });
  return hit;
}

/** shows the standard "blocked" message; returns true when the upload must stop */
export async function shieldGate(file: File | Blob, context: Parameters<typeof shieldCheck>[1], as?: string) {
  const hit = await shieldCheck(file, context, as);
  if (!hit) return false;
  toast(`🛡️ Blocked by Nexus Shield: “${hit.title}”${hit.artist ? ` by ${hit.artist}` : ""} is protected. Ask the owner to unlock it.`, "error");
  return true;
}

// ------------------------------------------------------------------ owners: register + manage songs
export type ShieldWork = {
  id: string;
  owner_id: string;
  title: string;
  artist: string | null;
  isrc: string | null;
  upc: string | null;
  acr_id: string | null;
  acr_status: "pending" | "ready" | "error" | "skipped" | null;
  acr_error: string | null;
  status: "locked" | "unlocked";
  unlock_at: string | null;
  allow_users: string[];
  file_path: string | null;
  file_name: string | null;
  bytes: number | null;
  duration: number | null;
  sha256: string | null;
  hash_count: number;
  created_at: string;
  updated_at: string;
};
export type ShieldEvent = { id: number; work_id: string; user_id: string | null; context: string; score: number; at: string };

export const isLive = (w: ShieldWork) => w.status === "locked" && (!w.unlock_at || new Date(w.unlock_at) > new Date());

export async function listWorks(all = false) {
  let q = supabase.from("shield_works").select("*").order("created_at", { ascending: false }).limit(500);
  if (!all) q = q.eq("owner_id", useApp.getState().userId);
  const { data } = await q;
  return (data ?? []) as ShieldWork[];
}
export async function listEvents(workIds: string[]) {
  if (!workIds.length) return [];
  const { data } = await supabase.from("shield_events").select("*").in("work_id", workIds).order("at", { ascending: false }).limit(200);
  return (data ?? []) as ShieldEvent[];
}
export async function updateWork(id: string, patch: Partial<ShieldWork>) {
  const { data, error } = await supabase.from("shield_works").update(patch).eq("id", id).select().single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as ShieldWork;
}
export async function removeWork(w: ShieldWork) {
  await supabase.functions.invoke("audiocheck", { body: { action: "shield_remove", work_id: w.id } }).catch(() => null);
  const docs = await listDocs(w.id);
  const paths = [...(w.file_path ? [w.file_path] : []), ...docs.map((d) => d.path)];
  if (paths.length) await supabase.storage.from("shield-vault").remove(paths);
  const { error } = await supabase.from("shield_works").delete().eq("id", w.id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function vaultUrl(w: ShieldWork) {
  if (!w.file_path) return null;
  const { data } = await supabase.storage.from("shield-vault").createSignedUrl(w.file_path, 600, { download: w.file_name ?? true });
  return data?.signedUrl ?? null;
}

// ------------------------------------------------------------------ ACRCloud custom bucket
/** send the vault copy to the ACRCloud custom bucket so ACRCloud recognises it too */
export async function syncAcr(workId: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("audiocheck", { body: { action: "shield_upload", work_id: workId } });
  if (error) {
    let msg = errorText(error);
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    return { ok: false, error: msg };
  }
  return data as { ok: boolean; skipped?: boolean };
}

// ------------------------------------------------------------------ documents (contracts, split sheets, proof…)
export type ShieldDoc = { id: string; work_id: string; owner_id: string; kind: DocKind; name: string; path: string; mime: string | null; bytes: number | null; created_at: string };
export type DocKind = "contract" | "split_sheet" | "proof" | "license" | "artwork" | "other";
export const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: "contract", label: "Contract" },
  { id: "split_sheet", label: "Split sheet" },
  { id: "proof", label: "Proof of ownership" },
  { id: "license", label: "Licence / sample clearance" },
  { id: "artwork", label: "Artwork" },
  { id: "other", label: "Other" },
];
export const DOC_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.rtf,.odt,application/pdf,image/*";
const DOC_MAX = 25 * 1024 * 1024;

export async function listDocs(workId: string) {
  const { data } = await supabase.from("shield_docs").select("*").eq("work_id", workId).order("created_at", { ascending: false });
  return (data ?? []) as ShieldDoc[];
}
export async function uploadDoc(workId: string, file: File, kind: DocKind) {
  if (file.size > DOC_MAX) {
    toast("Documents can be up to 25 MB", "error");
    return null;
  }
  const me = useApp.getState().userId!;
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${me}/${workId}/docs/${crypto.randomUUID().slice(0, 8)}-${safe}`;
  const up = await supabase.storage.from("shield-vault").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) {
    toast(`Upload failed: ${up.error.message}`, "error");
    return null;
  }
  const { data, error } = await supabase
    .from("shield_docs")
    .insert({ work_id: workId, owner_id: me, kind, name: file.name.slice(0, 300), path, mime: file.type || null, bytes: file.size })
    .select()
    .single();
  if (error) {
    await supabase.storage.from("shield-vault").remove([path]);
    toast(errorText(error), "error");
    return null;
  }
  return data as ShieldDoc;
}
export async function docUrl(d: ShieldDoc, download = false) {
  const { data } = await supabase.storage.from("shield-vault").createSignedUrl(d.path, 600, download ? { download: d.name } : undefined);
  return data?.signedUrl ?? null;
}
export async function removeDoc(d: ShieldDoc) {
  await supabase.storage.from("shield-vault").remove([d.path]);
  const { error } = await supabase.from("shield_docs").delete().eq("id", d.id);
  if (error) toast(errorText(error), "error");
  return !error;
}

export type RegisterStep = { step: string; p: number };
/** fingerprint the whole song, keep the original in the owner-only vault, lock it */
export async function registerWork(file: File, meta: { title: string; artist?: string; isrc?: string; upc?: string; docs?: { file: File; kind: DocKind }[]; unlock_at?: string | null; allow_users?: string[]; keepFile: boolean }, onStep: (s: RegisterStep) => void) {
  const me = useApp.getState().userId!;
  onStep({ step: "Reading audio…", p: 0.02 });
  const buf = await decodeFile(file);
  const hash = await sha256(file).catch(() => null);
  onStep({ step: "Fingerprinting…", p: 0.1 });
  // whole track, in 60 s chunks so the page stays responsive
  const print: Print = { h: [], t: [] };
  const CH = 60;
  for (let s = 0; s < buf.duration; s += CH) {
    const len = Math.min(CH + (N / SR), buf.duration - s);
    const [x] = await resample(buf, SR, 1, s, len);
    const p = fingerprint(x, Math.round((s * SR) / HOP));
    print.h.push(...p.h);
    print.t.push(...p.t);
    onStep({ step: "Fingerprinting…", p: 0.1 + 0.4 * Math.min(1, (s + CH) / buf.duration) });
    await new Promise((r) => setTimeout(r, 0));
  }
  if (distinctive(print, 30).h.length < 200) throw new Error("Couldn't hear enough music in this file to protect it");
  const fp = trim(distinctive(print, 30), 400000);

  const { data: w, error } = await supabase
    .from("shield_works")
    .insert({ owner_id: me, title: meta.title.slice(0, 200), artist: meta.artist?.slice(0, 200) || null, isrc: meta.isrc || null, upc: meta.upc || null, unlock_at: meta.unlock_at || null, allow_users: meta.allow_users ?? [], file_name: file.name.slice(0, 300), bytes: file.size, duration: buf.duration })
    .select()
    .single();
  if (error || !w) throw new Error(errorText(error));
  try {
    if (meta.keepFile) {
      onStep({ step: "Saving the original to your private vault…", p: 0.55 });
      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${me}/${w.id}/original.${ext}`;
      const up = await supabase.storage.from("shield-vault").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: true });
      if (up.error) throw new Error(`Vault upload failed: ${up.error.message}`);
      await supabase.from("shield_works").update({ file_path: path }).eq("id", w.id);
    }
    const B = 15000;
    for (let i = 0; i < fp.h.length; i += B) {
      const { error: e2 } = await supabase.rpc("shield_add_hashes", { p_work: w.id, p_hashes: fp.h.slice(i, i + B), p_times: fp.t.slice(i, i + B), p_sha256: i === 0 ? hash : null });
      if (e2) throw new Error(errorText(e2));
      onStep({ step: "Locking…", p: 0.7 + 0.3 * Math.min(1, (i + B) / fp.h.length) });
    }
  } catch (e) {
    await supabase.from("shield_works").delete().eq("id", w.id);
    throw e;
  }
  for (const d of meta.docs ?? []) {
    onStep({ step: `Attaching ${d.file.name}…`, p: 0.98 });
    await uploadDoc(w.id, d.file, d.kind);
  }
  if (meta.keepFile) {
    onStep({ step: "Registering with ACRCloud…", p: 0.99 });
    await syncAcr(w.id);
  }
  onStep({ step: "Protected", p: 1 });
  return w as ShieldWork;
}
