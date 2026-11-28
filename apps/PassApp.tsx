"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Copy, Download, ExternalLink, Eye, EyeOff, Fingerprint, KeyRound, Lock, Plus, RefreshCw, Search, Settings as SettingsIcon, ShieldCheck, Star, StickyNote, Timer, Trash2, Upload, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { KIND_LABEL, blankItem, filterItems, hostOf, importAny, safeUrl, type ImportResult, type ItemKind, type PassItem } from "@/lib/passItems";
import { DEFAULT_PHRASE, DEFAULT_PW, genPassphrase, genPassword, passphraseBits, passwordBits, strengthOf, type PhraseOpts, type PwOpts } from "@/lib/passGen";
import { groupCode, parseTotp, randomSecret, ringFraction, secondsLeft, totpNow } from "@/lib/passTotp";
import type { EncryptedExport } from "@/lib/passCrypto";
import {
  MAX_PIN_TRIES,
  MIN_MASTER,
  addItems,
  biometricsAvailable,
  changeMasterPassword,
  clearPin,
  copySecret,
  createVault,
  disableBiometrics,
  enableBiometrics,
  exportPlain,
  exportProtected,
  getSettings,
  initPass,
  lockVault,
  readProtected,
  removeItem,
  resetPass,
  saveItem,
  saveSettings,
  setPin,
  startAutoLock,
  unlockWithBiometrics,
  unlockWithPassword,
  unlockWithPin,
  usePass,
} from "@/lib/passVault";

const input = "w-full rounded-xl bg-menu px-3 py-2.5 text-sm outline-none ring-1 ring-black/20 placeholder:text-sub focus:ring-accent";
const btn = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50";
const primary = `${btn} bg-accent text-white`;
const quiet = `${btn} bg-hover`;

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className={cn("max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-chat pb-safe-2 shadow-xl sm:rounded-3xl", wide ? "sm:max-w-xl" : "sm:max-w-md")} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-chat px-4 py-3">
          <b>{title}</b>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-hover">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

function Strength({ pw }: { pw: string }) {
  const s = strengthOf(pw);
  const colors = ["bg-rose-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-emerald-500"];
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", pw && i <= s.score ? colors[s.score] : "bg-hover")} />
        ))}
      </div>
      <p className="text-xs text-sub">{pw ? `${s.label} · about ${s.bits} bits` : "Type a password"}</p>
    </div>
  );
}

// ------------------------------------------------------------------ live 2FA code with a countdown ring
function useTotp(value?: string) {
  const cfg = useMemo(() => (value ? parseTotp(value) : null), [value]);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const window = cfg ? Math.floor(now / 1000 / cfg.period) : 0;
  useEffect(() => {
    if (!cfg) return setCode("");
    let live = true;
    void totpNow(cfg, Date.now()).then((c) => live && setCode(c));
    return () => {
      live = false;
    };
  }, [cfg, window]);
  return { cfg, code, left: cfg ? secondsLeft(cfg.period, now) : 0, frac: cfg ? ringFraction(cfg.period, now) : 0 };
}

function Ring({ frac, left, size = 44 }: { frac: number; left: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${left} seconds left`} data-testid="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" className="stroke-hover" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * frac} transform={`rotate(-90 ${size / 2} ${size / 2})`} className={left <= 5 ? "stroke-rose-500" : "stroke-accent"} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-current text-[12px] font-bold">
        {left}
      </text>
    </svg>
  );
}

function TotpLine({ value, compact }: { value: string; compact?: boolean }) {
  const { cfg, code, left, frac } = useTotp(value);
  if (!cfg) return <p className="text-xs text-rose-400">That 2FA secret isn't valid.</p>;
  return (
    <button type="button" onClick={() => code && void copySecret(code, "Code copied", false)} className="flex items-center gap-3 text-left" aria-label="Copy one-time code">
      <Ring frac={frac} left={left} size={compact ? 36 : 48} />
      <span className={cn("font-mono font-bold tracking-widest tabular-nums", compact ? "text-lg" : "text-2xl", left <= 5 && "text-rose-400")} data-testid="totp-code">
        {code ? groupCode(code) : "······"}
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ generator
function Generator({ onUse, onClose }: { onUse?: (v: string) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"password" | "phrase">("password");
  const [pw, setPw] = useState<PwOpts>(DEFAULT_PW);
  const [ph, setPh] = useState<PhraseOpts>(DEFAULT_PHRASE);
  const make = () => {
    try {
      return mode === "password" ? genPassword(pw) : genPassphrase(ph);
    } catch {
      return "";
    }
  };
  const [value, setValue] = useState(make);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // the initial value is already made; regenerating here would swap it under the user
    }
    setValue(make());
  }, [mode, pw, ph]); // eslint-disable-line react-hooks/exhaustive-deps
  const bits = mode === "password" ? passwordBits(pw) : passphraseBits(ph);
  const tog = (k: "lower" | "upper" | "digits" | "symbols" | "avoidAmbiguous") => setPw((o) => ({ ...o, [k]: !o[k] }));
  const chip = (on: boolean) => cn("rounded-full px-3 py-1.5 text-xs font-semibold", on ? "bg-accent text-white" : "bg-hover");
  return (
    <Sheet title="Password generator" onClose={onClose}>
      <div className="flex gap-2">
        {(["password", "phrase"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={chip(mode === m)}>
            {m === "password" ? "Password" : "Passphrase"}
          </button>
        ))}
      </div>
      <div className="break-all rounded-2xl bg-menu p-4 font-mono text-lg" data-testid="gen-value">
        {value || "Pick at least one kind of character"}
      </div>
      <p className="text-xs text-sub">
        About {bits} bits of strength · {bits >= 100 ? "excellent" : bits >= 70 ? "strong" : "okay"}
      </p>
      {mode === "password" ? (
        <>
          <label className="block text-sm">
            Length: <b>{pw.length}</b>
            <input type="range" min={8} max={64} value={pw.length} onChange={(e) => setPw((o) => ({ ...o, length: +e.target.value }))} className="w-full" aria-label="Length" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => tog("lower")} className={chip(pw.lower)}>a-z</button>
            <button onClick={() => tog("upper")} className={chip(pw.upper)}>A-Z</button>
            <button onClick={() => tog("digits")} className={chip(pw.digits)}>0-9</button>
            <button onClick={() => tog("symbols")} className={chip(pw.symbols)}>!@#</button>
            <button onClick={() => tog("avoidAmbiguous")} className={chip(pw.avoidAmbiguous)}>No look-alikes</button>
          </div>
        </>
      ) : (
        <>
          <label className="block text-sm">
            Words: <b>{ph.words}</b>
            <input type="range" min={3} max={10} value={ph.words} onChange={(e) => setPh((o) => ({ ...o, words: +e.target.value }))} className="w-full" aria-label="Words" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {["-", ".", " ", "_"].map((s) => (
              <button key={s} onClick={() => setPh((o) => ({ ...o, separator: s }))} className={chip(ph.separator === s)} aria-label={`Separator ${s === " " ? "space" : s}`}>
                {s === " " ? "space" : s}
              </button>
            ))}
            <button onClick={() => setPh((o) => ({ ...o, capitalize: !o.capitalize }))} className={chip(ph.capitalize)}>Capitals</button>
            <button onClick={() => setPh((o) => ({ ...o, number: !o.number }))} className={chip(ph.number)}>Number</button>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button onClick={() => setValue(make())} className={cn(quiet, "inline-flex items-center gap-1.5")}>
          <RefreshCw className="size-4" /> New
        </button>
        <button onClick={() => void copySecret(value, "Copied")} className={cn(quiet, "inline-flex items-center gap-1.5")} disabled={!value}>
          <Copy className="size-4" /> Copy
        </button>
        {onUse && (
          <button onClick={() => (onUse(value), onClose())} className={cn(primary, "ml-auto")} disabled={!value}>
            Use this
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ one item: view and edit
function CopyRow({ label, value, secret, mono }: { label: string; value: string; secret?: boolean; mono?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-menu px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wide text-sub">{label}</div>
        <div className={cn("truncate text-sm", mono && "font-mono")}>{secret && !show ? "••••••••••••" : value}</div>
      </div>
      {secret && (
        <button onClick={() => setShow((v) => !v)} aria-label={show ? `Hide ${label}` : `Show ${label}`} className="grid size-8 place-items-center rounded-full hover:bg-hover">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
      <button onClick={() => void copySecret(value, `${label} copied`, !!secret)} aria-label={`Copy ${label}`} className="grid size-8 place-items-center rounded-full hover:bg-hover">
        <Copy className="size-4" />
      </button>
    </div>
  );
}

function ItemView({ item, onEdit, onClose }: { item: PassItem; onEdit: () => void; onClose: () => void }) {
  const url = safeUrl(item.url);
  const fav = (v: boolean) => void saveItem({ ...item, fav: v });
  return (
    <Sheet title={item.title || "Untitled"} onClose={onClose}>
      <div className="flex items-center gap-2 text-xs text-sub">
        <span className="rounded-full bg-hover px-2 py-0.5">{KIND_LABEL[item.kind]}</span>
        {item.updated ? <span>Edited {new Date(item.updated).toLocaleDateString()}</span> : null}
        <button onClick={() => fav(!item.fav)} className="ml-auto inline-flex items-center gap-1 font-semibold" aria-label={item.fav ? "Unpin" : "Pin"}>
          <Star className={cn("size-4", item.fav && "fill-yellow-400 text-yellow-400")} />
          {item.fav ? "Pinned" : "Pin"}
        </button>
      </div>
      {item.totp && (
        <div className="rounded-2xl bg-menu p-3">
          <TotpLine value={item.totp} />
        </div>
      )}
      {item.username && <CopyRow label="Username" value={item.username} />}
      {item.password && <CopyRow label="Password" value={item.password} secret mono />}
      {item.url && (
        <div className="flex items-center gap-2 rounded-2xl bg-menu px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-sub">Website</div>
            <div className="truncate text-sm">{item.url}</div>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open website" className="grid size-8 place-items-center rounded-full hover:bg-hover">
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      )}
      {item.notes && (
        <div className="rounded-2xl bg-menu p-3">
          <div className="mb-1 flex items-center text-[11px] font-bold uppercase tracking-wide text-sub">
            Notes
            <button onClick={() => void copySecret(item.notes ?? "", "Note copied", item.kind === "note")} aria-label="Copy notes" className="ml-auto grid size-7 place-items-center rounded-full hover:bg-hover">
              <Copy className="size-4" />
            </button>
          </div>
          <NoteBody text={item.notes} hidden={item.kind === "note"} />
        </div>
      )}
      {item.kind === "login" && (item.username || item.password) && <AutoType item={item} />}
      <div className="flex gap-2 pt-1">
        <button onClick={onEdit} className={primary}>Edit</button>
        <button onClick={onClose} className={quiet}>Done</button>
      </div>
    </Sheet>
  );
}

function NoteBody({ text, hidden }: { text: string; hidden: boolean }) {
  const [show, setShow] = useState(!hidden);
  return show ? (
    <pre className="whitespace-pre-wrap break-words font-mono text-sm" data-testid="note-body">{text}</pre>
  ) : (
    <button onClick={() => setShow(true)} className="text-sm font-semibold text-accent">
      Tap to reveal
    </button>
  );
}

/** Guided sign-in: open the site, then paste each part. Everything copied is wiped from the clipboard on a timer. */
function AutoType({ item }: { item: PassItem }) {
  const [step, setStep] = useState(0);
  const parts = [
    item.username ? { label: "username", value: item.username, secret: false } : null,
    item.password ? { label: "password", value: item.password, secret: true } : null,
  ].filter(Boolean) as { label: string; value: string; secret: boolean }[];
  const { cfg, code } = useTotp(item.totp);
  const all = [...parts, ...(cfg && code ? [{ label: "2FA code", value: code, secret: false }] : [])];
  const cur = all[Math.min(step, all.length - 1)];
  return (
    <div className="space-y-2 rounded-2xl bg-menu p-3" data-testid="autotype">
      <div className="text-[11px] font-bold uppercase tracking-wide text-sub">Sign-in helper</div>
      <p className="text-xs text-sub">Click the field on the site, then tap the button and paste. Next part, repeat. Copies are cleared for you.</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={async () => {
            if (await copySecret(cur.value, `${cur.label} copied`, cur.secret)) setStep((s) => Math.min(s + 1, all.length));
          }}
          className={primary}
          disabled={step >= all.length}
        >
          {step >= all.length ? "All done" : `Copy ${cur.label}`}
        </button>
        {step > 0 && (
          <button onClick={() => setStep(0)} className={quiet}>
            Start over
          </button>
        )}
      </div>
      <p className="text-[11px] text-sub">
        Step {Math.min(step + 1, all.length)} of {all.length}
      </p>
    </div>
  );
}

function ItemEditor({ item, isNew, onClose, onSaved }: { item: PassItem; isNew: boolean; onClose: () => void; onSaved: (it: PassItem) => void }) {
  const [d, setD] = useState<PassItem>(item);
  const [gen, setGen] = useState(false);
  const [show, setShow] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const totpOk = !d.totp || !!parseTotp(d.totp);
  const up = (p: Partial<PassItem>) => setD((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    const clean: PassItem = { ...d, totp: d.totp?.trim() || undefined, password: d.password || undefined, username: d.username?.trim() || undefined, url: d.url?.trim() || undefined, notes: d.notes?.trim() ? d.notes : undefined };
    const ok = await saveItem(clean);
    setBusy(false);
    if (ok) onSaved({ ...clean, title: clean.title.trim() || "Untitled" });
  };
  return (
    <Sheet title={isNew ? `New ${KIND_LABEL[d.kind].toLowerCase()}` : "Edit"} onClose={onClose} wide>
      <input className={input} placeholder="Name" aria-label="Name" value={d.title} onChange={(e) => up({ title: e.target.value })} maxLength={200} autoFocus={isNew} />
      {d.kind === "login" && (
        <>
          <input className={input} placeholder="Username or email" aria-label="Username" value={d.username ?? ""} onChange={(e) => up({ username: e.target.value })} autoCapitalize="none" autoCorrect="off" />
          <div className="flex gap-2">
            <input className={cn(input, "font-mono")} placeholder="Password" aria-label="Password" type={show ? "text" : "password"} value={d.password ?? ""} onChange={(e) => up({ password: e.target.value })} autoComplete="new-password" />
            <button onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="grid size-10 shrink-0 place-items-center rounded-xl bg-hover">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            <button onClick={() => setGen(true)} aria-label="Generate password" className="grid size-10 shrink-0 place-items-center rounded-xl bg-hover">
              <RefreshCw className="size-4" />
            </button>
          </div>
          <Strength pw={d.password ?? ""} />
          <input className={input} placeholder="Website (https://…)" aria-label="Website" value={d.url ?? ""} onChange={(e) => up({ url: e.target.value })} autoCapitalize="none" inputMode="url" />
        </>
      )}
      {(d.kind === "login" || d.kind === "totp") && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input className={cn(input, "font-mono")} placeholder="2FA secret or otpauth:// link (optional)" aria-label="2FA secret" value={d.totp ?? ""} onChange={(e) => up({ totp: e.target.value })} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            {d.kind === "totp" && (
              <button onClick={() => up({ totp: randomSecret() })} className="shrink-0 rounded-xl bg-hover px-3 text-xs font-semibold" aria-label="Make a new secret">
                New
              </button>
            )}
          </div>
          {!totpOk && <p className="text-xs text-rose-400">That doesn't look like a valid 2FA secret.</p>}
          {d.totp && totpOk && (
            <div className="pt-1">
              <TotpLine value={d.totp} compact />
            </div>
          )}
        </div>
      )}
      <textarea className={cn(input, "min-h-28 font-mono")} placeholder={d.kind === "note" ? "Recovery keys, API tokens, anything private…" : "Notes"} aria-label="Notes" value={d.notes ?? ""} onChange={(e) => up({ notes: e.target.value })} maxLength={20000} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!d.fav} onChange={(e) => up({ fav: e.target.checked })} /> Pin to the top
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => void save()} disabled={busy || !totpOk || (!d.title.trim() && !d.password && !d.notes && !d.totp)} className={primary}>
          Save
        </button>
        <button onClick={onClose} className={quiet}>Cancel</button>
        {!isNew && (
          <button onClick={() => (confirmDel ? void removeItem(d.id).then((ok) => ok && onClose()) : setConfirmDel(true))} className={cn(btn, "ml-auto inline-flex items-center gap-1 text-rose-400")}>
            <Trash2 className="size-4" /> {confirmDel ? "Tap again to delete" : "Delete"}
          </button>
        )}
      </div>
      {gen && <Generator onUse={(v) => up({ password: v })} onClose={() => setGen(false)} />}
    </Sheet>
  );
}

// ------------------------------------------------------------------ import / export
function ImportExport({ onClose }: { onClose: () => void }) {
  const progress = usePass((s) => s.progress);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [enc, setEnc] = useState<EncryptedExport | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const read = async (f: File | undefined) => {
    if (!f) return;
    setMsg("");
    setRes(null);
    setEnc(null);
    if (f.size > 20 * 1024 * 1024) return setMsg("That file is too big for a vault export.");
    const text = await f.text();
    try {
      const j = JSON.parse(text) as { format?: string };
      if (j.format === "nexus-pass-encrypted") return setEnc(j as EncryptedExport);
    } catch {
      /* not JSON: try CSV */
    }
    const r = importAny(text);
    if (!r.items.length) setMsg("No logins or notes found in that file.");
    else setRes(r);
  };
  const unlockFile = async () => {
    if (!enc) return;
    setBusy(true);
    const text = await readProtected(enc, pw);
    setBusy(false);
    if (text === null) return setMsg("Wrong password for that file.");
    const r = importAny(text);
    setEnc(null);
    setPw("");
    setMsg(r.items.length ? "" : "That file is empty.");
    if (r.items.length) setRes(r);
  };
  const doImport = async () => {
    if (!res) return;
    setBusy(true);
    try {
      const { added, dupes } = await addItems(res.items);
      toast(`Imported ${added} item${added === 1 ? "" : "s"}${dupes ? ` (${dupes} already there)` : ""}`, "success");
      setRes(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Import failed.");
    }
    setBusy(false);
  };
  const exportEnc = async () => {
    if (pw.length < MIN_MASTER || pw !== pw2) return setMsg(pw !== pw2 ? "The two passwords don't match." : `Use at least ${MIN_MASTER} characters.`);
    setBusy(true);
    const f = await exportProtected(pw);
    download(`nexus-pass-${new Date().toISOString().slice(0, 10)}.encrypted.json`, JSON.stringify(f), "application/json");
    setBusy(false);
    setPw("");
    setPw2("");
    setMsg("Saved. Keep that password: it can't be recovered.");
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Sheet title="Import and export" onClose={onClose} wide>
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-sub">Import</h3>
        <p className="text-xs text-sub">Nexus Pass, Bitwarden, Chrome, 1Password and LastPass (JSON or CSV).</p>
        <input ref={file} type="file" accept=".json,.csv,.txt,application/json,text/csv" hidden aria-label="Choose a file to import" onChange={(e) => void read(e.target.files?.[0])} />
        <button onClick={() => file.current?.click()} className={cn(quiet, "inline-flex items-center gap-1.5")}>
          <Upload className="size-4" /> Choose file
        </button>
        {enc && (
          <div className="space-y-2 rounded-2xl bg-menu p-3">
            <p className="text-sm">This file is protected. Enter the password it was exported with.</p>
            <input className={input} type="password" placeholder="Export password" aria-label="Export password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button onClick={() => void unlockFile()} disabled={busy || !pw} className={primary}>Open file</button>
          </div>
        )}
        {res && (
          <div className="space-y-2 rounded-2xl bg-menu p-3" data-testid="import-preview">
            <p className="text-sm">
              Found <b>{res.items.length}</b> item{res.items.length === 1 ? "" : "s"} ({res.format}){res.skipped ? `, ${res.skipped} skipped` : ""}.
            </p>
            <button onClick={() => void doImport()} disabled={busy} className={primary}>Import</button>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-sub">Export</h3>
        <p className="text-xs text-rose-400">JSON and CSV files are not protected. Delete them when you are done.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => download(`nexus-pass-${stamp}.json`, exportPlain("json"), "application/json")} className={cn(quiet, "inline-flex items-center gap-1.5")}>
            <Download className="size-4" /> JSON
          </button>
          <button onClick={() => download(`nexus-pass-${stamp}.csv`, exportPlain("csv"), "text/csv")} className={cn(quiet, "inline-flex items-center gap-1.5")}>
            <Download className="size-4" /> CSV
          </button>
        </div>
        <div className="space-y-2 rounded-2xl bg-menu p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="size-4 text-emerald-400" /> Password-protected backup
          </div>
          <input className={input} type="password" placeholder="Backup password" aria-label="Backup password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className={input} type="password" placeholder="Repeat it" aria-label="Repeat backup password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button onClick={() => void exportEnc()} disabled={busy} className={primary}>Save encrypted backup</button>
        </div>
      </section>
      {progress !== null && <p className="text-xs text-sub">Securing with Argon2id… {Math.round(progress * 100)}%</p>}
      {msg && <p className="text-sm text-sub" role="status">{msg}</p>}
    </Sheet>
  );
}

// ------------------------------------------------------------------ settings
function Settings({ onClose }: { onClose: () => void }) {
  const hasPin = usePass((s) => s.hasPin);
  const hasBio = usePass((s) => s.hasBio);
  const progress = usePass((s) => s.progress);
  const error = usePass((s) => s.error);
  const [s, setS] = useState(getSettings());
  const [bioOk, setBioOk] = useState(false);
  const [pin, setPinVal] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => void biometricsAvailable().then(setBioOk), []);
  const upd = (p: Partial<typeof s>) => (saveSettings(p), setS(getSettings()));
  const sel = "rounded-xl bg-menu px-3 py-2 text-sm outline-none ring-1 ring-black/20";
  return (
    <Sheet title="Vault settings" onClose={onClose} wide>
      <label className="flex items-center justify-between gap-3 text-sm">
        Lock after being idle
        <select className={sel} value={s.autoLockMin} onChange={(e) => upd({ autoLockMin: +e.target.value })} aria-label="Auto-lock">
          <option value={1}>1 minute</option>
          <option value={5}>5 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={60}>1 hour</option>
          <option value={0}>Never</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Clear copied secrets after
        <select className={sel} value={s.clipSec} onChange={(e) => upd({ clipSec: +e.target.value })} aria-label="Clipboard clear">
          <option value={15}>15 seconds</option>
          <option value={30}>30 seconds</option>
          <option value={60}>60 seconds</option>
          <option value={120}>2 minutes</option>
          <option value={0}>Never</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.lockOnHide} onChange={(e) => upd({ lockOnHide: e.target.checked })} /> Lock as soon as I switch tabs or apps
      </label>

      <section className="space-y-2 rounded-2xl bg-menu p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="size-4" /> PIN unlock {hasPin && <span className="text-xs font-normal text-emerald-400">on</span>}
        </div>
        <p className="text-xs text-sub">A 4 to 12 digit PIN for this device only. After {MAX_PIN_TRIES} wrong tries it is removed and you need your master password.</p>
        {hasPin ? (
          <button onClick={() => (clearPin(), setMsg("PIN removed."))} className={quiet}>Remove PIN</button>
        ) : (
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" type="password" placeholder="New PIN" aria-label="New PIN" value={pin} onChange={(e) => setPinVal(e.target.value.replace(/\D/g, "").slice(0, 12))} />
            <button
              onClick={async () => {
                if (await setPin(pin)) (setPinVal(""), setMsg("PIN is on for this device."));
                else setMsg("Use 4 to 12 digits.");
              }}
              className={primary}
            >
              Set
            </button>
          </div>
        )}
      </section>

      {bioOk && (
        <section className="flex items-center gap-3 rounded-2xl bg-menu p-3">
          <Fingerprint className="size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Face ID / fingerprint</div>
            <div className="text-xs text-sub">Unlock this device with your face or finger.</div>
          </div>
          {hasBio ? (
            <button onClick={() => (disableBiometrics(), setMsg("Biometrics turned off."))} className={quiet}>Turn off</button>
          ) : (
            <button onClick={async () => setMsg((await enableBiometrics()) ? "Biometric unlock is on." : "")} className={primary}>Turn on</button>
          )}
        </section>
      )}

      <section className="space-y-2 rounded-2xl bg-menu p-3">
        <div className="text-sm font-semibold">Change master password</div>
        <input className={input} type="password" placeholder="Current master password" aria-label="Current master password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
        <input className={input} type="password" placeholder="New master password" aria-label="New master password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
        <Strength pw={newPw} />
        <button
          onClick={async () => {
            if (await changeMasterPassword(oldPw, newPw)) (setOldPw(""), setNewPw(""), setMsg("Master password changed. Your items didn't need re-encrypting."));
          }}
          disabled={!oldPw || !newPw || progress !== null}
          className={primary}
        >
          Change it
        </button>
      </section>
      {progress !== null && <p className="text-xs text-sub">Securing with Argon2id… {Math.round(progress * 100)}%</p>}
      {(error || msg) && <p className="text-sm text-sub" role="status">{error || msg}</p>}
      <button onClick={() => (lockVault(), onClose())} className={cn(quiet, "inline-flex items-center gap-1.5")}>
        <Lock className="size-4" /> Lock now
      </button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ lock screen
function Gate() {
  const status = usePass((s) => s.status);
  const progress = usePass((s) => s.progress);
  const error = usePass((s) => s.error);
  const hasPin = usePass((s) => s.hasPin);
  const hasBio = usePass((s) => s.hasBio);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pin, setPinVal] = useState("");
  const [ok, setOk] = useState(false);
  const [usePw, setUsePw] = useState(false);
  const busy = progress !== null;
  const creating = status === "none";
  const pinMode = hasPin && !usePw && !creating;
  const bioTried = useRef(false);
  useEffect(() => {
    if (status === "locked" && hasBio && !bioTried.current) {
      bioTried.current = true;
      void unlockWithBiometrics();
    }
  }, [status, hasBio]);
  useEffect(() => {
    if (status === "unlocked") bioTried.current = false;
  }, [status]);
  const bad = creating && (pw.length < MIN_MASTER || pw !== pw2 || !ok);
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-8 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-accent/15 text-accent">
        <KeyRound className="size-8" />
      </div>
      <div>
        <h2 className="text-xl font-extrabold">{creating ? "Create your vault" : "Nexus Pass is locked"}</h2>
        <p className="mt-1 text-sm text-sub">{creating ? "Everything is locked on this device with your master password. Our servers only ever see scrambled data." : "Enter your master password to open your passwords and 2FA codes."}</p>
      </div>
      {status === "loading" && <p className="text-sm text-sub">Loading…</p>}
      {status === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-rose-400">{error || "Couldn't load your vault."}</p>
          <button onClick={() => void initPass(true)} className={primary}>Try again</button>
        </div>
      )}
      {(status === "none" || status === "locked") && (
        <form
          className="w-full space-y-3 text-left"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            if (creating) {
              if (!bad) await createVault(pw);
            } else if (pinMode) {
              if (await unlockWithPin(pin)) setPinVal("");
              else setPinVal("");
            } else if (await unlockWithPassword(pw)) setPw("");
          }}
        >
          {pinMode ? (
            <input className={cn(input, "text-center text-2xl tracking-[0.5em]")} type="password" inputMode="numeric" autoFocus placeholder="PIN" aria-label="PIN" value={pin} onChange={(e) => setPinVal(e.target.value.replace(/\D/g, "").slice(0, 12))} />
          ) : (
            <>
              <input className={input} type="password" autoFocus placeholder={creating ? "Choose a master password" : "Master password"} aria-label="Master password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={creating ? "new-password" : "current-password"} />
              {creating && (
                <>
                  <input className={input} type="password" placeholder="Repeat it" aria-label="Repeat master password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
                  <Strength pw={pw} />
                  <label className="flex items-start gap-2 text-xs text-sub">
                    <input type="checkbox" className="mt-0.5" checked={ok} onChange={(e) => setOk(e.target.checked)} />
                    <span>I understand nobody can reset my master password. If I lose it, my vault can't be opened.</span>
                  </label>
                </>
              )}
            </>
          )}
          {error && <p className="text-sm text-rose-400" role="alert">{error}</p>}
          <button type="submit" disabled={busy || (creating ? bad : pinMode ? pin.length < 4 : !pw)} className={cn(primary, "w-full py-3")}>
            {busy ? `Securing… ${Math.round((progress ?? 0) * 100)}%` : creating ? "Create vault" : "Unlock"}
          </button>
          {!creating && (
            <div className="flex justify-center gap-4 text-sm">
              {hasBio && (
                <button type="button" onClick={() => void unlockWithBiometrics()} className="inline-flex items-center gap-1.5 font-semibold text-accent">
                  <Fingerprint className="size-4" /> Biometrics
                </button>
              )}
              {hasPin && (
                <button type="button" onClick={() => setUsePw((v) => !v)} className="font-semibold text-accent">
                  {usePw ? "Use PIN" : "Use master password"}
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the vault
const TABS: { id: ItemKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "login", label: "Logins" },
  { id: "totp", label: "2FA" },
  { id: "note", label: "Notes" },
];

function Vault() {
  const items = usePass((s) => s.items);
  const broken = usePass((s) => s.broken);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ItemKind | "all">("all");
  const [view, setView] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ item: PassItem; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  const [gen, setGen] = useState(false);
  const [io, setIo] = useState(false);
  const [settings, setSettings] = useState(false);
  const list = useMemo(() => filterItems(items, q, tab), [items, q, tab]);
  const viewing = items.find((i) => i.id === view) ?? null;
  const add = (kind: ItemKind) => (setMenu(false), setEdit({ item: blankItem(kind), isNew: true }));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-menu px-4 py-2.5 ring-1 ring-black/20">
          <Search className="size-4 shrink-0 text-sub" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your vault" aria-label="Search your vault" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-sub" />
        </label>
        <button onClick={() => setGen(true)} aria-label="Password generator" className="grid size-10 place-items-center rounded-full bg-hover">
          <RefreshCw className="size-4" />
        </button>
        <button onClick={() => setIo(true)} aria-label="Import and export" className="grid size-10 place-items-center rounded-full bg-hover">
          <Download className="size-4" />
        </button>
        <button onClick={() => setSettings(true)} aria-label="Vault settings" className="grid size-10 place-items-center rounded-full bg-hover">
          <SettingsIcon className="size-4" />
        </button>
        <button onClick={() => lockVault()} aria-label="Lock vault" className="grid size-10 place-items-center rounded-full bg-hover">
          <Lock className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", tab === t.id ? "bg-accent text-white" : "bg-hover")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className={cn(primary, "inline-flex items-center gap-1.5")} aria-haspopup="menu" aria-expanded={menu}>
            <Plus className="size-4" /> Add
          </button>
          {menu && (
            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-2xl bg-menu shadow-xl ring-1 ring-black/30" role="menu">
              {(["login", "totp", "note"] as ItemKind[]).map((k) => (
                <button key={k} role="menuitem" onClick={() => add(k)} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-hover">
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {broken > 0 && <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">{broken} item{broken === 1 ? "" : "s"} couldn't be opened with this vault key. They are kept untouched.</p>}
      {list.length === 0 ? (
        <div className="rounded-2xl bg-menu p-8 text-center text-sm text-sub">{items.length === 0 ? "Your vault is empty. Add a login, a 2FA code or a secure note, or import a file." : "Nothing matches."}</div>
      ) : (
        <ul className="space-y-1.5" data-testid="item-list">
          {list.map((i) => (
            <li key={i.id}>
              <button onClick={() => setView(i.id)} className="flex w-full items-center gap-3 rounded-2xl bg-menu px-3 py-2.5 text-left hover:bg-hover">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-sm font-bold text-accent">
                  {i.kind === "note" ? <StickyNote className="size-5" /> : i.kind === "totp" ? <Timer className="size-5" /> : (i.title || hostOf(i.url) || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="flex items-center gap-1 truncate text-sm">
                    <span className="truncate">{i.title || hostOf(i.url) || "Untitled"}</span>
                    {i.fav && <Star className="size-3.5 shrink-0 fill-yellow-400 text-yellow-400" aria-label="Pinned" />}
                  </b>
                  <span className="block truncate text-xs text-sub">{i.kind === "note" ? "Secure note" : i.username || hostOf(i.url) || KIND_LABEL[i.kind]}</span>
                </span>
                {i.totp && i.kind === "totp" && <TotpLine value={i.totp} compact />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing && !edit && <ItemView item={viewing} onEdit={() => setEdit({ item: viewing, isNew: false })} onClose={() => setView(null)} />}
      {edit && (
        <ItemEditor
          key={edit.item.id}
          item={edit.item}
          isNew={edit.isNew}
          onClose={() => (setEdit(null), edit.isNew || items.some((x) => x.id === edit.item.id) || setView(null))}
          onSaved={(it) => (setEdit(null), setView(it.id))}
        />
      )}
      {gen && <Generator onClose={() => setGen(false)} />}
      {io && <ImportExport onClose={() => setIo(false)} />}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ app
export default function PassApp({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const status = usePass((s) => s.status);
  const userId = useApp((s) => s.userId);
  useEffect(() => {
    if (userId) void initPass();
    return () => undefined;
  }, [userId]);
  useEffect(() => startAutoLock(), []);
  useEffect(() => {
    // another account on the same device must never see this vault
    return () => {
      if (!useApp.getState().userId) resetPass();
    };
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
          <ChevronLeft className="size-5" />
        </button>
        <KeyRound className="size-5 text-emerald-400" />
        <span className="min-w-0 flex-1 truncate font-bold">Nexus Pass</span>
        {status === "unlocked" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <Check className="size-3.5" /> Unlocked
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto max-w-2xl">{status === "unlocked" ? <Vault /> : <Gate />}</div>
      </div>
    </div>
  );
}
