"use client";

// Saved claimant details (name, company, email, phone, postal address) — kept on the account so they follow
// you across devices. Falls back to this browser's copy if the table isn't available.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { emptyContact, loadContact, saveContact, type Contact } from "./takedown";

export type SavedContact = { id: string; label: string; contact: Contact; is_default: boolean };

const clean = (c: Partial<Contact> | null | undefined): Contact => {
  const e = emptyContact();
  const o = (c ?? {}) as Record<string, unknown>;
  return {
    name: String(o.name ?? e.name).slice(0, 120),
    company: String(o.company ?? e.company).slice(0, 120),
    role: o.role === "agent" ? "agent" : "owner",
    email: String(o.email ?? e.email).slice(0, 160),
    phone: String(o.phone ?? e.phone).slice(0, 40),
    address: String(o.address ?? e.address).slice(0, 300),
    country: String(o.country ?? e.country).slice(0, 80),
  };
};

export async function listContacts(): Promise<SavedContact[]> {
  const me = useApp.getState().userId;
  if (!me) return [];
  const { data, error } = await supabase.from("takedown_contacts").select("id,label,contact,is_default").eq("owner_id", me).order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id as string, label: r.label as string, contact: clean(r.contact as Partial<Contact>), is_default: !!r.is_default }));
}

export async function saveContactRow(label: string, contact: Contact, makeDefault: boolean, id?: string | null): Promise<SavedContact | null> {
  const me = useApp.getState().userId;
  if (!me) return null;
  const row = { owner_id: me, label: label.trim().slice(0, 60) || contact.company.trim() || contact.name.trim() || "My details", contact: clean(contact), is_default: makeDefault };
  saveContact(row.contact); // always keep this browser's copy, even if the account table isn't there yet
  const q = id ? supabase.from("takedown_contacts").update(row).eq("id", id).select("id,label,contact,is_default").single() : supabase.from("takedown_contacts").insert(row).select("id,label,contact,is_default").single();
  const { data, error } = await q;
  if (error) {
    toast(/takedown_contacts|relation|schema cache/i.test(error.message) ? "Saved on this device — account sync isn't set up yet" : errorText(error), /takedown_contacts|relation|schema cache/i.test(error.message) ? "info" : "error");
    return null;
  }
  return { id: data.id as string, label: data.label as string, contact: clean(data.contact as Partial<Contact>), is_default: !!data.is_default };
}

export async function deleteContactRow(id: string) {
  const { error } = await supabase.from("takedown_contacts").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}

/** the default saved claimant (or the first one), mirrored into this browser; null if none saved yet */
export async function hydrateContact(): Promise<Contact | null> {
  const list = await listContacts();
  const pick = list.find((c) => c.is_default) ?? list[0];
  if (!pick) return null;
  saveContact(pick.contact);
  return pick.contact;
}

/** is the local copy complete enough to file a notice? */
export const contactComplete = (c: Contact) => !!(c.name.trim() && /^\S+@\S+\.\S+$/.test(c.email.trim()) && c.phone.trim() && c.address.trim() && c.country.trim());
export { loadContact };
