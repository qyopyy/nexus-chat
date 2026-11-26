import { createSocket, type Socket } from 'node:dgram';
import type { ConsoleAdapter } from '../../application/ports.ts';
import { type Button, type ControllerState, NEUTRAL_STATE } from '../../domain/controller-state.ts';

/** Wire format understood by the chiaki-ng network-input patch (chiaki/net-input.patch). */
type ChiakiPacket = {
  v: 1;
  /** Bitmask of chiaki-ng's ChiakiControllerButton. */
  buttons: number;
  /** Trigger pressure, 0-255. */
  l2: number;
  r2: number;
  /** Stick axes, -32767..32767, up/left negative. */
  lx: number;
  ly: number;
  rx: number;
  ry: number;
};

/** Mirrors ChiakiControllerButton in chiaki-ng's lib/include/chiaki/controller.h. */
const BUTTON_BITS: Partial<Record<Button, number>> = {
  cross: 1 << 0,
  circle: 1 << 1,
  square: 1 << 2,
  triangle: 1 << 3,
  left: 1 << 4,
  right: 1 << 5,
  up: 1 << 6,
  down: 1 << 7,
  l1: 1 << 8,
  r1: 1 << 9,
  l3: 1 << 10,
  r3: 1 << 11,
  options: 1 << 12,
  create: 1 << 13,
  touchpad: 1 << 14,
  ps: 1 << 15,
  // l2/r2 are analog in chiaki-ng: sent as pressure, never in the mask.
};

/**
 * Asks chiaki-ng for a keyframe. It has no "v": 1 on purpose, so builds without keyframe support
 * reject it instead of reading it as an idle controller.
 */
const KEYFRAME_REQUEST = Buffer.from(JSON.stringify({ request: 'keyframe' }));
const STICK_MAX = 32767;
const TRIGGER_MAX = 255;

/** Converts a controller state to the chiaki-ng packet. */
export function toChiakiPacket(state: ControllerState): ChiakiPacket {
  let buttons = 0;
  for (const [button, bit] of Object.entries(BUTTON_BITS)) {
    if (state.buttons[button as Button]) buttons |= bit;
  }
  const stick = (value: number) => Math.round(value * STICK_MAX);
  const trigger = (value: number) => Math.round(value * TRIGGER_MAX);
  return {
    v: 1,
    buttons,
    l2: trigger(state.triggers.l2),
    r2: trigger(state.triggers.r2),
    lx: stick(state.sticks.lx),
    ly: stick(state.sticks.ly),
    rx: stick(state.sticks.rx),
    ry: stick(state.sticks.ry),
  };
}

type ChiakiConsoleOptions = {
  port: number;
  host?: string;
  /** Re-send interval; chiaki-ng releases everything if it hears nothing for 500 ms. */
  heartbeatMs?: number;
};

/**
 * Drives a PlayStation through a locally running, patched chiaki-ng (Remote Play). The state goes
 * over loopback UDP and is repeated on a heartbeat, so a lost packet heals itself and a dead
 * server lets chiaki-ng release every button.
 */
export class ChiakiConsole implements ConsoleAdapter {
  readonly #socket: Socket;
  readonly #port: number;
  readonly #host: string;
  #packet: Buffer = encode(NEUTRAL_STATE);

  constructor({ port, host = '127.0.0.1', heartbeatMs = 100 }: ChiakiConsoleOptions) {
    this.#socket = createSocket('udp4');
    // Bound to loopback: an unbound socket would listen on every interface.
    this.#socket.bind({ address: '127.0.0.1', port: 0 });
    this.#port = port;
    this.#host = host;
    setInterval(() => this.#send(), heartbeatMs).unref();
  }

  apply(state: ControllerState): void {
    this.#packet = encode(state);
    this.#send();
  }

  release(): void {
    this.apply(NEUTRAL_STATE);
  }

  requestKeyframe(): void {
    this.#socket.send(KEYFRAME_REQUEST, this.#port, this.#host, () => {});
  }

  #send(): void {
    // Fire-and-forget: the next heartbeat retries anything that failed.
    this.#socket.send(this.#packet, this.#port, this.#host, () => {});
  }
}

function encode(state: ControllerState): Buffer {
  return Buffer.from(JSON.stringify(toChiakiPacket(state)));
}
