// Wump Community Chat & Watch Party Sidebar Controller (js/wump-app.js)
import { store, showToast } from './store.js';
import { launchUrlInStage } from './media-hub.js';
import { transcodeVideoAttachment } from './video-converter.js';

const CHANNELS = ['watch-party', 'general', 'beats-showcase', 'subvito-discuss'];

export function renderSidebarChat(container) {
  const { messages, activeChannel } = store.state;
  const filtered = messages.filter((m) => m.channel === activeChannel);

  container.innerHTML = `
    <div class="p-3 border-b border-slate-800 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
        <span class="text-xs font-bold text-white uppercase tracking-wider">#${activeChannel}</span>
      </div>
      <select id="sidebar-channel-select" class="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 outline-none">
        ${CHANNELS.map(
          (ch) => `<option value="${ch}" ${ch === activeChannel ? 'selected' : ''}>#${ch}</option>`
        ).join('')}
      </select>
    </div>

    <div id="sidebar-messages" class="flex-1 overflow-y-auto p-3 space-y-2.5">
      ${filtered
        .map(
          (m) => `
        <div class="bg-slate-900/75 border border-slate-800/80 rounded-xl p-2.5 space-y-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-indigo-300">${m.author}</span>
              ${
                m.verified
                  ? '<span class="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded font-mono">✓</span>'
                  : ''
              }
            </div>
            <span class="text-[10px] text-slate-500 font-mono">${m.time}</span>
          </div>
          <p class="text-xs text-slate-200 leading-relaxed break-words">${m.text}</p>
          ${
            m.mediaUrl
              ? `
            <div class="pt-1.5 flex items-center justify-between gap-2 border-t border-slate-800/70">
              <span class="text-[10px] font-mono text-slate-400 truncate">${m.mediaUrl}</span>
              <button data-launch-url="${m.mediaUrl}" class="btn-sidebar-launch shrink-0 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold">
                Launch Stage
              </button>
            </div>
          `
              : ''
          }
        </div>
      `
        )
        .join('')}
    </div>

    <form id="sidebar-chat-form" class="p-3 border-t border-slate-800 bg-slate-950/60 space-y-2">
      <input
        id="sidebar-msg-input"
        type="text"
        placeholder="Message #${activeChannel} or paste SubVito/YouTube URL..."
        class="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
      />
      <div class="flex items-center justify-between gap-2">
        <label class="cursor-pointer px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1">
          <span>📎 Attach (.mov/.mkv auto-MP4)</span>
          <input id="sidebar-file-attach" type="file" accept=".mov,.mkv,.mp4,.mp3,.wav" class="hidden" />
        </label>
        <button type="submit" class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">
          Send
        </button>
      </div>
    </form>
  `;

  container.querySelector('#sidebar-channel-select')?.addEventListener('change', (e) => {
    store.state.activeChannel = e.target.value;
    store.notify();
  });

  container.querySelectorAll('.btn-sidebar-launch').forEach((btn) => {
    btn.addEventListener('click', () => {
      launchUrlInStage(btn.dataset.launchUrl);
    });
  });

  container.querySelector('#sidebar-file-attach')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    transcodeVideoAttachment(file, (convertedMp4Name) => {
      store.addMessage(`Uploaded attachment (auto-converted to MP4): **${convertedMp4Name}**`);
    });
  });

  container.querySelector('#sidebar-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = container.querySelector('#sidebar-msg-input');
    const val = (input.value || '').trim();
    if (!val) return;
    const urlMatch = val.match(/https?:\/\/[^\s]+/);
    store.addMessage(val, urlMatch ? urlMatch[0] : null);
    input.value = '';
  });
}

export function renderFullWumpChat(container) {
  renderSidebarChat(container);
}
