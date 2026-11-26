import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';

const gzip = promisify(gzipCallback);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.txt', '.webmanifest']);
/** Browsers and proxies revalidate every load, so a deploy reaches everyone at once. */
const REVALIDATE = 'private, no-cache';

type Entry = { mtimeMs: number; size: number; body: Buffer; etag: string; gzip: Promise<Buffer | null> | null };

type StaticResponse = { status: 200 | 304; headers: Record<string, string>; body: Buffer | null };

function acceptsGzip(header: string | undefined): boolean {
  if (!header) return false;
  return header.split(',').some((part) => {
    const [coding, ...params] = part
      .trim()
      .toLowerCase()
      .split(';')
      .map((s) => s.trim());
    if (coding !== 'gzip' && coding !== '*') return false;
    const q = params.find((p) => p.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
}

function matches(ifNoneMatch: string | undefined, tags: string[]): boolean {
  if (!ifNoneMatch) return false;
  // Weak comparison (RFC 9110): proxies turn tags into W/"..." when they re-compress.
  return ifNoneMatch.split(',').some((raw) => {
    const tag = raw.trim().replace(/^W\//, '');
    return tag === '*' || tags.includes(tag);
  });
}

/**
 * Serves files from memory: each file is read (and gzipped) once per modification, answered with
 * 304 when the browser already has it. Callers do their own access checks first.
 */
export class StaticFiles {
  readonly #cache = new Map<string, Entry>();

  async serve(file: string, request: { acceptEncoding?: string; ifNoneMatch?: string }): Promise<StaticResponse> {
    const entry = await this.#load(file);
    const ext = extname(file);
    const gzipTag = entry.etag.replace(/"$/, '-gz"');
    const headers: Record<string, string> = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': REVALIDATE,
      vary: 'Accept-Encoding',
    };
    const zipped = COMPRESSIBLE.has(ext) && acceptsGzip(request.acceptEncoding) ? await this.#gzipped(entry) : null;
    headers.etag = zipped ? gzipTag : entry.etag;
    if (matches(request.ifNoneMatch, [entry.etag, gzipTag])) return { status: 304, headers, body: null };
    if (zipped) headers['content-encoding'] = 'gzip';
    return { status: 200, headers, body: zipped ?? entry.body };
  }

  async #load(file: string): Promise<Entry> {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const cached = this.#cache.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached;
    const body = await readFile(file);
    const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
    const entry: Entry = { mtimeMs: info.mtimeMs, size: info.size, body, etag, gzip: null };
    this.#cache.set(file, entry);
    return entry;
  }

  #gzipped(entry: Entry): Promise<Buffer | null> {
    // Only worth it when it is actually smaller.
    entry.gzip ??= gzip(entry.body, { level: 9 }).then((zipped) => (zipped.length < entry.body.length ? zipped : null));
    return entry.gzip;
  }
}
