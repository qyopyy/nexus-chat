// On-screen controller for phones and tablets: two floating joysticks and the DualSense buttons.
// Pointer events, so several fingers work at once. Output matches what input.js samples from a gamepad.

/** Pixels of finger travel for a full stick deflection. */
const STICK_RADIUS = 56;
const CAMERA_RADIUS = 44;
const TOUCH_DEADZONE = 0.1;

/** Stick position from the finger's offset: clamped to the unit circle, with a small dead zone. */
export function stickFromOffset(dx, dy, radius) {
  const magnitude = Math.hypot(dx, dy);
  if (magnitude === 0) return [0, 0];
  const clamped = Math.min(1, magnitude / radius);
  if (clamped < TOUCH_DEADZONE) return [0, 0];
  const scaled = (clamped - TOUCH_DEADZONE) / (1 - TOUCH_DEADZONE);
  return [(dx / magnitude) * scaled, (dy / magnitude) * scaled];
}

/** True on phones and tablets (coarse pointer), or when the page was opened with ?touch=1. */
export function wantsTouchControls(win = window) {
  try {
    if (new URLSearchParams(win.location.search).get('touch') === '1') return true;
    return win.matchMedia?.('(pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

const FACE = [
  ['triangle', '△', 'btn-triangle'],
  ['circle', '○', 'btn-circle'],
  ['cross', '✕', 'btn-cross'],
  ['square', '□', 'btn-square'],
];
const SHOULDERS = [
  ['l2', 'L2', 'btn-l2'],
  ['l1', 'L1', 'btn-l1'],
  ['r2', 'R2', 'btn-r2'],
  ['r1', 'R1', 'btn-r1'],
];
const DPAD = [
  ['up', '▲', 'btn-up'],
  ['left', '◀', 'btn-left'],
  ['right', '▶', 'btn-right'],
  ['down', '▼', 'btn-down'],
];
const SMALL = [
  ['options', '≡', 'btn-options'],
  ['l3', 'L3', 'btn-l3'],
  ['r3', 'R3', 'btn-r3'],
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A floating joystick: appears where the finger lands inside `zone`, moves with it, vanishes on release. */
class Joystick {
  constructor(zone, radius, onChange) {
    this.zone = zone;
    this.radius = radius;
    this.onChange = onChange;
    this.pointer = null;
    this.origin = [0, 0];
    this.value = [0, 0];
    this.base = el('div', 'stick-base');
    this.knob = el('div', 'stick-knob');
    this.base.append(this.knob);
    this.base.hidden = true;
    zone.append(this.base);
    zone.addEventListener('pointerdown', (e) => this.down(e));
    zone.addEventListener('pointermove', (e) => this.move(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      zone.addEventListener(type, (e) => this.up(e));
    }
  }

  down(event) {
    if (this.pointer !== null || event.target.closest?.('.pad-btn')) return;
    this.pointer = event.pointerId;
    try {
      this.zone.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail for synthetic events; the stick still works while the finger stays inside.
    }
    const rect = this.zone.getBoundingClientRect();
    this.origin = [event.clientX, event.clientY];
    this.base.style.left = `${event.clientX - rect.left}px`;
    this.base.style.top = `${event.clientY - rect.top}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.hidden = false;
    event.preventDefault();
  }

  move(event) {
    if (event.pointerId !== this.pointer) return;
    const dx = event.clientX - this.origin[0];
    const dy = event.clientY - this.origin[1];
    this.value = stickFromOffset(dx, dy, this.radius);
    const shown = Math.min(1, Math.hypot(dx, dy) / this.radius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * shown * this.radius;
    const ky = Math.sin(angle) * shown * this.radius;
    this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    this.onChange();
    event.preventDefault();
  }

  up(event) {
    if (event.pointerId !== this.pointer) return;
    this.reset();
  }

  reset() {
    this.pointer = null;
    this.value = [0, 0];
    this.base.hidden = true;
    this.onChange();
  }
}

/**
 * Builds the controller inside `host` (an empty element). `sample()` returns the current
 * { buttons, triggers, sticks } (same shape input.js merges with keyboard and gamepad);
 * `setActive(on)` shows it only while this player is in control.
 */
export function createTouchPad(host, { enabled = wantsTouchControls() } = {}) {
  const held = new Set();
  const noop = () => {};
  const moveZone = el('div', 'pad-zone pad-zone-left');
  const lookZone = el('div', 'pad-zone pad-zone-right');
  host.append(moveZone, lookZone);
  const left = new Joystick(moveZone, STICK_RADIUS, noop);
  const right = new Joystick(lookZone, CAMERA_RADIUS, noop);

  const addButtons = (list, group) => {
    const box = el('div', `pad-group ${group}`);
    for (const [name, label, cls] of list) {
      const button = el('button', `pad-btn ${cls}`, label);
      button.type = 'button';
      button.setAttribute('aria-label', name);
      button.addEventListener('pointerdown', (e) => {
        held.add(name);
        button.classList.add('on');
        try {
          button.setPointerCapture(e.pointerId);
        } catch {
          // See Joystick.down.
        }
        e.preventDefault();
      });
      const release = () => {
        held.delete(name);
        button.classList.remove('on');
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
      button.addEventListener('contextmenu', (e) => e.preventDefault());
      box.append(button);
    }
    host.append(box);
  };
  addButtons(FACE, 'pad-face');
  addButtons(SHOULDERS, 'pad-shoulders');
  addButtons(DPAD, 'pad-dpad');
  addButtons(SMALL, 'pad-small');

  host.addEventListener('contextmenu', (e) => e.preventDefault());
  let active = false;
  const apply = () => {
    host.hidden = !(enabled && active);
  };
  apply();

  return {
    enabled,
    sample() {
      const buttons = {};
      for (const name of held) buttons[name] = true;
      const triggers = { l2: held.has('l2') ? 1 : 0, r2: held.has('r2') ? 1 : 0 };
      return {
        buttons,
        triggers,
        sticks: { lx: left.value[0], ly: left.value[1], rx: right.value[0], ry: right.value[1] },
      };
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      if (!on) this.reset();
      apply();
    },
    reset() {
      held.clear();
      for (const button of host.querySelectorAll('.pad-btn.on')) button.classList.remove('on');
      left.reset();
      right.reset();
    },
  };
}
