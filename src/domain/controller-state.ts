/** Gamepad buttons, in W3C "standard" Gamepad API order (DualSense names). */
export const BUTTONS = [
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
] as const;

export type Button = (typeof BUTTONS)[number];

/** Stick axes from -1 to 1; up and left are negative. */
type Sticks = { lx: number; ly: number; rx: number; ry: number };

/** Analog trigger pressure, 0 (released) to 1 (fully pressed). */
type Triggers = { l2: number; r2: number };

/** The complete state of one controller at one instant. */
export type ControllerState = {
  buttons: Record<Button, boolean>;
  sticks: Sticks;
  triggers: Triggers;
};

const STICK_AXES = ['lx', 'ly', 'rx', 'ry'] as const;
const TRIGGER_NAMES = ['l2', 'r2'] as const;

/** Every button released and both sticks centered. */
export const NEUTRAL_STATE: ControllerState = Object.freeze({
  buttons: Object.freeze(Object.fromEntries(BUTTONS.map((b) => [b, false]))) as Record<Button, boolean>,
  sticks: Object.freeze({ lx: 0, ly: 0, rx: 0, ry: 0 }),
  triggers: Object.freeze({ l2: 0, r2: 0 }),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function clamp(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

/**
 * Turns untrusted input into a complete, bounded controller state.
 * Unknown fields are ignored, missing ones default to released/centered.
 *
 * @returns null when the payload is not an object at all.
 */
export function parseControllerState(raw: unknown): ControllerState | null {
  if (!isRecord(raw)) return null;
  const rawButtons = isRecord(raw.buttons) ? raw.buttons : {};
  const rawSticks = isRecord(raw.sticks) ? raw.sticks : {};
  const rawTriggers = isRecord(raw.triggers) ? raw.triggers : {};

  const buttons = Object.fromEntries(BUTTONS.map((b) => [b, rawButtons[b] === true])) as Record<Button, boolean>;
  const sticks = Object.fromEntries(STICK_AXES.map((a) => [a, clamp(rawSticks[a], -1, 1)])) as Sticks;
  // A digital-only client (keyboard) sends the button without pressure: treat it as fully pressed.
  const triggers = Object.fromEntries(
    TRIGGER_NAMES.map((t) => [t, clamp(rawTriggers[t], 0, 1) || (buttons[t] ? 1 : 0)]),
  ) as Triggers;
  return { buttons, sticks, triggers };
}

/** True when `name` is one of {@link BUTTONS}. */
export function isButton(name: string): name is Button {
  return (BUTTONS as readonly string[]).includes(name);
}

/** Stick movement below this is drift, not a player doing something. */
const ACTIVITY_DEADZONE = 0.2;
const TRIGGER_ACTIVITY = 0.1;

/** True when the state shows the player doing something (a button, a trigger or a stick). */
export function isActive(state: ControllerState): boolean {
  if (Object.values(state.buttons).some(Boolean)) return true;
  if (state.triggers.l2 > TRIGGER_ACTIVITY || state.triggers.r2 > TRIGGER_ACTIVITY) return true;
  return Object.values(state.sticks).some((axis) => Math.abs(axis) > ACTIVITY_DEADZONE);
}
