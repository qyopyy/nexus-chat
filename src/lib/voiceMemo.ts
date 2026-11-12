"use client";

const MIME_ORDER = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

/** Prefer a format iPhone can record and play. WebM is a last resort. */
export function pickVoiceMime(supported: (mime: string) => boolean = defaultSupported) {
  for (const mime of MIME_ORDER) {
    if (supported(mime)) return mime;
  }
  return "";
}

export function voiceMemoExt(mime: string) {
  const value = mime.toLowerCase();
  if (value.includes("mp4") || value.includes("aac") || value.includes("m4a")) return "m4a";
  if (value.includes("ogg")) return "ogg";
  return "webm";
}

export function voiceMemoFile(blob: Blob, mime = blob.type) {
  const type = mime || "audio/mp4";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new File([blob], `memo-${stamp}.${voiceMemoExt(type)}`, { type });
}

function defaultSupported(mime: string) {
  return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime);
}

function pickMemoFile() {
  return new Promise<File>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.setAttribute("capture", "user");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file?.size) reject(new Error("No memo was recorded"));
      else resolve(file);
    };
    input.click();
  });
}

/** Start a memo. Call finish() when the user stops, or after a timer. */
export async function beginVoiceMemo() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    const file = await pickMemoFile();
    return { finish: async () => file };
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const mime = pickVoiceMime();
  let recorder: MediaRecorder;
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    const file = await pickMemoFile();
    return { finish: async () => file };
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  // A timeslice makes iOS flush audio. Without it the blob is often empty.
  recorder.start(200);
  return {
    finish: () =>
      new Promise<File>((resolve, reject) => {
        const fail = (error: Error) => {
          stream.getTracks().forEach((track) => track.stop());
          reject(error);
        };
        recorder.onerror = () => fail(new Error("The recording stopped"));
        recorder.onstop = () => {
          const type = recorder.mimeType || mime || "audio/mp4";
          const blob = new Blob(chunks, { type });
          stream.getTracks().forEach((track) => track.stop());
          if (!blob.size) fail(new Error("The memo was empty. Try again and speak for a second."));
          else resolve(voiceMemoFile(blob, type));
        };
        if (recorder.state === "inactive") {
          const type = recorder.mimeType || mime || "audio/mp4";
          const blob = new Blob(chunks, { type });
          stream.getTracks().forEach((track) => track.stop());
          if (!blob.size) reject(new Error("The memo was empty. Try again and speak for a second."));
          else resolve(voiceMemoFile(blob, type));
          return;
        }
        recorder.stop();
      }),
  };
}

export async function recordVoiceBlob(ms: number) {
  const rec = await beginVoiceMemo();
  await new Promise((resolve) => window.setTimeout(resolve, ms));
  return rec.finish();
}
