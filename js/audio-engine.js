// Web Audio API DSP & 60FPS Visualizer Engine (js/audio-engine.js)

export class NexusAudioEngine {
  constructor() {
    this.isPlaying = false;
    this.animFrame = null;
  }

  startSimulatedVisualizer(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let phase = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bars = 48;
      const barWidth = w / bars - 3;

      for (let i = 0; i < bars; i++) {
        const wave = Math.sin(phase + i * 0.25) * 0.5 + 0.5;
        const barHeight = this.isPlaying ? Math.max(8, wave * (h * 0.85)) : 6;
        const x = i * (barWidth + 3);
        const y = h - barHeight;

        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, '#818cf8');
        grad.addColorStop(1, '#4f46e5');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      phase += 0.12;
      this.animFrame = requestAnimationFrame(draw);
    };

    cancelAnimationFrame(this.animFrame);
    draw();
  }

  togglePlayback() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }
}

export const audioEngine = new NexusAudioEngine();
