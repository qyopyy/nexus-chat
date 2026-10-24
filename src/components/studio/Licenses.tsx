"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, FileDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "@/store/app";
import { studioGo } from "@/store/studio";
import { cn } from "@/lib/utils";
import {
  STATUS,
  addLicense,
  coverFile,
  downloadLicense,
  emptyLicensor,
  getLicensor,
  listLicenses,
  removeLicense,
  saveLicense,
  saveLicensor,
  today,
  type License,
  type LicenseStatus,
  type Licensor,
} from "@/lib/license";

const inp = "w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none hover:border-line focus:border-accent focus:bg-black/20";

function useLicenses() {
  const [rows, setRows] = useState<License[] | null>(null);
  const [lic, setLic] = useState<Licensor>(emptyLicensor());
  const load = useCallback(async () => {
    const [r, l] = await Promise.all([listLicenses(), getLicensor()]);
    setRows(r);
    setLic(l);
  }, []);
  useEffect(() => void load(), [load]);
  return { rows, setRows, lic, setLic, load };
}

/** the quick "add a row" bar: title, artist, date */
function AddRow({ rows, onAdded }: { rows: License[]; onAdded: (l: License) => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [date, setDate] = useState(today());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !artist.trim()) return toast("Add the release title and artist", "error");
        const last = rows[0];
        const l = await addLicense({ title, artist, effective_date: date, fee: last?.fee ?? 80, currency: last?.currency ?? "USD", release_type: last?.release_type ?? "Single", payment_method: last?.payment_method ?? null });
        if (l) {
          onAdded(l);
          setTitle("");
          setArtist("");
          toast("Row added — press PDF to make the license", "success");
        }
      }}
      className="grid gap-2 rounded-2xl bg-side p-3 sm:grid-cols-[2fr_1.3fr_150px_auto]"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Release title (e.g. Outta Time (Sped Up))" className="min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
      <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" className="min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none [color-scheme:dark] focus:border-accent" />
      <button className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">
        <Plus className="size-4" /> Add row
      </button>
    </form>
  );
}

function Row({ l, lic, onChange, onRemoved, onEdit, onDuplicate }: { l: License; lic: Licensor; onChange: (l: License) => void; onRemoved: () => void; onEdit: () => void; onDuplicate: () => void }) {
  const [v, setV] = useState({ title: l.title, artist: l.artist, effective_date: l.effective_date, fee: String(l.fee) });
  useEffect(() => setV({ title: l.title, artist: l.artist, effective_date: l.effective_date, fee: String(l.fee) }), [l]);
  const save = async (patch: Partial<License>) => {
    const x = await saveLicense(l.id, patch);
    if (x) onChange(x);
  };
  const ready = !!(lic.company_full && lic.signer);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 border-b border-line/50 px-2 py-2 last:border-0 md:grid-cols-[2fr_1.3fr_150px_90px_110px_auto]">
      <input className={cn(inp, "font-semibold")} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} onBlur={() => v.title.trim() && v.title !== l.title && void save({ title: v.title.trim() })} aria-label="Release title" />
      <div className="row-span-2 flex items-center gap-0.5 md:order-last md:row-span-1">
        <button
          onClick={() => (ready ? downloadLicense(l, lic) : toast("Fill in your licensor details first (top of Licenses)", "error"))}
          className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white"
          title="Download PDF"
        >
          <FileDown className="size-3.5" /> PDF
        </button>
        <IconBtn label="Preview" onClick={() => (ready ? downloadLicense(l, lic, true) : toast("Fill in your licensor details first", "error"))}>
          <Eye className="size-4" />
        </IconBtn>
        <IconBtn label="All details" onClick={onEdit}>
          <Pencil className="size-4" />
        </IconBtn>
        <IconBtn label="Duplicate row" onClick={onDuplicate}>
          <Copy className="size-4" />
        </IconBtn>
        <IconBtn label="Delete row" danger onClick={async () => confirm(`Delete the license for “${l.title}”?`) && (await removeLicense(l.id)) && onRemoved()}>
          <Trash2 className="size-4" />
        </IconBtn>
      </div>
      <input className={cn(inp, "text-sub")} value={v.artist} onChange={(e) => setV({ ...v, artist: e.target.value })} onBlur={() => v.artist.trim() && v.artist !== l.artist && void save({ artist: v.artist.trim() })} aria-label="Artist" />
      <input type="date" className={cn(inp, "hidden [color-scheme:dark] md:block")} value={v.effective_date} onChange={(e) => setV({ ...v, effective_date: e.target.value })} onBlur={() => v.effective_date && v.effective_date !== l.effective_date && void save({ effective_date: v.effective_date })} aria-label="Date" />
      <div className="hidden items-center md:flex">
        <span className="text-xs text-sub">{l.currency === "USD" ? "$" : l.currency}</span>
        <input className={inp} value={v.fee} inputMode="decimal" onChange={(e) => setV({ ...v, fee: e.target.value.replace(/[^\d.]/g, "") })} onBlur={() => Number(v.fee) !== Number(l.fee) && void save({ fee: Number(v.fee) || 0 })} aria-label="Fee" />
      </div>
      <select
        value={l.status}
        onChange={(e) => void save({ status: e.target.value as LicenseStatus })}
        className="hidden rounded-full border-0 px-2 py-1 text-xs font-bold text-white outline-none md:block"
        style={{ background: STATUS[l.status].color }}
        aria-label="Status"
      >
        {(Object.keys(STATUS) as LicenseStatus[]).map((s) => (
          <option key={s} value={s} className="bg-side text-txt">
            {STATUS[s].label}
          </option>
        ))}
      </select>
    </div>
  );
}

function IconBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={cn("grid size-8 place-items-center rounded-full text-sub hover:bg-hover hover:text-txt", danger && "hover:bg-dnd/15 hover:text-dnd")}>
      {children}
    </button>
  );
}

function Table({ rows, lic, limit, onRows }: { rows: License[]; lic: Licensor; limit?: number; onRows: (r: License[]) => void }) {
  const [edit, setEdit] = useState<License | null>(null);
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-line/70">
        <div className="hidden grid-cols-[2fr_1.3fr_150px_90px_110px_auto] gap-x-2 border-b border-line/70 bg-black/20 px-4 py-2 text-xs font-semibold text-sub uppercase md:grid">
          <span>Release title</span>
          <span>Artist</span>
          <span>Date</span>
          <span>Fee</span>
          <span>Status</span>
          <span className="w-[178px]" />
        </div>
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-sub">No licenses yet — add your first row above.</p>
        ) : (
          shown.map((l) => (
            <Row
              key={l.id}
              l={l}
              lic={lic}
              onChange={(x) => onRows(rows.map((y) => (y.id === x.id ? x : y)))}
              onRemoved={() => onRows(rows.filter((y) => y.id !== l.id))}
              onEdit={() => setEdit(l)}
              onDuplicate={async () => {
                const x = await addLicense({ ...l, title: `${l.title} (copy)`, effective_date: today() });
                if (x) {
                  const full = await saveLicense(x.id, { artwork_desc: l.artwork_desc, artwork_file: null, release_type: l.release_type, ai_disclosure: l.ai_disclosure, payment_method: l.payment_method });
                  onRows([full ?? x, ...rows]);
                }
              }}
            />
          ))
        )}
      </div>
      {edit && (
        <EditDrawer
          l={edit}
          lic={lic}
          onClose={() => setEdit(null)}
          onSaved={(x) => {
            onRows(rows.map((y) => (y.id === x.id ? x : y)));
            setEdit(x);
          }}
        />
      )}
    </>
  );
}

function EditDrawer({ l, lic, onClose, onSaved }: { l: License; lic: Licensor; onClose: () => void; onSaved: (l: License) => void }) {
  const [v, setV] = useState(l);
  const f = (k: keyof License, label: string, o: { placeholder?: string; type?: string; area?: boolean } = {}) => (
    <label className="block">
      <span className="mb-1 block text-xs text-sub">{label}</span>
      {o.area ? (
        <textarea value={(v[k] as string | null) ?? ""} placeholder={o.placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="min-h-20 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
      ) : (
        <input type={o.type ?? "text"} value={(v[k] as string | number | null) ?? ""} placeholder={o.placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none [color-scheme:dark] focus:border-accent" />
      )}
    </label>
  );
  const save = async () => {
    const patch: Partial<License> = {
      title: v.title.trim() || l.title,
      artist: v.artist.trim() || l.artist,
      effective_date: v.effective_date || l.effective_date,
      fee: Number(v.fee) || 0,
      currency: (v.currency || "USD").toUpperCase().slice(0, 3),
      release_type: v.release_type || "Single",
      release_date: v.release_date || null,
      isrc: v.isrc?.trim().toUpperCase() || null,
      artwork_file: v.artwork_file?.trim() || null,
      artwork_desc: v.artwork_desc?.trim() || null,
      licensee_legal: v.licensee_legal?.trim() || null,
      licensee_address: v.licensee_address?.trim() || null,
      licensee_email: v.licensee_email?.trim() || null,
      payment_method: v.payment_method?.trim() || null,
      ai_disclosure: v.ai_disclosure,
      notes: v.notes?.trim() || null,
    };
    const x = await saveLicense(l.id, patch);
    if (x) {
      onSaved(x);
      toast("Saved", "success");
    }
    return x;
  };
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-chat p-5 pb-safe-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-lg font-bold">{v.title || "License"}</h3>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{f("title", "Release title")}</div>
          {f("artist", "Artist (licensee)")}
          {f("effective_date", "Effective date", { type: "date" })}
          {f("fee", "Fee", { type: "number" })}
          {f("currency", "Currency", { placeholder: "USD" })}
          {f("release_type", "Release type", { placeholder: "Single" })}
          {f("release_date", "Release date (optional)", { type: "date" })}
          {f("isrc", "ISRC (optional)")}
          {f("payment_method", "Payment method", { placeholder: "PayPal" })}
          <div className="sm:col-span-2">{f("artwork_file", "Artwork file name", { placeholder: coverFile(v.title) })}</div>
          <div className="sm:col-span-2">{f("artwork_desc", "What the artwork shows (optional)", { area: true, placeholder: "It shows an original anime-style character holding a cracked pocket watch on a purple stage background" })}</div>
          <div className="text-xs font-bold text-sub uppercase sm:col-span-2">Licensee details (optional)</div>
          {f("licensee_legal", "Legal name")}
          {f("licensee_email", "Email")}
          <div className="sm:col-span-2">{f("licensee_address", "Address")}</div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4" checked={v.ai_disclosure} onChange={(e) => setV({ ...v, ai_disclosure: e.target.checked })} />
            Include the AI-assistance disclosure (3.6)
          </label>
          <div className="sm:col-span-2">{f("notes", "Private notes (not in the PDF)", { area: true })}</div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => void save()} className="rounded-full bg-hover px-5 py-2.5 text-sm font-bold hover:bg-active">
            Save
          </button>
          <button
            onClick={async () => {
              const x = await save();
              if (x) downloadLicense(x, lic);
            }}
            className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white"
          >
            <FileDown className="size-4" /> Save & download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function LicensorCard({ lic, onSaved }: { lic: Licensor; onSaved: (l: Licensor) => void }) {
  const [open, setOpen] = useState(!lic.company_full);
  const [v, setV] = useState(lic);
  useEffect(() => {
    setV(lic);
    setOpen(!lic.company_full);
  }, [lic]);
  const f = (k: keyof Licensor, label: string, ph = "") => (
    <label className="block">
      <span className="mb-1 block text-xs text-sub">{label}</span>
      <input value={String(v[k] ?? "")} placeholder={ph} onChange={(e) => setV({ ...v, [k]: k === "delivery_days" ? Number(e.target.value) || 0 : e.target.value })} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
    </label>
  );
  return (
    <div className="rounded-2xl bg-side p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <span className="flex-1 font-semibold">Licensor (you) — {lic.company_short || lic.company_full || "not set"}</span>
        <span className="text-xs text-sub">{open ? "Hide" : "Edit"}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{f("company_full", "Licensor (full legal name)", "Audia Music Recordings LLC, a Delaware limited liability company")}</div>
          {f("company_short", "Short name (signatures)", "Audia Music Recordings LLC")}
          {f("credit", "Credit line", "Cover art: Audia Music Recordings")}
          <div className="sm:col-span-2">{f("details", "Address · email", "330 Delaware St, Wilmington, DE 19808, USA · you@example.com")}</div>
          {f("signer", "Signer name")}
          {f("signer_title", "Signer title", "Owner")}
          {f("law", "Governing law (state / country)", "Delaware")}
          {f("court", "Courts", "New Castle County, Delaware")}
          {f("size", "Artwork size", "3000 × 3000 px")}
          {f("delivery_days", "Delivery (days after payment)")}
          <button
            onClick={async () => {
              if (await saveLicensor(v)) {
                onSaved(v);
                setOpen(false);
                toast("Licensor saved — used on every license", "success");
              }
            }}
            className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-white sm:col-span-2 sm:justify-self-start"
          >
            Save licensor
          </button>
        </div>
      )}
    </div>
  );
}

/** Studio → Licenses (full page) */
export default function Licenses() {
  const { rows, setRows, lic, setLic } = useLicenses();
  const paid = (rows ?? []).filter((r) => r.status === "paid").reduce((a, r) => a + Number(r.fee), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Licenses", rows?.length ?? 0],
          ["Waiting to be paid", (rows ?? []).filter((r) => r.status !== "paid").length],
          ["Paid", `$${paid.toFixed(0)}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line/70 bg-side p-3">
            <div className="text-xs text-sub">{k}</div>
            <div className="text-2xl font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <LicensorCard lic={lic} onSaved={setLic} />
      {rows && <AddRow rows={rows} onAdded={(l) => setRows([l, ...rows])} />}
      {rows === null ? <p className="text-sm text-sub">Loading…</p> : <Table rows={rows} lic={lic} onRows={setRows} />}
      <p className="text-center text-xs text-sub">Each row becomes the Exclusive Artwork License as a PDF — only the title, artist and date change unless you edit more. Template only, not legal advice.</p>
    </div>
  );
}

/** compact version for the Studio dashboard */
export function LicensesCard() {
  const { rows, setRows, lic } = useLicenses();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-semibold">📄 Licenses</h3>
        <button onClick={() => studioGo("licenses")} className="text-sm font-semibold text-accent hover:underline">
          Open all
        </button>
      </div>
      {rows && <AddRow rows={rows} onAdded={(l) => setRows([l, ...rows])} />}
      {rows && <Table rows={rows} lic={lic} limit={6} onRows={setRows} />}
    </div>
  );
}
