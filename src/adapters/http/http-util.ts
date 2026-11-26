import type { IncomingMessage, ServerResponse } from 'node:http';

/** The request body was larger than allowed. */
export class PayloadTooLarge extends Error {}

/** Reads the body as UTF-8 text, refusing more than `maxBytes`. */
export async function readText(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBytes) throw new PayloadTooLarge();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Reads a JSON object body; null when it is not one (or too large). */
export async function readJsonObject(req: IncomingMessage, maxBytes = 4096): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readText(req, maxBytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Ends the response with a status and an optional JSON body. Always returns true (handled). */
export function reply(res: ServerResponse, status: number, body?: unknown): true {
  if (body === undefined) res.writeHead(status).end();
  else
    res
      .writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(body));
  return true;
}

/** Reads one cookie from the request; '' when absent. */
export function readCookie(req: IncomingMessage, name: string): string {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

/** A Set-Cookie value: HttpOnly, Secure and SameSite=Lax always. */
export function cookie(name: string, value: string, path: string, maxAgeSeconds: number): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=${maxAgeSeconds}`;
}
