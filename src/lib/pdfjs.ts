"use client";

import type * as Pdfjs from "pdfjs-dist";

// public/pdfjs/* is copied from pdfjs-dist@6.5.438:
// build/pdf.worker.min.mjs and build/pdf.renderer.min.mjs.
// Keep those files in sync if the pinned pdfjs-dist version changes.
const PDFJS_VERSION = "6.5.438";

let loading: Promise<typeof Pdfjs> | null = null;

export function loadPdfjs() {
  loading ??= import("pdfjs-dist").then((pdfjs) => {
    if (pdfjs.version !== PDFJS_VERSION) {
      console.warn(`pdfjs-dist ${pdfjs.version} does not match the bundled workers (${PDFJS_VERSION}).`);
    }
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    pdfjs.GlobalWorkerOptions.rendererSrc = "/pdfjs/pdf.renderer.min.mjs";
    return pdfjs;
  });
  return loading;
}
