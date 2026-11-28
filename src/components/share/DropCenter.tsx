"use client";

import { useEffect, useRef, useState } from "react";
import { useApp, toast } from "@/store/app";
import { DROP_MAX_FILES, agoText, batchPercent, dropIcon, dropKind, fmtSize, timeLeft } from "@/lib/dropKit";
import {
  cancelItem,
  clearFinished,
  dismissDrop,
  enqueue,
  refreshHub,
  retryItem,
  saveAll,
  saveDrop,
  searchPeople,
  startDropHub,
  thumbUrl,
  unsendDrop,
  useDropHub,
  type PersonHit,
  type QItem,
} from "@/lib/dropHub";
import type { NexusDrop } from "@/lib/nexusDrop";

type Tab = "inbox" | "received" | "sent";

function Thumb({ row }: { row: NexusDrop }) {
  const [url, setUrl] = useState<string | null>(null);
  const kind = dropKind(row.mime, row.name);
  useEffect(() => {
    let live = true;
    if (kind === "image") void thumbUrl(row).then((u) => live && setUrl(u)).catch(() => undefined);
    return () => { live = false; };
  }, [row, kind]);
  return (
    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[.06] text-2xl" aria-hidden>
      {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" className="size-full object-cover" loading="lazy" onError={() => setUrl(null)} /> : dropIcon(kind)}
    </div>
  );
}

function Bar({ value, error }: { value: number; error?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={`h-full rounded-full transition-[width] duration-200 ${error ? "bg-[#ff8a8a]" : "bg-[#7ee0c6]"}`} style={{ width: `${Math.max(3, Math.round(value * 100))}%` }} />
    </div>
  );
}

function QueueRow({ item }: { item: QItem }) {
  const label =
    item.status === "queued" ? "Waiting…" :
    item.status === "sending" ? `Sending ${Math.round(item.progress * 100)}%` :
    item.status === "done" ? "Sent ✓" :
    item.status === "cancelled" ? "Cancelled" : item.error || "Failed";
  return (
    <li className="rounded-2xl bg-black/30 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{item.file.name}</div>
          <div className={`text-xs ${item.status === "error" ? "text-[#ff8a8a]" : "text-[#8d8880]"}`}>
            {fmtSize(item.file.size)} · {item.to ? `to @${item.to}` : "to your other devices"} · {label}
          </div>
        </div>
        {(item.status === "sending" || item.status === "queued") && (
          <button type="button" onClick={() => cancelItem(item.id)} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">Cancel</button>
        )}
        {(item.status === "error" || item.status === "cancelled") && (
          <button type="button" onClick={() => retryItem(item.id)} className="shrink-0 rounded-full bg-[#f4f1ea] px-3 py-1.5 text-xs font-bold text-[#070709]">Retry</button>
        )}
      </div>
      {(item.status === "sending" || item.status === "done" || item.status === "error") && <div className="mt-2"><Bar value={item.progress} error={item.status === "error"} /></div>}
    </li>
  );
}

function Recipient({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<"mine" | "friend">(value ? "friend" : "mine");
  const [hits, setHits] = useState<PersonHit[]>([]);
  useEffect(() => {
    if (mode !== "friend" || value.trim().length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => void searchPeople(value).then((h) => live && setHits(h)).catch(() => undefined), 220);
    return () => { live = false; clearTimeout(t); };
  }, [value, mode]);
  const exact = hits.some((h) => h.username.toLowerCase() === value.trim().replace(/^@/, "").toLowerCase());
  return (
    <div>
      <div className="inline-flex rounded-full bg-white/[.07] p-1 text-sm" role="tablist" aria-label="Send to">
        <button type="button" role="tab" aria-selected={mode === "mine"} onClick={() => { setMode("mine"); onChange(""); }} className={`rounded-full px-4 py-1.5 font-semibold ${mode === "mine" ? "bg-[#f4f1ea] text-[#070709]" : "text-[#cfcac1]"}`}>My devices</button>
        <button type="button" role="tab" aria-selected={mode === "friend"} onClick={() => setMode("friend")} className={`rounded-full px-4 py-1.5 font-semibold ${mode === "friend" ? "bg-[#f4f1ea] text-[#070709]" : "text-[#cfcac1]"}`}>A friend</button>
      </div>
      {mode === "friend" && (
        <div className="mt-2">
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="@username" aria-label="Friend's username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full rounded-full bg-[#141414] px-4 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-[#7ee0c6]" />
          {hits.length > 0 && !exact && (
            <ul className="mt-1 overflow-hidden rounded-2xl bg-[#141414] ring-1 ring-white/10">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => { onChange(h.username); setHits([]); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/[.06]">
                    <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-xs">
                      {h.avatar_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={h.avatar_url} alt="" className="size-full object-cover" /> : h.username.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{h.display_name || h.username}</span>
                    <span className="text-xs text-[#8d8880]">@{h.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The whole Nexus Drop experience in one card: send (drag, paste or pick), queue with progress, live inbox, received, sent. */
export default function DropCenter({ showTitle = true }: { showTitle?: boolean }) {
  const userId = useApp((s) => s.userId);
  const { queue, incoming, received, sent, loading, error } = useDropHub();
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<Tab>("inbox");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    return startDropHub(userId);
  }, [userId]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Paste a screenshot or file anywhere on the page (not while typing in a field).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      enqueue(files, to);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [to]);

  if (!userId) return <p className="text-sm text-[#a39e96]">Sign in to send and receive drops.</p>;

  const active = queue.filter((q) => q.status === "sending" || q.status === "queued");
  const finished = queue.length - active.length;
  const overall = batchPercent(active.map((q) => (q.status === "sending" ? q.progress : 0)).concat(queue.filter((q) => q.status === "done").map(() => 1)));

  const save = async (row: NexusDrop, claim: boolean) => {
    setBusy(row.id);
    try {
      const result = await saveDrop(row, claim);
      if (result === "ready") {
        setReady((s) => new Set(s).add(row.id));
        toast("Downloaded. Tap Save once more to open the share sheet.", "info");
      } else {
        setReady((s) => { const n = new Set(s); n.delete(row.id); return n; });
        toast(claim ? "Saved" : "Download started", "success");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  const tabBtn = (id: Tab, label: string, n: number) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? "bg-[#f4f1ea] text-[#070709]" : "bg-white/[.07] text-[#cfcac1]"}`}>
      {label}{n > 0 ? ` · ${n}` : ""}
    </button>
  );

  return (
    <div className="space-y-4">
      <section
        className={`rounded-3xl p-5 ring-1 transition ${over ? "bg-[#12201c] ring-[#7ee0c6]" : "bg-[#111114] ring-white/[.06]"}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const files = [...e.dataTransfer.files]; if (files.length) enqueue(files, to); }}
      >
        {showTitle && <h2 className="font-serif text-2xl">Send a drop</h2>}
        <p className="mt-1 text-sm text-[#a39e96]">Works on any network. Up to 100 MB each, {DROP_MAX_FILES} files at a time, deleted after 24 hours. Drag files here, paste a screenshot, or pick them.</p>
        <input ref={pick} type="file" multiple className="hidden" onChange={(e) => { const files = [...(e.target.files ?? [])]; if (files.length) enqueue(files, to); e.target.value = ""; }} />
        <button type="button" onClick={() => pick.current?.click()} className="mt-3 flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-white/20 px-4 py-6 text-center active:bg-white/[.05]">
          <span className="text-3xl" aria-hidden>🛰️</span>
          <span className="text-sm font-bold">{over ? "Release to send" : "Choose files or photos"}</span>
          <span className="text-xs text-[#8d8880]">or drop them here</span>
        </button>
        <div className="mt-3"><Recipient value={to} onChange={setTo} /></div>

        {queue.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-[#8d8880]">
              <span>{active.length ? `Sending ${active.length} · ${overall}%` : "All done"}</span>
              {finished > 0 && <button type="button" onClick={clearFinished} className="underline">Clear finished</button>}
            </div>
            <ul className="space-y-2">{queue.map((q) => <QueueRow key={q.id} item={q} />)}</ul>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-[#111114] p-5 ring-1 ring-white/[.06]">
        <div className="flex flex-wrap items-center gap-2" role="tablist">
          {tabBtn("inbox", "Inbox", incoming.length)}
          {tabBtn("received", "Received", received.length)}
          {tabBtn("sent", "Sent", sent.length)}
          <button type="button" onClick={() => void refreshHub()} className="ml-auto text-xs text-[#8d8880] underline">{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-[#3a2418] px-4 py-3 text-sm text-[#e4a15a]">{error}</p>}

        {tab === "inbox" && (
          <div className="mt-3">
            {incoming.length > 1 && !/iPhone|iPad|iPod/.test(typeof navigator === "undefined" ? "" : navigator.userAgent) && (
              <button type="button" onClick={() => void saveAll(incoming)} className="mb-2 rounded-full bg-[#7ee0c6] px-4 py-2 text-sm font-bold text-[#06201a]">Save all {incoming.length}</button>
            )}
            {incoming.length === 0 ? (
              <p className="text-sm text-[#8d8880]">Nothing waiting. Files sent to this account appear here the moment they arrive.</p>
            ) : (
              <ul className="space-y-2">
                {incoming.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-black/30 p-3">
                    <Thumb row={d} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{d.name}</div>
                      <div className="text-xs text-[#8d8880]">{fmtSize(d.bytes)} · {agoText(d.created_at)} · {timeLeft(d.expires_at)}</div>
                    </div>
                    <button type="button" disabled={busy === d.id} onClick={() => void save(d, true)} className="shrink-0 rounded-full bg-[#7ee0c6] px-4 py-2 text-sm font-bold text-[#06201a] disabled:opacity-50">
                      {busy === d.id ? "…" : ready.has(d.id) ? "Tap to save" : "Save"}
                    </button>
                    <button type="button" aria-label={`Dismiss ${d.name}`} onClick={() => void dismissDrop(d).catch((e: Error) => toast(e.message, "error"))} className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-sm">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "received" && (
          <div className="mt-3">
            {received.length === 0 ? (
              <p className="text-sm text-[#8d8880]">Drops you saved stay here until they expire, so you can download them again.</p>
            ) : (
              <ul className="space-y-2">
                {received.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-black/30 p-3">
                    <Thumb row={d} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{d.name}</div>
                      <div className="text-xs text-[#8d8880]">{fmtSize(d.bytes)} · taken {d.claimed_at ? agoText(d.claimed_at) : ""} · {timeLeft(d.expires_at)}</div>
                    </div>
                    <button type="button" disabled={busy === d.id} onClick={() => void save(d, false)} className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy === d.id ? "…" : "Again"}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "sent" && (
          <div className="mt-3">
            {sent.length === 0 ? (
              <p className="text-sm text-[#8d8880]">Drops you send show here with their status for 24 hours.</p>
            ) : (
              <ul className="space-y-2">
                {sent.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-black/30 p-3">
                    <Thumb row={d} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{d.name}</div>
                      <div className="text-xs text-[#8d8880]">
                        {fmtSize(d.bytes)} · to {d.to_name ? `@${d.to_name}` : "your devices"} · <span className={d.claimed_at ? "text-[#7ee0c6]" : ""}>{d.claimed_at ? "Opened" : "Waiting"}</span> · {timeLeft(d.expires_at)}
                      </div>
                    </div>
                    {!d.claimed_at && (
                      <button type="button" disabled={busy === d.id} onClick={() => { if (!window.confirm("Unsend this file? It will be deleted and the receiver won't be able to open it.")) return; setBusy(d.id); void unsendDrop(d).then(() => toast("Unsent", "success")).catch((e: Error) => toast(e.message, "error")).finally(() => setBusy(null)); }} className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold disabled:opacity-50">Unsend</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

