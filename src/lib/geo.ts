"use client";

// GeoGuess — real geotagged photos from Wikimedia Commons (free, CORS-enabled API), guessed on an
// OpenStreetMap/CARTO world map rendered with Leaflet (loaded on demand from a CDN).

export type GeoRound = { url: string; lat: number; lng: number; title: string; page: string; credit: string; license: string };

// places people actually photograph — spread over every continent; each round jitters inside the radius
const SEEDS: [number, number, number][] = [
  // Europe
  [47.5, 19.04, 60], [48.86, 2.35, 80], [51.5, -0.12, 60], [41.9, 12.5, 70], [40.42, -3.7, 80], [52.52, 13.4, 60], [59.33, 18.07, 60], [60.17, 24.94, 50],
  [55.68, 12.57, 50], [52.37, 4.9, 50], [50.08, 14.43, 50], [48.21, 16.37, 50], [45.44, 12.33, 40], [43.77, 11.25, 50], [38.72, -9.14, 60], [37.98, 23.73, 60],
  [41.01, 28.97, 60], [53.35, -6.26, 50], [55.95, -3.19, 60], [64.15, -21.94, 120], [61.5, 23.76, 150], [46.2, 6.14, 60], [46.95, 7.45, 80], [45.76, 4.84, 60],
  [43.3, 5.37, 60], [36.72, -4.42, 80], [39.47, -0.38, 60], [44.43, 26.1, 60], [42.7, 23.32, 60], [44.82, 20.46, 60], [45.81, 15.98, 60], [43.51, 16.44, 80],
  [54.69, 25.28, 60], [56.95, 24.11, 60], [59.44, 24.75, 60], [50.45, 30.52, 80], [52.23, 21.01, 60], [50.06, 19.94, 60], [47.16, 27.59, 80], [69.65, 18.96, 200],
  [35.9, 14.51, 20], [57.7, 11.97, 60], [53.55, 9.99, 60], [48.14, 11.58, 60], [51.05, 3.72, 60], [50.85, 4.35, 50],
  // Americas
  [40.71, -74.0, 60], [34.05, -118.24, 80], [37.77, -122.42, 60], [41.88, -87.63, 60], [47.61, -122.33, 60], [25.76, -80.19, 60], [29.95, -90.07, 60], [39.74, -104.99, 80],
  [36.17, -115.14, 80], [33.45, -112.07, 80], [43.65, -79.38, 60], [45.5, -73.57, 60], [49.28, -123.12, 60], [51.05, -114.07, 120], [19.43, -99.13, 70], [20.97, -89.62, 120],
  [21.16, -86.85, 80], [9.93, -84.08, 80], [8.98, -79.52, 60], [4.71, -74.07, 80], [-0.18, -78.47, 80], [-12.05, -77.04, 70], [-13.53, -71.97, 100], [-16.5, -68.15, 120],
  [-33.45, -70.67, 80], [-34.6, -58.38, 70], [-34.9, -56.16, 60], [-22.91, -43.17, 70], [-23.55, -46.63, 80], [-15.8, -47.88, 100], [-3.12, -60.02, 150], [-41.13, -71.31, 150],
  [18.47, -66.11, 60], [23.13, -82.38, 60], [61.22, -149.9, 150], [21.31, -157.86, 60], [44.43, -110.59, 120], [36.1, -112.1, 120],
  // Africa & Middle East
  [30.04, 31.24, 70], [31.63, -8.0, 80], [34.02, -6.84, 80], [36.81, 10.18, 60], [-1.29, 36.82, 80], [-6.79, 39.21, 80], [-33.92, 18.42, 70], [-26.2, 28.05, 80],
  [-29.86, 31.02, 70], [6.52, 3.38, 80], [5.6, -0.19, 70], [14.72, -17.47, 60], [9.03, 38.74, 80], [-18.91, 47.52, 100], [-20.16, 57.5, 40], [0.35, 32.58, 80],
  [25.2, 55.27, 60], [24.47, 54.37, 70], [21.49, 39.19, 80], [31.77, 35.21, 50], [32.08, 34.78, 50], [33.89, 35.5, 50], [31.95, 35.93, 70], [41.72, 44.79, 80], [40.18, 44.51, 70],
  [35.69, 51.39, 80], [25.29, 51.53, 60], [23.59, 58.38, 100],
  // Asia
  [35.68, 139.69, 70], [34.69, 135.5, 70], [35.01, 135.77, 50], [43.06, 141.35, 100], [37.57, 126.98, 70], [35.18, 129.08, 60], [39.9, 116.4, 80], [31.23, 121.47, 80],
  [22.32, 114.17, 50], [25.03, 121.56, 60], [22.54, 114.06, 60], [30.57, 104.07, 100], [13.76, 100.5, 70], [18.79, 98.98, 100], [21.03, 105.85, 70], [10.82, 106.63, 70],
  [11.56, 104.92, 70], [1.35, 103.82, 30], [3.14, 101.69, 70], [-6.2, 106.85, 80], [-8.65, 115.22, 70], [14.6, 120.98, 80], [10.31, 123.89, 80], [28.61, 77.21, 80],
  [19.08, 72.88, 70], [12.97, 77.59, 80], [27.17, 78.04, 80], [26.91, 75.79, 80], [6.93, 79.85, 70], [27.72, 85.32, 80], [23.81, 90.41, 70], [41.31, 69.24, 100],
  [43.24, 76.95, 100], [47.92, 106.92, 120], [40.41, 49.87, 70], [24.86, 67.0, 80], [33.68, 73.05, 80],
  // Oceania
  [-33.87, 151.21, 70], [-37.81, 144.96, 70], [-27.47, 153.03, 80], [-31.95, 115.86, 80], [-34.93, 138.6, 80], [-12.46, 130.84, 120], [-16.92, 145.77, 120], [-42.88, 147.33, 100],
  [-36.85, 174.76, 70], [-41.29, 174.78, 70], [-45.03, 168.66, 120], [-43.53, 172.64, 80], [-17.73, 168.32, 80], [-18.14, 178.44, 80], [-21.14, -175.2, 60], [-17.54, -149.57, 60],
];

const BAD = /\b(map|maps|logo|flag|coat[ _]of[ _]arms|seal|emblem|diagram|chart|plan|locator|svg|scan|document|page|book|manuscript|stamp|coin|banknote|poster|drawing|painting|portrait|screenshot|icon|graph|ticket|signature|interior of|museum exhibit)\b/i;

/** seeded RNG (mulberry32) so daily challenges / multiplayer can be reproducible */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const dailySeed = () => {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

type Page = {
  title: string;
  coordinates?: { lat: number; lon: number }[];
  imageinfo?: { thumburl?: string; url: string; width: number; height: number; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[];
};
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 80);

async function photosNear(lat: number, lng: number): Promise<GeoRound[]> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({
    action: "query",
    format: "json",
    origin: "*",
    generator: "geosearch",
    ggscoord: `${lat.toFixed(5)}|${lng.toFixed(5)}`,
    ggsradius: "10000",
    ggslimit: "50",
    ggsnamespace: "6",
    prop: "imageinfo|coordinates",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1600",
    iiextmetadatafilter: "Artist|LicenseShortName|Categories",
  }))
    u.searchParams.set(k, v);
  const res = await fetch(u.toString());
  if (!res.ok) return [];
  const j = (await res.json()) as { query?: { pages?: Record<string, Page> } };
  const out: GeoRound[] = [];
  for (const p of Object.values(j.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0];
    const c = p.coordinates?.[0];
    if (!ii || !c || ii.mime !== "image/jpeg") continue;
    const ratio = ii.width / Math.max(1, ii.height);
    if (ii.width < 1000 || ratio < 1.2 || ratio > 2.4) continue;
    const cats = ii.extmetadata?.Categories?.value ?? "";
    if (BAD.test(p.title) || /maps|interior|museum|people|portrait|logos|diagrams/i.test(cats)) continue;
    out.push({
      url: ii.thumburl ?? ii.url,
      lat: c.lat,
      lng: c.lon,
      title: p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
      page: ii.descriptionurl,
      credit: strip(ii.extmetadata?.Artist?.value ?? "Unknown"),
      license: strip(ii.extmetadata?.LicenseShortName?.value ?? ""),
    });
  }
  return out;
}

/** n rounds of real photos, far apart from each other */
export async function makeRounds(n: number, seed = Math.floor(Math.random() * 1e9), onProgress?: (k: number) => void): Promise<GeoRound[]> {
  const r = rng(seed);
  const rounds: GeoRound[] = [];
  const usedSeeds = new Set<number>();
  let tries = 0;
  while (rounds.length < n && tries < n * 8) {
    tries++;
    let si = Math.floor(r() * SEEDS.length);
    while (usedSeeds.has(si)) si = (si + 1) % SEEDS.length;
    usedSeeds.add(si);
    const [lat, lng, rad] = SEEDS[si];
    const ang = r() * Math.PI * 2;
    const dist = Math.sqrt(r()) * rad;
    const jl = lat + (Math.sin(ang) * dist) / 111;
    const jg = lng + (Math.cos(ang) * dist) / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    try {
      const photos = await photosNear(jl, jg);
      if (!photos.length) continue;
      const pick = photos[Math.floor(r() * photos.length)];
      if (rounds.some((x) => km(x.lat, x.lng, pick.lat, pick.lng) < 300)) continue;
      rounds.push(pick);
      onProgress?.(rounds.length);
    } catch {
      /* network hiccup → next seed */
    }
  }
  return rounds;
}

export function km(a1: number, o1: number, a2: number, o2: number) {
  const R = 6371;
  const d = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(d(a2 - a1) / 2) ** 2 + Math.cos(d(a1)) * Math.cos(d(a2)) * Math.sin(d(o2 - o1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** GeoGuessr-style: 5000 for a perfect guess, ~2500 at 1400 km */
export const points = (distKm: number) => Math.round(5000 * Math.exp(-distKm / 2000));
export const fmtKm = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : d < 100 ? `${d.toFixed(1)} km` : `${Math.round(d).toLocaleString()} km`);

/** "Budapest, Hungary" for the reveal (free client-side reverse geocoder) */
export async function placeName(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    const j = (await r.json()) as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string };
    return [j.city || j.locality || j.principalSubdivision, j.countryName].filter(Boolean).join(", ");
  } catch {
    return "";
  }
}

// ------------------------------------------------------------------ Leaflet on demand
export type LMap = {
  setView: (c: [number, number], z: number) => LMap;
  on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  off?: (ev: string, fn?: (e?: unknown) => void) => void;
  invalidateSize: () => void;
  fitBounds: (b: [number, number][], o?: Record<string, unknown>) => void;
  remove: () => void;
  getZoom?: () => number;
  removeLayer?: (layer: unknown) => void;
  flyTo?: (c: [number, number], z?: number, o?: Record<string, unknown>) => LMap;
  getCenter?: () => { lat: number; lng: number };
};
export type LTileLayer = { addTo: (m: LMap) => LTileLayer; remove?: () => void };
export type LCircle = {
  addTo: (m: LMap) => LCircle;
  remove: () => void;
  setLatLng: (c: [number, number]) => void;
  setRadius: (r: number) => void;
};
export type LeafletNS = {
  map: (el: HTMLElement, o?: Record<string, unknown>) => LMap;
  tileLayer: (url: string, o?: Record<string, unknown>) => LTileLayer;
  marker: (c: [number, number], o?: Record<string, unknown>) => {
    addTo: (m: LMap) => {
      remove: () => void;
      setLatLng: (c: [number, number]) => void;
      getLatLng: () => { lat: number; lng: number };
      on: (ev: string, fn: () => void) => void;
      setIcon?: (icon: unknown) => void;
      bindTooltip?: (t: string, o?: Record<string, unknown>) => unknown;
    };
    remove: () => void;
  };
  circle: (c: [number, number], o?: Record<string, unknown>) => LCircle;
  polyline: (c: [number, number][], o?: Record<string, unknown>) => { addTo: (m: LMap) => { remove: () => void; setLatLngs?: (c: [number, number][]) => void } };
  divIcon: (o: Record<string, unknown>) => unknown;
};
let leafletP: Promise<LeafletNS> | null = null;
const CDNS = ["https://unpkg.com/leaflet@1.9.4/dist/", "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/"];
function loadFrom(base: string): Promise<LeafletNS> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { L?: LeafletNS };
    if (w.L) return resolve(w.L);
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${base}leaflet.css`;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = `${base}leaflet.js`;
    s.async = true;
    s.onload = () => (w.L ? resolve(w.L) : reject(new Error("Map failed to load")));
    s.onerror = () => {
      css.remove();
      s.remove();
      reject(new Error("Map failed to load — check your connection"));
    };
    document.head.appendChild(s);
  });
}
export function loadLeaflet(): Promise<LeafletNS> {
  leafletP ??= loadFrom(CDNS[0])
    .catch(() => loadFrom(CDNS[1]))
    .catch((e: Error) => {
      leafletP = null;
      throw e;
    });
  return leafletP;
}

export function newMap(L: LeafletNS, el: HTMLElement): LMap {
  const m = L.map(el, { worldCopyJump: true, minZoom: 1, zoomControl: true, attributionControl: true }).setView([25, 10], 1);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap contributors © CARTO",
    subdomains: "abcd",
    maxZoom: 18,
  }).addTo(m);
  return m;
}

export type WumpMapStyle = "streets" | "dark" | "satellite" | "hybrid" | "outdoors";
export const WUMP_STYLE_LABEL: Record<WumpMapStyle, string> = { streets: "Streets", dark: "Dark", satellite: "Satellite", hybrid: "Hybrid", outdoors: "Outdoors" };

/** Optional HD map provider: set NEXT_PUBLIC_MAPTILER_KEY (a public, domain-restricted MapTiler key) in Vercel. */
const MT = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
type TileDef = { url: string; attr: string; maxZoom: number; subdomains?: string; tileSize?: number; zoomOffset?: number; overlay?: { url: string; attr: string } };
const WUMP_TILES: Record<WumpMapStyle, TileDef> = MT
  ? {
      streets: { url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}@2x.png?key=${MT}`, attr: "© MapTiler © OpenStreetMap", maxZoom: 20, tileSize: 512, zoomOffset: -1 },
      dark: { url: `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}@2x.png?key=${MT}`, attr: "© MapTiler © OpenStreetMap", maxZoom: 20, tileSize: 512, zoomOffset: -1 },
      satellite: { url: `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}@2x.jpg?key=${MT}`, attr: "© MapTiler © OpenStreetMap", maxZoom: 20, tileSize: 512, zoomOffset: -1 },
      hybrid: { url: `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}@2x.jpg?key=${MT}`, attr: "© MapTiler © OpenStreetMap", maxZoom: 20, tileSize: 512, zoomOffset: -1 },
      outdoors: { url: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}@2x.png?key=${MT}`, attr: "© MapTiler © OpenStreetMap", maxZoom: 20, tileSize: 512, zoomOffset: -1 },
    }
  : {
      streets: { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", attr: "© OpenStreetMap © CARTO", maxZoom: 19, subdomains: "abcd" },
      dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: "© OpenStreetMap © CARTO", maxZoom: 19, subdomains: "abcd" },
      satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "© Esri", maxZoom: 18 },
      hybrid: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attr: "© Esri",
        maxZoom: 18,
        overlay: { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", attr: "© OpenStreetMap © CARTO" },
      },
      outdoors: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap © OpenTopoMap (CC-BY-SA)", maxZoom: 17, subdomains: "abc" },
    };
export const WUMP_HD = !!MT;

/** Wump live map — OSM/CARTO tiles, street-level default, zoom controls hidden (FABs own chrome). */
export function newWumpMap(
  L: LeafletNS,
  el: HTMLElement,
  center: [number, number] = [47.5, 19.05],
  zoom = 14,
  style: WumpMapStyle = "streets",
): { map: LMap; setStyle: (s: WumpMapStyle) => void; style: () => WumpMapStyle } {
  const m = L.map(el, {
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 20,
    zoomControl: false,
    attributionControl: true,
  }).setView(center, zoom);
  let current: WumpMapStyle = style;
  let layers: LTileLayer[] = [];
  const setStyle = (s: WumpMapStyle) => {
    const t = WUMP_TILES[s] || WUMP_TILES.streets;
    for (const l of layers) {
      try {
        m.removeLayer?.(l);
        l.remove?.();
      } catch {
        /* ignore */
      }
    }
    layers = [
      L.tileLayer(t.url, {
        attribution: t.attr,
        subdomains: t.subdomains ?? "abc",
        maxZoom: 20,
        maxNativeZoom: t.maxZoom,
        ...(t.tileSize ? { tileSize: t.tileSize, zoomOffset: t.zoomOffset } : { detectRetina: false }),
        crossOrigin: true,
      }).addTo(m),
    ];
    if (t.overlay) layers.push(L.tileLayer(t.overlay.url, { attribution: t.overlay.attr, subdomains: "abcd", maxZoom: 20, maxNativeZoom: 19, pane: "overlayPane" }).addTo(m));
    current = s;
  };
  setStyle(style);
  return { map: m, setStyle, style: () => current };
}

export const pinIcon = (L: LeafletNS, color: string, label = "") =>
  L.divIcon({
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    html: `<div style="position:relative;width:28px;height:36px"><svg viewBox="0 0 28 36" width="28" height="36"><path d="M14 35s12-12.6 12-21A12 12 0 0 0 2 14c0 8.4 12 21 12 21z" fill="${color}" stroke="#fff" stroke-width="2.5"/></svg><span style="position:absolute;top:5px;left:0;width:28px;text-align:center;font:800 11px system-ui;color:#fff">${label}</span></div>`,
  });

function escHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Round avatar pin for Wump friends on the live map (optional heading cone + stale fade). */
export const wumpAvatarIcon = (
  L: LeafletNS,
  opts: {
    color: string;
    initial: string;
    me?: boolean;
    label?: string;
    place?: string | null;
    username?: string | null;
    heading?: number | null;
    stale?: boolean;
    /** Wump Plus: emoji instead of the initial + gold glow */
    emoji?: string | null;
    plus?: boolean;
    /** "Live with" focus — pulsing ring */
    focus?: boolean;
    /** my location marker style */
    arrow?: "classic" | "arrow" | "beam" | "orb" | "ghost" | "comet";
  },
) => {
  if (opts.me && opts.arrow && opts.arrow !== "classic" && opts.arrow !== "ghost") return wumpArrowIcon(L, opts.arrow, opts.color || "#0ea5e9", opts.heading ?? null, !!opts.plus, opts.emoji ?? null);
  const ring = opts.me && !opts.plus ? "#38bdf8" : opts.color || "#22c55a";
  const glyph = opts.emoji
    ? `<span style="font-size:20px;line-height:1">${escHtml(opts.emoji.slice(0, 16))}</span>`
    : `<span style="font:800 15px system-ui;color:#fff">${escHtml(opts.initial.slice(0, 1).toUpperCase())}</span>`;
  const glow = opts.plus ? `,0 0 0 2px #facc15,0 0 16px rgba(250,204,21,.75)` : "";
  const pulse = opts.me || opts.focus
    ? `<span style="position:absolute;left:-4px;top:2px;width:52px;height:52px;border-radius:999px;border:2px solid ${opts.focus ? "#facc15" : "#38bdf8"};opacity:.55;animation:wump-pulse 1.6s ease-out infinite"></span>`
    : "";
  const opacity = opts.stale ? 0.45 : opts.arrow === "ghost" ? 0.5 : 1;
  const place = opts.place ? escHtml(opts.place.slice(0, 28)) : "";
  const user = opts.username ? escHtml(`@${opts.username.slice(0, 18)}`) : "";
  const meta = opts.label ? escHtml(opts.label) : "";
  const lines = [user, place, meta].filter(Boolean);
  const sub =
    lines.length > 0
      ? `<span style="position:absolute;left:50%;bottom:-${Math.max(14, lines.length * 12)}px;transform:translateX(-50%);white-space:nowrap;background:rgba(15,23,42,.9);color:#fff;font:700 9px system-ui;padding:2px 6px;border-radius:10px;text-align:center;line-height:1.25;max-width:148px;overflow:hidden;text-overflow:ellipsis">${lines
          .map((l, i) => `<span style="display:block;${i === 0 && user ? "color:#7dd3fc" : i === 0 && place ? "" : "opacity:.9"}">${l}</span>`)
          .join("")}</span>`
      : "";
  const cone =
    opts.heading != null && Number.isFinite(opts.heading)
      ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;margin-left:-10px;margin-top:-28px;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid ${ring};opacity:.85;transform:rotate(${opts.heading}deg);transform-origin:10px 28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"></div>`
      : "";
  return L.divIcon({
    className: "",
    iconSize: [44, 56],
    iconAnchor: [22, 28],
    html: `<div style="position:relative;width:44px;height:56px;opacity:${opacity}">
      ${cone}
      <div style="position:absolute;left:0;top:6px;width:44px;height:44px;border-radius:999px;background:${ring};box-shadow:0 4px 14px rgba(0,0,0,.35)${glow};display:grid;place-items:center;border:3px solid #fff">
        ${glyph}
      </div>
      ${pulse}
      ${opts.plus ? `<span style="position:absolute;right:-3px;top:2px;width:16px;height:16px;border-radius:999px;background:#facc15;color:#000;font:900 10px system-ui;display:grid;place-items:center;border:2px solid #fff">✦</span>` : ""}
      ${sub}
    </div>
    <style>@keyframes wump-pulse{0%{transform:scale(.92);opacity:.7}100%{transform:scale(1.35);opacity:0}}</style>`,
  });
};

/** Alternative "you are here" markers. Heading rotates the arrow; without heading the arrow points north. */
function wumpArrowIcon(L: LeafletNS, kind: "arrow" | "beam" | "orb" | "comet", color: string, heading: number | null, plus: boolean, emoji: string | null) {
  const c = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#0ea5e9";
  const rot = heading != null && Number.isFinite(heading) ? Math.round(heading) : 0;
  const glow = plus ? "filter:drop-shadow(0 0 6px rgba(250,204,21,.85));" : "filter:drop-shadow(0 3px 6px rgba(0,0,0,.35));";
  let html = "";
  if (kind === "orb") {
    html = `<div style="position:relative;width:44px;height:44px;display:grid;place-items:center">
      <span style="position:absolute;width:44px;height:44px;border-radius:999px;background:${c};opacity:.18"></span>
      <span style="--wump-orb:${c}88;width:20px;height:20px;border-radius:999px;background:${c};border:3px solid #fff;animation:wump-orb 2s ease-in-out infinite;${glow}"></span>
      ${emoji ? `<span style="position:absolute;top:-6px;right:-2px;font-size:14px">${escHtml(emoji.slice(0, 16))}</span>` : ""}
    </div>`;
  } else if (kind === "beam") {
    html = `<div style="position:relative;width:44px;height:44px">
      <div style="position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:999px;background:conic-gradient(from ${rot - 32}deg, ${c}77, ${c}00 64deg, transparent 0);mask:radial-gradient(circle, #000 0 58%, transparent 60%);-webkit-mask:radial-gradient(circle, #000 0 58%, transparent 60%)"></div>
      <span style="position:absolute;left:11px;top:11px;width:22px;height:22px;border-radius:999px;background:${c};border:3px solid #fff;${glow}"></span>
    </div>`;
  } else {
    const tail =
      kind === "comet"
        ? `<div style="position:absolute;left:50%;top:50%;width:14px;height:46px;margin-left:-7px;border-radius:999px;background:linear-gradient(to bottom, ${c}cc, ${c}00);transform:rotate(${rot}deg) translateY(10px);transform-origin:7px 0"></div>`
        : "";
    html = `<div style="position:relative;width:44px;height:44px;display:grid;place-items:center">
      ${tail}
      <span style="position:absolute;width:40px;height:40px;border-radius:999px;background:${c};opacity:.16"></span>
      <svg viewBox="0 0 24 24" width="30" height="30" style="transform:rotate(${rot}deg);${glow}"><path d="M12 2 20 21 12 16.8 4 21Z" fill="${c}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
    </div>`;
  }
  return L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html });
}

/** Pinned profile place marker on the Wump map */
export const wumpPlaceIcon = (L: LeafletNS, opts: { title: string; color?: string }) => {
  const color = opts.color || "#f59e0b";
  const title = escHtml(opts.title.slice(0, 32));
  return L.divIcon({
    className: "",
    iconSize: [28, 40],
    iconAnchor: [14, 36],
    html: `<div style="position:relative;width:28px;height:40px">
      <svg viewBox="0 0 28 36" width="28" height="36"><path d="M14 35s12-12.6 12-21A12 12 0 0 0 2 14c0 8.4 12 21 12 21z" fill="${color}" stroke="#fff" stroke-width="2.5"/><circle cx="14" cy="13" r="4.5" fill="#fff"/></svg>
      <span style="position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:2px;white-space:nowrap;background:rgba(15,23,42,.88);color:#fff;font:700 9px system-ui;padding:2px 6px;border-radius:999px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${title}</span>
    </div>`,
  });
};
