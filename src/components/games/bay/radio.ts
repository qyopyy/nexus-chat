// Tiny synthwave radio — every station is generated live with Web Audio (no audio files).

export type Station = { name: string; bpm: number; root: number; prog: number[][]; lead: "saw" | "square"; vibe: string };

// chords as semitone offsets from the key root (minor-key synthwave progressions)
export const STATIONS: Station[] = [
  { name: "Bay FM 88.4", bpm: 104, root: 45, prog: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]], lead: "saw", vibe: "sunset synth-pop" },
  { name: "Neon Wave 101", bpm: 118, root: 40, prog: [[0, 3, 7], [3, 7, 10], [-2, 2, 5], [-4, 0, 3]], lead: "square", vibe: "outrun drive" },
  { name: "Night Drive 96", bpm: 88, root: 43, prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -2, 2]], lead: "saw", vibe: "midnight chill" },
];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Radio {
  ctx: AudioContext | null = null;
  out: GainNode | null = null;
  station = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private next = 0;
  private noise: AudioBuffer | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; g: GainNode; f: BiquadFilterNode } | null = null;
  volume = 0.55;

  start(station = this.station) {
    this.station = station;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startEngine();
    }
    void this.ctx.resume();
    if (this.timer) return;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  get playing() {
    return !!this.timer;
  }
  setStation(i: number) {
    this.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    this.step = 0;
  }
  dispose() {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
    this.engine = null;
  }

  /** engine hum follows the car's speed (0..1) */
  setEngine(rpm: number, gas: number) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 38 + rpm * 120;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(f * 1.505, t, 0.05);
    this.engine.f.frequency.setTargetAtTime(300 + rpm * 1400 + gas * 600, t, 0.05);
    this.engine.g.gain.setTargetAtTime(0.03 + gas * 0.05 + rpm * 0.03, t, 0.08);
  }
  private startEngine() {
    const c = this.ctx!;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    const osc2 = c.createOscillator();
    osc2.type = "square";
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 4;
    const g = c.createGain();
    g.gain.value = 0;
    osc.connect(f);
    osc2.connect(f);
    f.connect(g).connect(c.destination);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, g, f };
  }

  sfx(kind: "pickup" | "crash" | "checkpoint" | "splash" | "land") {
    const c = this.ctx;
    if (!c || !this.out) return;
    const t = c.currentTime;
    if (kind === "pickup" || kind === "checkpoint") {
      const notes = kind === "pickup" ? [76, 81, 88] : [72, 79, 84, 91];
      notes.forEach((n, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "square";
        o.frequency.value = hz(n);
        g.gain.setValueAtTime(0.0001, t + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.07 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.2);
        o.connect(g).connect(c.destination);
        o.start(t + i * 0.07);
        o.stop(t + i * 0.07 + 0.25);
      });
      return;
    }
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = kind === "splash" ? "bandpass" : "lowpass";
    f.frequency.value = kind === "splash" ? 900 : kind === "land" ? 220 : 500;
    const g = c.createGain();
    g.gain.setValueAtTime(kind === "land" ? 0.35 : 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kind === "splash" ? 0.9 : 0.35));
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + 1);
  }

  private schedule() {
    const c = this.ctx;
    if (!c || !this.out) return;
    const st = STATIONS[this.station];
    const dur = 60 / st.bpm / 4; // 16th notes
    while (this.next < c.currentTime + 0.15) {
      this.play(st, this.step, this.next, dur);
      this.step = (this.step + 1) % 128;
      this.next += dur;
    }
  }

  private play(st: Station, s: number, t: number, d: number) {
    const bar = Math.floor(s / 16) % 4;
    const chord = st.prog[bar].map((x) => x + st.root);
    const i16 = s % 16;
    // drums
    if (i16 % 4 === 0) this.kick(t);
    if (i16 === 4 || i16 === 12) this.snare(t);
    if (i16 % 2 === 1) this.hat(t, 0.05);
    // bass: octave pumping 8ths
    if (i16 % 2 === 0) this.tone(hz(chord[0] - 12 + (i16 % 4 === 2 ? 12 : 0)), t, d * 1.8, "sawtooth", 0.11, 900);
    // arp
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    this.tone(hz(chord[arp[i16 % 8]] + 24), t, d * 0.9, st.lead === "saw" ? "sawtooth" : "square", 0.035, 2800);
    // pad on bar start
    if (i16 === 0) for (const n of chord) this.tone(hz(n + 12), t, d * 16, "triangle", 0.04, 1600, 0.4);
  }
  private tone(f: number, t: number, len: number, type: OscillatorType, vol: number, cutoff: number, attack = 0.005) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const fl = c.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(fl).connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + 0.32);
  }
  private snare(t: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f).connect(g).connect(this.out!);
    s.start(t);
    s.stop(t + 0.3);
  }
  private hat(t: number, vol: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(this.out!);
    s.start(t);
    s.stop(t + 0.06);
  }
}
