import { describe, expect, it } from 'bun:test';
import { BUTTON_ORDER } from '../public/js/input-codec.js';
import { helpLine, isLayoutKey, LAYOUTS, layoutFor, mapKeys, PAD_BUTTONS } from '../public/js/keymap.js';
import { MouseLook } from '../public/js/mouse-look.js';
import { KEYBOARD_LAYOUTS } from '../src/adapters/config/env-config.ts';

const { generic, gta } = LAYOUTS;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('keyboard layouts', () => {
  it('has a layout for every KEYBOARD_LAYOUT value, and gta for anything else', () => {
    for (const name of KEYBOARD_LAYOUTS) expect(layoutFor(name).name).toBe(name);
    expect(layoutFor(undefined)).toBe(gta);
    expect(layoutFor('toString')).toBe(gta);
  });

  it('only presses buttons the input frame can carry', () => {
    for (const layout of [generic, gta]) {
      const buttons = [...Object.values(layout.buttons), ...Object.values(layout.driving?.buttons ?? {})];
      for (const button of buttons) expect(BUTTON_ORDER).toContain(button);
    }
    expect([...PAD_BUTTONS]).toStrictEqual([...BUTTON_ORDER]);
  });

  it('keeps the generic layout as it was', () => {
    const state = mapKeys(generic, ['Space', 'KeyW', 'KeyD', 'KeyL']);
    expect(state.buttons).toStrictEqual({ cross: true });
    expect(close(state.sticks.lx, Math.SQRT1_2)).toBe(true);
    expect(close(state.sticks.ly, -Math.SQRT1_2)).toBe(true);
    expect(state.sticks.rx).toBe(1);
    expect(helpLine(generic)).toBe(
      'Left stick WASD · right stick IJKL · D-pad arrows · ✕ Space · ○ C · □ R · △ F · L1 Q · R1 E · L2 Z · R2 X · ' +
        'L3 Shift · R3 V · Options Enter · Touchpad M · walk Alt. Or use any gamepad.',
    );
  });

  it('maps GTA keys and mouse buttons onto the PlayStation pad', () => {
    const pressed = (code: string) => Object.keys(mapKeys(gta, [code]).buttons);
    expect(pressed('ShiftLeft')).toStrictEqual(['cross']);
    expect(pressed('Space')).toStrictEqual(['square']);
    expect(pressed('KeyF')).toStrictEqual(['triangle']);
    expect(pressed('KeyR')).toStrictEqual(['circle']);
    expect(pressed('KeyQ')).toStrictEqual(['r1']);
    expect(pressed('Tab')).toStrictEqual(['l1']);
    expect(pressed('KeyX')).toStrictEqual(['l3']);
    expect(pressed('KeyC')).toStrictEqual(['r3']);
    expect(pressed('KeyM')).toStrictEqual(['touchpad']);
    expect(pressed('Enter')).toStrictEqual(['options']);
    expect(pressed('ArrowUp')).toStrictEqual(['up']);
    expect(pressed('Mouse0')).toStrictEqual(['r2']);
    expect(pressed('Mouse2')).toStrictEqual(['l2']);
    // Esc releases the pointer, and Ctrl+W would close the tab: neither may be a game key.
    for (const code of ['Escape', 'ControlLeft', 'ControlRight']) expect(isLayoutKey(gta, code)).toBe(false);
  });

  it('walks at half stick with Alt', () => {
    const state = mapKeys(gta, ['KeyW', 'AltLeft']);
    expect(state.sticks.ly).toBe(-0.5);
    expect(state.buttons).toStrictEqual({});
  });

  it('turns W/S into gas and brake, and Space into the handbrake, only while driving', () => {
    const onFoot = mapKeys(gta, ['KeyW', 'KeyA', 'Space']);
    expect(onFoot.buttons).toStrictEqual({ square: true });
    expect(onFoot.sticks.ly < 0).toBe(true);

    const driving = mapKeys(gta, ['KeyW', 'KeyA', 'Space'], { driving: true });
    expect(driving.buttons).toStrictEqual({ r2: true, r1: true });
    expect(driving.sticks.lx).toBe(-1);
    expect(driving.sticks.ly).toBe(0);
    expect(mapKeys(gta, ['KeyS'], { driving: true }).buttons).toStrictEqual({ l2: true });

    // Layouts without a driving mode ignore it.
    expect(mapKeys(generic, ['KeyW'], { driving: true }).sticks.ly).toBe(-1);
  });

  it('shows the GTA controls and the driving state in the help line', () => {
    const off = helpLine(gta);
    for (const part of ['sprint (✕) Shift', 'jump (□) Space', 'shoot (R2) left click', 'aim (L2) right click']) {
      expect(off).toContain(part);
    }
    expect(off).toContain('Esc frees it');
    expect(off).toContain('driving keys off (G turns them on');
    expect(helpLine(gta, { driving: true })).toContain('driving keys ON (G turns them off)');
    expect(isLayoutKey(gta, 'KeyG')).toBe(true);
    expect(isLayoutKey(generic, 'KeyG')).toBe(false);
  });
});

describe('mouse look', () => {
  /** Moves the mouse `perTick` pixels every 4 ms for `ms`, returning the last stick value. */
  function drive(look: MouseLook, start: number, ms: number, perTick: [number, number]): [number, number] {
    let stick: [number, number] = [0, 0];
    for (let t = start; t <= start + ms; t += 4) {
      look.move(...perTick);
      stick = look.sample(t);
    }
    return stick;
  }

  it('stays centered while the mouse does not move', () => {
    const look = new MouseLook();
    for (let t = 0; t < 100; t += 4) expect(look.sample(t)).toStrictEqual([0, 0]);
  });

  it('follows the mouse speed and direction', () => {
    const slow = drive(new MouseLook(), 0, 200, [1, 0]);
    const fast = drive(new MouseLook(), 0, 200, [4, 0]);
    expect(slow[0] > 0.15).toBe(true);
    expect(fast[0] > slow[0]).toBe(true);
    expect(slow[1]).toBe(0);
    const upLeft = drive(new MouseLook(), 0, 200, [-2, -2]);
    expect(upLeft[0] < 0 && upLeft[1] < 0).toBe(true);
  });

  it('never leaves the unit circle, even for a huge flick', () => {
    const look = new MouseLook();
    look.sample(0);
    look.move(100_000, 100_000);
    const [x, y] = look.sample(4);
    expect(Math.hypot(x, y) <= 1 + 1e-9).toBe(true);
    expect(drive(new MouseLook(), 0, 200, [50, 0])[0]).toBe(1);
  });

  it('returns to center soon after the mouse stops', () => {
    const look = new MouseLook();
    drive(look, 0, 200, [3, 1]);
    let centeredAt = -1;
    for (let t = 204; t < 600; t += 4) {
      if (look.sample(t)[0] === 0) {
        centeredAt = t;
        break;
      }
    }
    expect(centeredAt > 0 && centeredAt - 200 <= 150).toBe(true);
  });

  it('forgets everything on reset', () => {
    const look = new MouseLook();
    drive(look, 0, 100, [5, 5]);
    look.move(50, 50);
    look.reset();
    look.sample(200);
    expect(look.sample(204)).toStrictEqual([0, 0]);
  });
});
