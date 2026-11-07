"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bold,
  Download,
  FilePlus2,
  FilePen,
  CalendarDays,
  Italic,
  PenLine,
  Redo2,
  RotateCw,
  ShieldCheck,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { sanitizeDownloadName, sniffPdf } from "@/lib/fileSafety";
import { buildEditedPdf, isBlankPage, nextBlankPageId, PdfEditError, type PdfAnnotation, type PdfFontId } from "@/lib/pdfEdit";
import { loadPdfjs } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";
import SignaturePad, { forgetSavedSignature, loadSavedSignature, type Signature } from "./SignaturePad";

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_PAGES = 80;
const LETTER = { width: 612, height: 792 };

type Placed = PdfAnnotation & { pageHeight: number };

type Snapshot = { order: number[]; notes: Placed[]; rotations: Record<number, number>; current: number };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fontId(bold: boolean, italic: boolean): PdfFontId {
  if (bold && italic) return "helveticaBoldOblique";
  if (bold) return "helveticaBold";
  if (italic) return "helveticaOblique";
  return "helvetica";
}

function fontFamilyCss(id: PdfFontId) {
  if (id.includes("Bold") && id.includes("Oblique")) return "Helvetica, Arial, sans-serif";
  return "Helvetica, Arial, sans-serif";
}

function fontWeightCss(id: PdfFontId) {
  return id.includes("Bold") ? 700 : 400;
}

function fontStyleCss(id: PdfFontId) {
  return id.includes("Oblique") ? "italic" : "normal";
}

export default function PdfEditor({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [name, setName] = useState("document");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [notes, setNotes] = useState<Placed[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [text, setText] = useState("");
  const [size, setSize] = useState(18);
  const [color, setColor] = useState("#111827");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [watermark, setWatermark] = useState("");
  const [pageNumbers, setPageNumbers] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<{ scale: number; width: number; height: number } | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [histTick, setHistTick] = useState(0);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  // signing
  const [sig, setSig] = useState<Signature | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  useEffect(() => setSig(loadSavedSignature()), []);
  const dragMoved = useRef(false);

  useEffect(() => {
    return () => {
      void taskRef.current?.destroy();
    };
  }, []);

  function snap(): Snapshot {
    return { order: [...order], notes: notes.map((n) => ({ ...n })), rotations: { ...rotations }, current };
  }

  function pushHistory() {
    history.current.push(snap());
    if (history.current.length > 40) history.current.shift();
    future.current = [];
    setHistTick((n) => n + 1);
  }

  function restore(s: Snapshot) {
    setOrder(s.order);
    setNotes(s.notes);
    setRotations(s.rotations);
    setCurrent(Math.min(s.current, Math.max(0, s.order.length - 1)));
  }

  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(snap());
    restore(prev);
    setHistTick((n) => n + 1);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(snap());
    restore(next);
    setHistTick((n) => n + 1);
  }

  async function clearSession() {
    await taskRef.current?.destroy();
    taskRef.current = null;
    docRef.current = null;
    bytesRef.current = null;
    setReady(false);
    setOrder([]);
    setNotes([]);
    setRotations({});
    setThumbs({});
    setMetrics(null);
    setWatermark("");
    setPageNumbers(false);
    setText("");
    setError(null);
    setName("document");
    setSelectedNote(null);
    setZoom(1);
    history.current = [];
    future.current = [];
  }

  async function openFile(file: File) {
    setError(null);
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That PDF is over 40 MB.");
      return;
    }
    setBusy(true);
    try {
      await sniffPdf(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfjs = await loadPdfjs();
      await taskRef.current?.destroy();
      const task = pdfjs.getDocument({ data: bytes.slice() });
      const doc = await task.promise;
      if (doc.numPages > MAX_PAGES) {
        await task.destroy();
        throw new Error(`This editor allows up to ${MAX_PAGES} pages.`);
      }
      taskRef.current = task;
      docRef.current = doc;
      bytesRef.current = bytes;
      const nextOrder = Array.from({ length: doc.numPages }, (_, i) => i);
      setName(sanitizeDownloadName(file.name.replace(/\.pdf$/i, ""), "document"));
      setOrder(nextOrder);
      setCurrent(0);
      setNotes([]);
      setRotations({});
      setThumbs({});
      setReady(true);
      setSelectedNote(null);
      history.current = [];
      future.current = [];
      void renderThumbs(doc, nextOrder);
    } catch (err) {
      setReady(false);
      setError(err instanceof Error ? err.message : "Couldn't open that PDF. It may be encrypted or damaged.");
    } finally {
      setBusy(false);
    }
  }

  async function renderThumbs(doc: PDFDocumentProxy, pages: number[]) {
    for (const index of pages) {
      if (isBlankPage(index)) {
        setThumbs((prev) => ({ ...prev, [index]: "" }));
        continue;
      }
      try {
        const page = await doc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 0.22 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({ canvas, viewport }).promise;
        setThumbs((prev) => ({ ...prev, [index]: canvas.toDataURL("image/jpeg", 0.7) }));
      } catch {
        /* thumbnail is optional */
      }
    }
  }

  useEffect(() => {
    const doc = docRef.current;
    const canvas = previewRef.current;
    const stage = stageRef.current;
    const src = order[current];
    if (!canvas || !stage || src === undefined) return;
    let cancel = false;

    if (isBlankPage(src)) {
      const width = Math.min(768, Math.max(280, stage.clientWidth - 8)) * zoom;
      const scale = width / LETTER.width;
      canvas.width = Math.floor(LETTER.width * scale);
      canvas.height = Math.floor(LETTER.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#e5e7eb";
        ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
      }
      setMetrics({ scale, width: LETTER.width, height: LETTER.height });
      return;
    }

    if (!doc) return;
    const width = Math.min(768, Math.max(280, stage.clientWidth - 8)) * zoom;
    void (async () => {
      const page = await doc.getPage(src + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, width / base.width);
      const viewport = page.getViewport({ scale, rotation: rotations[src] ?? 0 });
      if (cancel) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      if (cancel) return;
      setMetrics({ scale, width: base.width, height: base.height });
    })().catch(() => {
      if (!cancel) setError("Couldn't draw this page.");
    });
    return () => {
      cancel = true;
    };
  }, [order, current, ready, zoom, rotations]);

  function placeAt(x: number, y: number) {
    const src = order[current];
    const pageHeight = metrics?.height;
    if (src === undefined || !pageHeight) return;
    const value = text.trim();
    if (!value) {
      setError("Type the text first, then click the page.");
      return;
    }
    setError(null);
    pushHistory();
    const note: Placed = {
      id: uid(),
      page: src,
      text: value,
      x,
      y,
      size: Math.max(8, Math.min(96, size)),
      color,
      font: fontId(bold, italic),
      opacity,
      pageHeight,
    };
    setNotes((list) => [...list, note]);
    setSelectedNote(note.id);
  }

  /** drop the signature centred on (x, y) in PDF space */
  function placeSignature(x: number, y: number, s: Signature | null = sig) {
    const src = order[current];
    const pageHeight = metrics?.height;
    const pageWidth = metrics?.width;
    if (!s || src === undefined || !pageHeight || !pageWidth) return;
    const width = Math.min(pageWidth * 0.4, 170);
    const height = (width * s.h) / s.w;
    pushHistory();
    const note: Placed = {
      id: uid(),
      page: src,
      text: "Signature",
      image: s.url,
      width,
      height,
      x: Math.max(0, Math.min(pageWidth - width, x - width / 2)),
      y: Math.max(0, Math.min(pageHeight - height, y - height / 2)),
      size: 12,
      color: "#000000",
      opacity: 1,
      pageHeight,
    };
    setNotes((list) => [...list, note]);
    setSelectedNote(note.id);
    setPlacing(false);
    setError(null);
  }

  function addDate() {
    const src = order[current];
    const pageHeight = metrics?.height;
    if (src === undefined || !pageHeight || !metrics) return;
    const sel = notes.find((n) => n.id === selectedNote && n.image);
    const label = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    pushHistory();
    const note: Placed = {
      id: uid(),
      page: src,
      text: label,
      x: sel ? sel.x : 48,
      y: sel ? Math.max(8, sel.y - 16) : 48,
      size: 11,
      color: "#111827",
      font: "helvetica",
      opacity: 1,
      pageHeight,
    };
    setNotes((list) => [...list, note]);
    setSelectedNote(note.id);
  }

  function resizeSelected(width: number) {
    setNotes((list) => list.map((n) => (n.id === selectedNote && n.image && n.width && n.height ? { ...n, height: (n.height / n.width) * width, width } : n)));
  }

  function onStageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current) return;
    if ((e.target as HTMLElement).closest("[data-note]")) return;
    const canvas = previewRef.current;
    if (!canvas || !metrics) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * metrics.width;
    const py = metrics.height - ((e.clientY - rect.top) / rect.height) * metrics.height;
    if (placing) return placeSignature(px, py);
    placeAt(Math.max(0, px), Math.max(0, py));
  }

  function move(dir: -1 | 1) {
    const j = current + dir;
    if (j < 0 || j >= order.length) return;
    pushHistory();
    setOrder((list) => {
      const next = list.slice();
      [next[current], next[j]] = [next[j], next[current]];
      return next;
    });
    setCurrent(j);
  }

  function removePage() {
    if (order.length <= 1) return;
    const src = order[current];
    pushHistory();
    setOrder((list) => list.filter((_, i) => i !== current));
    setNotes((list) => list.filter((note) => note.page !== src));
    setCurrent((i) => Math.max(0, Math.min(i, order.length - 2)));
  }

  function insertBlank() {
    if (order.length >= MAX_PAGES) {
      setError(`This editor allows up to ${MAX_PAGES} pages.`);
      return;
    }
    pushHistory();
    const id = nextBlankPageId();
    setOrder((list) => {
      const next = list.slice();
      next.splice(current + 1, 0, id);
      return next;
    });
    setCurrent((i) => i + 1);
  }

  function rotatePage() {
    const src = order[current];
    if (src === undefined || isBlankPage(src)) return;
    pushHistory();
    setRotations((r) => ({ ...r, [src]: ((r[src] ?? 0) + 90) % 360 }));
  }

  async function download() {
    const bytes = bytesRef.current;
    if (!bytes) return;
    setBusy(true);
    setError(null);
    try {
      const out = await buildEditedPdf(bytes.slice(), order, notes, { watermark, pageNumbers, rotations });
      const blob = new Blob([new Uint8Array(out)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}-${notes.some((n) => n.image) ? "signed" : "edited"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof PdfEditError ? err.message : "Couldn't save that PDF.");
    } finally {
      setBusy(false);
    }
  }

  const srcPage = order[current];
  const pageNotes = notes.filter((note) => note.page === srcPage);
  const activeFont = fontId(bold, italic);

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-1.5 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
          <ArrowLeft className="size-5" />
        </button>
        <FilePen className="size-5 text-[#faa61a]" />
        <span className="min-w-0 flex-1 truncate font-bold">PDF editor &amp; sign</span>
        {ready && (
          <>
            <button onClick={undo} disabled={histTick >= 0 && history.current.length === 0} className="grid size-9 place-items-center rounded-full hover:bg-hover disabled:opacity-30" aria-label="Undo">
              <Undo2 className="size-4" />
            </button>
            <button onClick={redo} disabled={histTick >= 0 && future.current.length === 0} className="grid size-9 place-items-center rounded-full hover:bg-hover disabled:opacity-30" aria-label="Redo">
              <Redo2 className="size-4" />
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Zoom out">
              <ZoomOut className="size-4" />
            </button>
            <span className="w-10 text-center text-[11px] text-sub">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)))} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Zoom in">
              <ZoomIn className="size-4" />
            </button>
            <button onClick={() => void clearSession()} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Clear PDF from memory">
              <Trash2 className="size-4" />
            </button>
            <button onClick={() => void download()} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              <Download className="size-4" /> Download
            </button>
          </>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto mb-4 flex max-w-6xl items-start gap-2 rounded-2xl bg-side/80 px-3 py-2 text-xs text-sub">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
          <span>
            Sign PDFs, add text, reorder and rotate pages, watermarks and page numbers. Files stay in this tab. Caps at {MAX_PAGES} pages · 40 MB. Helvetica family only for overlay text.
          </span>
        </div>
        {!ready ? (
          <label className="mx-auto grid min-h-72 max-w-xl cursor-pointer place-items-center rounded-2xl border border-dashed border-white/15 bg-side p-8 text-center">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              aria-label="Choose a PDF"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openFile(file);
                e.target.value = "";
              }}
            />
            <FilePen className="mb-3 size-10 text-sub" />
            <span className="block font-semibold">{busy ? "Opening PDF…" : "Open a PDF document"}</span>
            <span className="mt-1 block max-w-sm text-sm text-sub">Sign, annotate, reorder, rotate, insert blanks, watermark, then download. Editing stays on this device.</span>
          </label>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
            <aside className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Pages</h2>
                <span className="text-xs text-sub">{order.length}</span>
              </div>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {order.map((page, index) => (
                  <button
                    key={`${page}-${index}`}
                    onClick={() => setCurrent(index)}
                    className={cn("flex w-full items-center gap-2 rounded-xl p-2 text-left", index === current ? "bg-accent/20 ring-1 ring-accent" : "bg-side hover:bg-hover")}
                    aria-label={`Page ${index + 1}`}
                  >
                    <span className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-black/30 text-xs text-sub">
                      {isBlankPage(page) ? (
                        <span className="text-[10px]">Blank</span>
                      ) : thumbs[page] ? (
                        <img src={thumbs[page]} alt="" className="max-h-full max-w-full" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">Page {index + 1}</span>
                      <span className="block text-xs text-sub">
                        {isBlankPage(page) ? "Blank" : rotations[page] ? `${rotations[page]}°` : "Original"} · {notes.filter((n) => n.page === page).length} notes
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button onClick={() => move(-1)} disabled={current === 0} className="grid size-9 place-items-center rounded-xl bg-side hover:bg-hover disabled:opacity-40" aria-label="Move page up">
                  <ArrowUp className="size-4" />
                </button>
                <button onClick={() => move(1)} disabled={current >= order.length - 1} className="grid size-9 place-items-center rounded-xl bg-side hover:bg-hover disabled:opacity-40" aria-label="Move page down">
                  <ArrowDown className="size-4" />
                </button>
                <button onClick={rotatePage} disabled={isBlankPage(srcPage)} className="grid size-9 place-items-center rounded-xl bg-side hover:bg-hover disabled:opacity-40" aria-label="Rotate page">
                  <RotateCw className="size-4" />
                </button>
                <button onClick={removePage} disabled={order.length <= 1} className="grid size-9 place-items-center rounded-xl bg-side text-dnd hover:bg-hover disabled:opacity-40" aria-label="Delete page">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <button onClick={insertBlank} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs font-semibold hover:bg-white/10">
                <FilePlus2 className="size-3.5" /> Insert blank page
              </button>
            </aside>

            <div ref={stageRef} className="min-w-0 overflow-auto">
              <div className="relative mx-auto w-fit max-w-full cursor-crosshair" onClick={onStageClick}>
                <canvas ref={previewRef} className="h-auto max-w-full rounded-xl bg-white shadow-lg" />
                {metrics &&
                  pageNotes.map((note) => (
                    <span
                      key={note.id}
                      data-note={note.id}
                      className={cn("absolute cursor-move whitespace-pre text-left select-none", selectedNote === note.id && "outline outline-2 outline-accent")}
                      style={{
                        left: `${(note.x / metrics.width) * 100}%`,
                        top: `${((metrics.height - note.y - (note.image ? (note.height ?? 60) : note.size)) / metrics.height) * 100}%`,
                        ...(note.image ? { width: `${((note.width ?? 160) / metrics.width) * 100}%` } : {}),
                        fontSize: `${Math.max(8, note.size * metrics.scale)}px`,
                        color: note.color,
                        opacity: note.opacity ?? 1,
                        fontFamily: fontFamilyCss(note.font ?? "helvetica"),
                        fontWeight: fontWeightCss(note.font ?? "helvetica"),
                        fontStyle: fontStyleCss(note.font ?? "helvetica"),
                        lineHeight: 1.25,
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedNote(note.id);
                        const canvas = previewRef.current;
                        if (!canvas || !metrics) return;
                        const rect = canvas.getBoundingClientRect();
                        dragMoved.current = false;
                        dragRef.current = {
                          id: note.id,
                          ox: ((e.clientX - rect.left) / rect.width) * metrics.width - note.x,
                          oy: metrics.height - ((e.clientY - rect.top) / rect.height) * metrics.height - note.y,
                        };
                        const onMove = (ev: MouseEvent) => {
                          const d = dragRef.current;
                          if (!d || !metrics || !previewRef.current) return;
                          dragMoved.current = true;
                          const r = previewRef.current.getBoundingClientRect();
                          const nx = ((ev.clientX - r.left) / r.width) * metrics.width - d.ox;
                          const ny = metrics.height - ((ev.clientY - r.top) / r.height) * metrics.height - d.oy;
                          setNotes((list) => list.map((n) => (n.id === d.id ? { ...n, x: Math.max(0, nx), y: Math.max(0, ny) } : n)));
                        };
                        const onUp = () => {
                          if (dragRef.current && dragMoved.current) pushHistory();
                          dragRef.current = null;
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    >
                      {note.image ? <img src={note.image} alt="Signature" draggable={false} className="pointer-events-none block w-full" /> : note.text}
                    </span>
                  ))}
                {placing && (
                  <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                    <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-lg">Tap where the signature goes</span>
                  </div>
                )}
              </div>
            </div>

            <aside className="h-fit space-y-3 rounded-2xl bg-side p-4">
              <div className="space-y-2 rounded-xl bg-accent/10 p-3 ring-1 ring-accent/30">
                <h2 className="flex items-center gap-1.5 font-bold">
                  <PenLine className="size-4 text-accent" /> Sign
                </h2>
                {sig ? (
                  <>
                    <div className="grid h-16 place-items-center rounded-lg bg-white p-1">
                      <img src={sig.url} alt="Your signature" className="max-h-full max-w-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={() => setPlacing((v) => !v)} className={cn("rounded-lg py-2 text-xs font-bold", placing ? "bg-white text-black" : "bg-accent text-white")}>
                        {placing ? "Cancel" : "Place on page"}
                      </button>
                      <button onClick={() => metrics && placeSignature(metrics.width * 0.72, 90)} className="rounded-lg bg-white/10 py-2 text-xs font-semibold">
                        Bottom-right
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <button onClick={() => setSigOpen(true)} className="flex items-center gap-1 font-semibold text-accent">
                        <PenLine className="size-3.5" /> New signature
                      </button>
                      <button onClick={addDate} className="flex items-center gap-1 font-semibold text-sub hover:text-txt">
                        <CalendarDays className="size-3.5" /> Add date
                      </button>
                      <button
                        onClick={() => {
                          forgetSavedSignature();
                          setSig(null);
                        }}
                        className="ml-auto text-sub hover:text-dnd"
                      >
                        Forget
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => setSigOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-sm font-bold text-white">
                    <PenLine className="size-4" /> Create signature
                  </button>
                )}
                {notes.find((n) => n.id === selectedNote && n.image) && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold tracking-wide text-sub uppercase">Signature size</span>
                    <input type="range" min={60} max={360} value={notes.find((n) => n.id === selectedNote)?.width ?? 170} onChange={(e) => resizeSelected(Number(e.target.value))} onPointerDown={pushHistory} className="w-full accent-accent" />
                  </label>
                )}
                <p className="text-[11px] text-sub">Draw, type or upload your signature, place it, then download the signed PDF. Nothing leaves this device.</p>
              </div>
              <h2 className="font-bold">Text tools</h2>
              <p className="text-xs text-sub">Style a note, click the page to place it, then drag to reposition.</p>
              <label className="block">
                <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Text</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  aria-label="Annotation text"
                  placeholder="Heading, caption, stamp…"
                  className="w-full resize-none rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent"
                />
              </label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setBold((v) => !v)} className={cn("grid size-9 place-items-center rounded-lg", bold ? "bg-accent text-white" : "bg-white/5")} aria-pressed={bold} aria-label="Bold">
                  <Bold className="size-4" />
                </button>
                <button type="button" onClick={() => setItalic((v) => !v)} className={cn("grid size-9 place-items-center rounded-lg", italic ? "bg-accent text-white" : "bg-white/5")} aria-pressed={italic} aria-label="Italic">
                  <Italic className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => metrics && placeAt(48, Math.max(8, metrics.height - 48 - size))}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/5 text-xs font-semibold hover:bg-white/10"
                >
                  <AlignLeft className="size-3.5" /> Top-left
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Size</span>
                  <input
                    type="number"
                    min={8}
                    max={96}
                    value={size}
                    aria-label="Text size"
                    onChange={(e) => setSize(Math.max(8, Math.min(96, Number(e.target.value) || 18)))}
                    className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Color</span>
                  <input type="color" value={color} aria-label="Text color" onChange={(e) => setColor(e.target.value)} className="h-[46px] w-full rounded-xl border border-white/10 bg-input px-2" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 flex justify-between text-xs font-bold tracking-wide text-sub uppercase">
                  Opacity <span>{Math.round(opacity * 100)}%</span>
                </span>
                <input type="range" min={0.2} max={1} step={0.05} value={opacity} aria-label="Opacity" onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-accent" />
              </label>
              <p className="text-[11px] text-sub" style={{ fontFamily: fontFamilyCss(activeFont), fontWeight: fontWeightCss(activeFont), fontStyle: fontStyleCss(activeFont) }}>
                Preview · Helvetica{bold ? " Bold" : ""}
                {italic ? " Italic" : ""}
              </p>
              <button onClick={() => metrics && placeAt(48, Math.max(8, metrics.height - 48 - size))} className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white">
                Add at top of page
              </button>

              <div className="border-t border-white/10 pt-3">
                <h3 className="mb-2 text-sm font-bold">Export options</h3>
                <label className="mb-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pageNumbers} onChange={(e) => setPageNumbers(e.target.checked)} className="accent-accent" />
                  Page numbers footer
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Watermark</span>
                  <input
                    value={watermark}
                    onChange={(e) => setWatermark(e.target.value.slice(0, 40))}
                    aria-label="Watermark text"
                    placeholder="CONFIDENTIAL"
                    className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent"
                  />
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {["CONFIDENTIAL", "DRAFT", "FOR REVIEW", "COPY"].map((w) => (
                    <button key={w} type="button" onClick={() => setWatermark(w)} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10">
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {pageNotes.length > 0 && (
                <ul className="space-y-1 border-t border-white/10 pt-3">
                  {pageNotes.map((note) => (
                    <li key={note.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", selectedNote === note.id ? "bg-accent/20" : "bg-black/20")}>
                      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedNote(note.id)}>
                        {note.image ? "✍️ Signature" : note.text}
                      </button>
                      <button
                        onClick={() => {
                          pushHistory();
                          setNotes((list) => list.filter((item) => item.id !== note.id));
                        }}
                        className="text-sub hover:text-dnd"
                        aria-label={`Remove ${note.text}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={() => void download()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold disabled:opacity-50">
                <Download className="size-4" /> {busy ? "Saving…" : "Download PDF"}
              </button>
            </aside>
          </div>
        )}
        {error && <p className="mx-auto mt-3 max-w-6xl text-sm text-dnd">{error}</p>}
        {sigOpen && (
          <SignaturePad
            onClose={() => setSigOpen(false)}
            onDone={(s) => {
              setSig(s);
              setSigOpen(false);
              setPlacing(true);
            }}
          />
        )}
        {ready && (
          <label className="mx-auto mt-4 block max-w-6xl text-sm text-accent">
            Open a different PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              aria-label="Open a different PDF"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openFile(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
