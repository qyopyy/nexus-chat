// Central Reactive State Store for Nexus Workspace (qyopyy/nexus-chat)

const initialSubvitoEpisodes = [
  {
    id: 'sp-29x01',
    code: '29x01',
    season: 29,
    episode: 1,
    title: 'South American Biker Gangs',
    lang: 'Magyar Felirat / HD',
    platform: 'subvito',
    url: 'https://subvito.eu/29-evad/29x01-south-american-biker-gangs/',
    badge: 'NEW S29'
  },
  {
    id: 'sp-29x02',
    code: '29x02',
    season: 29,
    episode: 2,
    title: 'Billionaire Weenietown',
    lang: 'Magyar Felirat / HD',
    platform: 'subvito',
    url: 'https://subvito.eu/29-evad/29x02-billionaire-weenietown/',
    badge: 'S29'
  },
  {
    id: 'sp-29x03',
    code: '29x03',
    season: 29,
    episode: 3,
    title: 'You Like That On Your Face',
    lang: 'Magyar Felirat / HD',
    platform: 'subvito',
    url: 'https://subvito.eu/29-evad/29x03-you-like-that-on-your-face/',
    badge: 'S29'
  },
  {
    id: 'sp-29-index',
    code: 'S29 HUB',
    season: 29,
    episode: 0,
    title: 'SubVito 29. Évad — Teljes Epizódlista',
    lang: 'Magyar Felirat & Szinkron',
    platform: 'subvito',
    url: 'https://subvito.eu/29-evad/',
    badge: 'ARCHIVE'
  }
];

export const store = {
  state: {
    activeModule: 'media-hub',
    activeChannel: 'watch-party',
    currentUser: {
      id: 'u-mxteen',
      username: '3.5 - mxteen',
      handle: '@mxteen',
      verified: true,
      role: 'Label Founder & Producer'
    },
    mediaStage: {
      title: 'South Park 29x01 — South American Biker Gangs',
      rawUrl: 'https://subvito.eu/29-evad/29x01-south-american-biker-gangs/',
      embedUrl: 'https://subvito.eu/29-evad/29x01-south-american-biker-gangs/',
      platform: 'subvito',
      tallMode: true,
      sandboxEnabled: false
    },
    subvitoLibrary: [...initialSubvitoEpisodes],
    messages: [
      {
        id: 'm-1',
        channel: 'watch-party',
        author: '3.5 - mxteen',
        verified: true,
        time: '21:14',
        text: 'Loaded South Park 29x01 (South American Biker Gangs) from SubVito into the Nexus Theater Stage!',
        mediaUrl: 'https://subvito.eu/29-evad/29x01-south-american-biker-gangs/'
      },
      {
        id: 'm-2',
        channel: 'watch-party',
        author: 'MA Beats',
        verified: true,
        time: '21:16',
        text: 'You can also paste Videa, Indavideo, YouTube, Spotify, or SoundCloud links directly in chat or the top bar to sync the embed player.',
        mediaUrl: null
      }
    ],
    tracks: [
      {
        id: 'tr-1',
        title: 'Midnight in Budapest (Melodic Guitar Type Beat)',
        artist: '3.5 - mxteen × MA Beats',
        bpm: 144,
        key: 'F#m',
        duration: '2:48',
        plays: '614.2K',
        shareSlug: 'nexus.chat/u/mxteen/midnight-budapest'
      },
      {
        id: 'tr-2',
        title: 'Ksubi & Chrome (Hardtekk / Rage Edit)',
        artist: '3.5 - mxteen',
        bpm: 160,
        key: 'Cm',
        duration: '2:19',
        plays: '189.4K',
        shareSlug: 'nexus.chat/u/mxteen/ksubi-chrome'
      },
      {
        id: 'tr-3',
        title: 'Shadow Cloud Freestyle (Emo Rap / R&B)',
        artist: 'MA Beats',
        bpm: 132,
        key: 'Am',
        duration: '3:05',
        plays: '94.8K',
        shareSlug: 'nexus.chat/u/mabeats/shadow-freestyle'
      }
    ],
    activeTrackIndex: 0,
    activePreset: 'clean',
    conversionJobs: [
      {
        id: 'conv-1',
        sourceName: 'studio_session_capture.mov',
        outputName: 'studio_session_capture.mp4',
        codec: 'H.264 / AAC (faststart)',
        status: 'Ready (100%)',
        size: '18.4 MB'
      }
    ]
  },

  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach((fn) => fn(this.state));
  },

  setActiveModule(moduleName) {
    this.state.activeModule = moduleName;
    this.notify();
  },

  updateMediaStage(payload) {
    this.state.mediaStage = { ...this.state.mediaStage, ...payload };
    this.notify();
  },

  addSubvitoEpisode(ep) {
    this.state.subvitoLibrary.unshift(ep);
    this.notify();
  },

  addMessage(text, mediaUrl = null, channel = null) {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    this.state.messages.push({
      id: 'm-' + Date.now(),
      channel: channel || this.state.activeChannel,
      author: this.state.currentUser.username,
      verified: this.state.currentUser.verified,
      time: timeStr,
      text,
      mediaUrl
    });
    this.notify();
  },

  addTrack(track) {
    this.state.tracks.unshift(track);
    this.state.activeTrackIndex = 0;
    this.notify();
  },

  addConversionJob(job) {
    this.state.conversionJobs.unshift(job);
    this.notify();
  }
};

export function showToast(message) {
  const container = document.getElementById('nexus-toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'bg-slate-900/95 border border-indigo-500/40 text-slate-100 px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2 pointer-events-auto transition-all';
  el.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-400"></span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}
