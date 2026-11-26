// The local admin panel: line controls and cheat macros, all through /api/admin/*.
import { MONEY_PRESET, parseMacroText } from './admin-macro.js';

/** @type {(id: string) => any} */
const $ = (id) => document.getElementById(id);
const MACRO_KEY = 'playgta.admin.macro';
let token = '';
let timer = null;

function stored(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked: nothing is remembered.
  }
  return null;
}

function setStatus(text) {
  $('admin-status').textContent = text;
}

async function api(method, path, body) {
  const response = await fetch(`/api/admin/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) throw new Error('Wrong token.');
  if (response.status === 404) throw new Error('Admin API is off, or this page is not open on the host machine.');
  return response;
}

const clock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

async function refresh() {
  try {
    const state = await (await api('GET', 'state')).json();
    const now = state.serverNow ?? Date.now();
    $('now-playing').textContent = state.current
      ? `Playing: ${state.current.name} · ${clock(state.paused ? (state.paused.remainingMs ?? 0) : state.current.endsAt - now)} left${state.paused ? ' (paused)' : ''}`
      : 'Nobody is playing.';
    const list = $('waiting');
    list.replaceChildren(
      ...state.waiting.map((player) => {
        const item = document.createElement('li');
        item.append(`${player.name} `);
        const kick = document.createElement('button');
        kick.type = 'button';
        kick.textContent = 'Remove';
        kick.addEventListener('click', () => void act('POST', 'kick', { id: player.id }));
        item.append(kick);
        return item;
      }),
    );
    setStatus(`Connected · ${state.connected ?? 0} online · ${state.total ?? state.waiting.length} waiting`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function act(method, path, body) {
  try {
    const response = await api(method, path, body);
    if (path === 'macro') {
      $('macro-note').textContent =
        response.status === 202 ? 'Running…' : response.status === 409 ? 'A macro is already running.' : 'The console refused that sequence.';
    }
  } catch (error) {
    setStatus(error.message);
  }
  void refresh();
}

function runMacro(text) {
  const parsed = parseMacroText(text);
  if ('error' in parsed) {
    $('macro-note').textContent = parsed.error;
    return;
  }
  void act('POST', 'macro', { steps: parsed.steps });
}

$('token-form').addEventListener('submit', (event) => {
  event.preventDefault();
  token = $('token').value.trim();
  $('token').value = '';
  if (!token) return;
  stored('playgta.admin.token', token);
  start();
});

function start() {
  $('panel').hidden = false;
  $('macro-text').value = stored(MACRO_KEY) || MONEY_PRESET;
  clearInterval(timer);
  timer = setInterval(() => void refresh(), 2000);
  void refresh();
}

$('skip').addEventListener('click', () => void act('POST', 'skip'));
$('pause').addEventListener('click', () => void act('POST', 'pause'));
$('resume').addEventListener('click', () => void act('POST', 'resume'));
$('money').addEventListener('click', () => runMacro(MONEY_PRESET));
$('run-custom').addEventListener('click', () => runMacro($('macro-text').value));
$('macro-text').addEventListener('input', () => stored(MACRO_KEY, $('macro-text').value));
$('reset-macro').addEventListener('click', () => {
  $('macro-text').value = MONEY_PRESET;
  stored(MACRO_KEY, MONEY_PRESET);
});

token = stored('playgta.admin.token') || '';
if (token) start();
