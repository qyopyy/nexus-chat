// [untitled] Music Studio Controller (js/untitled-app.js)
import { store, showToast } from './store.js';
import { audioEngine } from './audio-engine.js';

export function renderUntitledStudio(container) {
  const { tracks, activeTrackIndex, activePreset } = store.state;
  const currentTrack = tracks[activeTrackIndex] || tracks[0];

  container.innerHTML = `
    <div class="max-w-5xl mx-auto space-y-5">
      <div class="bg-[#0f1320] border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">DSP STUDIO</span>
            <h2 class="text-base font-bold text-white">[untitled] Music Studio — 3.5 - mxteen & MA Beats</h2>
          </div>
          <p class="text-xs text-slate-400 mt-1">60FPS Spectrum Visualizer • Real-Time DSP Presets • Instant Custom Share Links</p>
        </div>

        <label class="cursor-pointer px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition">
          + Upload Stem / Beat (.wav / .mp3)
          <input id="studio-upload-input" type="file" accept="audio/*" class="hidden" />
        </label>
      </div>

      <!-- Active Player & Visualizer -->
      <div class="bg-[#0b0e17] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-white">${currentTrack.title}</h3>
            <p class="text-xs text-slate-400">${currentTrack.artist} • ${currentTrack.bpm} BPM • Key: ${currentTrack.key}</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-studio-play" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
              ${audioEngine.isPlaying ? '⏸ Pause Master' : '▶ Play Master'}
            </button>
            <button id="btn-copy-track-link" data-link="https://${currentTrack.shareSlug}" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono">
              🔗 ${currentTrack.shareSlug}
            </button>
          </div>
        </div>

        <canvas id="studio-visualizer-canvas" width="800" height="120" class="w-full h-28 bg-slate-950 rounded-xl border border-slate-800/80"></canvas>

        <div class="flex flex-wrap items-center gap-2 pt-1">
          <span class="text-xs text-slate-400 mr-1">DSP FX Preset:</span>
          ${['clean', 'nightcore', 'slowed-reverb', 'bass-boost']
            .map(
              (preset) => `
            <button data-preset="${preset}" class="btn-dsp-preset px-3 py-1 rounded-lg text-xs font-semibold uppercase ${
                activePreset === preset
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }">
              ${preset}
            </button>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Track Vault List -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${tracks
          .map(
            (t, idx) => `
          <div data-track-idx="${idx}" class="card-select-track cursor-pointer bg-[#0f1320] border ${
              idx === activeTrackIndex ? 'border-indigo-500' : 'border-slate-800'
            } rounded-xl p-4 space-y-2 hover:border-slate-700 transition">
            <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>${t.bpm} BPM • ${t.key}</span>
              <span>${t.plays} plays</span>
            </div>
            <h4 class="text-xs font-bold text-white">${t.title}</h4>
            <p class="text-[11px] text-slate-400">${t.artist}</p>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;

  const canvas = container.querySelector('#studio-visualizer-canvas');
  audioEngine.startSimulatedVisualizer(canvas);

  container.querySelector('#btn-studio-play')?.addEventListener('click', (e) => {
    const playing = audioEngine.togglePlayback();
    e.currentTarget.textContent = playing ? '⏸ Pause Master' : '▶ Play Master';
  });

  container.querySelector('#btn-copy-track-link')?.addEventListener('click', (e) => {
    const link = e.currentTarget.dataset.link;
    navigator.clipboard?.writeText(link);
    store.addMessage(`Shared [untitled] studio master: **${currentTrack.title}**`, link, 'beats-showcase');
    showToast(`Copied & shared ${link}`);
  });

  container.querySelectorAll('.btn-dsp-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.state.activePreset = btn.dataset.preset;
      store.notify();
      showToast(`DSP Preset switched to ${btn.dataset.preset.toUpperCase()}`);
    });
  });

  container.querySelectorAll('.card-select-track').forEach((card) => {
    card.addEventListener('click', () => {
      store.state.activeTrackIndex = Number(card.dataset.trackIdx);
      store.notify();
    });
  });

  container.querySelector('#studio-upload-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
    store.addTrack({
      id: 'tr-' + Date.now(),
      title: cleanTitle,
      artist: '3.5 - mxteen',
      bpm: 145,
      key: 'Gm',
      duration: '2:34',
      plays: '1',
      shareSlug: `nexus.chat/u/mxteen/${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    });
    showToast(`Uploaded "${cleanTitle}" to [untitled] Studio!`);
  });
}
