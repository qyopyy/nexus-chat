/**
 * Keeps short taps down for a minimum time so they survive input sampling and sending.
 * Clock-free: callers pass `now` (ms), which keeps it easy to test.
 */
export class PressLatch {
  constructor(minPressMs = 80) {
    this.minPressMs = minPressMs;
    /** key → { pressedAt, releaseAt (null while physically held) } */
    this.keys = new Map();
  }

  /** Records a press; auto-repeat of a held key is ignored so it never extends the press. */
  press(key, now, repeat = false) {
    const entry = this.keys.get(key);
    if (repeat && entry) return;
    if (entry) entry.releaseAt = null;
    else this.keys.set(key, { pressedAt: now, releaseAt: null });
  }

  /** Lets go now, or at pressedAt + minPressMs if the press was too short. */
  release(key, now) {
    const entry = this.keys.get(key);
    if (!entry) return;
    const earliest = entry.pressedAt + this.minPressMs;
    if (now >= earliest) this.keys.delete(key);
    else entry.releaseAt = earliest;
  }

  /** Keys that count as down at `now`. */
  held(now) {
    const down = new Set();
    for (const [key, entry] of this.keys) {
      if (entry.releaseAt !== null && now >= entry.releaseAt) this.keys.delete(key);
      else down.add(key);
    }
    return down;
  }

  reset() {
    this.keys.clear();
  }
}
