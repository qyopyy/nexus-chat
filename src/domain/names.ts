const MAX_PLAYER_NAME = 20;
const FALLBACK_PLAYER_NAME = 'Anonymous';
const MAX_DISPLAY_NAME = 18;
const DISPLAY_FALLBACK = 'Player';

/** A player's name for the line: no control characters, trimmed, at most 20 characters. */
export function cleanPlayerName(raw: string): string {
  const name = [...raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, MAX_PLAYER_NAME).join('');
  return name || FALLBACK_PLAYER_NAME;
}

/**
 * A name safe to draw on a public broadcast: letters, digits, spaces and `. _ -` only (no emoji
 * walls or look-alike tricks), trimmed and cut with an ellipsis past 18 characters.
 */
export function displayName(name: string): string {
  const clean = [
    ...name
      .replace(/[^\p{L}\p{N} ._-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ];
  if (clean.length === 0) return DISPLAY_FALLBACK;
  return clean.length > MAX_DISPLAY_NAME ? `${clean.slice(0, MAX_DISPLAY_NAME - 1).join('')}…` : clean.join('');
}
