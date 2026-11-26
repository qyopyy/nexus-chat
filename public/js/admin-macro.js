// Macro text <-> steps for the admin panel (pure, no DOM). See docs/protocol.md "Admin API".

export const MAX_STEPS = 160;
const BUTTON_NAMES = new Set([
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'options', 'l3', 'r3', 'up', 'down', 'left', 'right', 'touchpad',
]);

/** Gap between two presses of a cheat code, so the game sees them as separate taps. */
const TAP_MS = 90;

/**
 * The classic GTA San Andreas PlayStation cheat for $250,000, health and armor:
 * R1 R2 L1 X Left Down Right Up Left Down Right Up. It only exists in that game (and its ports);
 * edit the sequence for any other title.
 */
export const MONEY_PRESET = ['r1', 'r2', 'l1', 'cross', 'left', 'down', 'right', 'up', 'left', 'down', 'right', 'up']
  .flatMap((button) => [`${button} ${TAP_MS}`, `- ${TAP_MS}`])
  .join('\n');

/**
 * Parses the text into `[{ buttons, ms }]` for POST /api/admin/macro.
 * @returns `{ steps }` or `{ error }` naming the first bad line.
 */
export function parseMacroText(text) {
  const steps = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line || line.startsWith('#')) continue;
    const [names, ms, ...extra] = line.split(/\s+/);
    const hold = Number(ms);
    if (extra.length || !names || !Number.isFinite(hold) || hold < 30 || hold > 2000) {
      return { error: `Line ${i + 1}: use "button+button 90" with 30-2000 ms.` };
    }
    const buttons = names === '-' ? [] : names.toLowerCase().split('+');
    const bad = buttons.find((name) => !BUTTON_NAMES.has(name));
    if (bad) return { error: `Line ${i + 1}: unknown or blocked button "${bad}".` };
    steps.push({ buttons, ms: Math.round(hold) });
    if (steps.length > MAX_STEPS) return { error: `At most ${MAX_STEPS} steps.` };
  }
  return steps.length ? { steps } : { error: 'Add at least one step.' };
}
