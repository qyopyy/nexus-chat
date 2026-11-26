// What the page says about the line (pure helpers, testable without a browser). The server sends
// every viewer the controller and the total ("queue"), and each player only their own place
// ("position").

/** "Playing: Ana · 3 waiting". */
export function lineSummary(queue) {
  const playing = queue.current ? `Playing: ${queue.current.name}` : 'Nobody is playing';
  return `${playing} · ${queue.total ?? queue.waiting?.length ?? 0} waiting`;
}

/** Your own status: in control, waiting at n, or not in line. */
export function statusText({ position, controlling, reconnecting, notice, pausedReasons = [] }) {
  let text = notice || 'Join the line to play.';
  if (reconnecting) text = 'Reconnecting…';
  else if (controlling) text = 'You are in control.';
  else if (Number.isInteger(position) && position >= 1)
    text = position === 1 ? 'You are next.' : `You are #${position} in line.`;
  if (pausedReasons.includes('stream')) return `Paused: the video dropped. ${text}`;
  if (pausedReasons.includes('admin')) return `Paused by the host. ${text}`;
  return text;
}

/** Time left in the controller's turn (frozen while paused). */
export function turnLeftMs(queue, serverNow) {
  if (!queue.current) return 0;
  return queue.paused ? (queue.paused.remainingMs ?? 0) : queue.current.endsAt - serverNow;
}

/**
 * May this page ask for the direct (WebRTC) video? With a public restream the server keeps its
 * slots for the controller and the next `videoSpectators` in line; everyone else watches it.
 */
export function videoEligible({ restream, controller, position, videoSpectators }) {
  if (!restream || controller) return true;
  return Number.isInteger(position) && position >= 1 && position <= videoSpectators;
}

/** Wait before reconnect attempt `attempt` (0 first): doubling up to 20 s, with jitter. */
export function reconnectDelay(attempt, random = Math.random) {
  return Math.round(Math.min(20_000, 1500 * 2 ** attempt) * (0.5 + random()));
}

/** m:ss, rounded down. */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
