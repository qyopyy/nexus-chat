// Nexus Clear — RNNoise AI noise suppression as an AudioWorklet (48 kHz, 480-sample frames).
// rnnoise.wasm comes from jitsi/rnnoise-wasm (Apache-2.0) / xiph rnnoise (BSD-3-Clause).
const FRAME = 480;

class NexusClear extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ok = false;
    this.on = true;
    this.vad = 0;
    this.vadTick = 0;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.enabled === "boolean") this.on = e.data.enabled;
    };
    try {
      const bytes = options.processorOptions.wasm;
      const mod = new WebAssembly.Module(bytes);
      let mem = null;
      const imports = {
        a: {
          // emscripten_resize_heap
          a: (size) => {
            const need = (size >>> 0) - mem.buffer.byteLength;
            try {
              if (need > 0) mem.grow(Math.ceil(need / 65536));
              return 1;
            } catch {
              return 0;
            }
          },
          // emscripten_memcpy_big
          b: (dest, src, num) => {
            new Uint8Array(mem.buffer).copyWithin(dest, src, src + num);
          },
        },
      };
      const inst = new WebAssembly.Instance(mod, imports);
      const x = inst.exports;
      mem = x.c;
      x.d(); // ctors
      this.x = x;
      this.mem = () => x.c.buffer;
      this.state = x.f(0); // rnnoise_create(NULL)  (exports: d ctors, e init, f create, g malloc, h destroy, i free, j process_frame)
      this.inPtr = x.g(FRAME * 4);
      this.outPtr = x.g(FRAME * 4);
      this.inBuf = new Float32Array(FRAME * 4);
      this.inLen = 0;
      this.outBuf = new Float32Array(FRAME * 4);
      this.outLen = FRAME; // 10 ms of priming silence keeps the FIFO from underflowing
      this.ok = sampleRate === 48000;
      this.port.postMessage({ ready: this.ok, sampleRate });
    } catch (err) {
      this.port.postMessage({ ready: false, error: String(err) });
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;
    const src = input && input[0];
    if (!src) {
      for (const ch of output) ch.fill(0);
      return true;
    }
    if (!this.ok || !this.on) {
      for (const ch of output) ch.set(src);
      return true;
    }
    const n = src.length;
    this.inBuf.set(src, this.inLen);
    this.inLen += n;
    while (this.inLen >= FRAME) {
      const heap = new Float32Array(this.mem());
      const ip = this.inPtr >> 2;
      for (let i = 0; i < FRAME; i++) heap[ip + i] = this.inBuf[i] * 32768;
      const v = this.x.j(this.state, this.outPtr, this.inPtr);
      const h2 = new Float32Array(this.mem());
      const op = this.outPtr >> 2;
      for (let i = 0; i < FRAME; i++) this.outBuf[this.outLen + i] = h2[op + i] / 32768;
      this.outLen += FRAME;
      this.inBuf.copyWithin(0, FRAME, this.inLen);
      this.inLen -= FRAME;
      this.vad = Math.max(v, this.vad * 0.6);
      if (++this.vadTick >= 3) {
        this.vadTick = 0;
        this.port.postMessage({ vad: this.vad });
      }
    }
    const take = Math.min(n, this.outLen);
    for (const ch of output) {
      ch.set(this.outBuf.subarray(0, take));
      if (take < n) ch.fill(0, take);
    }
    this.outBuf.copyWithin(0, take, this.outLen);
    this.outLen -= take;
    return true;
  }
}

registerProcessor("nexus-clear", NexusClear);
