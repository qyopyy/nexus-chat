// Keyboard and mouse layouts (pure: no DOM). The server picks one with KEYBOARD_LAYOUT:
//   generic  keys name console buttons, for any game
//   gta      GTA-style PC controls mapped onto the PlayStation buttons GTA uses, with mouse look
// Gamepads never go through a layout: PAD_BUTTONS maps them the same way in both.
//
// Input codes are KeyboardEvent.code values, plus Mouse0 (left button) and Mouse2 (right button),
// which the page only reports while the pointer is locked to the video.

const DPAD = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
/** Code → [axis, direction]: WASD is the left stick, IJKL the right one. */
const STICKS = {
  KeyA: ['lx', -1],
  KeyD: ['lx', 1],
  KeyW: ['ly', -1],
  KeyS: ['ly', 1],
  KeyJ: ['rx', -1],
  KeyL: ['rx', 1],
  KeyI: ['ry', -1],
  KeyK: ['ry', 1],
};
/** Hold to move the left stick halfway (walk instead of run). */
const WALK = ['AltLeft', 'AltRight'];

/**
 * A layout: `buttons` (code → console button), `sticks` (code → [axis, direction]), `walk`
 * (codes that halve the left stick), `mouseLook` (mouse movement drives the right stick while the
 * pointer is locked), `actions` (button → what it does, for the help line) and `driving` (null,
 * or a toggle key plus the codes it remaps).
 */
export const LAYOUTS = {
  generic: {
    name: 'generic',
    buttons: {
      Space: 'cross',
      KeyC: 'circle',
      KeyR: 'square',
      KeyF: 'triangle',
      KeyQ: 'l1',
      KeyE: 'r1',
      KeyZ: 'l2',
      KeyX: 'r2',
      ShiftLeft: 'l3',
      KeyV: 'r3',
      ...DPAD,
      Enter: 'options',
      KeyM: 'touchpad',
    },
    sticks: STICKS,
    walk: WALK,
    mouseLook: false,
    actions: {},
    driving: null,
  },
  // GTA V's PC keys on the PS5 pad layout GTA uses. Two deliberate changes from the PC game:
  // Esc stays free to release the mouse, so Options (pause) is Enter; and crouch is X, not Ctrl,
  // because browsers do not let a page stop Ctrl+W (close tab) or Ctrl+T, and a player holding W
  // who presses Ctrl to crouch would close their own tab.
  gta: {
    name: 'gta',
    buttons: {
      Mouse2: 'l2',
      Mouse0: 'r2',
      ShiftLeft: 'cross',
      Space: 'square',
      KeyF: 'triangle',
      KeyR: 'circle',
      KeyQ: 'r1',
      Tab: 'l1',
      KeyX: 'l3',
      KeyC: 'r3',
      KeyM: 'touchpad',
      Enter: 'options',
      ...DPAD,
    },
    sticks: STICKS,
    walk: WALK,
    mouseLook: true,
    actions: {
      l2: 'aim',
      r2: 'shoot',
      cross: 'sprint',
      square: 'jump',
      triangle: 'vehicle',
      circle: 'reload',
      r1: 'cover',
      l1: 'weapons',
      l3: 'crouch',
      r3: 'look back',
      touchpad: 'map',
      options: 'pause',
    },
    // On a pad, cars use R2 to accelerate and L2 to brake, not the left stick. Keyboard drivers get
    // a toggle instead of guessing from F (enter/exit): F fails when no car is near, the guess
    // would go out of step, and on foot R2 shoots, so W would open fire. The toggle is one extra
    // key but always does what the help line says. While it is on, W and S stop pushing the left
    // stick (A and D still steer), so bikes and planes lose forward/back lean on the keyboard.
    driving: {
      toggle: 'KeyG',
      buttons: { KeyW: 'r2', KeyS: 'l2', Space: 'r1' },
    },
  },
};

/** The layout for a `/config.json` value. Unknown or missing names get the server's default, gta. */
export function layoutFor(name) {
  return Object.hasOwn(LAYOUTS, name) ? LAYOUTS[name] : LAYOUTS.gta;
}

/** Whether the layout uses this code (so the page should keep the browser from acting on it). */
export function isLayoutKey(layout, code) {
  return (
    code in layout.buttons ||
    code in layout.sticks ||
    layout.walk.includes(code) ||
    (layout.driving !== null && (code === layout.driving.toggle || code in layout.driving.buttons))
  );
}

const unit = ([x, y], scale = 1) => {
  const m = Math.hypot(x, y);
  return m > 0 ? [(x / m) * scale, (y / m) * scale] : [0, 0];
};

/**
 * Turns held codes into `{ buttons, sticks }`. With `driving` on (layouts that have it), the
 * driving codes press their buttons instead of what they do on foot.
 */
export function mapKeys(layout, held, { driving = false } = {}) {
  const overrides = driving && layout.driving ? layout.driving.buttons : {};
  const buttons = {};
  const axes = { lx: 0, ly: 0, rx: 0, ry: 0 };
  let walk = false;
  for (const code of held) {
    if (Object.hasOwn(overrides, code)) {
      buttons[overrides[code]] = true;
      continue;
    }
    if (Object.hasOwn(layout.buttons, code)) buttons[layout.buttons[code]] = true;
    if (Object.hasOwn(layout.sticks, code)) {
      const [axis, direction] = layout.sticks[code];
      axes[axis] += direction;
    }
    if (layout.walk.includes(code)) walk = true;
  }
  const [lx, ly] = unit([axes.lx, axes.ly], walk ? 0.5 : 1);
  const [rx, ry] = unit([axes.rx, axes.ry]);
  return { buttons, sticks: { lx, ly, rx, ry } };
}

/** W3C "standard" gamepad button index → console button. */
export const PAD_BUTTONS = [
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

const LABELS = { cross: '✕', circle: '○', square: '□', triangle: '△', options: 'Options', touchpad: 'Touchpad' };
const label = (button) => LABELS[button] ?? button.toUpperCase();

/** The one-line controls help shown under the video, for the layout and driving state. */
export function helpLine(layout, { driving = false } = {}) {
  const keys = Object.entries(layout.buttons).filter(([code]) => !code.startsWith('Arrow'));
  if (!layout.mouseLook) {
    const parts = keys.map(([code, button]) => `${label(button)} ${keyName(code)}`);
    return `Left stick WASD · right stick IJKL · D-pad arrows · ${parts.join(' · ')} · walk Alt. Or use any gamepad.`;
  }
  const parts = keys.map(([code, button]) => `${layout.actions[button] ?? button} (${label(button)}) ${keyName(code)}`);
  let text = `Move WASD · walk Alt · look: click the video to use the mouse (Esc frees it) or IJKL · ${parts.join(' · ')} · D-pad arrows (↑ phone)`;
  if (layout.driving) {
    const toggle = keyName(layout.driving.toggle);
    text += driving
      ? ` · driving keys ON (${toggle} turns them off): W gas (R2), S brake (L2), Space handbrake (R1)`
      : ` · driving keys off (${toggle} turns them on: W/S gas and brake, Space handbrake)`;
  }
  return `${text}. Or use any gamepad.`;
}

const KEY_NAMES = { Mouse0: 'left click', Mouse2: 'right click' };

/** A readable name for an input code. */
function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Shift')) return 'Shift';
  return code;
}
