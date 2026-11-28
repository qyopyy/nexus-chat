"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Clipboard, Copy, ExternalLink, Eye, EyeOff, FileText, Image as ImageIcon, Link2, Lock, Monitor, Palette, Pin, PinOff, Search, Send, Timer, Trash2, Wifi, WifiOff } from "lucide-react";
import { toast, useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import {
  MIN_PASS,
  clearHistory,
  copyItem,
  createClipKey,
  forgetDeviceKey,
  getDevice,
  getSettings,
  initClip,
  lockClip,
  removeClip,
  renameDevice,
  resetClipKey,
  saveSettings,
  sendHandoff,
  sendImage,
  sendText,
  setPinned,
  startWatch,
  unlockClip,
  useClip,
  type ClipSettings,
} from "@/lib/clipVault";
import { clock, preview, searchClips, secondsLeft, sortClips, type ClipItem, type Filter } from "@/lib/clipCore";

const input = "w-full rounded-xl bg-menu px-3 py-2.5 text-sm outline-none ring-1 ring-black/20 placeholder:text-sub focus:ring-accent";
const btn = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50";
const primary = `${btn} bg-accent text-white`;
const quiet = `${btn} bg-hover`;

function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  return s < 10 ? "just now" : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
};
const hostOf = (u?: string) => {
  try {
    return new URL(u ?? "").hostname.replace(/^www\./, "");
  } catch {
    return u ?? "";
  }
};

// ------------------------------------------------------------------ gate
function Gate() {
  const status = useClip((s) => s.status);
  const error = useClip((s) => s.error);
  const progress = useClip((s) => s.progress);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [keep, setKeep] = useState(true);
  const [ack, setAck] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const creating = status === "none";
  const busy = progress !== null;
  const ready = creating ? pw.length >= MIN_PASS && pw === pw2 && ack : pw.length > 0;
  if (status === "loading") return <p className="py-16 text-center text-sm text-sub">Loading…</p>;
  if (status === "error") return <p className="py-16 text-center text-sm text-dnd" role="alert">{error || "Something went wrong."}</p>;
  return (
    <form
      className="mx-auto max-w-sm space-y-3 py-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        const ok = creating ? await createClipKey(pw, keep) : await unlockClip(pw, keep);
        if (ok) (setPw(""), setPw2(""));
      }}
    >
      <div className="grid size-14 place-items-center rounded-2xl bg-sky-500/15 text-sky-300">
        <Clipboard className="size-7" />
      </div>
      <h2 className="text-xl font-black">{creating ? "Set up Nexus Clip" : "Nexus Clip is locked"}</h2>
      <p className="text-sm text-sub">
        {creating
          ? "Copy on one device, paste on another. Everything is locked with a passphrase on your device before it is sent, so the server only ever sees scrambled data."
          : "Enter your Clip passphrase to see your clipboard."}
      </p>
      <input className={input} type="password" autoFocus placeholder={creating ? "Choose a passphrase" : "Clip passphrase"} aria-label="Clip passphrase" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
      {creating && <input className={input} type="password" placeholder="Repeat it" aria-label="Repeat passphrase" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="off" />}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span>Keep it unlocked on this device. Anyone using this browser profile can then open Clip.</span>
      </label>
      {creating && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I understand nobody can reset this passphrase for me. Other devices need it to link.</span>
        </label>
      )}
      {error && (
        <p className="text-sm text-dnd" role="alert">
          {error}
        </p>
      )}
      {busy && <p className="text-xs text-sub">Securing… {Math.round((progress ?? 0) * 100)}%</p>}
      <button className={cn(primary, "w-full")} disabled={!ready || busy}>
        {creating ? "Create" : "Unlock"}
      </button>
      {!creating && (
        <div className="pt-2 text-center">
          {!confirmReset ? (
            <button type="button" onClick={() => setConfirmReset(true)} className="text-xs text-sub underline underline-offset-2">
              Forgot the passphrase?
            </button>
          ) : (
            <div className="space-y-2 rounded-2xl bg-menu p-3 text-left text-sm">
              <p>It can’t be recovered. You can start over, which deletes your clipboard history from every device.</p>
              <div className="flex gap-2">
                <button type="button" className={cn(btn, "bg-dnd text-white")} onClick={() => void resetClipKey()}>
                  Delete and start over
                </button>
                <button type="button" className={quiet} onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

// ------------------------------------------------------------------ one clipboard item
function Row({ it, now }: { it: ClipItem; now: number }) {
  const [show, setShow] = useState(false);
  const left = secondsLeft(it, now);
  const hidden = it.sensitive && !show;
  const p = it.payload;
  return (
    <li className="space-y-1.5 rounded-2xl bg-menu px-3 py-2.5" data-testid="clip-row" data-kind={it.kind} data-sensitive={it.sensitive || undefined}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-hover text-sky-300">
          {it.kind === "url" ? <Link2 className="size-4" /> : it.kind === "color" ? <Palette className="size-4" /> : it.kind === "image" ? <ImageIcon className="size-4" /> : it.sensitive ? <Lock className="size-4" /> : <FileText className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          {it.kind === "image" && p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="Copied picture" className="max-h-40 rounded-lg" />
          ) : it.kind === "color" ? (
            <div className="flex items-center gap-2">
              <span className="size-6 rounded-md ring-1 ring-white/20" style={{ background: p.text?.trim() }} />
              <span className="font-mono text-sm">{p.text}</span>
            </div>
          ) : hidden ? (
            <span className="text-sm text-sub" data-testid="hidden-secret">
              ••••••• {p.why ?? "secret"}
            </span>
          ) : (
            <div className={cn("whitespace-pre-wrap break-words text-sm", it.kind === "code" && "font-mono text-xs")} data-testid="clip-text">
              {it.sensitive ? (p.text ?? p.url) : preview(it, 400)}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-sub">
            <span>{p.from}</span>
            <span>{ago(it.createdAt, now)}</span>
            {it.pinned && <span className="font-semibold text-amber-300">Pinned</span>}
            {left !== null && (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-300" data-testid="countdown">
                <Timer className="size-3" /> disappears in {left}s
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => void copyItem(it)} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold" aria-label="Copy to this device">
          <Copy className="size-3.5" /> Copy
        </button>
        {it.sensitive && (
          <button onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold" aria-label={show ? "Hide" : "Show"}>
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {show ? "Hide" : "Show"}
          </button>
        )}
        {it.kind === "url" && p.url && (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold">
            <ExternalLink className="size-3.5" /> Open
          </a>
        )}
        <button onClick={() => void setPinned(it.id, !it.pinned)} className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold" aria-label={it.pinned ? "Unpin" : "Pin"}>
          {it.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />} {it.pinned ? "Unpin" : "Pin"}
        </button>
        <button onClick={() => void removeClip(it.id)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs font-semibold text-dnd" aria-label="Delete">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ clipboard tab
function ClipboardTab() {
  const items = useClip((s) => s.items);
  const watch = useClip((s) => s.watch);
  const now = useNow();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const list = useMemo(() => searchClips(items, q, filter), [items, q, filter]);
  const send = async () => {
    if (!text.trim()) return;
    if (await sendText(text)) setText("");
  };
  return (
    <>
      <div className="space-y-2 rounded-2xl bg-menu p-3">
        <textarea
          ref={ta}
          className={cn(input, "min-h-[3.5rem] resize-y bg-chat")}
          placeholder="Type or paste something to send to your other devices"
          aria-label="Text to send"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
            if (f) (e.preventDefault(), void sendImage(f));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className={cn(primary, "inline-flex items-center gap-1.5")} disabled={!text.trim()} onClick={() => void send()}>
            <Send className="size-4" /> Send
          </button>
          <button
            className={cn(quiet, "inline-flex items-center gap-1.5")}
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                if (t.trim()) await sendText(t);
                else toast("Your clipboard is empty", "info");
              } catch {
                toast("Allow clipboard access to send what you copied", "error");
              }
            }}
          >
            <Clipboard className="size-4" /> Send my clipboard
          </button>
        </div>
        <p className="text-xs text-sub" data-testid="watch-status">
          {watch === "on" ? "Watching your clipboard while this tab is open and in front. New copies are sent for you." : watch === "blocked" ? "Clipboard access is blocked. " : "Automatic sending is off. "}
          {watch !== "on" && (
            <button className="underline underline-offset-2" onClick={() => (saveSettings({ watch: true }), startWatch())}>
              {watch === "blocked" ? "Allow it" : "Turn on"}
            </button>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[8rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
          <input className={cn(input, "pl-9")} placeholder="Search history" aria-label="Search history" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filter">
        {(["all", "pinned", "text", "url", "color", "image"] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-bold", filter === f ? "bg-accent text-white" : "bg-hover")}>
            {{ all: "All", pinned: "Pinned", text: "Text", url: "Links", color: "Colors", image: "Images" }[f]}
          </button>
        ))}
      </div>

      <ul className="space-y-2" data-testid="clip-list">
        {list.map((it) => (
          <Row key={it.id} it={it} now={now} />
        ))}
        {!list.length && <li className="rounded-2xl bg-menu p-8 text-center text-sm text-sub">{q || filter !== "all" ? "Nothing matches." : "Nothing yet. Copy something on any device where Clip is open and it shows up here."}</li>}
      </ul>
      {items.some((i) => i.kind !== "handoff" && !i.pinned) && (
        <button className={quiet} onClick={() => void clearHistory(true)}>
          Clear history (keeps pinned)
        </button>
      )}
    </>
  );
}

// ------------------------------------------------------------------ handoff tab
function parseTime(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0) || parts.length > 3) return NaN;
  return parts.reduce((a, n) => a * 60 + n, 0);
}
function HandoffTab() {
  const items = useClip((s) => s.items);
  const now = useNow();
  const me = getDevice();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const tray = useMemo(() => sortClips(items.filter((i) => i.kind === "handoff")), [items]);
  return (
    <>
      <p className="text-sm text-sub">Pages and media you sent from another device wait here. Tap Open to carry on where you left off.</p>
      <ul className="space-y-2" data-testid="handoff-tray">
        {tray.map((i) => (
          <li key={i.id} className="space-y-2 rounded-2xl bg-menu px-3 py-3" data-testid="handoff-row">
            <div className="flex items-start gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-hover text-sky-300">
                <Monitor className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm">{i.payload.title || hostOf(i.payload.url)}</b>
                <span className="block truncate text-xs text-sub">{hostOf(i.payload.url)}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-sub">
                  <span>from {i.payload.from}{i.payload.from === me.name ? " (this device name)" : ""}</span>
                  <span>{ago(i.createdAt, now)}</span>
                  {i.payload.at ? <span className="font-semibold text-sky-300">at {clock(i.payload.at)}</span> : null}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <a href={i.payload.url} target="_blank" rel="noopener noreferrer" className={cn(primary, "inline-flex items-center gap-1.5 !py-1.5")}>
                <ExternalLink className="size-4" /> Open here
              </a>
              <button onClick={() => void removeClip(i.id)} className={cn(quiet, "!py-1.5")}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
        {!tray.length && <li className="rounded-2xl bg-menu p-8 text-center text-sm text-sub">Nothing waiting. Send a page from another device, or send one from here below.</li>}
      </ul>

      <form
        className="space-y-2 rounded-2xl bg-menu p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const at = parseTime(time);
          if (Number.isNaN(at)) return toast("Time looks like 1:30 or 1:02:03", "error");
          if (await sendHandoff({ url, title, at })) (setUrl(""), setTitle(""), setTime(""), toast("Sent to your devices", "success"));
        }}
      >
        <b className="text-sm">Send a page or video to your other devices</b>
        <input className={input} placeholder="https://…" aria-label="Link to hand off" inputMode="url" autoCapitalize="none" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex gap-2">
          <input className={input} placeholder="Title (optional)" aria-label="Handoff title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <input className={cn(input, "!w-28 shrink-0")} placeholder="At 1:30" aria-label="Position in the video" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className={primary} disabled={!url.trim()}>
            Send
          </button>
          <button type="button" className={quiet} onClick={() => setUrl(location.href)}>
            Use this page
          </button>
        </div>
      </form>
    </>
  );
}

// ------------------------------------------------------------------ devices + settings
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-2xl bg-menu px-3 py-2.5">
      <input type="checkbox" className="mt-1" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-sub">{hint}</span>}
      </span>
    </label>
  );
}
function SettingsTab() {
  const devices = useClip((s) => s.devices);
  const remembered = useClip((s) => s.remembered);
  const [s, setS] = useState<ClipSettings>(getSettings());
  const [name, setName] = useState(getDevice().name);
  const up = (p: Partial<ClipSettings>) => (saveSettings(p), setS(getSettings()));
  const me = getDevice();
  return (
    <>
      <div className="space-y-2 rounded-2xl bg-menu p-3">
        <b className="text-sm">Devices online now</b>
        <ul className="space-y-1" data-testid="devices">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full bg-emerald-400" /> {d.name}
              {d.id === me.id && <span className="text-xs text-sub">(this one)</span>}
            </li>
          ))}
          {!devices.length && <li className="text-sm text-sub">Only this device so far. Open Nexus on another device and unlock Clip there with the same passphrase.</li>}
        </ul>
        <div className="flex gap-2 pt-1">
          <input className={input} aria-label="This device's name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button className={quiet} onClick={() => (renameDevice(name), toast("Renamed", "success"))}>
            Rename
          </button>
        </div>
      </div>

      <Toggle on={s.watch} onChange={(v) => up({ watch: v })} label="Send what I copy, automatically" hint="Works while this tab is open and in front. The browser extension keeps it going in the background." />
      <Toggle on={s.autoCopy} onChange={(v) => up({ autoCopy: v })} label="Put new items from other devices on this clipboard" hint="Off by default so nothing overwrites what you just copied." />
      <Toggle on={s.wipe} onChange={(v) => up({ wipe: v })} label="Clear the clipboard when a secret expires" hint="One-time codes, passwords and keys vanish from your clipboard too." />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 rounded-2xl bg-menu p-3 text-sm">
          <span className="block font-semibold">Secrets disappear after</span>
          <select className={input} aria-label="Secrets disappear after" value={s.sensitiveSec} onChange={(e) => up({ sensitiveSec: Number(e.target.value) })}>
            {[15, 30, 60, 120, 300].map((x) => (
              <option key={x} value={x}>
                {x < 60 ? `${x} seconds` : `${x / 60} minute${x > 60 ? "s" : ""}`}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 rounded-2xl bg-menu p-3 text-sm">
          <span className="block font-semibold">Keep history for</span>
          <select className={input} aria-label="Keep history for" value={s.historyDays} onChange={(e) => up({ historyDays: Number(e.target.value) })}>
            <option value={0}>Until I clear it</option>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-sub">Pinned items are kept until you remove them. Applies to new items.</p>

      <div className="flex flex-wrap gap-2">
        <button className={cn(quiet, "inline-flex items-center gap-1.5")} onClick={lockClip}>
          <Lock className="size-4" /> Lock Clip now
        </button>
        {remembered && (
          <button className={quiet} onClick={() => (forgetDeviceKey(), toast("This device will ask for the passphrase next time", "success"))}>
            Stop keeping it unlocked here
          </button>
        )}
      </div>

      <div className="space-y-1 rounded-2xl bg-menu p-3 text-sm">
        <b>Browser extension</b>
        <p className="text-xs text-sub">
          Adds “send this tab”, watches the clipboard in the background while your browser runs, and fills Nexus Pass logins on websites. It talks to this tab, so keep Nexus open (a pinned tab is fine) and unlocked.
        </p>
        <a href="/downloads/nexus-bridge.zip" download className="inline-block text-xs font-bold text-accent underline underline-offset-2">
          Download the extension (.zip)
        </a>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ the app
type Tab = "clip" | "handoff" | "settings";
export default function ClipApp({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const userId = useApp((s) => s.userId);
  const status = useClip((s) => s.status);
  const live = useClip((s) => s.live);
  const devices = useClip((s) => s.devices);
  const items = useClip((s) => s.items);
  const incoming = useClip((s) => s.incoming);
  const [tab, setTab] = useState<Tab>("clip");
  const seen = useRef(incoming);
  useEffect(() => {
    if (userId) void initClip();
  }, [userId]);
  useEffect(() => {
    if (incoming !== seen.current && tab !== "handoff") toast("A page arrived from another device. See Handoff.", "info");
    seen.current = incoming;
  }, [incoming, tab]);
  const waiting = items.filter((i) => i.kind === "handoff").length;
  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
          <ChevronLeft className="size-5" />
        </button>
        <Clipboard className="size-5 text-sky-400" />
        <span className="min-w-0 flex-1 truncate font-bold">Nexus Clip</span>
        {status === "unlocked" && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", live ? "bg-emerald-500/15 text-emerald-400" : "bg-hover text-sub")} data-testid="live">
            {live ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {live ? `Live · ${devices.length || 1} device${devices.length > 1 ? "s" : ""}` : "Connecting…"}
          </span>
        )}
      </header>
      {status === "unlocked" && (
        <nav className="flex shrink-0 gap-1.5 px-3 pt-2" role="tablist" aria-label="Clip sections">
          {(
            [
              ["clip", "Clipboard"],
              ["handoff", waiting ? `Handoff (${waiting})` : "Handoff"],
              ["settings", "Devices & settings"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold", tab === id ? "bg-accent text-white" : "bg-hover")}>
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto max-w-2xl space-y-3">
          {status !== "unlocked" ? <Gate /> : tab === "clip" ? <ClipboardTab /> : tab === "handoff" ? <HandoffTab /> : <SettingsTab />}
        </div>
      </div>
    </div>
  );
}

