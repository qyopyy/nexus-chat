// Full screen for the game view. Browsers with the Fullscreen API use it; iPhone Safari has none for
// ordinary elements, so there the view is stretched over the page instead ("pseudo" full screen).

const doc = document;
const nativeElement = () => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

/** Locks to landscape when the browser allows it (Android Chrome, in full screen). */
async function lockLandscape() {
  try {
    await screen.orientation?.lock?.('landscape');
  } catch {
    // Not supported or not allowed: the player just rotates the phone.
  }
}

/**
 * Wires `button` to toggle full screen for `view`. `onChange(on)` fires after every change
 * (the page moves the touch controls inside the view while it is full screen).
 */
export function setupFullscreen({ view, button, onChange = () => {} }) {
  let pseudo = false;
  const isOn = () => pseudo || nativeElement() === view;

  const report = () => {
    const on = isOn();
    view.classList.toggle('fullscreen', on);
    doc.documentElement.classList.toggle('has-fullscreen', on);
    button.textContent = on ? '✕' : '⛶';
    button.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    onChange(on);
  };

  const enter = async () => {
    const request = view.requestFullscreen ?? view.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(view, { navigationUI: 'hide' });
        void lockLandscape();
        return report();
      } catch {
        // Fall through to the pseudo mode.
      }
    }
    pseudo = true;
    window.scrollTo(0, 0);
    report();
  };

  const exit = async () => {
    if (pseudo) pseudo = false;
    else if (nativeElement()) await (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    try {
      screen.orientation?.unlock?.();
    } catch {
      // Nothing was locked.
    }
    report();
  };

  button.addEventListener('click', () => void (isOn() ? exit() : enter()));
  for (const type of ['fullscreenchange', 'webkitfullscreenchange']) doc.addEventListener(type, report);
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pseudo) void exit();
  });
  report();
  return { isOn, enter, exit };
}

/** Keeps the screen on while `on` (a turn in progress). Silent where the Wake Lock API is missing. */
export function keepAwake() {
  let lock = null;
  const acquire = async () => {
    try {
      lock = await navigator.wakeLock?.request('screen');
      lock?.addEventListener('release', () => (lock = null));
    } catch {
      lock = null;
    }
  };
  doc.addEventListener('visibilitychange', () => {
    if (wanted && !lock && !doc.hidden) void acquire();
  });
  let wanted = false;
  return (on) => {
    if (on === wanted) return;
    wanted = on;
    if (on) void acquire();
    else {
      void lock?.release?.();
      lock = null;
    }
  };
}
