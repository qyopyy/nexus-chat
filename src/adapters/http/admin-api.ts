import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MacroStep } from '../../application/macros.ts';
import { parseMacro } from '../../application/macros.ts';
import type { PauseReason } from '../../domain/turn-queue.ts';
import { PayloadTooLarge, readJsonObject, reply } from './http-util.ts';

const PREFIX = '/api/admin/';

/** What the admin API can see and do. Implemented by the Lobby (plus a state read model). */
export interface AdminBackend {
  state(): object;
  kick(playerId: string): boolean;
  skipTurn(): boolean;
  setPaused(reason: PauseReason, paused: boolean): void;
  /** Plays a button sequence on the console (cheat codes and the like). */
  runMacro(steps: MacroStep[]): 'started' | 'busy';
}

type AdminApiOptions = {
  /** Shared secret for `Authorization: Bearer <token>`. */
  token: string;
  backend: AdminBackend;
};

/**
 * The JSON API behind `/api/admin/*`. The HTTP server only routes here for direct local
 * requests (see isDirectLocalRequest); the bearer token is still required on top of that.
 */
export class AdminApi {
  readonly #tokenDigest: Buffer;
  readonly #backend: AdminBackend;

  constructor({ token, backend }: AdminApiOptions) {
    this.#tokenDigest = digest(token);
    this.#backend = backend;
  }

  /** Returns false when the request is not for an admin route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith(PREFIX)) return false;
    if (!this.#authorized(req)) return reply(res, 401);
    try {
      return await this.#route(`${req.method} ${pathname.slice(PREFIX.length)}`, req, res);
    } catch (error) {
      if (error instanceof PayloadTooLarge) return reply(res, 413);
      throw error;
    }
  }

  async #route(route: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const b = this.#backend;
    switch (route) {
      case 'GET state':
        return reply(res, 200, b.state());
      case 'POST skip':
        return reply(res, b.skipTurn() ? 204 : 409);
      case 'POST pause':
        b.setPaused('admin', true);
        return reply(res, 204);
      case 'POST resume':
        b.setPaused('admin', false);
        return reply(res, 204);
      case 'POST macro': {
        const body = await readJsonObject(req, 16_384);
        const steps = parseMacro(body?.steps);
        if (!steps) return reply(res, 400);
        return reply(res, b.runMacro(steps) === 'started' ? 202 : 409);
      }
      case 'POST kick': {
        const body = await readJsonObject(req);
        if (typeof body?.id !== 'string') return reply(res, 400);
        return reply(res, b.kick(body.id) ? 204 : 404);
      }
    }
    return reply(res, 404);
  }

  #authorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    return token.length > 0 && timingSafeEqual(digest(token), this.#tokenDigest);
  }
}

/** Fixed-length digests let timingSafeEqual compare tokens of any length. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
