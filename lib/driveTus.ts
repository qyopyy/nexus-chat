// Resumable uploads (TUS 1.0.0) for Supabase Storage. Pure logic: the network goes through an injected
// transport so the same code runs in the browser (XHR, with progress) and in tests (a fake server).
//
// Why: one POST of a multi-GB file restarts from zero on any hiccup. Here the file is sent in 6 MB pieces,
// the server remembers how far it got, and after a drop / pause / reload we ask "where were we?" and go on.

export const TUS_CHUNK = 6 * 1024 * 1024; // Supabase requires exactly 6 MiB pieces (the last one may be shorter)
const MAX_TRIES = 8;

export type TusReq = {
  method: "POST" | "PATCH" | "HEAD" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: Blob;
  /** bytes of this request body sent so far */
  onProgress?: (sent: number) => void;
  signal?: AbortSignal;
};
export type TusRes = { status: number; header: (name: string) => string | null };
export type TusTransport = (req: TusReq) => Promise<TusRes>;

export class TusAbort extends Error {
  constructor() {
    super("Upload paused");
    this.name = "AbortError";
  }
}
export class TusFatal extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
export const tusMetadata = (m: Record<string, string>) =>
  Object.entries(m)
    .map(([k, v]) => `${k} ${b64(v)}`)
    .join(",");

export type TusOpts = {
  endpoint: string;
  file: Blob;
  bucket: string;
  objectName: string;
  contentType: string;
  /** auth headers, asked for before every request so an expired token is replaced mid-upload */
  headers: () => Promise<Record<string, string>>;
  transport: TusTransport;
  /** upload URL from an earlier attempt (survives reloads when the caller stores it) */
  resumeUrl?: string | null;
  onUrl?: (url: string) => void;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  /** replaced in tests so retries don't wait */
  sleep?: (ms: number) => Promise<void>;
  chunk?: number;
};

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        rej(new TusAbort());
      },
      { once: true },
    );
  });

const retryable = (status: number) => status === 0 || status === 408 || status === 429 || status >= 500;

export async function tusUpload(o: TusOpts): Promise<void> {
  const total = o.file.size;
  const chunk = o.chunk ?? TUS_CHUNK;
  const sleep = o.sleep ?? ((ms: number) => wait(ms, o.signal));
  const sig = o.signal;
  const call = async (req: Omit<TusReq, "headers" | "signal"> & { headers?: Record<string, string> }): Promise<TusRes> => {
    if (sig?.aborted) throw new TusAbort();
    const auth = await o.headers();
    try {
      return await o.transport({ ...req, headers: { "Tus-Resumable": "1.0.0", ...auth, ...(req.headers ?? {}) }, signal: sig });
    } catch (e) {
      if (sig?.aborted || (e as Error)?.name === "AbortError") throw new TusAbort();
      return { status: 0, header: () => null }; // network error
    }
  };

  let url = o.resumeUrl ?? null;
  let offset = 0;

  const head = async (): Promise<boolean> => {
    if (!url) return false;
    for (let i = 0; i < MAX_TRIES; i++) {
      const r = await call({ method: "HEAD", url });
      if (r.status === 404 || r.status === 410 || r.status === 403) return false; // upload is gone: start over
      if (r.status >= 200 && r.status < 300) {
        const n = Number(r.header("Upload-Offset"));
        if (Number.isFinite(n) && n >= 0 && n <= total) {
          offset = n;
          return true;
        }
        return false;
      }
      if (!retryable(r.status)) throw new TusFatal(`Upload check failed (${r.status})`, r.status);
      await sleep(Math.min(8000, 500 * 2 ** i));
    }
    throw new TusFatal("Network is down. Resume when you are back online.", 0);
  };

  const create = async () => {
    for (let i = 0; i < MAX_TRIES; i++) {
      const r = await call({
        method: "POST",
        url: o.endpoint,
        headers: {
          "Upload-Length": String(total),
          "Upload-Metadata": tusMetadata({ bucketName: o.bucket, objectName: o.objectName, contentType: o.contentType, cacheControl: "3600" }),
          "x-upsert": "true",
        },
      });
      if (r.status === 201) {
        const loc = r.header("Location");
        if (!loc) throw new TusFatal("Storage did not return an upload address", 201);
        url = new URL(loc, o.endpoint).toString();
        offset = 0;
        o.onUrl?.(url);
        return;
      }
      if (!retryable(r.status)) throw new TusFatal(r.status === 413 ? "That file is bigger than your storage allows." : `Could not start the upload (${r.status})`, r.status);
      await sleep(Math.min(8000, 500 * 2 ** i));
    }
    throw new TusFatal("Network is down. Resume when you are back online.", 0);
  };

  if (!(await head())) await create();
  o.onProgress?.(offset, total);

  let tries = 0;
  while (offset < total) {
    const end = Math.min(offset + chunk, total);
    const piece = o.file.slice(offset, end);
    const r = await call({
      method: "PATCH",
      url: url!,
      headers: { "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
      body: piece,
      onProgress: (sent) => o.onProgress?.(offset + sent, total),
    });
    if (r.status === 204 || r.status === 200) {
      const n = Number(r.header("Upload-Offset"));
      offset = Number.isFinite(n) && n > 0 ? n : end;
      tries = 0;
      o.onProgress?.(offset, total);
      continue;
    }
    if (r.status === 409 || r.status === 0 || retryable(r.status)) {
      // we may be out of step with the server (a chunk landed but its answer was lost): ask where we are
      if (++tries > MAX_TRIES) throw new TusFatal("Network is down. Resume when you are back online.", r.status);
      await sleep(Math.min(8000, 500 * 2 ** tries));
      if (!(await head())) {
        // the server forgot this upload: restart from byte 0
        await create();
      }
      o.onProgress?.(offset, total);
      continue;
    }
    throw new TusFatal(r.status === 413 ? "That file is bigger than your storage allows." : `Upload failed (${r.status})`, r.status);
  }
}

/** Best-effort: tell the server to forget a half-finished upload (TUS "termination"). */
export async function tusCancel(url: string, headers: () => Promise<Record<string, string>>, transport: TusTransport) {
  try {
    await transport({ method: "DELETE", url, headers: { "Tus-Resumable": "1.0.0", ...(await headers()) } });
  } catch {
    /* it expires by itself */
  }
}

// ------------------------------------------------------------------ rate + eta
export function makeMeter(windowMs = 4000, now: () => number = Date.now) {
  const pts: { t: number; b: number }[] = [];
  return {
    push(bytes: number) {
      const t = now();
      pts.push({ t, b: bytes });
      while (pts.length > 2 && t - pts[0]!.t > windowMs) pts.shift();
    },
    /** bytes per second over the recent window */
    rate() {
      if (pts.length < 2) return 0;
      const a = pts[0]!;
      const z = pts[pts.length - 1]!;
      const dt = (z.t - a.t) / 1000;
      return dt > 0 ? Math.max(0, (z.b - a.b) / dt) : 0;
    },
  };
}
export function fmtEta(bytesLeft: number, rate: number) {
  if (!rate || bytesLeft <= 0) return "";
  const s = Math.ceil(bytesLeft / rate);
  if (s < 60) return `${s}s left`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s left`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m left`;
}
