import { DropRoom } from './room.mjs';
import { DropTransfer } from './transfer.mjs';
import { MAX_BYTES, cleanName, createRoomToken, escapeHtml as esc, fileManifest, formatBytes, invitationUrl, parseInvitation } from './core.mjs';

const $ = selector => document.querySelector(selector);
const base = new URL(location.href); base.hash = ''; base.search = '';
const state = { room: null, transfer: null, peers: [], selected: null, files: [], mode: 'files', received: [], current: null, joining: false };
const kind = /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : /iPhone|Android.*Mobile/i.test(navigator.userAgent) ? 'phone' : 'desktop';
const supported = window.isSecureContext && Boolean(window.RTCPeerConnection && window.crypto?.subtle);
const terminal = phase => ['complete', 'failed', 'cancelled'].includes(phase);
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000);
}

function deviceName() { return cleanName($('#device-name').value, `My ${kind === 'desktop' ? 'computer' : kind}`, 32); }
function peerName(id) { return state.peers.find(peer => peer.id === id)?.name ?? 'The other device'; }

function status(value) {
  const labels = { connecting: 'Connecting your room…', online: 'Room connected', offline: 'Connection unavailable · local tabs only', local: 'Local tabs only · service not configured' };
  $('#connection').textContent = labels[value] ?? 'Ready when you are';
  $('#connection').dataset.state = value;
}

function updateSend() {
  const note = $('#note-input').value;
  const ready = state.mode === 'files' ? state.files.length > 0 : note.trim().length > 0;
  $('#send').disabled = !supported || !state.room || !state.selected || !ready || Boolean(state.current);
  $('#send').textContent = state.current ? 'Finish the current transfer first' : !state.selected ? 'Choose a device to send' : !ready ? (state.mode === 'files' ? 'Choose files to share' : 'Write a note to share') : `Send to ${peerName(state.selected)}`;
}

function renderPeers() {
  if (!state.peers.some(peer => peer.id === state.selected)) state.selected = null;
  $('#device-count').textContent = state.room ? `${state.peers.length} connected` : 'Join a room to connect';
  $('#devices').innerHTML = state.peers.length ? state.peers.map(peer => `<button class="device ${peer.id === state.selected ? 'selected' : ''}" data-peer="${peer.id}" aria-pressed="${peer.id === state.selected}"><span class="device-icon" aria-hidden="true">${peer.kind === 'desktop' ? '▱' : '▯'}</span><span><strong>${esc(peer.name)}</strong><small>${esc(peer.kind)} · ${peer.id.slice(0, 4)}</small></span><span class="device-check" aria-hidden="true">${peer.id === state.selected ? '✓' : '+'}</span></button>`).join('') : `<div class="empty-devices"><span aria-hidden="true">◎</span><p>${state.room ? 'Waiting for your other screen.' : 'A little quiet here.'}<br><span>${state.room ? 'Open this room’s invitation on another device.' : 'Your connected devices will appear here.'}</span></p></div>`;
  updateSend();
}

function renderFiles() {
  $('#selected-files').innerHTML = state.files.length ? `<div class="selection-heading"><span>${state.files.length} file${state.files.length === 1 ? '' : 's'} · ${formatBytes(state.files.reduce((sum, file) => sum + file.size, 0))}</span><button class="text-button" data-action="clear-files">Clear all</button></div>${state.files.map((file, i) => `<div class="selected-file"><span class="file-symbol" aria-hidden="true">▤</span><span><strong>${esc(cleanName(file.name))}</strong><small>${formatBytes(file.size)}</small></span><button class="icon-button" data-remove="${i}" aria-label="Remove ${esc(cleanName(file.name))}">×</button></div>`).join('')}` : '';
  $('#dropzone').classList.toggle('compact', state.files.length > 0);
  updateSend();
}

function addFiles(files) {
  if (state.current) return toast('Finish the current transfer before changing files.');
  const candidates = [...state.files, ...Array.from(files)].filter((file, index, all) => all.findIndex(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) === index);
  try { fileManifest(candidates); }
  catch (error) { return toast(error.message); }
  state.files = candidates;
  renderFiles();
}

function renderTransfer(current) {
  const previous = state.current;
  state.current = current;
  const panel = $('#transfer-panel');
  const focusedAction = panel.contains(document.activeElement) ? document.activeElement.closest('[data-action]')?.dataset.action : null;
  panel.hidden = !current;
  updateSend();
  if (!current) return;
  const names = { waiting: 'Waiting for the other side.', approval: 'Something good is coming your way.', connecting: 'Making a direct connection.', sending: 'On its way.', receiving: 'Coming in nicely.', complete: 'A successful little handoff.', failed: 'That didn’t quite land.', cancelled: 'Transfer cancelled.' };
  const label = current.manifest.kind === 'note' ? 'Text or link' : `${current.manifest.files.length} file${current.manifest.files.length === 1 ? '' : 's'} · ${formatBytes(current.manifest.total)}`;
  const percentage = Math.round(current.progress * 100);
  panel.innerHTML = `<div class="heading-row"><div><span class="section-label">${current.direction === 'incoming' ? 'INCOMING' : 'OUTGOING'} · ${esc(peerName(current.peer))}</span><h2>${names[current.phase]}</h2></div><span class="transfer-symbol" aria-hidden="true">${current.phase === 'complete' ? '✓' : '◎'}</span></div><p class="muted">${esc(label)}${current.phase === 'waiting' ? ' · The recipient must accept before anything is sent.' : ''}</p>${current.phase === 'approval' && current.manifest.kind === 'files' ? `<ul class="request-files">${current.manifest.files.map(file => `<li><span>${esc(file.name)}</span><span>${formatBytes(file.size)}</span></li>`).join('')}</ul>` : ''}${['sending', 'receiving', 'complete'].includes(current.phase) ? `<div class="progress-label"><span>${current.phase === 'complete' ? 'Delivery confirmed' : current.progress === 1 ? 'Waiting for delivery confirmation' : `${formatBytes(current.bytes)} transferred`}</span><span>${current.phase === 'complete' ? 100 : percentage}%</span></div><progress max="100" value="${current.phase === 'complete' ? 100 : percentage}" aria-label="Transfer progress"></progress>` : ''}${current.error ? `<p class="transfer-error" role="alert">${esc(current.error)}</p>` : ''}<div class="button-row">${current.phase === 'approval' ? '<button class="button primary" data-action="accept">Accept transfer</button><button class="button secondary" data-action="cancel">Decline</button>' : terminal(current.phase) ? '<button class="button secondary" data-action="dismiss">Done</button>' : '<button class="button secondary small" data-action="cancel">Cancel transfer</button>'}</div>`;
  if (focusedAction) (panel.querySelector(`[data-action="${focusedAction}"]`) ?? panel.querySelector('[data-action]'))?.focus({ preventScroll: true });
  if (current.phase === 'approval' && previous?.id !== current.id) toast(`${peerName(current.peer)} sent a transfer request. Review it below to accept or decline.`);
}

function renderReceived() {
  $('#received-panel').hidden = !state.received.length;
  $('#received-items').innerHTML = state.received.map((item, index) => item.url
    ? `<div class="received-file"><span class="file-symbol" aria-hidden="true">▤</span><div><strong>${esc(item.name)}</strong><small>${formatBytes(item.size)} · from ${esc(item.from)}</small></div><a class="button secondary small" href="${esc(item.url)}" download="${esc(item.name)}">Download</a></div>`
    : `<div class="received-note"><div class="heading-row"><span class="fine">A note from ${esc(item.from)}</span><button class="button secondary small" data-copy-note="${index}">Copy text</button></div><pre>${esc(item.text)}</pre></div>`).join('');
}

function clearReceived() {
  for (const item of state.received) if (item.url) URL.revokeObjectURL(item.url);
  state.received = [];
  renderReceived();
}

async function copy(text, success) {
  try { await navigator.clipboard.writeText(text); toast(success); }
  catch { toast('Clipboard access is unavailable. Select the text and copy it manually.'); }
}

async function join(token) {
  if (!supported) return;
  if (state.joining) return;
  state.joining = true;
  $('#create-room').disabled = true;
  $('#join-form button').disabled = true;
  try {
    await leave();
    const room = new DropRoom({ token, name: deviceName(), kind,
      onPeers: peers => { if (state.room === room) { state.peers = peers; renderPeers(); } },
      onSignal: (type, payload, from) => state.room === room ? state.transfer.receive(type, payload, from) : undefined,
      onStatus: value => { if (state.room === room) status(value); },
    });
    state.room = room;
    state.transfer = new DropTransfer({ signal: (type, payload, to) => room.send(type, payload, to), rtcConfig: window.NEXUS_DROP_RTC ?? {},
      onChange: current => { if (state.room === room) renderTransfer(current); },
      onReceived: content => {
        if (state.room !== room) return;
        const from = peerName(content.peer);
        for (const file of content.files ?? []) state.received.push({ name: file.name, size: file.size, url: URL.createObjectURL(file.blob), from });
        if (content.text !== undefined) state.received.push({ text: content.text, from, size: 0 });
        renderReceived();
        toast('Transfer received. Your files are ready to download.');
      },
    });
    const link = invitationUrl(token, base);
    history.replaceState(null, '', link);
    $('#room-link').value = link;
    $('#start-controls').hidden = true;
    $('#room-controls').hidden = false;
    $('#invitation-input').value = '';
    await room.start();
    renderPeers();
  } catch (error) { await leave(); toast(error.message || 'Could not open this sharing room. Try again.'); }
  finally { state.joining = false; $('#create-room').disabled = false; $('#join-form button').disabled = false; }
}

async function leave() {
  const room = state.room;
  state.transfer?.dismiss();
  state.room = null;
  state.transfer = null;
  state.current = null;
  state.peers = [];
  state.selected = null;
  $('#start-controls').hidden = false;
  $('#room-controls').hidden = true;
  $('#transfer-panel').hidden = true;
  status('');
  history.replaceState(null, '', base);
  renderPeers();
  await room?.close();
}

$('#device-name').value = deviceName();
if (location.pathname.startsWith('/public/')) $('#home-link').href = '../../index.html';
if (!supported) {
  $('#support-error').hidden = false;
  $('#support-error').textContent = 'This browser cannot start a secure direct transfer. Open this page over HTTPS in a current browser with WebRTC support.';
  $('#create-room').disabled = true;
  $('#join-form button').disabled = true;
}

$('#create-room').addEventListener('click', () => void join(createRoomToken()));
$('#join-form').addEventListener('submit', event => {
  event.preventDefault();
  try { void join(parseInvitation($('#invitation-input').value, base)); }
  catch (error) { toast(error.message); $('#invitation-input').focus(); }
});
$('#leave-room').addEventListener('click', () => void leave().catch(() => toast('Room closed.')));
$('#device-name').addEventListener('change', () => { $('#device-name').value = deviceName(); state.room?.rename(deviceName()).catch(error => toast(error.message)); });
$('#copy-invite').addEventListener('click', () => { $('#room-link').select(); void copy($('#room-link').value, 'Invitation copied. Open it on your other device.'); });
$('#share-invite').addEventListener('click', async () => {
  if (!navigator.share) return copy($('#room-link').value, 'Invitation copied.');
  try { await navigator.share({ title: 'Join my Nexus Drop room', url: $('#room-link').value }); }
  catch (error) { if (error.name !== 'AbortError') toast('Sharing is unavailable. Copy the invitation instead.'); }
});
$('#room-link').addEventListener('click', () => $('#room-link').select());
$('#devices').addEventListener('click', event => { const button = event.target.closest('[data-peer]'); if (button) { state.selected = button.dataset.peer; renderPeers(); } });
$('#file-input').addEventListener('change', event => { if (event.target.files.length) addFiles(event.target.files); event.target.value = ''; });
$('#dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#file-input').click(); } });
for (const eventName of ['dragenter', 'dragover']) $('#dropzone').addEventListener(eventName, event => { event.preventDefault(); $('#dropzone').classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) $('#dropzone').addEventListener(eventName, event => { event.preventDefault(); $('#dropzone').classList.remove('dragging'); if (eventName === 'drop') addFiles(event.dataTransfer.files); });
// Prevent an accidental drop outside the target from navigating away mid-transfer.
window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
window.addEventListener('drop', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
$('#selected-files').addEventListener('click', event => {
  if (state.current) return toast('Finish the current transfer before changing files.');
  const remove = event.target.closest('[data-remove]');
  if (remove) state.files.splice(Number(remove.dataset.remove), 1);
  if (event.target.closest('[data-action="clear-files"]')) state.files = [];
  renderFiles();
});
function mode(value) {
  state.mode = value;
  $('#files-content').hidden = value !== 'files'; $('#note-content').hidden = value !== 'note';
  $('#files-mode').setAttribute('aria-pressed', String(value === 'files')); $('#note-mode').setAttribute('aria-pressed', String(value === 'note'));
  updateSend();
}
$('#files-mode').addEventListener('click', () => mode('files'));
$('#note-mode').addEventListener('click', () => mode('note'));
$('#note-input').addEventListener('input', () => { $('#note-count').textContent = `${$('#note-input').value.length.toLocaleString()} / 8,000`; updateSend(); });
$('#send').addEventListener('click', async () => {
  if (!state.transfer || !state.selected || state.current) return;
  try { await state.transfer.request(state.selected, state.mode === 'files' ? { files: state.files } : { text: $('#note-input').value }); $('#transfer-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); }
  catch (error) { toast(error.message); }
});
$('#transfer-panel').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'accept') {
    if (state.received.length + (state.current?.manifest.files.length || 1) > 40 || state.received.reduce((sum, item) => sum + item.size, 0) + (state.current?.manifest.total ?? 0) > MAX_BYTES) return toast('Download and clear received items before accepting another transfer.');
    void state.transfer?.accept();
  }
  if (action === 'cancel') state.transfer?.cancel();
  if (action === 'dismiss') state.transfer?.dismiss();
});
$('#clear-received').addEventListener('click', clearReceived);
$('#received-items').addEventListener('click', event => { const button = event.target.closest('[data-copy-note]'); if (button) void copy(state.received[Number(button.dataset.copyNote)]?.text ?? '', 'Text copied.'); });
window.addEventListener('beforeunload', event => {
  if ((state.current && !terminal(state.current.phase)) || state.received.length) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => { void leave().catch(() => {}); clearReceived(); });

const initialHash = new URLSearchParams(location.hash.slice(1));
if (initialHash.has('room') && supported) {
  try { void join(parseInvitation(location.href, base)); }
  catch (error) { toast(error.message); history.replaceState(null, '', base); }
}
renderPeers();
