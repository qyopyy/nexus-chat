"use client";

import { useEffect, useState } from "react";
import { FileArchive, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "@/store/app";
import { buildDdexPackage, ddexLog, ddexProblems, getDdex, type DdexConfig, type DdexLog, type DdexProgress } from "@/lib/ddex";
import { cn } from "@/lib/utils";
import type { DistRelease, DistTrack } from "@/lib/types";

const panel = "rounded-2xl bg-side p-3 ring-1 ring-line/60 sm:p-4";
const inp = "min-w-0 w-full rounded-lg bg-black/25 px-3 py-2 text-sm outline-none ring-1 ring-line/60 focus:ring-accent";

/** DDEX ERN 4.3 package for a release: XML (with your Party ID) + resources + MD5s, zipped for SFTP/S3 delivery. */
export default function DdexSend({ r, tracks }: { r: DistRelease; tracks: DistTrack[] }) {
  const [cfg, setCfg] = useState<DdexConfig | null>(null);
  const [to, setTo] = useState("");
  const [update, setUpdate] = useState(false);
  const [test, setTest] = useState(true);
  const [prog, setProg] = useState<DdexProgress | null>(null);
  const [log, setLog] = useState<DdexLog[]>([]);
  useEffect(() => {
    void getDdex()
      .then((c) => {
        setCfg(c);
        setTest(c.test_mode);
        setTo(c.recipients[0]?.dpid ?? "");
      })
      .catch(() => setCfg(null));
    void ddexLog(r.id).then((l) => {
      setLog(l);
      if (l.length) setUpdate(true);
    });
  }, [r.id]);
  const problems = ddexProblems(r, tracks, cfg);
  const recipient = cfg?.recipients.find((x) => x.dpid === to) ?? null;

  const build = async () => {
    if (!cfg || !recipient) return;
    try {
      await buildDdexPackage(r, tracks, cfg, recipient, { update, test }, setProg);
      toast(`DDEX package for ${recipient.name} downloaded`, "success");
      setLog(await ddexLog(r.id));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setProg(null);
    }
  };

  return (
    <div className={panel}>
      <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-sub uppercase">
        <FileArchive className="size-4 text-accent" /> DDEX delivery (ERN 4.3)
        {cfg?.sender_dpid && <span className="ml-auto rounded-full bg-black/25 px-2 py-0.5 font-mono text-[11px] normal-case">{cfg.sender_dpid}</span>}
      </div>
      <p className="mb-3 text-[12px] text-sub">Builds a standard DDEX package — NewReleaseMessage XML with your Party ID, audio, cover and MD5 hash sums — ready to drop on the recipient&apos;s SFTP/S3 delivery folder.</p>

      {problems.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-xl bg-black/20 p-2.5">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-2 text-[12px] text-idle">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="text-[11px] text-sub">
          Recipient
          <select value={to} onChange={(e) => setTo(e.target.value)} className={cn(inp, "mt-0.5")} disabled={!cfg?.recipients.length}>
            {(cfg?.recipients ?? []).map((x) => (
              <option key={x.dpid} value={x.dpid}>
                {x.name} · {x.dpid}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-[13px]">
          <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} /> Update
        </label>
        <label className="flex items-end gap-2 pb-2 text-[13px]">
          <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Test message
        </label>
      </div>

      <button disabled={!!prog || problems.length > 0 || !recipient} onClick={() => void build()} className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {prog ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />} {prog ? `${prog.step}…` : "Build DDEX package"}
      </button>
      {prog && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
          <div className="h-full bg-accent transition-all" style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%` }} />
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-bold text-sub uppercase">Deliveries</div>
          <ul className="space-y-1 text-[12px]">
            {log.slice(0, 6).map((l) => (
              <li key={l.id} className="flex flex-wrap gap-x-2 text-sub">
                <span className="text-txt">{l.recipient_name ?? l.recipient_dpid}</span>
                <span>{l.update_indicator === "UpdateMessage" ? "update" : "original"}</span>
                {l.test && <span className="text-idle">test</span>}
                <span className="font-mono">{l.message_id}</span>
                <span className="ml-auto">{new Date(l.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
