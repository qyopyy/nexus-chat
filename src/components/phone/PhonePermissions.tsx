"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { myDevices } from "@/lib/locator";
import { platformLabel, type Handset } from "@/lib/handset";
import { DEFAULT_GRANT, loadGrant, saveGrant, type HandsetGrant } from "@/lib/phoneLink";

const FIELDS: { key: keyof Omit<HandsetGrant, "user_id" | "device_id">; label: string; hint: string }[] = [
  { key: "clipboard", label: "Clipboard", hint: "Send text both ways. A read still asks on the phone." },
  { key: "files", label: "Files", hint: "Drag files from this computer. The phone does not upload its camera roll alone." },
  { key: "chats", label: "Chat reply", hint: "Reply to Nexus chats from this computer." },
  { key: "find", label: "Find", hint: "Ring, vibrate, and flashlight." },
  { key: "acetate", label: "Acetate", hint: "Play, seek, sleep, and crossfade on the phone." },
  { key: "focus", label: "Focus", hint: "Silence Nexus notifications on that phone. Not iOS Focus." },
  { key: "screenshot", label: "Screenshot", hint: "Off until you enable it. The phone still has to confirm, and you take the shot." },
  { key: "gallery", label: "Gallery", hint: "Off until you enable it. The phone still has to confirm, and you pick the photos." },
];

export default function PhonePermissions() {
  const [rows, setRows] = useState<Handset[]>([]);
  const [grants, setGrants] = useState<Record<string, HandsetGrant | null>>({});

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      useApp.setState({ userId: id });
      const list = await myDevices();
      setRows(list.filter((row) => row.kind === "phone"));
      const next: Record<string, HandsetGrant | null> = {};
      for (const row of list) next[row.device_id] = await loadGrant(row.device_id);
      setGrants(next);
    });
  }, []);

  async function toggle(deviceId: string, key: (typeof FIELDS)[number]["key"], value: boolean) {
    try {
      await saveGrant(deviceId, { [key]: value });
      setGrants((current) => ({
        ...current,
        [deviceId]: { ...(current[deviceId] ?? { ...DEFAULT_GRANT, user_id: "", device_id: deviceId }), [key]: value } as HandsetGrant,
      }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save that", "error");
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-3xl px-5 py-8 pb-24">
        <Link href="/phone" className="text-sm text-[#8d8880]">Phone Link</Link>
        <h1 className="mt-3 font-serif text-4xl">Permissions</h1>
        <p className="mt-2 text-sm text-[#a39e96]">Each phone decides what this account's computers can ask. Screenshot and gallery stay off until you turn them on, and the phone still confirms those actions. These switches do not grant access to SMS, iMessage, or the system notification shade.</p>
        <div className="mt-6 space-y-6">
          {rows.map((row) => {
            const grant = { ...DEFAULT_GRANT, ...grants[row.device_id] };
            return (
              <section key={row.device_id} className="rounded-3xl border border-white/10 p-4">
                <h2 className="font-semibold">{row.label}</h2>
                <p className="text-xs text-[#8d8880]">{platformLabel(row.platform)}{row.model ? ` · ${row.model}` : ""}</p>
                <ul className="mt-3 space-y-3">
                  {FIELDS.map((field) => (
                    <li key={field.key} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-sm font-semibold">{field.label}</span>
                        <span className="block text-xs text-[#8d8880]">{field.hint}</span>
                      </span>
                      <input type="checkbox" checked={!!grant[field.key]} onChange={(e) => void toggle(row.device_id, field.key, e.target.checked)} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {rows.length === 0 && <p className="text-sm text-[#8d8880]">No phone has signed into this account yet.</p>}
        </div>
      </main>
    </div>
  );
}
