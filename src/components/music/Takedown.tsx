"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, FileText, Mail, Printer, Trash2 } from "lucide-react";
import { toast } from "@/store/app";
import { listWorks, type ShieldWork } from "@/lib/shield";
import { NEED, gate } from "@/lib/premium";
import { cn } from "@/lib/utils";
import {
  PLATFORM,
  STATUS,
  emptyContact,
  listTakedowns,
  loadContact,
  mailtoUrl,
  noticeText,
  printNotice,
  problems,
  removeTakedown,
  saveContact,
  saveTakedown,
  sendCode,
  sendDirect,
  sendStatus,
  setTakedownStatus,
  verifyCode,
  splitLinks,
  subject,
  takePrefill,
  type Contact,
  type Draft,
  type Platform,
  type Takedown,
} from "@/lib/takedown";

const REASONS = [
  ["Re-upload", "This release is an unauthorized re-upload of my recording. I own the master and composition and did not license it to the uploader."],
  ["Sample / beat", "This release uses my recording (beat/sample) without a license or clearance. The matching section starts at about 0:00."],
  ["Wrong artist", "This release was delivered to my artist profile but it is not my music. Please remove it from my profile."],
  ["Impersonation", "This profile/release impersonates my artist name to mislead listeners and divert streams."],
] as const;

const inp = "w-full min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs text-sub">{label}</span>
      {children}
    </label>
  );
}

const blank = (platform: Platform): Draft => ({
  platform,
  work_title: "",
  work_artist: "",
  isrc: "",
  upc: "",
  original_url: "",
  infringing: [],
  description: "",
  contact: emptyContact(),
  signature: "",
  shield_work: null,
});

/** Copyright takedown notices for Spotify & Apple Music */
export default function TakedownTool({ initial }: { initial?: Platform }) {
  const [d, setD] = useState<Draft>(() => blank(initial ?? "spotify"));
  const [links, setLinks] = useState("");
  const [agree, setAgree] = useState([false, false, false]);
  const [works, setWorks] = useState<ShieldWork[]>([]);
  const [history, setHistory] = useState<Takedown[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [srv, setSrv] = useState<{ configured: boolean; test: boolean; verified: string[] }>({ configured: false, test: false, verified: [] });
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    setD((x) => ({ ...x, contact: loadContact() }));
    const pre = takePrefill();
    if (pre) {
      setD((x) => ({ ...x, platform: pre.platform ?? x.platform, work_title: pre.work_title ?? x.work_title, work_artist: pre.work_artist ?? x.work_artist, description: pre.description ?? x.description }));
      if (pre.links?.length) setLinks(pre.links.join("\n"));
    }
    void listWorks().then(setWorks);
    void listTakedowns().then(setHistory);
    void sendStatus().then(setSrv);
  }, []);

  const full: Draft = useMemo(() => ({ ...d, infringing: splitLinks(links) }), [d, links]);
  const issues = problems(full);
  const ready = issues.length === 0 && agree.every(Boolean);
  const P = PLATFORM[d.platform];

  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setC = (p: Partial<Contact>) =>
    setD((x) => {
      const contact = { ...x.contact, ...p };
      saveContact(contact);
      return { ...x, contact };
    });
  const copy = (t: string, what = "Copied") => void navigator.clipboard.writeText(t).then(() => toast(what, "success"));
  const reload = () => void listTakedowns().then(setHistory);

  const record = async (status: "draft" | "sent") => {
    setBusy(true);
    const r = await saveTakedown(full, editing, status === "sent" ? { status: "sent", sent_at: new Date().toISOString() } : { status: "draft" });
    setBusy(false);
    if (r) {
      setEditing(r.id);
      reload();
    }
    return r;
  };

  const myEmail = d.contact.email.trim().toLowerCase();
  const verified = srv.verified.includes(myEmail);

  /** email app fallback (or when the user prefers it) */
  const sendEmail = async () => {
    if (!gate(NEED.takedown, "Takedown notices")) return;
    if (!ready) return toast(`Missing: ${issues[0] ?? "the three statements"}`, "error");
    setBusy(true);
    const r = await saveTakedown(full, editing, { status: "sent", sent_at: new Date().toISOString(), sent_via: "email_app" });
    setBusy(false);
    if (!r) return;
    setEditing(r.id);
    reload();
    window.location.href = mailtoUrl(full);
    toast(`Your email app opened with the notice to ${P.email} — press Send there`, "success");
  };

  /** Nexus sends it: 1) code to your email 2) checked on the server 3) notice goes to the platform */
  const sendNexus = async (skipVerify = false) => {
    if (!gate(NEED.takedown, "Takedown notices")) return;
    if (!ready) return toast(`Missing: ${issues[0] ?? "the three statements"}`, "error");
    if (!srv.configured) return sendEmail();
    setBusy(true);
    try {
      if (!verified && !skipVerify) {
        await sendCode(myEmail);
        setCodeFor(myEmail);
        setCode("");
        toast(`We emailed a 6-digit code to ${myEmail}`, "success");
        return;
      }
      const r = await saveTakedown(full, editing, { status: "draft" });
      if (!r) return;
      setEditing(r.id);
      const res = await sendDirect(r.id);
      toast(res.to === "test" ? "Sent (test mode — went to the test inbox)" : `Sent to ${P.name}! A copy is in your inbox.`, "success");
      reload();
    } catch (e) {
      const err = e as Error & { need_verify?: boolean };
      if (err.need_verify) {
        setSrv((x) => ({ ...x, verified: x.verified.filter((v) => v !== myEmail) }));
        toast("Please verify your email again", "info");
      } else toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!codeFor) return;
    setBusy(true);
    try {
      await verifyCode(codeFor, code);
      setSrv((x) => ({ ...x, verified: [...x.verified, codeFor] }));
      setCodeFor(null);
      setBusy(false);
      toast("Email verified ✓ — sending your notice…", "success");
      await sendNexus(true);
    } catch (e) {
      setBusy(false);
      toast((e as Error).message, "error");
    }
  };
  const openForm = async () => {
    if (!gate(NEED.takedown, "Takedown notices")) return;
    if (!ready) return toast(`Missing: ${issues[0] ?? "the three statements"}`, "error");
    if (!(await record("draft"))) return;
    window.open(P.form, "_blank", "noopener");
    toast("Form opened — copy each field from the boxes below, then mark the notice as sent", "info");
  };

  const load = (t: Takedown) => {
    setEditing(t.id);
    setD({ platform: t.platform, work_title: t.work_title, work_artist: t.work_artist ?? "", isrc: t.isrc ?? "", upc: t.upc ?? "", original_url: t.original_url ?? "", infringing: t.infringing, description: t.description, contact: { ...emptyContact(), ...t.contact }, signature: t.signature, shield_work: t.shield_work });
    setLinks(t.infringing.join("\n"));
    setAgree([false, false, false]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      {/* platform */}
      <div className="grid grid-cols-2 gap-2">
        {(["spotify", "apple"] as const).map((p) => (
          <button
            key={p}
            onClick={() => set({ platform: p })}
            className={cn("rounded-2xl p-3 text-left ring-2 transition", d.platform === p ? "bg-side" : "bg-side/50 opacity-70 ring-transparent")}
            style={d.platform === p ? { boxShadow: `0 0 0 2px ${PLATFORM[p].color}` } : undefined}
          >
            <div className="font-bold" style={{ color: PLATFORM[p].color }}>
              {p === "spotify" ? "● Spotify" : " Apple Music"}
            </div>
            <div className="text-xs text-sub">{p === "spotify" ? "Email to Spotify's copyright team or their report form" : "Apple Music dispute form or Apple's copyright agent"}</div>
          </button>
        ))}
      </div>

      {/* song */}
      <section className="space-y-3 rounded-2xl bg-side p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-semibold">Your song</h3>
          {works.length > 0 && (
            <select
              value={d.shield_work ?? ""}
              onChange={(e) => {
                const w = works.find((x) => x.id === e.target.value);
                if (w) set({ shield_work: w.id, work_title: w.title, work_artist: w.artist ?? "", isrc: w.isrc ?? "", upc: w.upc ?? "" });
                else set({ shield_work: null });
              }}
              className="rounded-full border border-line bg-side px-3 py-1.5 text-xs font-semibold outline-none"
            >
              <option value="">Fill from Shield 360…</option>
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                  {w.artist ? ` — ${w.artist}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Song title *">
            <input className={inp} value={d.work_title} onChange={(e) => set({ work_title: e.target.value })} />
          </Field>
          <Field label="Artist">
            <input className={inp} value={d.work_artist ?? ""} onChange={(e) => set({ work_artist: e.target.value })} />
          </Field>
          <Field label="ISRC">
            <input className={cn(inp, "font-mono")} value={d.isrc ?? ""} placeholder="QT6HV2600001" onChange={(e) => set({ isrc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })} />
          </Field>
          <Field label="UPC">
            <input className={cn(inp, "font-mono")} value={d.upc ?? ""} inputMode="numeric" onChange={(e) => set({ upc: e.target.value.replace(/\D/g, "").slice(0, 14) })} />
          </Field>
          <Field label="Your official release link (optional)" className="sm:col-span-2">
            <input className={inp} value={d.original_url ?? ""} placeholder="Link to your authorized release, YouTube, SoundCloud…" onChange={(e) => set({ original_url: e.target.value })} />
          </Field>
        </div>
      </section>

      {/* infringing */}
      <section className="space-y-3 rounded-2xl bg-side p-4">
        <h3 className="font-semibold">Infringing content on {P.name}</h3>
        <Field label={`Links — one per line (${full.infringing.length}/50)`}>
          <textarea className={cn(inp, "min-h-24 font-mono text-xs")} value={links} placeholder={P.linkHint} onChange={(e) => setLinks(e.target.value)} />
        </Field>
        <div>
          <span className="mb-1 block text-xs text-sub">Description * — what's infringing and why</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {REASONS.map(([k, v]) => (
              <button key={k} type="button" onClick={() => set({ description: d.description ? `${d.description}\n${v}` : v })} className="rounded-full bg-hover px-3 py-1 text-xs font-semibold hover:bg-active">
                + {k}
              </button>
            ))}
          </div>
          <textarea className={cn(inp, "min-h-32")} value={d.description} maxLength={5000} onChange={(e) => set({ description: e.target.value })} placeholder="Explain how the release copies your work: same recording, sampled section with timestamps, when yours was released…" />
        </div>
      </section>

      {/* contact */}
      <section className="space-y-3 rounded-2xl bg-side p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-semibold">You (sent to {P.name})</h3>
          <div className="flex rounded-full bg-black/25 p-0.5 text-xs">
            {(["owner", "agent"] as const).map((r) => (
              <button key={r} onClick={() => setC({ role: r })} className={cn("rounded-full px-3 py-1 font-semibold", d.contact.role === r && "bg-active")}>
                {r === "owner" ? "I'm the rights owner" : "Authorized agent"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full legal name *">
            <input className={inp} value={d.contact.name} onChange={(e) => setC({ name: e.target.value })} />
          </Field>
          <Field label={d.contact.role === "agent" ? "Company you represent *" : "Company / label (optional)"}>
            <input className={inp} value={d.contact.company} onChange={(e) => setC({ company: e.target.value })} />
          </Field>
          <Field label="Email *">
            <input className={inp} type="email" value={d.contact.email} onChange={(e) => setC({ email: e.target.value })} />
          </Field>
          <Field label="Phone *">
            <input className={inp} type="tel" value={d.contact.phone} onChange={(e) => setC({ phone: e.target.value })} />
          </Field>
          <Field label="Postal address *">
            <input className={inp} value={d.contact.address} onChange={(e) => setC({ address: e.target.value })} />
          </Field>
          <Field label="Country *">
            <input className={inp} value={d.contact.country} onChange={(e) => setC({ country: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-sub">Saved only in this browser for next time. {P.name} may share your name and email with the uploader.</p>
      </section>

      {/* statements */}
      <section className="space-y-2 rounded-2xl bg-side p-4 text-sm">
        <h3 className="font-semibold">Statements</h3>
        {[
          "I have a good faith belief that this use is not authorized by the copyright owner, its agent, or the law.",
          "Under penalty of perjury, the information is accurate and I am the owner or authorized to act for the owner.",
          d.platform === "spotify" ? "I understand my contact details and this notice may be shared with the uploader." : "I understand I may be liable for damages under 17 U.S.C. § 512(f) for knowingly false claims.",
        ].map((t, i) => (
          <label key={i} className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={agree[i]} onChange={(e) => setAgree((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} />
            <span>{t}</span>
          </label>
        ))}
        <Field label="Electronic signature — type your full name *">
          <input className={cn(inp, "italic")} value={d.signature} onChange={(e) => set({ signature: e.target.value })} />
        </Field>
      </section>

      {/* actions */}
      <section className="space-y-3 rounded-2xl p-4 ring-2" style={{ boxShadow: `inset 0 0 0 2px ${P.color}55` }}>
        {issues.length > 0 && <p className="text-xs text-idle">Still needed: {issues.join(" · ")}</p>}
        <div className="flex flex-wrap gap-2">
          {d.platform === "spotify" ? (
            <>
              <button disabled={busy} onClick={() => void sendNexus()} className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-black text-black disabled:opacity-50" style={{ background: P.color }}>
                <Mail className="size-4" /> {busy ? "Working…" : "Send to Spotify"}
              </button>
              <button disabled={busy} onClick={() => void openForm()} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2.5 text-sm font-semibold hover:bg-active">
                <ExternalLink className="size-4" /> Use Spotify's form instead
              </button>
            </>
          ) : (
            <>
              <button disabled={busy} onClick={() => void openForm()} className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-black text-white disabled:opacity-50" style={{ background: P.color }}>
                <ExternalLink className="size-4" /> Open Apple Music dispute form
              </button>
              <button disabled={busy} onClick={() => void sendNexus()} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2.5 text-sm font-semibold hover:bg-active">
                <Mail className="size-4" /> Send to Apple&apos;s copyright agent
              </button>
            </>
          )}
          <button onClick={() => copy(`${subject(full)}\n\n${noticeText(full)}`, "Notice copied")} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2.5 text-sm font-semibold hover:bg-active">
            <Copy className="size-4" /> Copy
          </button>
          <button onClick={() => printNotice(full)} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2.5 text-sm font-semibold hover:bg-active">
            <Printer className="size-4" /> PDF
          </button>
          <button onClick={() => setPreview(!preview)} className="flex items-center gap-1.5 rounded-full bg-hover px-4 py-2.5 text-sm font-semibold hover:bg-active">
            <FileText className="size-4" /> {preview ? "Hide" : "Preview"}
          </button>
        </div>
        {codeFor && (
          <div className="rounded-xl bg-black/30 p-3">
            <div className="text-sm font-semibold">Enter the 6-digit code we sent to {codeFor}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && void confirmCode()}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                className="w-36 rounded-lg border border-line bg-transparent px-3 py-2 text-center font-mono text-lg tracking-[.4em] outline-none focus:border-accent"
              />
              <button disabled={busy || code.length !== 6} onClick={() => void confirmCode()} className="rounded-full px-5 py-2 text-sm font-black text-black disabled:opacity-40" style={{ background: P.color }}>
                Verify & send
              </button>
              <button disabled={busy} onClick={() => void sendCode(codeFor).then(() => toast("New code sent", "success")).catch((e: Error) => toast(e.message, "error"))} className="text-xs text-sub underline">
                Resend code
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-sub">
          {srv.configured
            ? `Nexus sends the notice to ${P.email} for you${srv.test ? " (TEST MODE — goes to the test inbox)" : ""}. ${verified ? `Replies go to ${myEmail} ✓` : "First we email you a code to confirm the address replies should go to."} You get a copy, and Nexus Bot confirms in chat.`
            : d.platform === "spotify"
              ? `“Send to Spotify” opens your email app with the full notice addressed to ${P.email} — press Send there so Spotify replies to you.`
              : "Apple handles Apple Music claims through its dispute form. Open it, then copy each field from the boxes below."}{" "}
          {srv.configured && (
            <button onClick={() => void sendEmail()} className="text-accent underline">
              Use my own email app instead
            </button>
          )}
        </p>

        {(d.platform === "apple" || preview) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {(d.platform === "apple"
              ? [
                  ["Rights Owner", d.contact.company || d.contact.name],
                  ["Country", d.contact.country],
                  ["Submitter name", d.contact.name],
                  ["Email", d.contact.email],
                  ["Address", d.contact.address],
                  ["Links (Provide Links)", full.infringing.join("\n")],
                  ["Description", noticeText(full)],
                ]
              : [
                  ["Subject", subject(full)],
                  ["Notice", noticeText(full)],
                ]
            ).map(([k, v]) => (
              <button key={k} onClick={() => copy(v, `${k} copied`)} className={cn("rounded-xl bg-black/25 p-2.5 text-left hover:bg-black/40", (k === "Description" || k === "Notice") && "sm:col-span-2")}>
                <span className="flex items-center gap-1 text-[11px] font-bold text-sub uppercase">
                  {k} <Copy className="size-3" />
                </span>
                <span className={cn("block text-sm whitespace-pre-wrap", k === "Description" || k === "Notice" ? "max-h-64 overflow-y-auto font-mono text-xs" : "truncate")}>{v || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* history */}
      {history.length > 0 && (
        <section className="rounded-2xl bg-side p-4">
          <h3 className="mb-2 font-semibold">Your notices</h3>
          <div className="space-y-2">
            {history.map((t) => (
              <div key={t.id} className={cn("rounded-xl border border-line/70 p-3", editing === t.id && "ring-2 ring-accent")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: PLATFORM[t.platform].color }}>
                    {PLATFORM[t.platform].name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {t.work_title}
                    {t.work_artist ? ` — ${t.work_artist}` : ""}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: STATUS[t.status].color }}>
                    {STATUS[t.status].label}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-sub">
                  {t.infringing.length} link(s) · {t.sent_at ? `sent ${new Date(t.sent_at).toLocaleDateString([], { dateStyle: "medium" })}` : `created ${new Date(t.created_at).toLocaleDateString([], { dateStyle: "medium" })}`}
                  {t.note ? ` · ${t.note}` : ""}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <button onClick={() => load(t)} className="rounded-full bg-hover px-3 py-1 font-semibold hover:bg-active">
                    Open
                  </button>
                  {t.status === "draft" && (
                    <button onClick={async () => (await setTakedownStatus(t.id, "sent")) && reload()} className="rounded-full bg-hover px-3 py-1 font-semibold hover:bg-active">
                      Mark as sent
                    </button>
                  )}
                  {t.status === "sent" && (
                    <>
                      <button onClick={async () => (await setTakedownStatus(t.id, "resolved")) && reload()} className="rounded-full bg-ok px-3 py-1 font-semibold text-white">
                        Taken down ✓
                      </button>
                      <button
                        onClick={async () => {
                          const note = prompt("What did they say? (optional)");
                          if (note !== null && (await setTakedownStatus(t.id, "rejected", note || null))) reload();
                        }}
                        className="rounded-full bg-hover px-3 py-1 font-semibold hover:bg-active"
                      >
                        Rejected
                      </button>
                    </>
                  )}
                  <button
                    onClick={async () => {
                      if (!confirm("Remove this notice from your list?")) return;
                      if (await removeTakedown(t.id)) {
                        if (editing === t.id) setEditing(null);
                        reload();
                      }
                    }}
                    className="ml-auto grid size-7 place-items-center rounded-full text-sub hover:bg-dnd/15 hover:text-dnd"
                    aria-label="Remove notice"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="pb-4 text-center text-xs text-sub">
        Only file notices for music you own or are authorized to represent — false claims can carry legal liability. Policies:{" "}
        <a href={PLATFORM.spotify.policy} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Spotify
        </a>{" "}
        ·{" "}
        <a href={PLATFORM.apple.policy} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Apple
        </a>
      </p>
    </div>
  );
}
