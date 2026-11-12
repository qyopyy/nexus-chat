"use client";

/**
 * XHR storage upload — fetch-based supabase.storage.upload can hang after
 * CORS OPTIONS on iOS / Capacitor for larger blobs. Gram already used XHR;
 * chat attachments and other buckets share this helper.
 */

import { supabase } from "./supabase";
import * as tus from "tus-js-client";

export type StorageUploadOpts = {
  bucket: string;
  path: string;
  blob: Blob;
  contentType?: string;
  upsert?: boolean;
  timeoutMs?: number;
  onProgress?: (ratio: number) => void;
};

export async function xhrStorageUpload(opts: StorageUploadOpts): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error("Sign in again to upload");

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const encoded = opts.path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  const type = opts.contentType || opts.blob.type || "application/octet-stream";

  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${base}/storage/v1/object/${encodeURIComponent(opts.bucket)}/${encoded}`);
    x.setRequestHeader("Authorization", `Bearer ${token}`);
    x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
    x.setRequestHeader("Content-Type", type);
    x.setRequestHeader("x-upsert", opts.upsert ? "true" : "false");
    x.setRequestHeader("cache-control", "3600");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) opts.onProgress(e.loaded / e.total);
    };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return res();
      let msg = `Upload failed (${x.status})`;
      try {
        const j = JSON.parse(x.responseText) as { message?: string; error?: string };
        msg = j.message || j.error || msg;
      } catch {
        /* */
      }
      rej(new Error(msg));
    };
    x.onerror = () => rej(new Error("Network error while uploading — check your connection and try again"));
    x.ontimeout = () => rej(new Error("Upload timed out — try a smaller file"));
    x.timeout = opts.timeoutMs ?? 5 * 60 * 1000;
    x.send(opts.blob);
  });
}

/** Supabase Storage resumable upload. Chunks are 6 MB, which is what this project accepts. */
export async function resumableStorageUpload(opts: StorageUploadOpts): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error("Sign in again to upload");
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(".supabase.co", ".storage.supabase.co").replace(/\/$/, "");
  await new Promise<void>((resolve, reject) => {
    const up = new tus.Upload(opts.blob, {
      endpoint: `${base}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.path,
        contentType: opts.contentType || opts.blob.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (err) => reject(err instanceof Error ? err : new Error("Upload failed")),
      onProgress: (sent, total) => {
        if (total > 0 && opts.onProgress) opts.onProgress(sent / total);
      },
      onSuccess: () => resolve(),
    });
    up.start();
  });
}
