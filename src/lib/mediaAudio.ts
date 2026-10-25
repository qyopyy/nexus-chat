// iPhone/iPad: once the page has made any Web Audio sound (UI sounds, calls, music tools), iOS
// treats the page's audio as "ambient" — the ring/silent switch then mutes <video>/<audio> too,
// so uploaded videos play silently on phones while desktop browsers play them fine.
// While a page video/audio element plays with sound we switch the audio session to "playback"
// (like YouTube does), and hand it back to "auto" when everything is paused so we don't stop the
// user's own music when Nexus only plays a notification blip.

type AudioSession = { type: string };
const session = (): AudioSession | null =>
  typeof navigator !== "undefined" ? ((navigator as unknown as { audioSession?: AudioSession }).audioSession ?? null) : null;

const playing = new Set<HTMLMediaElement>();

function set(type: "playback" | "auto") {
  const s = session();
  if (!s || s.type === type) return;
  try {
    s.type = type;
  } catch {
    /* older WebKit */
  }
}

function update(el: HTMLMediaElement) {
  if (!el.paused && !el.ended && !el.muted && el.volume > 0) playing.add(el);
  else playing.delete(el);
  for (const m of playing) if (!m.isConnected) playing.delete(m);
  set(playing.size ? "playback" : "auto");
}

let started = false;
/** global listener — media events don't bubble, so listen in the capture phase */
export function startMediaAudio() {
  if (started || typeof document === "undefined") return;
  started = true;
  const on = (e: Event) => {
    const el = e.target;
    if (el instanceof HTMLMediaElement) update(el);
  };
  for (const ev of ["play", "playing", "pause", "ended", "volumechange", "emptied"]) document.addEventListener(ev, on, true);
}

/** call right before el.play() inside a tap handler so the very first frame already has sound */
export function preparePlayback() {
  set("playback");
}
