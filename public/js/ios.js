// iPhone / iPad helpers. Safari on iPhone has no Fullscreen API for ordinary elements, so the page can be
// installed to the Home Screen (Share → Add to Home Screen) and then runs full screen, like an app.

/** iPhone, iPod and iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(ua = navigator.userAgent, platform = navigator.platform, maxTouchPoints = navigator.maxTouchPoints) {
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/** True when launched from the Home Screen (no browser bars). */
export function isStandalone(nav = navigator, match = globalThis.matchMedia) {
  return nav.standalone === true || Boolean(match?.('(display-mode: standalone)')?.matches);
}

/** Only Safari can add to the Home Screen on iOS; Chrome/Firefox/Edge on iOS use "Share" too, but in-app browsers don't. */
export function canShowInstallHint(ua = navigator.userAgent, platform, maxTouchPoints, standalone = isStandalone()) {
  return isIOS(ua, platform ?? navigator.platform, maxTouchPoints ?? navigator.maxTouchPoints) && !standalone && !/FBAN|FBAV|Instagram|Line\/|Twitter/i.test(ua);
}

const HINT_KEY = 'playgta.installHint';

/** Shows a small, dismissible "Add to Home Screen" tip (once per device) on iPhone/iPad Safari. */
export function setupInstallHint(el, storage = globalThis.localStorage) {
  let dismissed = false;
  try {
    dismissed = storage?.getItem(HINT_KEY) === '1';
  } catch {
    // Private mode: show the tip every visit.
  }
  if (dismissed || !canShowInstallHint()) return false;
  el.hidden = false;
  el.querySelector('button')?.addEventListener('click', () => {
    el.hidden = true;
    try {
      storage?.setItem(HINT_KEY, '1');
    } catch {
      // Nothing to remember it with.
    }
  });
  return true;
}

/** Stops pinch-zoom and double-tap zoom, which fight with the on-screen joysticks. */
export function blockZoomGestures(doc = document) {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) doc.addEventListener(type, (e) => e.preventDefault());
  let last = 0;
  doc.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - last < 350 && e.target instanceof Element && e.target.closest('#screen, #touchpad')) e.preventDefault();
      last = now;
    },
    { passive: false },
  );
}
