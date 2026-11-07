"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, Mic, Square, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/store/app";
import { msgLimit, useMyTier } from "@/lib/premium";
import { cn } from "@/lib/utils";
import Sheet from "@/components/ui/Sheet";

type Scheduled = { id: string; content: string; send_at: string; status: "pending" | "sent" | "failed"; error: string | null };
const EVT = "nexus:scheduled-changed";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function presets(): { label: string; at: Date }[] {
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60_000);
  const tonight = new Date(now);
  tonight.setHours(20, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  monday.setHours(9, 0, 0, 0);
  return [
    { label: "In 1 hour", at: inHour },
    ...(tonight.getTime() - now.getTime() > 30 * 60_000 ? [{ label: "Tonight 8 PM", at: tonight }] : []),
    { label: "Tomorrow 9 AM", at: tomorrow },
    { label: "Monday 9 AM", at: monday },
  ];
}

/** "Send later" sheet — Nexus posts the message for you at the chosen time (even if your app is closed). */
export function ScheduleSheet({ conversationId, initial = "", onClose }: { conversationId: string; initial?: string; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const limit = msgLimit(useMyTier());
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [busy, setBusy] = useState(false);
  const save = async (d: Date) => {
    if (!text.trim()) return toast("Write a message first", "error");
    setBusy(true);
    const { error } = await supabase.rpc("schedule_message", { p_conversation: conversationId, p_content: text, p_send_at: d.toISOString() });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`Scheduled for ${when(d.toISOString())}`, "success");
    window.dispatchEvent(new Event(EVT));
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Schedule a message">
      <div className="space-y-3 p-1">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={limit} placeholder="Message to send later…" className="w-full resize-none rounded-xl bg-rail px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-accent/60" />
        <div className="grid grid-cols-2 gap-2">
          {presets().map((p) => (
            <button key={p.label} disabled={busy} onClick={() => void save(p.at)} className="rounded-xl bg-side px-3 py-2.5 text-left text-sm hover:bg-hover disabled:opacity-50">
              <span className="block font-semibold">{p.label}</span>
              <span className="block text-xs text-sub">{when(p.at.toISOString())}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="datetime-local" value={at} min={toLocalInput(new Date(Date.now() + 60_000))} onChange={(e) => setAt(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
          <button disabled={busy || !at} onClick={() => void save(new Date(at))} className="flex items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-50">
            <AlarmClock className="size-4" /> Schedule
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Small bar above the composer: your scheduled messages in this chat, with cancel. */
export function ScheduledBar({ conversationId }: { conversationId: string }) {
  const [rows, setRows] = useState<Scheduled[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("scheduled_messages")
      .select("id,content,send_at,status,error")
      .eq("conversation_id", conversationId)
      .neq("status", "sent")
      .order("send_at");
    setRows((data as Scheduled[]) ?? []);
  }, [conversationId]);
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener(EVT, on);
    const t = setInterval(on, 60_000);
    return () => {
      window.removeEventListener(EVT, on);
      clearInterval(t);
    };
  }, [load]);
  if (!rows.length) return null;
  const failed = rows.filter((r) => r.status === "failed").length;
  return (
    <div className="mx-2 mb-1.5 rounded-xl bg-side/80 text-sm ring-1 ring-white/5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        <AlarmClock className="size-4 text-accent" />
        <span className="flex-1 font-semibold">
          {rows.length - failed} scheduled{failed ? <span className="ml-1 text-dnd">· {failed} failed</span> : null}
        </span>
        <span className="text-xs text-sub">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="space-y-1 px-2 pb-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg bg-rail px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate">{r.content}</div>
                <div className={cn("text-[11px]", r.status === "failed" ? "text-dnd" : "text-sub")}>{r.status === "failed" ? `Not sent: ${r.error ?? "error"}` : when(r.send_at)}</div>
              </div>
              <button
                onClick={async () => {
                  await supabase.from("scheduled_messages").delete().eq("id", r.id);
                  void load();
                }}
                className="grid size-7 place-items-center rounded-md text-sub hover:bg-hover hover:text-dnd"
                aria-label="Cancel scheduled message"
              >
                {r.status === "failed" ? <X className="size-4" /> : <Trash2 className="size-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── dictation ─────────────────────────
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
const SRCtor = (): (new () => SR) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Speak instead of typing — words go straight into the message box. Hidden where the browser can't do it. */
export function DictateButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<SR | null>(null);
  useEffect(() => setSupported(!!SRCtor()), []);
  useEffect(() => () => rec.current?.stop(), []);
  if (!supported) return null;
  const toggle = () => {
    if (on) return rec.current?.stop();
    const C = SRCtor();
    if (!C) return;
    const r = new C();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") toast("Allow microphone access to dictate", "error");
    };
    r.onend = () => setOn(false);
    rec.current = r;
    try {
      r.start();
      setOn(true);
    } catch {
      setOn(false);
    }
  };
  return (
    <button type="button" onClick={toggle} className={cn("mb-1 grid size-9 shrink-0 place-items-center rounded-full transition active:scale-90", on ? "animate-pulse bg-dnd/20 text-dnd" : "text-sub hover:text-accent")} title={on ? "Stop dictation" : "Dictate (speech to text)"} aria-label={on ? "Stop dictation" : "Dictate"}>
      {on ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
    </button>
  );
}
