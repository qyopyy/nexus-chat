import { downloadBlob } from "@/lib/imageEdit";

/** Fetch a (possibly signed/cross-origin) URL and trigger a local file download. */
export async function downloadAttachment(url: string, filename: string) {
  const name = (filename || "download").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 120);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    downloadBlob(blob, name);
    return true;
  } catch {
    // Fallback: open in a new tab if CORS/fetch fails (public URLs still download via navigate + Content-Disposition)
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
    return false;
  }
}
