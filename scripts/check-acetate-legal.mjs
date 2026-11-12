import assert from "node:assert/strict";
import { encodeWavPcm } from "../src/lib/acetateWav.ts";
import {
  assertMetadataOnly,
  parseImportLink,
  soundCloudPage,
  youtubeIsoDuration,
} from "../src/lib/acetateImportParse.ts";

const wav = encodeWavPcm([new Float32Array([0, 0.5, -0.5]), new Float32Array([0, -0.25, 0.25])], 44100, 16);
assert.equal(Buffer.from(wav.subarray(0, 4)).toString(), "RIFF");
assert.equal(Buffer.from(wav.subarray(8, 12)).toString(), "WAVE");
assert.equal(wav[34], 16);
assert.equal(new DataView(wav.buffer, wav.byteOffset).getUint32(24, true), 44100);

const wide = encodeWavPcm([new Float32Array([1, -1])], 48000, 24);
assert.equal(wide[34], 24);
assert.equal(wide.length, 44 + 2 * 3);

const spotify = parseImportLink("https://open.spotify.com/intl-en/track/6rqhFgbbKwnb9MLmUQDhG6");
assert.equal(spotify?.source, "spotify");
assert.equal(spotify && "id" in spotify ? spotify.id : "", "6rqhFgbbKwnb9MLmUQDhG6");

const video = parseImportLink("https://youtu.be/dQw4w9WgXcQ");
assert.equal(video?.source, "youtube");
assert.equal(video && "kind" in video ? video.kind : "", "video");

const playlist = parseImportLink("https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
assert.equal(playlist && "kind" in playlist ? playlist.kind : "", "playlist");

const cloud = parseImportLink("https://soundcloud.com/artist/track-name");
assert.equal(cloud?.source, "soundcloud");
assert.equal(soundCloudPage("https://soundcloud.com/artist/track/stream"), null);
assert.equal(parseImportLink("https://api.soundcloud.com/tracks/1/stream"), null);
assert.equal(youtubeIsoDuration("PT1H2M3S"), ((1 * 60 + 2) * 60 + 3) * 1000);

assert.throws(() => assertMetadataOnly({ items: [{ preview_url: "https://example.com/a.mp3" }] }));
assert.throws(() => assertMetadataOnly({ stream_url: "https://api.soundcloud.com/tracks/1/stream" }));
assertMetadataOnly({ title: "Keep", sourceUrl: "https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6" });

console.log("acetate legal checks ok");
