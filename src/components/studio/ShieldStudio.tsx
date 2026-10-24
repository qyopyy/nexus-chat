"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudUpload, Download, FileText, Lock, LockOpen, Paperclip, RefreshCw, ShieldCheck, Trash2, Upload, UserPlus, X } from "lucide-react";
import { useApp, toast, openModal } from "@/store/app";
import { friendIds } from "@/lib/data";
import { myRank } from "@/lib/admin";
import {
  DOC_ACCEPT,
  DOC_KINDS,
  docUrl,
  isLive,
  listDocs,
  listEvents,
  listWorks,
  registerWork,
  removeDoc,
  removeWork,
  shieldCheck,
  syncAcr,
  updateWork,
  uploadDoc,
  vaultUrl,
  type DocKind,
  type RegisterStep,
  type ShieldDoc,
  type ShieldEvent,
  type ShieldWork,
} from "@/lib/shield";
import { checkStatus, clipFromFile, copyrightCheck } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { buildCertificate } from "@/lib/certificate";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { Card, H } from "./Studio";
import { NEED, gate, needPlan, useMyTier } from "@/lib/premium";

type Draft = { id: string; file: File; title: string; artist: string; isrc: string; upc: string; docs: { file: File; kind: DocKind }[]; lockUntil: string; keep: boolean; allow: string[]; step?: RegisterStep; error?: string; done?: boolean };

const WHERE: Record<string, string> = { chat: "in a chat", video: "as a video", release: "as a release", space: "in a space", send: "to stores", tool: "in a test" };

export default function ShieldStudio() {
  const me = useApp((s) => s.userId)!;
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "");
  const staff = myRank() >= 3;
  const tier = useMyTier();
  const [all, setAll] = useState(false);
  const [works, setWorks] = useState<ShieldWork[] | null>(null);
  const [events, setEvents] = useState<ShieldEvent[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<string | null>(null);
  const [acr, setAcr] = useState<{ configured: boolean; shieldBucket?: boolean } | null>(null);
  useEffect(() => void checkStatus().then(setAcr), []);
  const pick = useRef<HTMLInputElement>(null);
  const testPick = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const w = await listWorks(all && staff);
    setWorks(w);
    setEvents(await listEvents(w.map((x) => x.id)));
  }, [all, staff]);
  useEffect(() => void load(), [load]);

  const add = (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("audio/") || /\.(wav|flac|mp3|m4a|aac|ogg|aiff?)$/i.test(f.name));
    if (!list.length) return toast("Pick audio files (WAV, FLAC, MP3, M4A…)", "error");
    setDrafts((d) => [
      ...d,
      ...list.map((f) => ({ id: crypto.randomUUID(), file: f, title: f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").slice(0, 200), artist: myName, isrc: "", upc: "", docs: [], lockUntil: "", keep: true, allow: [] })),
    ]);
  };
  const patch = (id: string, p: Partial<Draft>) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const protectAll = async () => {
    if (!gate(NEED.shield, "Shield 360 protection")) return;
    setBusy(true);
    for (const d of drafts.filter((x) => !x.done)) {
      try {
        await registerWork(
          d.file,
          { title: d.title.trim() || "Untitled", artist: d.artist.trim(), isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(d.isrc) ? d.isrc : undefined, upc: /^\d{12,14}$/.test(d.upc) ? d.upc : undefined, docs: d.docs, unlock_at: d.lockUntil ? new Date(`${d.lockUntil}T00:00:00`).toISOString() : null, allow_users: d.allow, keepFile: d.keep },
          (step) => patch(d.id, { step }),
        );
        patch(d.id, { done: true, error: undefined });
      } catch (e) {
        patch(d.id, { error: (e as Error).message, step: undefined });
      }
    }
    setBusy(false);
    setDrafts((d) => d.filter((x) => !x.done));
    void load();
  };

  const stats = useMemo(() => {
    const mine = works ?? [];
    const month = Date.now() - 30 * 86400_000;
    return { locked: mine.filter(isLive).length, total: mine.length, blocked: events.length, recent: events.filter((e) => new Date(e.at).getTime() > month).length };
  }, [works, events]);

  return (
    <>
      <H
        right={
          staff ? (
            <div className="flex rounded-full bg-black/25 p-0.5 text-sm">
              <button onClick={() => setAll(false)} className={cn("rounded-full px-3 py-1.5 font-semibold", !all && "bg-active")}>
                Mine
              </button>
              <button onClick={() => setAll(true)} className={cn("rounded-full px-3 py-1.5 font-semibold", all && "bg-active")}>
                Everyone
              </button>
            </div>
          ) : undefined
        }
      >
        Shield 360
      </H>

      <div className="mb-4 overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg,#0b3a5c,#1b0b5c 55%,#5c0b3a)" }}>
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/70 uppercase">
          <ShieldCheck className="size-4" /> Content protection
        </div>
        <div className="mt-1 text-2xl font-black sm:text-3xl">Lock your unreleased music</div>
        <p className="mt-1 max-w-2xl text-sm text-white/80">
          Upload your songs once. Nexus stores an audio fingerprint and keeps the original in your private vault (only you can download it). Until you unlock a song, nobody else can send it in chats, post
          it as a video, play it in a space or submit it for distribution — even re-encoded, cut or quieter copies are recognised.
        </p>
        {tier < NEED.shield && (
          <button onClick={() => openModal("premium", needPlan(NEED.shield).id)} className="mt-3 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-black">
            💎 Shield 360 comes with Nexus Lighting Premium — $5.99/mo
          </button>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-3 py-1">🧬 Nexus fingerprint · on</span>
          <span className="rounded-full bg-white/15 px-3 py-1">🎚 {tier >= 4 ? "Unlimited songs" : tier >= 3 ? "Up to 25 songs" : tier >= 2 ? "Up to 10 songs" : "Premium plan needed"}</span>
          <span className={cn("rounded-full px-3 py-1", acr?.shieldBucket ? "bg-[#00ff9c]/25" : "bg-white/10 text-white/60")}>
            ☁️ ACRCloud bucket · {acr?.shieldBucket ? "connected" : staffHint(staff)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Locked songs", stats.locked],
            ["Protected total", stats.total],
            ["Blocked uploads", stats.blocked],
            ["Blocked · 30 days", stats.recent],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <div className="text-2xl font-black tabular-nums">{v}</div>
              <div className="text-xs text-white/70">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Protect new songs">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                add(e.dataTransfer.files);
              }}
              onClick={() => pick.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line p-6 text-center hover:border-accent/60"
            >
              <Upload className="size-7 text-sub" />
              <div className="font-semibold">Drop songs here or tap to choose</div>
              <div className="text-xs text-sub">WAV, FLAC, MP3, M4A · several at once</div>
              <input ref={pick} type="file" multiple accept="audio/*,.wav,.flac,.mp3,.m4a,.aiff" hidden onChange={(e) => (e.target.files && add(e.target.files), (e.target.value = ""))} />
            </div>
            {drafts.length > 0 && (
              <div className="mt-3 space-y-2">
                {drafts.map((d) => (
                  <DraftRow key={d.id} d={d} busy={busy} onPatch={(p) => patch(d.id, p)} onRemove={() => setDrafts((x) => x.filter((y) => y.id !== d.id))} />
                ))}
                <button disabled={busy} onClick={() => void protectAll()} className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
                  <Lock className="size-4" /> {busy ? "Protecting…" : `Protect ${drafts.length} song${drafts.length === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
          </Card>

          <Card title={`Protected songs${works ? ` (${works.length})` : ""}`}>
            {works === null ? (
              <p className="text-sm text-sub">Loading…</p>
            ) : works.length === 0 ? (
              <p className="text-sm text-sub">Nothing protected yet.</p>
            ) : (
              <div className="space-y-2">
                {works.map((w) => (
                  <WorkRow key={w.id} w={w} mine={w.owner_id === me} blocked={events.filter((e) => e.work_id === w.id).length} onChange={(x) => setWorks((ws) => (ws ?? []).map((y) => (y.id === x.id ? x : y)))} onRemoved={() => void load()} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Blocked attempts">
            {events.length === 0 ? (
              <p className="text-sm text-sub">When someone tries to upload one of your locked songs, you&apos;ll see who, where and when.</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 30).map((e) => {
                  const w = works?.find((x) => x.id === e.work_id);
                  return (
                    <div key={e.id} className="flex items-center gap-2.5 text-sm">
                      {e.user_id ? <Avatar userId={e.user_id} size={28} plain /> : <span className="size-7 rounded-full bg-white/10" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          {e.user_id ? <NameTag userId={e.user_id} badges={false} /> : "Someone"} <span className="text-sub">tried “{w?.title ?? "song"}” {WHERE[e.context] ?? ""}</span>
                        </div>
                        <div className="text-xs text-sub">{new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Test a file">
            <p className="mb-2 text-sm text-sub">Check whether a file would be blocked (your own songs show up here too).</p>
            <button onClick={() => testPick.current?.click()} className="rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
              Choose file
            </button>
            <input
              ref={testPick}
              type="file"
              accept="audio/*,video/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setTest("Listening…");
                const hit = await shieldCheck(f, "tool");
                let line = hit ? `🛡️ Nexus fingerprint: “${hit.title}”${hit.artist ? ` by ${hit.artist}` : ""} (confidence ${Math.min(100, Math.round(hit.score / 3))}%)` : "✅ Nexus fingerprint: no protected song";
                if (acr?.configured) {
                  try {
                    const c = await copyrightCheck(await clipFromFile(f), { kind: "tool" });
                    const sh = c.matches.find((m) => (m as { shield?: boolean }).shield);
                    line += sh ? `\n☁️ ACRCloud: protected “${sh.title}”` : c.status === "match" ? `\n☁️ ACRCloud: released song “${c.matches[0]?.title}” — ${c.matches[0]?.artists.join(", ")}` : "\n☁️ ACRCloud: no match";
                  } catch (err) {
                    line += `\n☁️ ACRCloud: ${(err as Error).message}`;
                  }
                }
                setTest(line);
              }}
            />
            {test && <p className="mt-2 text-sm whitespace-pre-line">{test}</p>}
          </Card>

          <p className="text-xs text-faint">
            Shield 360 is Nexus&apos;s own fingerprint system and protects uploads inside Nexus. It isn&apos;t connected to Audible Magic or YouTube Content ID — for blocking on other platforms, register
            the released songs with your distributor&apos;s Content ID service.
          </p>
        </div>
      </div>
    </>
  );
}

function FriendPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ids = friendIds();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <span key={id} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-0.5 text-xs">
            <Avatar userId={id} size={18} plain /> <NameTag userId={id} badges={false} />
            <button onClick={() => onChange(value.filter((x) => x !== id))} aria-label="Remove">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-xs font-semibold">
          <UserPlus className="size-3.5" /> Allow someone
        </button>
      </div>
      {open && (
        <div className="mt-1.5 max-h-40 overflow-y-auto rounded-xl bg-black/30 p-1">
          {ids.length === 0 && <div className="p-2 text-xs text-sub">Add friends first.</div>}
          {ids
            .filter((id) => !value.includes(id))
            .map((id) => (
              <button key={id} type="button" onClick={() => onChange([...value, id].slice(0, 50))} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-white/5">
                <Avatar userId={id} size={22} plain /> <NameTag userId={id} badges={false} />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function DraftRow({ d, busy, onPatch, onRemove }: { d: Draft; busy: boolean; onPatch: (p: Partial<Draft>) => void; onRemove: () => void }) {
  const inp = "w-full rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent";
  return (
    <div className="rounded-xl border border-line/70 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-sub">
        <span className="min-w-0 flex-1 truncate">
          {d.file.name} · {(d.file.size / 1048576).toFixed(1)} MB
        </span>
        {!busy && (
          <button onClick={onRemove} aria-label="Remove">
            <X className="size-4" />
          </button>
        )}
      </div>
      <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
        <input className={inp} value={d.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Song title" />
        <input className={inp} value={d.artist} onChange={(e) => onPatch({ artist: e.target.value })} placeholder="Artist" />
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <input className={cn(inp, "font-mono")} value={d.isrc} onChange={(e) => onPatch({ isrc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })} placeholder="ISRC (optional)" />
          <input className={cn(inp, "font-mono")} inputMode="numeric" value={d.upc} onChange={(e) => onPatch({ upc: e.target.value.replace(/\D/g, "").slice(0, 14) })} placeholder="UPC / EAN (optional)" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="shrink-0 text-xs text-sub">Auto-unlock</span>
          <input type="date" className={cn(inp, "[color-scheme:dark]")} value={d.lockUntil} min={new Date().toISOString().slice(0, 10)} onChange={(e) => onPatch({ lockUntil: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={d.keep} onChange={(e) => onPatch({ keep: e.target.checked })} className="size-4" /> Keep the original in my private vault
        </label>
        <div className="sm:col-span-2">
          <FriendPicker value={d.allow} onChange={(allow) => onPatch({ allow })} />
        </div>
        <div className="sm:col-span-2">
          <DocPicker docs={d.docs} onChange={(docs) => onPatch({ docs })} />
        </div>
      </fieldset>
      {d.step && (
        <div className="mt-2">
          <div className="text-xs text-sub">{d.step.step}</div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full bg-accent transition-all" style={{ width: `${d.step.p * 100}%` }} />
          </div>
        </div>
      )}
      {d.error && <div className="mt-2 text-sm text-dnd">{d.error}</div>}
    </div>
  );
}

function WorkRow({ w, mine, blocked, onChange, onRemoved }: { w: ShieldWork; mine: boolean; blocked: number; onChange: (w: ShieldWork) => void; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const live = isLive(w);
  const autoAt = w.unlock_at ? new Date(w.unlock_at) : null;
  const [flip, setFlip] = useState(false);
  const toggleLock = async () => {
    setFlip(true);
    const x = await updateWork(w.id, live ? { status: "unlocked" } : { status: "locked", unlock_at: autoAt && autoAt < new Date() ? null : w.unlock_at });
    setFlip(false);
    if (x) {
      onChange(x);
      toast(live ? "Unlocked — anyone can upload it now" : "Locked — uploads of this song are blocked again", "success");
    }
  };
  return (
    <div className="rounded-xl border border-line/70">
      <div className="flex items-center gap-2 pr-3">
      <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", live ? "bg-accent/20 text-accent" : "bg-white/10 text-sub")}>{live ? <Lock className="size-5" /> : <LockOpen className="size-5" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{w.title}</span>
          <span className="block truncate text-xs text-sub">
            {[w.artist, w.duration ? `${Math.floor(w.duration / 60)}:${String(Math.round(w.duration % 60)).padStart(2, "0")}` : null, `${w.hash_count.toLocaleString()} landmarks`].filter(Boolean).join(" · ")}
            {!mine && (
              <>
                {" · owner "}
                <NameTag userId={w.owner_id} badges={false} />
              </>
            )}
          </span>
        </span>
        <span className="text-right text-xs">
          <span className={cn("block font-bold", live ? "text-accent" : "text-sub")}>{live ? (autoAt ? `Locked until ${autoAt.toLocaleDateString([], { month: "short", day: "numeric" })}` : "Locked") : "Unlocked"}</span>
          {blocked > 0 && <span className="block text-dnd">{blocked} blocked</span>}
        </span>
      </button>
        {mine && (
          <button
            disabled={flip}
            onClick={() => void toggleLock()}
            role="switch"
            aria-checked={live}
            aria-label={live ? "Unlock song" : "Lock song"}
            title={live ? "Tap to unlock" : "Tap to lock"}
            className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", live ? "bg-accent" : "bg-white/15")}
          >
            <span className={cn("absolute top-0.5 grid size-6 place-items-center rounded-full bg-white text-black shadow transition-all", live ? "left-[22px]" : "left-0.5")}>
              {live ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </span>
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-3 border-t border-line/60 p-3">
          {mine && (
            <div className="flex flex-wrap gap-2">
              <button
                disabled={flip}
                onClick={() => void toggleLock()}
                className={cn("flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold", live ? "bg-hover hover:bg-active" : "bg-accent text-white")}
              >
                {live ? <LockOpen className="size-4" /> : <Lock className="size-4" />} {live ? "Unlock" : "Lock again"}
              </button>
              <label className="flex items-center gap-2 rounded-full bg-hover px-3 py-1 text-sm">
                Auto-unlock
                <input
                  type="date"
                  className="bg-transparent outline-none [color-scheme:dark]"
                  value={w.unlock_at ? w.unlock_at.slice(0, 10) : ""}
                  onChange={async (e) => {
                    const x = await updateWork(w.id, { unlock_at: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null });
                    if (x) onChange(x);
                  }}
                />
              </label>
              {w.file_path && (
                <button
                  onClick={async () => {
                    const u = await vaultUrl(w);
                    if (u) window.open(u, "_blank");
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active"
                >
                  <Download className="size-4" /> Original
                </button>
              )}
              <button
                onClick={() => {
                  const st = useApp.getState();
                  const p = st.profiles[w.owner_id];
                  const bytes = buildCertificate(w, { name: p?.display_name ?? p?.username ?? "Owner", username: p?.username ?? "user" });
                  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `Shield 360 Certificate – ${w.title.replace(/[\\/:*?"<>|]+/g, "")}.pdf`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }}
                className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active"
                title="Proof-of-creation certificate (PDF): registration time, file hash, fingerprint"
              >
                <FileText className="size-4" /> Certificate
              </button>
            </div>
          )}
          {mine && <CodesRow w={w} onChange={onChange} />}
          <AcrRow w={w} mine={mine} onChange={onChange} />
          <Docs w={w} mine={mine} />
          {mine && (
            <div>
              <div className="mb-1 text-xs text-sub">People who may upload it while locked (collaborators, your label…)</div>
              <FriendPicker
                value={w.allow_users}
                onChange={async (allow_users) => {
                  const x = await updateWork(w.id, { allow_users });
                  if (x) onChange(x);
                }}
              />
            </div>
          )}
          <button
            onClick={async () => {
              if (!confirm(`Remove protection for “${w.title}”? The fingerprint${w.file_path ? " and the vault copy" : ""} will be deleted.`)) return;
              if (await removeWork(w)) onRemoved();
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-dnd"
          >
            <Trash2 className="size-4" /> Remove protection
          </button>
        </div>
      )}
    </div>
  );
}

const staffHint = (staff: boolean) => (staff ? "add it in Distribution settings" : "not connected");

function DocPicker({ docs, onChange }: { docs: { file: File; kind: DocKind }[]; onChange: (d: { file: File; kind: DocKind }[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {docs.map((d, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-2 text-xs">
            <FileText className="size-3" /> <span className="max-w-32 truncate">{d.file.name}</span>
            <select value={d.kind} onChange={(e) => onChange(docs.map((x, j) => (j === i ? { ...x, kind: e.target.value as DocKind } : x)))} className="bg-transparent text-[11px] text-sub outline-none">
              {DOC_KINDS.map((k) => (
                <option key={k.id} value={k.id} className="bg-side">
                  {k.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onChange(docs.filter((_, j) => j !== i))} aria-label="Remove">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => ref.current?.click()} className="flex items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-xs font-semibold">
          <Paperclip className="size-3.5" /> Attach documents (PDF…)
        </button>
      </div>
      <input
        ref={ref}
        type="file"
        multiple
        accept={DOC_ACCEPT}
        hidden
        onChange={(e) => {
          const f = [...(e.target.files ?? [])].map((file) => ({ file, kind: (/split/i.test(file.name) ? "split_sheet" : /contract|agreement/i.test(file.name) ? "contract" : "proof") as DocKind }));
          e.target.value = "";
          onChange([...docs, ...f].slice(0, 20));
        }}
      />
    </div>
  );
}

function CodesRow({ w, onChange }: { w: ShieldWork; onChange: (w: ShieldWork) => void }) {
  const [isrc, setIsrc] = useState(w.isrc ?? "");
  const [upc, setUpc] = useState(w.upc ?? "");
  const inp = "w-full rounded-lg border border-line bg-transparent px-2.5 py-1.5 font-mono text-sm outline-none focus:border-accent";
  const save = async (patch: Partial<ShieldWork>) => {
    const x = await updateWork(w.id, patch);
    if (x) onChange(x);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="mb-0.5 block text-xs text-sub">ISRC</span>
        <input
          className={inp}
          value={isrc}
          placeholder="CC-XXX-YY-NNNNN"
          onChange={(e) => setIsrc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
          onBlur={() => {
            if (isrc === (w.isrc ?? "")) return;
            if (isrc && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) return toast("ISRC looks like CCXXXYYNNNNN (12 characters)", "error");
            void save({ isrc: isrc || null });
          }}
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-xs text-sub">UPC / EAN</span>
        <input
          className={inp}
          inputMode="numeric"
          value={upc}
          placeholder="12–14 digits"
          onChange={(e) => setUpc(e.target.value.replace(/\D/g, "").slice(0, 14))}
          onBlur={() => {
            if (upc === (w.upc ?? "")) return;
            if (upc && !/^\d{12,14}$/.test(upc)) return toast("UPC is 12–14 digits", "error");
            void save({ upc: upc || null });
          }}
        />
      </label>
    </div>
  );
}

function AcrRow({ w, mine, onChange }: { w: ShieldWork; mine: boolean; onChange: (w: ShieldWork) => void }) {
  const [busy, setBusy] = useState(false);
  const label =
    w.acr_status === "ready" ? "Registered in your ACRCloud bucket" : w.acr_status === "pending" ? "Uploading to ACRCloud…" : w.acr_status === "error" ? `ACRCloud: ${w.acr_error ?? "failed"}` : w.acr_status === "skipped" ? `ACRCloud: ${w.acr_error ?? "skipped"}` : "Not sent to ACRCloud yet";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm">
      <CloudUpload className={cn("size-4", w.acr_status === "ready" ? "text-ok" : w.acr_status === "error" ? "text-dnd" : "text-sub")} />
      <span className="min-w-0 flex-1">{label}</span>
      {mine && w.acr_status !== "pending" && (
        <button
          disabled={busy}
          onClick={async () => {
            if (!gate(NEED.acr, "ACRCloud sync")) return;
            setBusy(true);
            const r = await syncAcr(w.id);
            setBusy(false);
            if (r.ok) toast("Registered with ACRCloud", "success");
            else toast(r.error ?? "ACRCloud isn't connected yet", r.skipped ? "info" : "error");
            const [x] = (await listWorks()).filter((y) => y.id === w.id);
            if (x) onChange(x);
          }}
          className="flex items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs font-semibold hover:bg-active disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> {w.acr_status === "ready" ? "Re-sync" : "Send to ACRCloud"}
        </button>
      )}
    </div>
  );
}

function Docs({ w, mine }: { w: ShieldWork; mine: boolean }) {
  const [docs, setDocs] = useState<ShieldDoc[] | null>(null);
  const [kind, setKind] = useState<DocKind>("proof");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => void listDocs(w.id).then(setDocs), [w.id]);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs text-sub">
        <FileText className="size-3.5" /> Documents {docs ? `(${docs.length})` : ""}
        <span className="text-faint">· private, only you can open them</span>
      </div>
      <div className="space-y-1">
        {docs?.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5 text-sm">
            <FileText className={cn("size-4 shrink-0", d.mime === "application/pdf" ? "text-dnd" : "text-sub")} />
            <button
              onClick={async () => {
                const u = await docUrl(d);
                if (u) window.open(u, "_blank");
              }}
              className="min-w-0 flex-1 truncate text-left hover:underline"
              title="Open"
            >
              {d.name}
            </button>
            <span className="hidden shrink-0 text-xs text-sub sm:inline">{DOC_KINDS.find((k) => k.id === d.kind)?.label}</span>
            {d.bytes ? <span className="shrink-0 text-xs text-sub">{(d.bytes / 1048576).toFixed(1)} MB</span> : null}
            <button
              onClick={async () => {
                const u = await docUrl(d, true);
                if (u) window.open(u, "_blank");
              }}
              className="grid size-7 place-items-center rounded text-sub hover:text-txt"
              aria-label="Download"
            >
              <Download className="size-4" />
            </button>
            {mine && (
              <button onClick={async () => confirm(`Delete ${d.name}?`) && (await removeDoc(d)) && setDocs((x) => (x ?? []).filter((y) => y.id !== d.id))} className="grid size-7 place-items-center rounded text-sub hover:text-dnd" aria-label="Delete">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        {docs?.length === 0 && <div className="text-xs text-faint">No documents yet — add contracts, split sheets or proof of ownership.</div>}
      </div>
      {mine && (
        <div className="mt-1.5 flex items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className="rounded-lg border border-line bg-transparent px-2 py-1 text-xs outline-none">
            {DOC_KINDS.map((k) => (
              <option key={k.id} value={k.id} className="bg-side">
                {k.label}
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={() => ref.current?.click()} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs font-semibold hover:bg-active disabled:opacity-50">
            <Paperclip className="size-3.5" /> {busy ? "Uploading…" : "Attach PDF / file"}
          </button>
          <input
            ref={ref}
            type="file"
            multiple
            accept={DOC_ACCEPT}
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              setBusy(true);
              for (const f of files) {
                const d = await uploadDoc(w.id, f, kind);
                if (d) setDocs((x) => [d, ...(x ?? [])]);
              }
              setBusy(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
