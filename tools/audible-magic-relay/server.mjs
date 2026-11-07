// Nexus ⇄ Audible Magic relay
// Runs next to Audible Magic's licensed command-line Toolkit (identify / analyze / identifyStream)
// and exposes two HTTPS endpoints the Nexus `audiocheck` function calls:
//   GET  /health    → { ok, toolkit }
//   POST /identify  → body: WAV clip (≤ 2 MB) · returns the Toolkit's compliance JSON unchanged
// No dependencies — Node 18+. Put it behind HTTPS (Caddy / nginx / a platform's TLS).
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.RELAY_TOKEN || "";
const BIN = process.env.AM_IDENTIFY_BIN || "/opt/audiblemagic/identify";
const CONFIG = process.env.AM_CONFIG || "/opt/audiblemagic/config.cfg";
// argument template — check Audible Magic's Toolkit docs for your version; {config} and {file} are filled in
const ARGS = (process.env.AM_IDENTIFY_ARGS || "-c {config} {file}").split(/\s+/).filter(Boolean);
const TIMEOUT = Number(process.env.AM_TIMEOUT_MS || 20000);
const MAX = 2 * 1024 * 1024;

if (TOKEN.length < 16) {
  console.error("Set RELAY_TOKEN (16+ random characters) — the same value you paste into Nexus Studio.");
  process.exit(1);
}

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};
const authed = (req) => {
  const got = Buffer.from((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
};
const exists = (p) => access(p).then(() => true, () => false);

function runIdentify(file) {
  const args = ARGS.map((a) => a.replace("{config}", CONFIG).replace("{file}", file));
  return new Promise((resolve, reject) => {
    execFile(BIN, args, { timeout: TIMEOUT, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = String(stdout || "").trim();
      const start = out.indexOf("{");
      if (start >= 0) {
        try {
          return resolve(JSON.parse(out.slice(start)));
        } catch {
          /* fall through */
        }
      }
      reject(new Error(err ? `${err.message} ${String(stderr || "").slice(0, 300)}` : "Toolkit returned no JSON"));
    });
  });
}

createServer(async (req, res) => {
  const path = new URL(req.url || "/", "http://x").pathname;
  if (!authed(req)) return send(res, 401, { error: "Bad relay token" });

  if (req.method === "GET" && path === "/health") {
    const [bin, cfg] = await Promise.all([exists(BIN), exists(CONFIG)]);
    return send(res, bin && cfg ? 200 : 503, { ok: bin && cfg, toolkit: bin ? BIN : null, config: cfg, error: !bin ? "identify binary not found" : !cfg ? "config file not found" : undefined });
  }

  if (req.method === "POST" && path === "/identify") {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX) return send(res, 413, { error: "Clip too big (2 MB max)" });
      chunks.push(c);
    }
    const body = Buffer.concat(chunks);
    if (body.subarray(0, 4).toString() !== "RIFF") return send(res, 400, { error: "Send a WAV clip" });
    const dir = await mkdtemp(join(tmpdir(), "am-"));
    const file = join(dir, `${String(req.headers["x-asset-id"] || randomUUID()).replace(/[^\w-]/g, "").slice(0, 64) || "clip"}.wav`);
    try {
      await writeFile(file, body);
      const json = await runIdentify(file);
      return send(res, 200, json);
    } catch (e) {
      return send(res, 502, { error: String(e.message || e).slice(0, 400) });
    } finally {
      void rm(dir, { recursive: true, force: true });
    }
  }

  send(res, 404, { error: "Not found" });
}).listen(PORT, () => console.log(`Audible Magic relay on :${PORT}`));
