"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Globe, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";

type Row = { domain: string; token: string; status: "pending" | "verified" | "live"; note: string | null };

/** "me.yourname.co.uk" → "me" ("" for the bare domain) — the record names your DNS provider expects */
const subPart = (d: string) => {
  const p = d.split(".");
  const two = p.length >= 3 && p[p.length - 1].length === 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(p[p.length - 2]);
  return p.slice(0, Math.max(0, p.length - (two ? 3 : 2))).join(".");
};

/** Settings → My Account: point your own domain (yourname.com) at your Nexus profile. */
export default function CustomDomain() {
  const [row, setRow] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("profile_domains").select("domain,token,status,note").maybeSingle();
    setRow((data as Row) ?? null);
    setLoaded(true);
  }, []);
  useEffect(() => void load(), [load]);

  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("set_profile_domain", { p_domain: val });
    setBusy(false);
    if (error) return toast(error.message, "error");
    setRow(data as Row);
    setVal("");
  };
  const verify = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("domains", { body: { action: "verify" } });
    setBusy(false);
    if (error) return toast("Couldn't check right now — try again", "error");
    const r = data as { status?: Row["status"]; note?: string | null };
    toast(r.status === "live" ? "Your domain is live 🎉" : (r.note ?? "Checked"), r.status === "pending" ? "error" : "success");
    void load();
  };
  const remove = async () => {
    setBusy(true);
    await supabase.functions.invoke("domains", { body: { action: "remove" } });
    setBusy(false);
    setRow(null);
  };
  const copy = (t: string) => {
    void navigator.clipboard?.writeText(t);
    toast("Copied", "success");
  };

  if (!loaded) return null;
  const Rec = ({ type, name, value }: { type: string; name: string; value: string }) => (
    <div className="grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-lg bg-rail px-2.5 py-2 text-xs">
      <b className="text-accent">{type}</b>
      <div className="min-w-0">
        <div className="truncate font-mono">{name}</div>
        <div className="truncate font-mono text-sub">{value}</div>
      </div>
      <button onClick={() => copy(value)} className="grid size-7 place-items-center rounded-md hover:bg-hover" aria-label={`Copy ${type} value`}>
        <Copy className="size-3.5" />
      </button>
    </div>
  );

  return (
    <div>
      <div className="mb-2 text-xs font-bold tracking-wide text-sub uppercase">Custom domain</div>
      {!row ? (
        <>
          <p className="mb-2 text-xs text-sub">Use your own domain (like yourname.com) as the link to your Nexus profile.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex gap-2"
          >
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="yourname.com"
              inputMode="url"
              autoCapitalize="none"
              className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
            />
            <button disabled={busy || !val.trim()} className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-40">
              Connect
            </button>
          </form>
        </>
      ) : (
        <div className="space-y-2 rounded-xl bg-side p-3">
          <div className="flex items-center gap-2">
            <Globe className="size-4 shrink-0 text-sub" />
            <a href={`https://${row.domain}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold hover:underline">
              {row.domain}
            </a>
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", row.status === "live" ? "bg-ok/20 text-ok" : row.status === "verified" ? "bg-accent/20 text-accent" : "bg-idle/20 text-idle")}>
              {row.status !== "pending" && <CheckCircle2 className="size-3" />}
              {row.status === "live" ? "Live" : row.status === "verified" ? "Verified" : "Waiting for DNS"}
            </span>
          </div>
          {row.status !== "live" && (
            <>
              <p className="text-xs text-sub">Add these records where you bought the domain (GoDaddy, Namecheap, Cloudflare…), then tap Check.</p>
              <Rec type="TXT" name={`_nexus${subPart(row.domain) ? `.${subPart(row.domain)}` : ""}`} value={`nexus-verify=${row.token}`} />
              {subPart(row.domain) ? <Rec type="CNAME" name={subPart(row.domain)} value="cname.vercel-dns.com" /> : <Rec type="A" name="@" value="76.76.21.21" />}
            </>
          )}
          {row.note && <p className="text-xs text-sub">{row.note}</p>}
          {row.status === "live" && <p className="text-xs text-sub">https://{row.domain} now opens your profile.</p>}
          <div className="flex gap-2">
            {row.status !== "live" && (
              <button onClick={() => void verify()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-50">
                <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Check
              </button>
            )}
            <button onClick={() => void remove()} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-md bg-hover px-3 py-2 text-sm font-semibold hover:bg-dnd hover:text-white disabled:opacity-50">
              <Trash2 className="size-4" /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
