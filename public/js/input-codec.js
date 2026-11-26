// Compact binary controller frame shared by the browser (input.js) and the server
// (src/adapters/ws/player-gateway.ts): 15 bytes instead of ~400 of JSON, up to ~125 times a second.
//
// byte  0      frame type (1 = controller state)
// bytes 1-4    uint32 LE button mask, bit i = BUTTON_ORDER[i]
// byte  5      L2 pressure 0-255
// byte  6      R2 pressure 0-255
// bytes 7-14   int16 LE sticks lx, ly, rx, ry (-32767..32767, up/left negative)

/** Must match BUTTONS in src/domain/controller-state.ts (a test checks it). */
export const BUTTON_ORDER = [
  'cross',
  'circle',
  'square',
  'triangle',
  'l1',
  'r1',
  'l2',
  'r2',
  'create',
  'options',
  'l3',
  'r3',
  'up',
  'down',
  'left',
  'right',
  'ps',
  'touchpad',
];

export const INPUT_FRAME_BYTES = 15;
const FRAME_TYPE_STATE = 1;
const STICKS = ['lx', 'ly', 'rx', 'ry'];
const STICK_MAX = 32767;
const TRIGGER_MAX = 255;

const clamp = (value, min, max) => (Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0);

/** Encodes { buttons, sticks, triggers } into an ArrayBuffer frame. */
export function encodeInput({ buttons = {}, sticks = {}, triggers = {} }) {
  const buffer = new ArrayBuffer(INPUT_FRAME_BYTES);
  const view = new DataView(buffer);
  let mask = 0;
  BUTTON_ORDER.forEach((button, bit) => {
    if (buttons[button] === true) mask |= 1 << bit;
  });
  view.setUint8(0, FRAME_TYPE_STATE);
  view.setUint32(1, mask >>> 0, true);
  view.setUint8(5, Math.round(clamp(triggers.l2, 0, 1) * TRIGGER_MAX));
  view.setUint8(6, Math.round(clamp(triggers.r2, 0, 1) * TRIGGER_MAX));
  STICKS.forEach((axis, i) => {
    view.setInt16(7 + i * 2, Math.round(clamp(sticks[axis], -1, 1) * STICK_MAX), true);
  });
  return buffer;
}

/** Decodes a frame (ArrayBuffer, typed array or Buffer) into { buttons, sticks, triggers }, or null. */
export function decodeInput(input) {
  const bytes =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.byteLength !== INPUT_FRAME_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== FRAME_TYPE_STATE) return null;
  const mask = view.getUint32(1, true);
  const buttons = Object.fromEntries(BUTTON_ORDER.map((button, bit) => [button, (mask & (1 << bit)) !== 0]));
  const triggers = { l2: view.getUint8(5) / TRIGGER_MAX, r2: view.getUint8(6) / TRIGGER_MAX };
  const sticks = Object.fromEntries(STICKS.map((axis, i) => [axis, view.getInt16(7 + i * 2, true) / STICK_MAX]));
  return { buttons, sticks, triggers };
}
