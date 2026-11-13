/**
 * Basemap styles for the Wump map.
 *
 * Keyless default is OpenFreeMap (vector) plus Esri World Imagery for satellite.
 * Optional public keys, in order:
 *   NEXT_PUBLIC_MAPTILER_KEY — MapTiler streets / dark / satellite / hybrid / outdoor
 *   NEXT_PUBLIC_STADIA_KEY   — Stadia Alidade styles when MapTiler is unset
 * Server geocoding may also read MAPTILER_API_KEY (preferred) or the public MapTiler key.
 */

export type WumpMapStyle = "streets" | "dark" | "satellite" | "hybrid" | "outdoors";

/** Seconds since a live pin moved. Null when the server sent neither an age nor a timestamp. */
export function pinAgeSeconds(pin: { age_seconds?: number | null; updated_at?: string | null }, now = Date.now()) {
  if (pin.age_seconds != null && Number.isFinite(pin.age_seconds)) return pin.age_seconds;
  if (!pin.updated_at) return null;
  const at = new Date(pin.updated_at).getTime();
  if (!Number.isFinite(at)) return null;
  return (now - at) / 1000;
}

/** A pin is live when its age is known and under 90 seconds. Missing age is not treated as fresh. */
export function pinIsLive(pin: { age_seconds?: number | null; updated_at?: string | null }, now = Date.now()) {
  const age = pinAgeSeconds(pin, now);
  return age != null && age >= 0 && age < 90;
}

export type RasterStyle = {
  version: 8;
  name: string;
  sources: Record<string, { type: "raster"; tiles: string[]; tileSize: number; attribution?: string; maxzoom?: number }>;
  layers: { id: string; type: "raster"; source: string }[];
};

export type WumpStyleValue = string | RasterStyle;

export type WumpStyleKeys = { maptiler?: string; stadia?: string };

const OPENFREE = "https://tiles.openfreemap.org/styles";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const CARTO_LABELS = "https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png";
const TOPO = "https://a.tile.opentopomap.org/{z}/{x}/{y}.png";

function raster(name: string, tiles: { id: string; tiles: string[]; attribution: string; maxzoom?: number }[]): RasterStyle {
  return {
    version: 8,
    name,
    sources: Object.fromEntries(tiles.map((t) => [t.id, { type: "raster" as const, tiles: t.tiles, tileSize: 256, attribution: t.attribution, maxzoom: t.maxzoom ?? 19 }])),
    layers: tiles.map((t) => ({ id: t.id, type: "raster" as const, source: t.id })),
  };
}

export function resolveWumpStyles(keys: WumpStyleKeys = {}): Record<WumpMapStyle, WumpStyleValue> {
  const mt = keys.maptiler?.trim() || "";
  if (mt) {
    const u = (id: string) => `https://api.maptiler.com/maps/${id}/style.json?key=${encodeURIComponent(mt)}`;
    return {
      streets: u("streets-v2"),
      dark: u("streets-v2-dark"),
      satellite: u("satellite"),
      hybrid: u("hybrid"),
      outdoors: u("outdoor-v2"),
    };
  }
  const st = keys.stadia?.trim() || "";
  if (st) {
    const u = (id: string) => `https://tiles.stadiamaps.com/styles/${id}.json?api_key=${encodeURIComponent(st)}`;
    return {
      streets: u("alidade_smooth"),
      dark: u("alidade_smooth_dark"),
      satellite: u("alidade_satellite"),
      hybrid: u("alidade_satellite"),
      outdoors: u("outdoors"),
    };
  }
  return {
    streets: `${OPENFREE}/liberty`,
    dark: `${OPENFREE}/dark`,
    satellite: raster("Satellite", [{ id: "satellite", tiles: [ESRI], attribution: "© Esri, Maxar, Earthstar Geographics", maxzoom: 18 }]),
    hybrid: raster("Hybrid", [
      { id: "satellite", tiles: [ESRI], attribution: "© Esri, Maxar, Earthstar Geographics", maxzoom: 18 },
      { id: "labels", tiles: [CARTO_LABELS], attribution: "© OpenStreetMap © CARTO", maxzoom: 19 },
    ]),
    outdoors: raster("Outdoors", [{ id: "topo", tiles: [TOPO], attribution: "© OpenStreetMap © OpenTopoMap (CC-BY-SA)", maxzoom: 17 }]),
  };
}

export function wumpStyleKeysFromEnv(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): WumpStyleKeys {
  return {
    maptiler: env.NEXT_PUBLIC_MAPTILER_KEY,
    stadia: env.NEXT_PUBLIC_STADIA_KEY,
  };
}

export function resolveWumpStyle(style: WumpMapStyle, keys?: WumpStyleKeys): WumpStyleValue {
  const all = resolveWumpStyles(keys ?? wumpStyleKeysFromEnv());
  return all[style] ?? all.streets;
}

/** Short credit for the style menu. Does not include the key. */
export function wumpBasemapCredit(keys?: WumpStyleKeys): string {
  const k = keys ?? wumpStyleKeysFromEnv();
  if (k.maptiler?.trim()) return "HD maps · MapTiler";
  if (k.stadia?.trim()) return "HD maps · Stadia";
  return "OpenFreeMap · Esri satellite";
}
