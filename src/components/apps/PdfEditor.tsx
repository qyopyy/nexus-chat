"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Download, FilePen, ShieldCheck, Trash2 } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { sanitizeDownloadName, sniffPdf } from "@/lib/fileSafety";
import { buildEditedPdf, PdfEditError, type PdfAnnotation } from "@/lib/pdfEdit";
import { loadPdfjs } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_PAGES = 80;

type Placed = PdfAnnotation & { pageHeight: number };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function PdfEditor({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [name, setName] = useState("document");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [notes, setNotes] = useState<Placed[]>([]);
  const [text, setText] = useState("");
  const [size, setSize] = useState(18);
  const [color, setColor] = useState("#111827");
  const [watermark, setWatermark] = useState("");
  const [ready, setReady] = useState(false);
  const bytesRef = useRef<Uint8Array | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<{ scale: number; width: number; height: number } | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  useEffect(() => {
    return () => {
      void taskRef.current?.destroy();
    };
  }, []);

  async function clearSession() {
    await taskRef.current?.destroy();
    taskRef.current = null;
    docRef.current = null;
    bytesRef.current = null;
    setReady(false);
    setOrder([]);
    setNotes([]);
    setThumbs({});
    setMetrics(null);
    setWatermark("");
    setText("");
    setError(null);
    setName("document");
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
      setThumbs({});
      setReady(true);
      void renderThumbs(doc, nextOrder);
    } catch (err) {
      setReady(false);
      setError(err instanceof Error ? err.message : "Couldn't open that PDF. It may be encrypted or damaged.");
    } finally {
      setBusy(false);
    }
  }

  async function renderThumbs(doc: PDFDocumentProxy, pages: number[]) {
    const next: Record<number, string> = {};
    for (const index of pages) {
      try {
        const page = await doc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 0.22 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({ canvas, viewport }).promise;
        next[index] = canvas.toDataURL("image/jpeg", 0.7);
        setThumbs((prev) => ({ ...prev, [index]: next[index] }));
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
    if (!doc || !canvas || !stage || src === undefined) return;
    let cancel = false;
    const width = Math.min(768, Math.max(280, stage.clientWidth - 8));
    void (async () => {
      const page = await doc.getPage(src + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, width / base.width);
      const viewport = page.getViewport({ scale });
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
  }, [order, current, ready]);

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
    setNotes((list) => [
      ...list,
      { id: uid(), page: src, text: value, x, y, size: Math.max(8, Math.min(96, size)), color, pageHeight },
    ]);
  }

  function onStageClick(e: React.MouseEvent<HTMLDivElement>) {
    const canvas = previewRef.current;
    if (!canvas || !metrics) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * metrics.width;
    const py = metrics.height - ((e.clientY - rect.top) / rect.height) * metrics.height;
    placeAt(Math.max(0, px), Math.max(0, py));
  }

  function move(dir: -1 | 1) {
    const j = current + dir;
    if (j < 0 || j >= order.length) return;
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
    setOrder((list) => list.filter((_, i) => i !== current));
    setNotes((list) => list.filter((note) => note.page !== src));
    setCurrent((i) => Math.max(0, Math.min(i, order.length - 2)));
  }

  async function download() {
    const bytes = bytesRef.current;
    if (!bytes) return;
    setBusy(true);
    setError(null);
    try {
      const out = await buildEditedPdf(bytes.slice(), order, notes, { watermark });
      const blob = new Blob([new Uint8Array(out)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}-edited.pdf`;
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
          <ArrowLeft className="size-5" />
        </button>
        <FilePen className="size-5 text-[#00a8fc]" />
        <span className="min-w-0 flex-1 truncate font-bold">PDF editor</span>
        {ready && (
          <>
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
          <span>PDFs stay in this browser tab. File headers are checked, encrypted PDFs are rejected, and the editor caps at {MAX_PAGES} pages. Use Clear to wipe the open file from memory.</span>
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
            <span className="block font-semibold">{busy ? "Opening PDF…" : "Choose a PDF"}</span>
            <span className="mt-1 block max-w-sm text-sm text-sub">Add text, reorder pages, delete pages, then download. Editing stays on this device.</span>
          </label>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
            <aside className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Pages</h2>
                <span className="text-xs text-sub">{order.length}</span>
              </div>
              <div className="space-y-2">
                {order.map((page, index) => (
                  <button
                    key={`${page}-${index}`}
                    onClick={() => setCurrent(index)}
                    className={cn("flex w-full items-center gap-2 rounded-xl p-2 text-left", index === current ? "bg-accent/20 ring-1 ring-accent" : "bg-side hover:bg-hover")}
                    aria-label={`Page ${index + 1}`}
                  >
                    <span className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-black/30 text-xs text-sub">
                      {thumbs[page] ? <img src={thumbs[page]} alt="" className="max-h-full max-w-full" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">Page {index + 1}</span>
                      <span className="block text-xs text-sub">{notes.filter((n) => n.page === page).length} notes</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => move(-1)} disabled={current === 0} className="grid size-9 flex-1 place-items-center rounded-xl bg-side hover:bg-hover disabled:opacity-40" aria-label="Move page up">
                  <ArrowUp className="size-4" />
                </button>
                <button onClick={() => move(1)} disabled={current >= order.length - 1} className="grid size-9 flex-1 place-items-center rounded-xl bg-side hover:bg-hover disabled:opacity-40" aria-label="Move page down">
                  <ArrowDown className="size-4" />
                </button>
                <button onClick={removePage} disabled={order.length <= 1} className="grid size-9 flex-1 place-items-center rounded-xl bg-side text-dnd hover:bg-hover disabled:opacity-40" aria-label="Delete page">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </aside>

            <div ref={stageRef} className="min-w-0">
              <div className="relative w-full max-w-3xl cursor-crosshair" style={{ containerType: "inline-size" }} onClick={onStageClick}>
                <canvas ref={previewRef} className="h-auto w-full rounded-xl bg-white shadow-lg" />
                {metrics &&
                  pageNotes.map((note) => (
                    <span
                      key={note.id}
                      className="pointer-events-none absolute whitespace-pre text-left"
                      style={{
                        left: `${(note.x / metrics.width) * 100}%`,
                        top: `${((metrics.height - note.y - note.size) / metrics.height) * 100}%`,
                        fontSize: `${(note.size / metrics.width) * 100}cqw`,
                        color: note.color,
                        fontFamily: "Helvetica, Arial, sans-serif",
                        lineHeight: 1.25,
                      }}
                    >
                      {note.text}
                    </span>
                  ))}
              </div>
            </div>

            <aside className="h-fit space-y-3 rounded-2xl bg-side p-4">
              <h2 className="font-bold">Add text</h2>
              <p className="text-xs text-sub">Type a note, then click the page or use the button. New text is drawn on top — words already in the PDF are not rewritten.</p>
              <label className="block">
                <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Text</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  aria-label="Annotation text"
                  placeholder="A note on this page"
                  className="w-full resize-none rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent"
                />
              </label>
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
              <button
                onClick={() => metrics && placeAt(48, Math.max(8, metrics.height - 48 - size))}
                className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white"
              >
                Add at top of page
              </button>
              <label className="block">
                <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Watermark on download</span>
                <input
                  value={watermark}
                  onChange={(e) => setWatermark(e.target.value.slice(0, 40))}
                  aria-label="Watermark text"
                  placeholder="CONFIDENTIAL"
                  className="w-full rounded-xl border border-white/10 bg-input px-3 py-2.5 outline-none focus:border-accent"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {["CONFIDENTIAL", "DRAFT", "FOR REVIEW"].map((w) => (
                  <button key={w} type="button" onClick={() => setWatermark(w)} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10">
                    {w}
                  </button>
                ))}
              </div>
              {pageNotes.length > 0 && (
                <ul className="space-y-1">
                  {pageNotes.map((note) => (
                    <li key={note.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{note.text}</span>
                      <button onClick={() => setNotes((list) => list.filter((item) => item.id !== note.id))} className="text-sub hover:text-dnd" aria-label={`Remove ${note.text}`}>
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
