"use client";

// License Maker — exclusive artwork licenses as rows; each row turns into a PDF.
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { buildLicensePdf, docTitle, emptyLicensor, today, type License, type Licensor } from "./licenseDoc";

export * from "./licenseDoc";
const me = () => useApp.getState().userId!;

// ------------------------------------------------------------------ data
export async function listLicenses() {
  const { data } = await supabase.from("licenses").select("*").eq("owner_id", me()).order("effective_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  return (data ?? []) as License[];
}
export async function addLicense(row: Partial<License>) {
  const { data, error } = await supabase
    .from("licenses")
    .insert({ owner_id: me(), title: row.title?.trim() || "Untitled", artist: row.artist?.trim() || "Artist", effective_date: row.effective_date || today(), fee: row.fee ?? 80, currency: row.currency ?? "USD", release_type: row.release_type ?? "Single", artwork_desc: row.artwork_desc ?? null, payment_method: row.payment_method ?? null, ai_disclosure: row.ai_disclosure ?? true })
    .select()
    .single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as License;
}
export async function saveLicense(id: string, patch: Partial<License>) {
  const { data, error } = await supabase.from("licenses").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) toast(errorText(error), "error");
  return (data ?? null) as License | null;
}
export async function removeLicense(id: string) {
  const { error } = await supabase.from("licenses").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function getLicensor(): Promise<Licensor> {
  const { data } = await supabase.from("license_profiles").select("data").eq("owner_id", me()).maybeSingle();
  return { ...emptyLicensor(), ...((data?.data as Partial<Licensor>) ?? {}) };
}
export async function saveLicensor(l: Licensor) {
  const { error } = await supabase.from("license_profiles").upsert({ owner_id: me(), data: l, updated_at: new Date().toISOString() });
  if (error) toast(errorText(error), "error");
  return !error;
}

export function downloadLicense(l: License, lic: Licensor, open = false) {
  const bytes = buildLicensePdf(l, lic);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, "_blank");
  else {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docTitle(l).replace(/[\\/:*?"<>|]+/g, "")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
