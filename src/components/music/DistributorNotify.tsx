"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Mail, Plus, Search, Send } from "lucide-react";
import { toast } from "@/store/app";
import { spotifyTakedownLookup } from "@/lib/music";
import { PLATFORM, noticeText, subject, type Draft } from "@/lib/takedown";
import { ccMailto, ccStoreKey, contactSearchUrl, matchDistributor, parseEmails, uniqueLabels, upstreamBody } from "@/lib/distributors";
import { cn } from "@/lib/utils";

const inp = "w-full min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

type Row = { label: string; emails: string };

/**
 * Notify the label / distributor too: finds the label Spotify lists for the ISRC, then opens your email app with the
 * platform's copyright agent in To and the label (distributor) in CC — or a direct note to the label itself.
 */
export default function DistributorNotify({ draft, labels = [], titles, isrc }: { draft: Draft; labels?: (string | null | undefined)[]; titles: string; isrc?: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [finding, setFinding] = useState(false);
  const [manual, setManual] = useState("");
  const key = uniqueLabels(labels).join("|").toLowerCase();

  useEffect(() => {
    setRows((cur) => {
      const next = [...cur];
      for (const l of uniqueLabels(labels)) if (!next.some((r) => r.label.toLowerCase() === l.toLowerCase())) next.push({ label: l, emails: lsGet(ccStoreKey(l)) });
      return next;
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEmails = (label: string, emails: string) => {
    setRows((r) => r.map((x) => (x.label === label ? { ...x, emails } : x)));
    lsSet(ccStoreKey(label), emails);
  };
  const addLabel = (label: string) => {
    const l = label.trim();
    if (!l) return;
    setRows((cur) => (cur.some((r) => r.label.toLowerCase() === l.toLowerCase()) ? cur : [...cur, { label: l, emails: lsGet(ccStoreKey(l)) }]));
  };

  const find = async () => {
    const code = (isrc ?? "").trim();
    if (!code) return toast("Add the ISRC first", "error");
    setFinding(true);
    try {
      const r = await spotifyTakedownLookup({ isrc: code });
      const l = r.album?.label?.trim();
      if (l) {
        addLabel(l);
        toast(`Label for ${code}: ${l}`, "success");
      } else toast("Spotify doesn't list a label for that track — add it by hand", "info");
    } catch (e) {
      toast((e as Error).message || "Couldn't search that ISRC", "error");
    }
    setFinding(false);
  };

  const P = PLATFORM[draft.platform];
  const ccAll = useMemo(() => [...new Set(rows.flatMap((r) => parseEmails(r.emails)))], [rows]);
  const parts = () => ({ to: P.email, subject: subject(draft), body: noticeText(draft), ownerEmail: draft.contact.email });

  const open = async (url: string, tooLong: boolean) => {
    if (tooLong) {
      try {
        await navigator.clipboard.writeText(noticeText(draft));
        toast("Notice copied — paste it into the email", "info");
      } catch {
        toast("Notice is long — use Preview notice to copy it", "info");
      }
    }
    window.location.href = url;
  };

  const sendCc = () => {
    if (!ccAll.length) return toast("Add at least one label/distributor email to CC", "error");
    const m = ccMailto(parts(), ccAll);
    void open(m.url, m.tooLong);
  };
  const sendDirect = (r: Row) => {
    const to = parseEmails(r.emails);
    if (!to.length) return toast(`Add an email for ${r.label}`, "error");
    const body = upstreamBody({ label: r.label, platformName: P.name, titles, notice: noticeText(draft), owner: draft.contact.name });
    const m = ccMailto({ to: to[0]!, subject: `${subject(draft)} — please remove at source`, body, ownerEmail: draft.contact.email }, [...to.slice(1), ...(draft.contact.email ? [draft.contact.email] : [])]);
    void open(m.url, m.tooLong);
  };

  return (
    <div className="space-y-2 rounded-xl bg-black/20 p-3">
      <div className="text-sm font-semibold">Also notify the label / distributor</div>
      <p className="text-xs text-sub">
        Search the ISRC to see which label Spotify lists, then send the same notice to {P.name} with the label in CC — or write to the label directly. Your own email app sends it, so replies come straight to you.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => void find()} disabled={finding || !isrc} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-bold hover:bg-active disabled:opacity-40">
          {finding ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Find label by ISRC {isrc ? `(${isrc})` : ""}
        </button>
        <div className="flex min-w-0 flex-1 gap-1.5">
          <input className={cn(inp, "py-1.5 text-xs")} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type a label / distributor name" aria-label="Label name" />
          <button
            onClick={() => {
              addLabel(manual);
              setManual("");
            }}
            className="rounded-full bg-hover px-3 text-xs font-bold hover:bg-active"
            aria-label="Add label"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {rows.map((r) => {
        const d = matchDistributor(r.label);
        return (
          <div key={r.label} className="space-y-1.5 rounded-lg bg-black/25 p-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b className="min-w-0 truncate">{r.label}</b>
              {d && <span className="rounded-full bg-[#1DB954]/20 px-2 py-0.5 text-[10px] font-bold text-[#1DB954]">distributor: {d.name}</span>}
              <a href={d?.takedownPage ?? contactSearchUrl(r.label)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#1DB954] hover:underline">
                {d?.takedownPage ? "Official takedown page" : "Find their copyright contact"} <ExternalLink className="size-3" />
              </a>
            </div>
            <input className={cn(inp, "py-1.5 text-xs")} value={r.emails} onChange={(e) => setEmails(r.label, e.target.value)} placeholder="copyright / legal email (you can add several)" aria-label={`Email for ${r.label}`} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => sendDirect(r)} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1 font-bold hover:bg-active">
                <Send className="size-3.5" /> Email {r.label} directly
              </button>
              {parseEmails(r.emails).length === 0 && <span className="text-sub">Add their email to enable sending.</span>}
            </div>
          </div>
        );
      })}

      {rows.length > 0 && (
        <button onClick={sendCc} className="inline-flex items-center gap-1.5 rounded-xl bg-[#1DB954] px-4 py-2 text-sm font-black text-black">
          <Mail className="size-4" /> Email {P.name} with {ccAll.length || "the"} label{ccAll.length === 1 ? "" : "s"} in CC
        </button>
      )}
    </div>
  );
}
