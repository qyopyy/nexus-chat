// The reference player page: connection, line status, join/leave, video and input.
// Every message it handles is documented in docs/protocol.md.
import { setupFullscreen, keepAwake } from './fullscreen.js';
import { startInput } from './input.js';
import { helpLine, layoutFor } from './keymap.js';
import { formatClock, lineSummary, reconnectDelay, statusText, turnLeftMs, videoEligible } from './line-view.js';
import { createTouchPad } from './touch-pad.js';
import { blockZoomGestures, setupInstallHint } from './ios.js';
import { StallWatch, WhepSession } from './video-player.js';

const VIDEO_RETRY_MS = { offline: 3000, full: 10_000, error: 5000 };
const JOIN_ERRORS = {
  'line-full': 'The line is full. Try again in a bit.',
  'origin-full': 'Someone on your connection is already in line.',
  'account-in-line': 'This account is already in line.',
};

/** @type {(id: string) => any} */
const $ = (id) => document.getElementById(id);

const state = {
  config: {},
  socket: null,
  myId: null,
  videoToken: null,
  queue: { current: null, waiting: [], total: 0, paused: null },
  /** 0 = in control, 1..n = waiting, null = not in line. */
  position: null,
  clockOffset: 0,
  idleKickAt: null,
  reconnecting: false,
  reconnectAttempt: 0,
  notice: '',
  account: null,
  frame: null,
};

const isController = () => state.myId !== null && state.queue.current?.id === state.myId;
const serverNow = () => Date.now() + state.clockOffset;

function session(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked: the identity lasts this page load only.
  }
  return null;
}

// ---------- connection ----------

function connect() {
  const resume = session('resume');
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const socket = new WebSocket(resume ? `${url}?resume=${encodeURIComponent(resume)}` : url);
  socket.binaryType = 'arraybuffer';
  state.socket = socket;
  socket.addEventListener('open', () => {
    $('connection').textContent = 'Connected';
  });
  socket.addEventListener('close', (event) => {
    const tooMany = event.reason === 'too-many-connections';
    $('connection').textContent = tooMany ? 'Too many tabs open' : 'Reconnecting…';
    state.videoToken = null;
    state.reconnecting = true;
    video.stop();
    render();
    // Backoff with jitter: after a restart, hundreds of pages must not reconnect in step.
    setTimeout(connect, tooMany ? 15_000 : reconnectDelay(state.reconnectAttempt++));
  });
  socket.addEventListener('message', (event) => {
    if (typeof event.data === 'string') handle(JSON.parse(event.data));
  });
}

function send(message) {
  if (state.socket?.readyState !== WebSocket.OPEN) return;
  state.socket.send(message instanceof ArrayBuffer ? message : JSON.stringify(message));
}

function handle(message) {
  switch (message.type) {
    case 'hello':
      if (state.myId && !message.resumed) state.notice = 'Your place was lost while you were away.';
      state.myId = message.id;
      state.videoToken = message.videoToken;
      state.reconnecting = false;
      state.reconnectAttempt = 0;
      state.idleKickAt = null;
      session('resume', message.resumeToken);
      video.start();
      break;
    case 'queue':
      state.queue = message;
      state.clockOffset = message.serverNow - Date.now();
      break;
    case 'count':
      state.queue = { ...state.queue, total: message.total };
      break;
    case 'position':
      state.position = Number.isInteger(message.position) ? message.position : null;
      break;
    case 'idle':
      state.idleKickAt = typeof message.kickAt === 'number' ? message.kickAt : null;
      state.clockOffset = message.serverNow - Date.now();
      break;
    case 'kicked':
      state.notice =
        message.reason === 'idle' ? 'You lost your turn for not moving.' : 'You were removed from the line.';
      state.idleKickAt = null;
      break;
    case 'join-rejected':
      if (message.reason === 'login-required') return startLogin();
      state.notice = JOIN_ERRORS[message.reason] ?? 'Could not join.';
      break;
    case 'frame':
      state.frame = message;
      return;
    default:
      return;
  }
  render();
}

// ---------- rendering ----------

function render() {
  const controlling = isController();
  const inLine = controlling || (state.position ?? 0) >= 1;
  $('status').textContent = statusText({
    position: state.position,
    controlling,
    reconnecting: state.reconnecting,
    notice: state.notice,
    pausedReasons: state.queue.paused?.reasons,
  });
  $('line').textContent = lineSummary(state.queue);
  $('join-form').hidden = inLine;
  $('leave').hidden = !inLine;
  if (video.blocked && inLine) video.start();
  tick();
}

/** Once a second: the turn clock and the idle countdown. */
function tick() {
  const current = state.queue.current;
  let turn = current ? `${formatClock(turnLeftMs(state.queue, serverNow()))} left in this turn` : '';
  if (isController() && state.idleKickAt !== null && !state.queue.paused) {
    turn += ` · move or you lose your turn in ${Math.max(0, Math.ceil((state.idleKickAt - serverNow()) / 1000))} s`;
  }
  $('turn').textContent = turn;
  $('turn').hidden = !turn;
}

// ---------- joining and login ----------

$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.config.login === 'kick' && !state.account) return startLogin();
  try {
    localStorage.setItem('name', $('name').value);
  } catch {
    // Not remembered: fine.
  }
  state.notice = '';
  send({ type: 'join', name: $('name').value });
});
$('leave').addEventListener('click', () => send({ type: 'leave' }));
$('logout').addEventListener('click', () => {
  send({ type: 'leave' });
  const reload = () => location.reload();
  fetch('/auth/logout', { method: 'POST' }).then(reload, reload);
});

let loginStartedAt = 0;
function startLogin() {
  // One login at a time: an automatic redirect plus a click must not start two.
  if (Date.now() - loginStartedAt < 5000) return;
  loginStartedAt = Date.now();
  location.href = '/auth/kick/login';
}

// ---------- video ----------

/** The console video over WebRTC (WHEP through the server's proxy). */
const video = {
  session: null,
  stall: null,
  starting: false,
  blocked: false,
  retry: null,

  start() {
    if (state.config.video !== 'webrtc' || !state.videoToken || this.starting) return;
    const restream = Boolean(state.config.kickChannel);
    const controller = isController();
    const eligible = videoEligible({
      restream,
      controller,
      position: state.position,
      videoSpectators: state.config.videoSpectators ?? 0,
    });
    this.stop();
    this.blocked = !eligible;
    $('restream').hidden = eligible || !restream;
    if (!eligible) return setStatus('Video is for the player in control and the next in line.');
    this.starting = true;
    const stream = new MediaStream();
    const whep = new WhepSession({
      route: '/api/video',
      token: state.videoToken,
      iceServers: state.config.iceServers ?? [],
      kinds: ['video', 'audio'],
      onTrack: (track) => {
        stream.addTrack(track);
        $('live').srcObject = stream;
      },
      onState: (phase) => {
        if (this.session !== whep) return;
        if (phase !== 'connected') return this.fail('The video dropped. Reconnecting…', VIDEO_RETRY_MS.error);
        setStatus('');
        $('live').hidden = false;
        $('unmute').hidden = !$('live').muted;
      },
    });
    this.session = whep;
    this.stall = new StallWatch();
    whep
      .start()
      .then((status) => {
        if (this.session !== whep) return;
        if (status === 201) setStatus('Connecting video…');
        else if (status === 503) this.fail('The console is offline.', VIDEO_RETRY_MS.offline);
        else if (status === 429) {
          $('restream').hidden = !restream;
          this.fail('All video slots are taken.', VIDEO_RETRY_MS.full);
        } else this.fail('Video failed. Retrying…', VIDEO_RETRY_MS.error);
      })
      .catch(() => this.fail('Video failed. Retrying…', VIDEO_RETRY_MS.error))
      .finally(() => {
        this.starting = false;
      });
  },

  stop() {
    clearTimeout(this.retry);
    this.session?.close();
    this.session = null;
    $('live').hidden = true;
    $('unmute').hidden = true;
  },

  fail(message, retryMs) {
    this.stop();
    setStatus(message);
    this.retry = setTimeout(() => this.start(), retryMs);
  },

  /** The console sends keyframes on request: ask for one when the controller's picture froze. */
  async checkStall() {
    const whep = this.session;
    if (!whep || !isController() || whep.connection.connectionState !== 'connected') return;
    const stats = await whep.videoStats().catch(() => null);
    if (stats && this.stall.update(performance.now(), stats)) send({ type: 'video-stalled' });
  },
};

function setStatus(text) {
  $('video-status').textContent = text;
}

$('unmute').addEventListener('click', () => {
  $('live').muted = false;
  $('unmute').hidden = true;
  $('live')
    .play()
    .catch(() => {});
});

/** Simulated console: a dot where the left stick drove it. */
function drawSimulator() {
  const canvas = $('sim');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.frame) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(state.frame.x * canvas.width, state.frame.y * canvas.height, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText(`Buttons: ${state.frame.pressed.join(' ') || '-'}`, 8, canvas.height - 8);
  }
  requestAnimationFrame(drawSimulator);
}

// ---------- boot ----------

async function boot() {
  state.config = await fetch('/config.json')
    .then((r) => r.json())
    .catch(() => ({}));
  const name = state.config.name ?? 'PlayGTA';
  document.title = name;
  $('title').textContent = name;
  const layout = layoutFor(state.config.keyboardLayout);
  const showHelp = (driving = false) => {
    $('help').textContent = helpLine(layout, { driving });
  };
  showHelp();
  try {
    $('name').value = localStorage.getItem('name') ?? '';
  } catch {
    // Storage blocked.
  }
  if (state.config.kickChannel) {
    $('restream-link').href = `https://kick.com/${encodeURIComponent(state.config.kickChannel)}`;
  }
  if (state.config.login === 'kick') {
    const me = await fetch('/auth/me')
      .then((r) => r.json())
      .catch(() => ({}));
    state.account = typeof me.name === 'string' ? me.name : null;
    $('name').hidden = true;
    $('join').textContent = state.account ? 'Join the line' : 'Log in with Kick to play';
    $('account').hidden = !state.account;
    $('account-name').textContent = state.account ? `Logged in as ${state.account}.` : '';
    const result = new URLSearchParams(location.search).get('login');
    if (result) {
      state.notice = result === 'cancelled' ? 'Login cancelled.' : 'Login failed. Try again.';
      history.replaceState(null, '', location.pathname);
    }
  }
  if (state.config.video === 'webrtc') setStatus('Connecting video…');
  else if (state.config.console === 'simulated') {
    $('sim').hidden = false;
    requestAnimationFrame(drawSimulator);
  } else setStatus('No video on this server.');

  render();
  connect();
  // Phones and tablets: on-screen joysticks and buttons, full screen, and no screen sleep during a turn.
  const touch = createTouchPad($('touchpad'));
  document.documentElement.classList.toggle('touch', touch.enabled);
  const awake = keepAwake();
  if (touch.enabled) {
    blockZoomGestures();
    setupInstallHint($('install-hint'));
  }
  setupFullscreen({
    view: $('screen'),
    button: $('fs'),
    onChange: (on) => {
      // In full screen the controls sit on top of the picture; otherwise they sit under it.
      if (on) $('screen').append($('touchpad'));
      else $('screen').after($('touchpad'));
    },
  });
  setInterval(() => awake(isController()), 1000);
  startInput({ active: isController, send, layout, screen: $('screen'), touch, onDrivingChange: showHelp });
  setInterval(tick, 1000);
  setInterval(() => void video.checkStall(), 250);
  // Keeps the socket alive through proxies that drop idle connections.
  setInterval(() => send({ type: 'ping', t: performance.now() }), 25_000);
}

void boot();
