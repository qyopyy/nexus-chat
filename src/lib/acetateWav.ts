/** PCM WAV encoder. No browser APIs, so the header can be checked in Node. */

export function encodeWavPcm(channels: Float32Array[], sampleRate: number, bits: 16 | 24) {
  const count = channels.length;
  if (!count || !channels[0]) throw new Error("Nothing to encode");
  const frames = channels[0].length;
  const bytesPer = bits / 8;
  const block = count * bytesPer;
  const dataSize = frames * block;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * block, true);
  view.setUint16(32, block, true);
  view.setUint16(34, bits, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < count; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
      if (bits === 16) {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      } else {
        const value = Math.max(-8388608, Math.min(8388607, Math.round(sample * 8388607)));
        view.setUint8(offset, value & 0xff);
        view.setUint8(offset + 1, (value >> 8) & 0xff);
        view.setUint8(offset + 2, (value >> 16) & 0xff);
        offset += 3;
      }
    }
  }
  return new Uint8Array(buffer);
}
