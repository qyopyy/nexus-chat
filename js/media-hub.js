// SubVito & Multi-Platform Embed Hub Controller (js/media-hub.js)
import { store, showToast } from './store.js';

export function parseSmartEmbedUrl(rawInput) {
  const url = (rawInput || '').trim();
  if (!url) return null;

  if (url.includes('subvito.eu')) {
    return {
      platform: 'subvito',
      rawUrl: url,
      embedUrl: url,
      title: url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ').toUpperCase() || 'SubVito Episode'
    };
  }

  if (url.includes('videa.hu')) {
    let embedUrl = url;
    if (!url.includes('/player?v=') && url.includes('/videok/')) {
      const token = url.split('-').pop();
      if (token) embedUrl = `https://videa.hu/player?v=${token}`;
    }
    return {
      platform: 'videa',
      rawUrl: url,
      embedUrl,
      title: 'Videa.hu Embedded Stream'
    };
  }

  if (url.includes('indavideo.hu')) {
    return {
      platform: 'indavideo',
      rawUrl: url,
      embedUrl: url.replace('/video/', '/player/video/'),
      title: 'Indavideo.hu Embedded Stream'
    };
  }

  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
    let videoId = '';
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split(/[?&]/)[0];
    } else {
      const urlObj = new URL(url);
      videoId = urlObj.searchParams.get('v');
    }
    if (videoId) {
      return {
        platform: 'youtube',
        rawUrl: url,
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
        title: `YouTube Video (${videoId})`
      };
    }
  }

  if (url.includes('open.spotify.com/')) {
    const embedUrl = url.includes('/embed/')
      ? url
      : url.replace('open.spotify.com/', 'open.spotify.com/embed/');
    return {
      platform: 'spotify',
      rawUrl: url,
      embedUrl,
      title: 'Spotify Embedded Player'
    };
  }

  if (url.includes('soundcloud.com/')) {
    const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%236366f1&auto_play=false&show_artwork=true`;
    return {
      platform: 'soundcloud',
      rawUrl: url,
      embedUrl,
      title: 'SoundCloud Embedded Stream'
    };
  }

  return {
    platform: 'custom',
    rawUrl: url,
    embedUrl: url,
    title: 'External Embedded Stream'
  };
}

export function launchUrlInStage(rawUrl, customTitle = null) {
  const parsed = parseSmartEmbedUrl(rawUrl);
  if (!parsed) return;
  store.updateMediaStage({
    title: customTitle || parsed.title,
    rawUrl: parsed.rawUrl,
    embedUrl: parsed.embedUrl,
    platform: parsed.platform
  });
  if (store.state.activeModule !== 'media-hub') {
    store.setActiveModule('media-hub');
  }
  showToast(`Loaded into Stage: ${customTitle || parsed.title}`);
}

export function renderMediaHub(container) {
  const { mediaStage, subvitoLibrary } = store.state;

  container.innerHTML = `
    <div class="max-w-6xl mx-auto space-y-5">
      <div class="bg-[#0f1320] border border-slate-800/90 rounded-2xl p-4 shadow-xl space-y-3">
        <div class="flex flex-col md:flex-row gap-2.5">
          <div class="flex-1 relative">
            <input
              id="universal-embed-input"
              type="text"
              value="${mediaStage.rawUrl}"
              placeholder="Paste SubVito, Videa.hu, Indavideo, YouTube, Spotify, or SoundCloud URL..."
              class="w-full bg-slate-950/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 outline-none font-mono"
            />
          </div>
          <button
            id="btn-load-embed"
            class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shrink-0"
          >
            Load in Stage
          </button>
          <button
            id="btn-share-stage-chat"
            class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition shrink-0"
          >
            Share to #watch-party
          </button>
        </div>

        <div class="pt-2 border-t border-slate-800/70 flex flex-wrap items-center gap-2 text-xs">
          <span class="text-slate-400 font-medium">SubVito Route Builder:</span>
          <input id="subvito-season" type="number" value="29" min="1" max="30" class="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white" title="Season (Évad)" />
          <input id="subvito-ep-slug" type="text" placeholder="e.g. 29x01-south-american-biker-gangs" class="flex-1 min-w-[220px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs font-mono text-white" />
          <button id="btn-build-subvito" class="px-3 py-1 rounded-lg bg-violet-600/25 hover:bg-violet-600/40 text-violet-200 border border-violet-500/30 font-semibold">
            + Add & Launch SubVito Episode
          </button>
        </div>
      </div>

      <div class="bg-[#0b0e17] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[10px] uppercase">
              ${mediaStage.platform}
            </span>
            <h2 class="text-sm font-bold text-white truncate max-w-md">${mediaStage.title}</h2>
          </div>

          <div class="flex items-center gap-2">
            <button id="btn-toggle-height" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200">
              ${mediaStage.tallMode ? 'Tall Mode (700px)' : '16:9 Widescreen'}
            </button>
            <button id="btn-toggle-sandbox" class="px-2.5 py-1 rounded-lg ${mediaStage.sandboxEnabled ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'} text-[11px] font-medium">
              ${mediaStage.sandboxEnabled ? 'Popup Guard: ON' : 'Popup Guard: OFF'}
            </button>
            <a href="${mediaStage.rawUrl}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium">
              Open Direct ↗
            </a>
          </div>
        </div>

        <div class="bg-black w-full">
          <iframe
            src="${mediaStage.embedUrl}"
            class="w-full border-0 ${mediaStage.tallMode ? 'theater-iframe-tall' : 'theater-iframe-16-9'}"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowfullscreen
            ${mediaStage.sandboxEnabled ? 'sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"' : ''}
          ></iframe>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">
            SubVito.eu — South Park 29. Évad (Magyar Felirat & Szinkron) Quick Launch
          </h3>
          <span class="text-[11px] text-slate-500 font-mono">${subvitoLibrary.length} episodes indexed</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          ${subvitoLibrary
            .map(
              (ep) => `
            <div class="bg-[#0f1320] border ${
              mediaStage.rawUrl === ep.url ? 'border-indigo-500 ring-1 ring-indigo-500/40' : 'border-slate-800/90'
            } rounded-xl p-3.5 flex flex-col justify-between gap-3 hover:border-slate-700 transition">
              <div>
                <div class="flex items-center justify-between gap-2 mb-1.5">
                  <span class="text-xs font-mono font-bold text-indigo-400">${ep.code}</span>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">${ep.badge}</span>
                </div>
                <h4 class="font-bold text-xs text-white leading-snug">${ep.title}</h4>
                <p class="text-[11px] text-slate-400 mt-1">${ep.lang}</p>
              </div>

              <div class="flex items-center gap-1.5 pt-2 border-t border-slate-800/70">
                <button
                  data-ep-url="${ep.url}"
                  data-ep-title="South Park ${ep.code} — ${ep.title}"
                  class="btn-launch-ep flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition"
                >
                  Watch in Stage
                </button>
                <button
                  data-share-url="${ep.url}"
                  data-share-title="South Park ${ep.code} — ${ep.title}"
                  class="btn-share-ep px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
                  title="Send to #watch-party"
                >
                  💬
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  const inputEl = container.querySelector('#universal-embed-input');
  container.querySelector('#btn-load-embed')?.addEventListener('click', () => {
    launchUrlInStage(inputEl.value);
  });

  container.querySelector('#btn-share-stage-chat')?.addEventListener('click', () => {
    const { title, rawUrl } = store.state.mediaStage;
    store.addMessage(`Watching **${title}** on Nexus Stage:`, rawUrl, 'watch-party');
    showToast('Shared current stream to #watch-party!');
  });

  container.querySelector('#btn-toggle-height')?.addEventListener('click', () => {
    store.updateMediaStage({ tallMode: !store.state.mediaStage.tallMode });
  });

  container.querySelector('#btn-toggle-sandbox')?.addEventListener('click', () => {
    store.updateMediaStage({ sandboxEnabled: !store.state.mediaStage.sandboxEnabled });
  });

  container.querySelector('#btn-build-subvito')?.addEventListener('click', () => {
    const season = container.querySelector('#subvito-season').value || '29';
    const slug = (container.querySelector('#subvito-ep-slug').value || '').trim().replace(/^\/|\/$/g, '');
    const builtUrl = slug
      ? `https://subvito.eu/${season}-evad/${slug}/`
      : `https://subvito.eu/${season}-evad/`;
    const code = slug ? slug.split('-')[0].toUpperCase() : `S${season}`;
    const title = slug ? slug.replace(/-/g, ' ').toUpperCase() : `SubVito ${season}. Évad`;

    store.addSubvitoEpisode({
      id: 'sp-' + Date.now(),
      code,
      season: Number(season),
      episode: 1,
      title,
      lang: 'Magyar Felirat / HD',
      platform: 'subvito',
      url: builtUrl,
      badge: 'CUSTOM'
    });
    launchUrlInStage(builtUrl, `South Park — ${title}`);
  });

  container.querySelectorAll('.btn-launch-ep').forEach((btn) => {
    btn.addEventListener('click', () => {
      launchUrlInStage(btn.dataset.epUrl, btn.dataset.epTitle);
    });
  });

  container.querySelectorAll('.btn-share-ep').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.addMessage(`Check out **${btn.dataset.shareTitle}** on SubVito:`, btn.dataset.shareUrl, 'watch-party');
      showToast('Posted episode link to #watch-party');
    });
  });
}
