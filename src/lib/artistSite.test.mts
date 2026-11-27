import test from "node:test";
import assert from "node:assert/strict";
import { releaseYear, thisYearReleases, dspLinks, allPlatformsUrl, renderArtistSite, type SiteRelease } from "./artistSite.ts";

const R = (id: string, name: string, date: string, type = "single"): SiteRelease => ({ id, name, release_date: date, type, url: `https://open.spotify.com/album/${id}`, image: "https://i.scdn.co/image/x" });

test("release years parse all Spotify date shapes", () => {
  assert.equal(releaseYear("2026-03-04"), 2026);
  assert.equal(releaseYear("2026-03"), 2026);
  assert.equal(releaseYear("2025"), 2025);
  assert.equal(releaseYear(""), null);
});

test("only this year's releases, newest first, no duplicate titles, no compilations", () => {
  const out = thisYearReleases([R("a", "Old", "2025-12-31"), R("b", "Spring", "2026-03-01"), R("c", "Fall", "2026-10-02"), R("d", "fall", "2026-10-02"), R("e", "Mix", "2026-05-05", "compilation")], 2026);
  assert.deepEqual(out.map((r) => r.id), ["c", "b"]);
});

test("DSP list has the big services, encoded search links and a direct Spotify link", () => {
  const l = dspLinks("Mar&tin", "https://open.spotify.com/artist/1DH");
  assert.equal(l[0].url, "https://open.spotify.com/artist/1DH");
  assert.ok(l.length >= 14);
  assert.ok(l.find((d) => d.id === "apple")!.url.includes("Mar%26tin"));
  assert.ok(l.every((d) => d.url.startsWith("https://")));
});

test("all-platforms link only for Spotify releases", () => {
  assert.equal(allPlatformsUrl({ id: "x", url: "https://open.spotify.com/album/x" }), "https://song.link/https://open.spotify.com/album/x");
  assert.equal(allPlatformsUrl({ id: "", url: "javascript:alert(1)" }), null);
});

test("page shows the check only when verified, escapes names and lists only 2026", () => {
  const data = { artist: { id: "1", name: "Mar<b>tin", url: "https://open.spotify.com/artist/1DH" }, releases: [R("a", "Old", "2025-01-01"), R("b", "New <i>", "2026-02-02")], year: 2026 };
  const yes = renderArtistSite({ ...data, verified: true }, "https://x.test");
  const no = renderArtistSite({ ...data, verified: false }, "https://x.test");
  assert.ok(yes.includes('aria-label="Verified"') && !no.includes('aria-label="Verified"'));
  assert.ok(!yes.includes("Mar<b>tin") && !yes.includes("New <i>"));
  assert.ok(yes.includes("New &lt;i&gt;") && (yes.match(/class="rel"/g) ?? []).length === 1);
  assert.ok(yes.includes("Listen everywhere") && yes.includes("Apple Music"));
});

test("empty year shows a coming-soon note instead of old releases", () => {
  const html = renderArtistSite({ artist: { id: "1", name: "Martin" }, releases: [R("a", "Old", "2024-01-01")], verified: false, year: 2026 }, "https://x.test");
  assert.ok(html.includes("New music is on the way") && !html.includes(">Old<"));
});

test("Martin's site is built in: handle, Spotify ID, profile picture", async () => {
  const { BUILTIN_ARTISTS, AVATAR_OVERRIDES } = await import("./artistSite.ts");
  assert.equal(BUILTIN_ARTISTS.martin.spotify_id, "1DHWtSkA0gpJJdWz7OwwVQ");
  assert.equal(BUILTIN_ARTISTS.martin.verified, true);
  const html = renderArtistSite({ artist: { id: "1DHWtSkA0gpJJdWz7OwwVQ", name: "Martin", image: "https://i.scdn.co/spotify.jpg" }, releases: [], verified: true, handle: "martin", year: 2026 }, "https://nexusproject.cc");
  assert.ok(html.includes(`src="https://nexusproject.cc${AVATAR_OVERRIDES.martin}"`) && !html.includes("spotify.jpg"));
  assert.ok(html.includes("Bebas Neue") && html.includes("999"));
});

test("contact section: Instagram, TikTok, Wikipedia, IMDb, email; big-letter tiles; safe URLs only", async () => {
  const { MARTIN_CONTACTS } = await import("./artistSite.ts");
  const ids = MARTIN_CONTACTS.map((c) => c.id);
  for (const id of ["instagram", "tiktok", "wikipedia", "imdb", "email"]) assert.ok(ids.includes(id), id);
  assert.ok(MARTIN_CONTACTS.find((c) => c.id === "instagram")!.url.endsWith("/qyopyprod"));
  assert.ok(MARTIN_CONTACTS.find((c) => c.id === "tiktok")!.url.endsWith("/@qyopy"));
  const html = renderArtistSite({ artist: { id: "1", name: "Martin" }, releases: [], verified: true, year: 2026, contacts: [...MARTIN_CONTACTS, { id: "bad", label: "Bad", color: "#fff", url: "javascript:alert(1)" }] }, "https://x.test");
  assert.ok(html.includes("Connect &amp; contact") && html.includes('<span class="lt" aria-hidden="true">Y</span><span class="nm">YouTube'));
  assert.ok(!html.includes("javascript:"));
});

const ID = (c: string) => c.repeat(22);

test("featured song: track first, then a release with that title, then the artist player", async () => {
  const { pickEmbed } = await import("./artistSite.ts");
  const rel = [{ id: ID("r"), name: "MONTAGEM BOLUME", release_date: "2025-01-01", type: "single" }];
  assert.deepEqual(pickEmbed("Montagem Bolume", [{ id: ID("t"), name: "Montagem Bolume" }], rel, ID("a")), { path: `track/${ID("t")}`, title: "Montagem Bolume" });
  assert.deepEqual(pickEmbed("Montagem Bolume", [], rel, ID("a")), { path: `album/${ID("r")}`, title: "MONTAGEM BOLUME" });
  assert.deepEqual(pickEmbed("Montagem Bolume", [], [], ID("a")), { path: `artist/${ID("a")}`, title: null });
  assert.equal(pickEmbed("x", [], [], "bad"), null);
});

test("page has snow, share button, views, Spotify player and the Nexus Project credit", () => {
  const base = { artist: { id: ID("a"), name: "Martin" }, releases: [], verified: true, year: 2026 };
  const html = renderArtistSite({ ...base, views: 1234, embed: `track/${ID("t")}`, embedTitle: "Montagem Bolume" }, "https://nexusproject.cc");
  assert.ok(html.includes('id="snow"') && html.includes("requestAnimationFrame"));
  assert.ok(html.includes('id="share"') && html.includes("navigator.share"));
  assert.ok(html.includes("<b>1,234</b> views"));
  assert.ok(html.includes(`https://open.spotify.com/embed/track/${ID("t")}`) && html.includes("Montagem Bolume"));
  assert.ok(html.includes("Made with") && html.includes("Nexus Project"));
  assert.ok(!renderArtistSite(base, "https://x.test").includes('class="views"'));
});

test("embed path is validated (no arbitrary iframe URLs)", () => {
  const html = renderArtistSite({ artist: { id: ID("a"), name: "Martin" }, releases: [], verified: false, year: 2026, embed: "../../evil.com/x" }, "https://x.test");
  assert.ok(!html.includes("<iframe"));
});

test("Montagem Bolume is pinned to the Spotify track the artist sent", async () => {
  const { pickEmbed, BUILTIN_ARTISTS } = await import("./artistSite.ts");
  const m = BUILTIN_ARTISTS.martin;
  assert.equal(m.featuredTrackId, "3LdtMt5vCRlP9n5TEktnBv");
  assert.deepEqual(pickEmbed(m.featured, [], [], m.spotify_id, m.featuredTrackId), { path: "track/3LdtMt5vCRlP9n5TEktnBv", title: "Montagem Bolume" });
});

test("discography: all years, kinds, de-duplicated, collaborators exclude the artist", async () => {
  const { discography } = await import("./artistSite.ts");
  const main = { id: ID("m"), name: "Martin" };
  const feat = { id: ID("f"), name: "DJ Guest" };
  const d = discography(
    [
      { id: ID("1"), name: "Old Single", release_date: "2024-05-01", type: "single", total_tracks: 1, artists: [main] },
      { id: ID("2"), name: "Team Up", release_date: "2026-03-01", type: "single", total_tracks: 1, artists: [main, feat] },
      { id: ID("3"), name: "Team Up", release_date: "2026-03-01", type: "single", total_tracks: 1, artists: [main, feat] },
      { id: ID("4"), name: "Six Pack", release_date: "2025-06-01", type: "single", total_tracks: 6, artists: [main] },
      { id: ID("5"), name: "Debut", release_date: "2023", type: "album", total_tracks: 12, artists: [main] },
    ],
    [main],
  );
  assert.deepEqual(d.singles.map((r) => r.name), ["Team Up", "Old Single"]);
  assert.deepEqual(d.eps.map((r) => r.name), ["Six Pack"]);
  assert.deepEqual(d.albums.map((r) => r.name), ["Debut"]);
  assert.deepEqual(d.singles[0].collaborators.map((a) => a.name), ["DJ Guest"]);
  assert.equal(d.singles[1].collaborators.length, 0);
});

test("collaborations merge releases and tracks, most frequent first; page highlights mentions and escapes", async () => {
  const { collaborations } = await import("./artistSite.ts");
  const main = { id: ID("m"), name: "Martin" };
  const a = { id: ID("a"), name: "MC <A>" };
  const b = { id: ID("b"), name: "Beta" };
  const rels = [{ id: ID("1"), name: "One", release_date: "2026-01-01", type: "single", artists: [main, a] }];
  const tracks = [{ id: ID("t"), name: "Two", artists: [main, a, b], album: { release_date: "2025-02-02" } }];
  const c = collaborations(rels, tracks, [main]);
  assert.deepEqual(c.map((x) => x.name), ["MC <A>", "Beta"]);
  assert.equal(c[0].works.length, 2);
  const html = renderArtistSite({ artist: { id: main.id, name: "Martin" }, releases: rels, tracks, verified: true, year: 2026 }, "https://x.test");
  assert.ok(html.includes("Collaborations") && html.includes("Discography") && html.includes('class="wikitable"'));
  assert.ok(html.includes("<mark>MC &lt;A&gt;</mark>") && !html.includes("<A>"));
  assert.ok(html.includes(`https://open.spotify.com/artist/${ID("a")}`));
});

test("exact-name artist match only; popular one wins; lookalikes are never merged", async () => {
  const { pickArtistByName } = await import("./artistSite.ts");
  const items = [
    { id: ID("a"), name: "mxteen2", popularity: 90 },
    { id: ID("b"), name: "MXTEEN", popularity: 5 },
    { id: ID("c"), name: "mxteen", popularity: 40 },
  ];
  assert.equal(pickArtistByName(items, "mxteen")!.id, ID("c"));
  assert.equal(pickArtistByName([{ id: ID("a"), name: "mxteen2" }], "mxteen"), null);
});

test("three profiles become one catalog: merged, de-duplicated, credited-as, nobody listed as their own collaborator", async () => {
  const { mergeCatalogs, discography, collaborations } = await import("./artistSite.ts");
  const M = { id: ID("m"), name: "Martin" }, T = { id: ID("t"), name: "2txiggerrxvo" }, X = { id: ID("x"), name: "mxteen" }, G = { id: ID("g"), name: "Guest" };
  const r = (id: string, name: string, d: string, artists: typeof M[]) => ({ id: ID(id), name, release_date: d, type: "single", total_tracks: 1, artists });
  const merged = mergeCatalogs([[r("1", "A", "2026-01-01", [M])], [r("2", "B", "2026-02-01", [T, G]), r("1", "A", "2026-01-01", [M])], [r("3", "C", "2026-03-01", [X, T])]]);
  assert.equal(merged.length, 3);
  const d = discography(merged, [M, T, X]);
  assert.deepEqual(d.singles.map((x) => x.name), ["C", "B", "A"]);
  assert.deepEqual(d.singles[0].collaborators, []);
  assert.deepEqual(d.singles[1].collaborators.map((c) => c.name), ["Guest"]);
  assert.deepEqual(collaborations(merged, [], [M, T, X]).map((c) => c.name), ["Guest"]);
  const html = renderArtistSite({ artist: M, aliases: [T, X], releases: merged, verified: true, year: 2026 }, "https://x.test");
  assert.ok(html.includes("under Martin, 2txiggerrxvo, mxteen") && html.includes("as 2txiggerrxvo") && html.includes("as mxteen"));
  assert.equal((html.match(/class="rel"/g) ?? []).length, 3);
});

test("Martin's catalog = his three Spotify profiles, pinned by ID", async () => {
  const { BUILTIN_ARTISTS } = await import("./artistSite.ts");
  assert.deepEqual([BUILTIN_ARTISTS.martin.spotify_id, ...(BUILTIN_ARTISTS.martin.alsoIds ?? [])].sort(), ["13E8SUWeA0daX8fiOUbKuv", "1DHWtSkA0gpJJdWz7OwwVQ", "3dwpWcus9GuxTGeNKXxWGm"]);
});

test("Spotify + Genius search links for every profile, lyrics link per release", async () => {
  const { spotifyGeniusLinks } = await import("./artistSite.ts");
  const mains = [{ id: ID("a"), name: "Martin" }, { id: ID("b"), name: "mx teen" }];
  const l = spotifyGeniusLinks(mains);
  assert.equal(l.length, 4);
  assert.ok(l.some((x) => x.url === `https://open.spotify.com/artist/${ID("a")}`) && l.some((x) => x.url === "https://genius.com/search?q=mx%20teen"));
  const html = renderArtistSite({ artist: mains[0], aliases: [mains[1]], releases: [{ id: ID("1"), name: "Song", release_date: "2026-01-01", type: "single", total_tracks: 1, artists: [mains[0]] }], verified: true, year: 2026 }, "https://x.test");
  assert.ok(html.includes("Genius · mx teen") && html.includes("genius.com/search?q=Martin%20Song") && html.includes("Lyrics"));
});
