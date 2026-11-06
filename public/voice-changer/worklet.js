/**
 * Nexus Voice FX — delay-line pitch shifter (AudioWorklet).
 * ratio > 1 = higher pitch, < 1 = lower. Wet mix blends dry/wet.
 */
class NexusVoiceFx extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = (opts && opts.processorOptions) || {};
    this.ratio = typeof o.ratio === "number" ? o.ratio : 1;
    this.wet = typeof o.wet === "number" ? o.wet : 1;
    this.robot = !!o.robot;
    this.bufSize = 1 << 14;
    this.buf = new Float32Array(this.bufSize);
    this.w = 0;
    this.r = 0;
    this.phase = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.ratio === "number") this.ratio = Math.max(0.35, Math.min(2.4, d.ratio));
      if (typeof d.wet === "number") this.wet = Math.max(0, Math.min(1, d.wet));
      if (typeof d.robot === "boolean") this.robot = d.robot;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!input || !output) return true;
    const n = input.length;
    const mask = this.bufSize - 1;
    const wet = this.wet;
    const dry = 1 - wet;
    const ratio = this.ratio;
    for (let i = 0; i < n; i++) {
      const x = input[i];
      this.buf[this.w] = x;
      this.w = (this.w + 1) & mask;
      // two read heads for crossfade (granular-ish)
      const r1 = this.r;
      const r2 = (r1 + (this.bufSize >> 1)) & mask;
      const y1 = this.buf[r1 | 0];
      const y2 = this.buf[r2 | 0];
      const fade = (r1 - Math.floor(r1));
      let y = y1 * (1 - fade) + y2 * fade;
      if (this.robot) {
        this.phase += 0.18;
        y *= 0.55 + 0.45 * Math.sin(this.phase);
      }
      output[i] = dry * x + wet * y;
      this.r = (this.r + ratio) % this.bufSize;
    }
    return true;
  }
}

registerProcessor("nexus-voice-fx", NexusVoiceFx);
