import test from "node:test";
import assert from "node:assert/strict";
import { soundHours, pickFromSpotify, isActive, timeLeftLabel, embedUrl, cleanQuery, cleanPeopleQuery, SOUND_HOURS, SOUND_HOURS_LONG } from "./snapSounds.ts";

test("24 hours for everyone, 48 for vip, moderators, admins and owners", () => {
  assert.equal(SOUND_HOURS, 24);
  assert.equal(SOUND_HOURS_LONG, 48);
  for (const r of ["member", null, undefined, "", "VIP", "superadmin"]) assert.equal(soundHours(r as string), 24, String(r));
  for (const r of ["vip", "moderator", "admin", "owner"]) assert.equal(soundHours(r), 48, r);
});

const item = { id: "11dFghVXANMlKmJXsNCbNl", name: "Cut To The Feeling", url: "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl", preview_url: "https://p.scdn.co/mp3-preview/x", album: { image: "https://i.scdn.co/image/abc" }, artists: [{ name: "Carly Rae Jepsen" }, { name: "Guest" }] };

test("a Spotify search result becomes a clean pick", () => {
  const p = pickFromSpotify(item)!;
  assert.equal(p.track_id, "11dFghVXANMlKmJXsNCbNl");
  assert.equal(p.title, "Cut To The Feeling");
  assert.equal(p.artist, "Carly Rae Jepsen, Guest");
  assert.equal(p.cover_url, "https://i.scdn.co/image/abc");
  assert.equal(p.preview_url, "https://p.scdn.co/mp3-preview/x");
  assert.equal(p.spotify_url, item.url);
});

test("bad or hostile results are cleaned or refused", () => {
  assert.equal(pickFromSpotify(null), null);
  assert.equal(pickFromSpotify({}), null);
  assert.equal(pickFromSpotify({ ...item, id: "short" }), null, "bad track id");
  assert.equal(pickFromSpotify({ ...item, id: "abc/../../etc/passwd" }), null);
  assert.equal(pickFromSpotify({ ...item, name: "   " }), null, "no title");
  const p = pickFromSpotify({ ...item, name: "Hi\u0000\u0007 there", url: "javascript:alert(1)", preview_url: "http://insecure/x", album: { image: "data:image/png;base64,AAAA" }, artists: "nope" })!;
  assert.equal(p.title, "Hi there");
  assert.equal(p.cover_url, null, "only https images");
  assert.equal(p.preview_url, null, "only https previews");
  assert.equal(p.spotify_url, "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl", "falls back to the canonical link");
  assert.equal(p.artist, "");
  assert.equal(pickFromSpotify({ ...item, url: "https://evil.example/track/1" })!.spotify_url, "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl");
  assert.equal(pickFromSpotify({ ...item, name: "x".repeat(500) })!.title.length, 200);
});

test("expiry labels", () => {
  const now = Date.parse("2026-11-28T00:00:00Z");
  const at = (ms: number) => new Date(now + ms).toISOString();
  assert.equal(isActive({ expires_at: at(1) }, now), true);
  assert.equal(isActive({ expires_at: at(0) }, now), false);
  assert.equal(isActive(null, now), false);
  assert.equal(timeLeftLabel(at(-5), now), "Ended");
  assert.equal(timeLeftLabel("garbage", now), "Ended");
  assert.equal(timeLeftLabel(at(12 * 60_000), now), "12m left");
  assert.equal(timeLeftLabel(at(59 * 60_000 + 1000), now), "1h left", "rounds up: 59m01s is the last minute of the hour");
  assert.equal(timeLeftLabel(at(65 * 60_000), now), "1h 05m left");
  assert.equal(timeLeftLabel(at(23 * 3600_000), now), "23h left");
  assert.equal(timeLeftLabel(at(48 * 3600_000), now), "48h left");
});

test("embed and search text", () => {
  assert.equal(embedUrl("11dFghVXANMlKmJXsNCbNl"), "https://open.spotify.com/embed/track/11dFghVXANMlKmJXsNCbNl?utm_source=generator&theme=0");
  assert.equal(embedUrl("bad id"), null);
  assert.equal(cleanQuery("  a   b \n c "), "a b c");
  assert.equal(cleanQuery("x".repeat(300)).length, 100);
  assert.equal(cleanPeopleQuery("@Mar tin!"), "Martin");
  assert.equal(cleanPeopleQuery("%,()"), "");
});
