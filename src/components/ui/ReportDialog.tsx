"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { REPORT_REASONS, fileReport, useReportDialog, type ReportReason } from "@/lib/adminTools";
import { blockUser, useIsBlocked } from "@/lib/blocks";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import Sheet from "./Sheet";

/** report a message or a person to the Nexus team (opened with openReport) — lands in Admin → Reports */
export default function ReportDialog() {
  const target = useReportDialog((s) => s.target);
  const close = () => useReportDialog.setState({ target: null });
  return (
    <Sheet open={!!target} onClose={close}>
      {target && <ReportBody key={(target.messageId ?? "") + (target.userId ?? "")} target={target} onDone={close} />}
    </Sheet>
  );
}

function ReportBody({ target, onDone }: { target: { messageId?: string; userId?: string; excerpt?: string; name?: string }; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = useApp((s) => (target.userId ? (s.profiles[target.userId]?.display_name ?? target.name) : target.name));
  const blocked = useIsBlocked(target.userId);
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    const ok = await fileReport(reason, details.trim(), { messageId: target.messageId, userId: target.userId });
    if (ok && alsoBlock && target.userId && !blocked) await blockUser(target.userId, who ?? undefined);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="space-y-3 p-1 text-txt">
      <div className="flex items-center gap-2 text-lg font-bold">
        <Flag className="size-5 text-dnd" /> {target.messageId ? "Report message" : `Report ${who ?? "user"}`}
      </div>
      {target.excerpt && <p className="line-clamp-3 rounded-lg bg-black/25 p-2.5 text-sm text-sub italic">“{target.excerpt}”</p>}
      <div className="space-y-1">
        {REPORT_REASONS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReason(r.id)}
            className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm", reason === r.id ? "bg-accent/20 ring-1 ring-accent" : "bg-white/[.04] hover:bg-white/[.08]")}
          >
            <span className={cn("size-4 rounded-full border-2", reason === r.id ? "border-accent bg-accent" : "border-white/30")} />
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
        rows={3}
        placeholder="Anything else the team should know? (optional)"
        className="w-full rounded-lg bg-black/25 p-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/60"
      />
      {target.userId && !blocked && (
        <label className="flex items-center gap-2 text-sm text-sub">
          <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="accent-[var(--color-accent,#5865f2)]" />
          Also block {who ?? "them"}
        </label>
      )}
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-lg bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/15">
          Cancel
        </button>
        <button disabled={!reason || busy} onClick={() => void send()} className="flex-1 rounded-lg bg-dnd py-2.5 text-sm font-bold text-white disabled:opacity-40">
          {busy ? "Sending…" : "Send report"}
        </button>
      </div>
      <p className="text-center text-[11px] text-faint">Reports are private — the person won&apos;t know who reported them.</p>
    </div>
  );
}
