import test from "node:test";
import assert from "node:assert/strict";
import { tusUpload, tusMetadata, makeMeter, fmtEta, TusAbort, TusFatal, TUS_CHUNK, type TusReq, type TusRes } from "./driveTus.ts";

/** A tiny fake TUS server. `faults` lets a test break specific requests. */
function server(opts: { faults?: (n: number, r: TusReq) => TusRes | null } = {}) {
  const uploads = new Map<string, { length: number; data: Uint8Array[]; offset: number }>();
  const log: string[] = [];
  let n = 0;
  const res = (status: number, h: Record<string, string> = {}): TusRes => ({ status, header: (k) => h[k] ?? h[k.toLowerCase()] ?? null });
  const transport = async (r: TusReq): Promise<TusRes> => {
    n++;
    log.push(`${r.method}${r.headers["Upload-Offset"] ? " @" + r.headers["Upload-Offset"] : ""}`);
    const f = opts.faults?.(n, r);
    if (f) return f;
    assert.equal(r.headers["Tus-Resumable"], "1.0.0");
    if (r.method === "POST") {
      const id = "u" + uploads.size;
      uploads.set(id, { length: Number(r.headers["Upload-Length"]), data: [], offset: 0 });
      return res(201, { Location: `/storage/v1/upload/resumable/${id}` });
    }
    const id = r.url.split("/").pop()!;
    const u = uploads.get(id);
    if (!u) return res(404);
    if (r.method === "HEAD") return res(200, { "Upload-Offset": String(u.offset) });
    if (r.method === "PATCH") {
      if (Number(r.headers["Upload-Offset"]) !== u.offset) return res(409);
      const buf = new Uint8Array(await r.body!.arrayBuffer());
      r.onProgress?.(buf.length);
      u.data.push(buf);
      u.offset += buf.length;
      return res(204, { "Upload-Offset": String(u.offset) });
    }
    return res(204);
  };
  const bytes = (id = "u0") => {
    const u = uploads.get(id)!;
    const out = new Uint8Array(u.offset);
    let p = 0;
    for (const d of u.data) (out.set(d, p), (p += d.length));
    return out;
  };
  return { transport, uploads, log, bytes };
}
const mk = (n: number) => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 31 + 7) & 255;
  return a;
};
const base = { endpoint: "https://x.test/storage/v1/upload/resumable", bucket: "user-vault", objectName: "me/1/a.flac", contentType: "audio/flac", headers: async () => ({ Authorization: "Bearer t" }), sleep: async () => {} };

test("splits into 6 MiB pieces and the server gets every byte, in order", async () => {
  const s = server();
  const data = mk(TUS_CHUNK * 2 + 1234);
  const prog: number[] = [];
  await tusUpload({ ...base, file: new Blob([data]), transport: s.transport, onProgress: (a) => prog.push(a) });
  assert.deepEqual(s.log, ["POST", `PATCH @0`, `PATCH @${TUS_CHUNK}`, `PATCH @${TUS_CHUNK * 2}`]);
  assert.ok(Buffer.compare(s.bytes(), data) === 0);
  assert.equal(prog.at(-1), data.length);
  assert.ok(prog.every((x, i) => i === 0 || x >= prog[i - 1]!), "progress never goes backwards");
});

test("empty file still creates the object", async () => {
  const s = server();
  await tusUpload({ ...base, file: new Blob([]), transport: s.transport });
  assert.deepEqual(s.log, ["POST"]);
});

test("a dropped chunk is retried after asking the server where it is", async () => {
  const data = mk(300);
  let fail = true;
  const s = server({ faults: (_n, r) => (r.method === "PATCH" && r.headers["Upload-Offset"] === "100" && fail ? ((fail = false), { status: 0, header: () => null }) : null) });
  await tusUpload({ ...base, chunk: 100, file: new Blob([data]), transport: s.transport });
  assert.ok(Buffer.compare(s.bytes(), data) === 0);
  assert.ok(s.log.includes("HEAD"), "re-synced with HEAD");
});

test("a chunk that landed but whose answer was lost is not sent twice", async () => {
  const data = mk(300);
  let lost = true;
  const inner = server();
  const transport = async (r: TusReq) => {
    const out = await inner.transport(r);
    if (r.method === "PATCH" && r.headers["Upload-Offset"] === "100" && lost) {
      lost = false;
      return { status: 0, header: () => null };
    }
    return out;
  };
  await tusUpload({ ...base, chunk: 100, file: new Blob([data]), transport });
  assert.ok(Buffer.compare(inner.bytes(), data) === 0, "no duplicated bytes");
  assert.equal(inner.bytes().length, 300);
});

test("resumes from a saved upload URL without re-sending what the server has", async () => {
  const data = mk(500);
  const s = server();
  const ctl = new AbortController();
  const urls: string[] = [];
  await assert.rejects(
    tusUpload({
      ...base,
      chunk: 100,
      file: new Blob([data]),
      transport: s.transport,
      signal: ctl.signal,
      onUrl: (u) => urls.push(u),
      onProgress: (a) => a >= 200 && ctl.abort(),
    }),
    (e: Error) => e instanceof TusAbort,
  );
  assert.equal(urls.length, 1);
  s.log.length = 0;
  await tusUpload({ ...base, chunk: 100, file: new Blob([data]), transport: s.transport, resumeUrl: urls[0] });
  assert.equal(s.log[0], "HEAD");
  assert.ok(!s.log.includes("POST"), "reused the same upload");
  assert.ok(!s.log.includes("PATCH @0") && !s.log.includes("PATCH @100"));
  assert.ok(Buffer.compare(s.bytes(), data) === 0);
});

test("a forgotten upload URL starts over cleanly", async () => {
  const s = server();
  const data = mk(250);
  await tusUpload({ ...base, chunk: 100, file: new Blob([data]), transport: s.transport, resumeUrl: "https://x.test/storage/v1/upload/resumable/gone" });
  assert.equal(s.log[0], "HEAD");
  assert.equal(s.log[1], "POST");
  assert.ok(Buffer.compare(s.bytes(), data) === 0);
});

test("server errors that will not fix themselves stop with a clear message", async () => {
  const s = server({ faults: (_n, r) => (r.method === "POST" ? { status: 413, header: () => null } : null) });
  await assert.rejects(tusUpload({ ...base, file: new Blob([mk(10)]), transport: s.transport }), (e: Error) => e instanceof TusFatal && /bigger than your storage/.test(e.message));
});

test("gives up after repeated network failures instead of spinning forever", async () => {
  const s = server({ faults: (_n, r) => (r.method === "PATCH" ? { status: 503, header: () => null } : null) });
  await assert.rejects(tusUpload({ ...base, file: new Blob([mk(10)]), transport: s.transport }), (e: Error) => e instanceof TusFatal);
});

test("auth header is read fresh for every request", async () => {
  const s = server();
  let n = 0;
  const seen: string[] = [];
  const t = async (r: TusReq) => (seen.push(r.headers.Authorization!), s.transport(r));
  await tusUpload({ ...base, chunk: 100, file: new Blob([mk(250)]), transport: t, headers: async () => ({ Authorization: `Bearer ${++n}` }) });
  assert.deepEqual(seen, ["Bearer 1", "Bearer 2", "Bearer 3", "Bearer 4"]);
});

test("metadata is base64 and handles non-ASCII names", () => {
  assert.equal(tusMetadata({ a: "x" }), "a eA==");
  assert.ok(tusMetadata({ objectName: "me/ő.flac" }).startsWith("objectName "));
});

test("meter and eta", () => {
  let t = 0;
  const m = makeMeter(4000, () => t);
  m.push(0);
  t = 2000;
  m.push(2_000_000);
  assert.equal(m.rate(), 1_000_000);
  assert.equal(fmtEta(10_000_000, 1_000_000), "10s left");
  assert.equal(fmtEta(100_000_000, 1_000_000), "1m 40s left");
  assert.equal(fmtEta(5, 0), "");
});
