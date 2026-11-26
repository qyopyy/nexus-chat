// Mouse look (pure: no DOM; callers pass the time in ms). Turns mouse movement into a right stick.
//
// A stick is a speed control: how far it is pushed sets how fast the camera turns. A moving mouse
// is a speed too, so the stick follows how fast the mouse moves, not where it is. Mice report at
// 125-1000 Hz while input is sampled every 4 ms, so many samples see no movement at all: the speed
// is smoothed with a short half-life, and when the mouse stops it decays to zero, which brings the
// stick back to center. Games ignore small stick values (their own dead zone), so any movement
// starts at `minOutput` instead of crawling up from zero.

const DEFAULTS = {
  /** Stick deflection per pixel per millisecond: 1 px/ms (a moderate flick) is half a stick. */
  gain: 0.5,
  /** Smoothing half-life. Longer is steadier but keeps turning a little after the mouse stops. */
  halfLifeMs: 20,
  /** Smallest deflection sent while the mouse moves, to clear the game's dead zone. */
  minOutput: 0.15,
  /** Below this (before minOutput is added) the stick counts as centered. */
  rest: 0.03,
  /** Larger single reports are cut: browsers sometimes report a jump when the pointer locks. */
  maxDelta: 200,
};

const clamp = (value, limit) => (Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0);

export class MouseLook {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.reset();
  }

  /** Adds one movement report (pixels, right and down positive). */
  move(dx, dy) {
    const { maxDelta } = this.options;
    this.dx += clamp(dx, maxDelta);
    this.dy += clamp(dy, maxDelta);
  }

  /** The right stick `[rx, ry]` at `now` (each -1..1, inside the unit circle). */
  sample(now) {
    const { gain, halfLifeMs, rest } = this.options;
    const dt = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    if (dt === 0) return this.output();
    const keep = 0.5 ** (dt / halfLifeMs);
    this.vx = this.vx * keep + (this.dx / dt) * gain * (1 - keep);
    this.vy = this.vy * keep + (this.dy / dt) * gain * (1 - keep);
    this.dx = 0;
    this.dy = 0;
    const magnitude = Math.hypot(this.vx, this.vy);
    if (magnitude < rest) {
      this.vx = 0;
      this.vy = 0;
    } else if (magnitude > 1) {
      // Cap the smoothed speed itself, so a fast flick does not keep turning after it ends.
      this.vx /= magnitude;
      this.vy /= magnitude;
    }
    return this.output();
  }

  output() {
    const { minOutput } = this.options;
    const magnitude = Math.hypot(this.vx, this.vy);
    if (magnitude === 0) return [0, 0];
    const scaled = minOutput + (1 - minOutput) * Math.min(1, magnitude);
    return [(this.vx / magnitude) * scaled, (this.vy / magnitude) * scaled];
  }

  /** Centers the stick and forgets pending movement (pointer released, turn over). */
  reset() {
    this.dx = 0;
    this.dy = 0;
    this.vx = 0;
    this.vy = 0;
    this.last = null;
  }
}
