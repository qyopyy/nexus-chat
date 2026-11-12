"use client";

/**
 * MapLibre engine for Wump. The handle matches the small Leaflet-shaped API the
 * live map already calls (markers, polylines, circles, fit/fly), so friend pins,
 * trails and directions keep working on top of vector tiles.
 *
 * Loaded only in the browser. Styles come from wumpMapStyle (OpenFreeMap, or
 * MapTiler / Stadia when a public key is set).
 */

import type { LeafletNS, LCircle, LMap, WumpMapStyle } from "./geo";
import { resolveWumpStyle, type WumpStyleValue } from "./wumpMapStyle";

type MlLngLat = { lat: number; lng: number };
type MlMap = {
  remove: () => void;
  resize: () => void;
  getZoom: () => number;
  getCenter: () => MlLngLat;
  getBearing: () => number;
  setStyle: (style: WumpStyleValue) => void;
  isStyleLoaded: () => boolean;
  loaded: () => boolean;
  jumpTo: (o: Record<string, unknown>) => void;
  flyTo: (o: Record<string, unknown>) => void;
  easeTo: (o: Record<string, unknown>) => void;
  fitBounds: (b: [[number, number], [number, number]], o?: Record<string, unknown>) => void;
  project: (ll: [number, number]) => { x: number; y: number };
  unproject: (pt: [number, number]) => MlLngLat;
  on: (ev: string, fn: (e: { lngLat?: MlLngLat }) => void) => void;
  off: (ev: string, fn: (e: { lngLat?: MlLngLat }) => void) => void;
  addSource: (id: string, spec: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => { setData: (d: unknown) => void } | undefined;
  getLayer: (id: string) => unknown;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
};
type MlMarker = {
  setLngLat: (c: [number, number]) => MlMarker;
  addTo: (m: MlMap) => MlMarker;
  remove: () => void;
  on: (ev: string, fn: () => void) => void;
  getElement: () => HTMLElement;
  getLngLat: () => MlLngLat;
  setOffset: (o: [number, number]) => void;
};
type MlNs = {
  Map: new (o: Record<string, unknown>) => MlMap;
  Marker: new (o?: Record<string, unknown>) => MlMarker;
  supported: (o?: { failIfMajorPerformanceCaveat?: boolean }) => boolean;
};

type DivIcon = { html: string; iconSize: [number, number]; iconAnchor: [number, number]; className: string };

type Pin = {
  lat: number;
  lng: number;
  cluster: boolean;
  removed: boolean;
  hidden: boolean;
  onMap: boolean;
  el: HTMLElement;
  marker: MlMarker;
  home: Reg | null;
  listeners: Map<string, Set<() => void>>;
};

type Reg = {
  mlMap: MlMap;
  ml: MlNs;
  pins: Pin[];
  bubbles: MlMarker[];
  schedule: () => void;
};

const regs = new WeakMap<object, Reg>();
let seq = 0;

function asMl(mod: unknown): MlNs {
  const m = mod as MlNs & { default?: MlNs };
  return m.default && typeof m.default.Map === "function" ? m.default : m;
}

declare module "maplibre-gl/dist/maplibre-gl.css";

let loading: Promise<MlNs> | null = null;
function loadMl(): Promise<MlNs> {
  loading ??= Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([mod]) => asMl(mod));
  return loading;
}

function circleRing(lat: number, lng: number, radiusM: number, steps = 64): [number, number][] {
  const ring: [number, number][] = [];
  const R = 6371000;
  const φ = (lat * Math.PI) / 180;
  const λ = (lng * Math.PI) / 180;
  const d = radiusM / R;
  for (let i = 0; i <= steps; i++) {
    const br = (i / steps) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ) * Math.cos(d) + Math.cos(φ) * Math.sin(d) * Math.cos(br));
    const λ2 = λ + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(φ), Math.cos(d) - Math.sin(φ) * Math.sin(φ2));
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  return ring;
}

function dashArray(v: unknown): number[] | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const parts = v.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) return undefined;
  return parts.map((n) => Math.max(0.15, n / 4));
}

function boundsOf(pts: [number, number][]): [[number, number], [number, number]] | null {
  if (!pts.length) return null;
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const [lat, lng] of pts) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  if (minLat > maxLat) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

function paddingOf(o?: Record<string, unknown>) {
  const raw = o?.padding;
  const pair = Array.isArray(raw) ? raw.map(Number) : [Number(raw) || 40, Number(raw) || 40];
  const y = Number.isFinite(pair[0]) ? pair[0] : 40;
  const x = Number.isFinite(pair[1]) ? pair[1] : y;
  return { top: y, bottom: y, left: x, right: x };
}

function applyIcon(el: HTMLElement, icon: DivIcon | null) {
  el.replaceChildren();
  if (!icon) {
    el.innerHTML = `<div style="width:18px;height:18px;border-radius:999px;background:#0ea5e9;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`;
    return [-9, -9] as [number, number];
  }
  const wrap = document.createElement("div");
  wrap.className = icon.className;
  wrap.innerHTML = icon.html;
  el.appendChild(wrap);
  const [ax, ay] = icon.iconAnchor;
  return [-ax, -ay] as [number, number];
}

export async function loadWumpGl(): Promise<LeafletNS> {
  const ml = await loadMl();
  if (!ml.supported()) throw new Error("This device can’t show the map");

  const divIcon = (o: Record<string, unknown>): DivIcon => {
    const size = (Array.isArray(o.iconSize) ? o.iconSize : [28, 36]) as [number, number];
    const anchor = (Array.isArray(o.iconAnchor) ? o.iconAnchor : [size[0] / 2, size[1]]) as [number, number];
    return { html: String(o.html ?? ""), iconSize: [Number(size[0]) || 28, Number(size[1]) || 36], iconAnchor: [Number(anchor[0]) || 0, Number(anchor[1]) || 0], className: String(o.className ?? "") };
  };

  const ns = {
    map: () => {
      throw new Error("Use newWumpGlMap");
    },
    tileLayer: () => {
      throw new Error("Wump styles are vector styles, not raster tile layers");
    },
    divIcon,
    marker: (c: [number, number], o?: Record<string, unknown>) => {
      const icon = (o?.icon as DivIcon | undefined) ?? null;
      const el = document.createElement("div");
      el.className = "wump-pin";
      el.style.pointerEvents = o?.interactive === false ? "none" : "auto";
      if (typeof o?.title === "string") el.title = o.title;
      if (typeof o?.zIndexOffset === "number") el.style.zIndex = String(200 + o.zIndexOffset);
      const offset = applyIcon(el, icon);
      const marker = new ml.Marker({ element: el, anchor: "top-left", offset, draggable: !!o?.draggable });
      const pin: Pin = {
        lat: c[0],
        lng: c[1],
        cluster: !!o?.cluster,
        removed: false,
        hidden: false,
        onMap: false,
        el,
        marker,
        home: null,
        listeners: new Map(),
      };
      const emit = (ev: string) => pin.listeners.get(ev)?.forEach((fn) => fn());
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        emit("click");
      });
      marker.on("dragend", () => {
        const pos = marker.getLngLat();
        pin.lat = pos.lat;
        pin.lng = pos.lng;
        emit("dragend");
      });
      const handle = {
        addTo(map: LMap) {
          const reg = regs.get(map);
          if (!reg) return handle;
          pin.home = reg;
          marker.setLngLat([pin.lng, pin.lat]);
          reg.pins.push(pin);
          pin.onMap = true;
          pin.hidden = false;
          marker.addTo(reg.mlMap);
          reg.schedule();
          return handle;
        },
        remove() {
          pin.removed = true;
          if (pin.onMap) marker.remove();
          pin.onMap = false;
          const reg = pin.home;
          if (!reg) return;
          const i = reg.pins.indexOf(pin);
          if (i >= 0) reg.pins.splice(i, 1);
          pin.home = null;
          reg.schedule();
        },
        setLatLng(next: [number, number]) {
          pin.lat = next[0];
          pin.lng = next[1];
          if (!pin.hidden) marker.setLngLat([pin.lng, pin.lat]);
          pin.home?.schedule();
          return handle;
        },
        getLatLng: () => ({ lat: pin.lat, lng: pin.lng }),
        setIcon(next: unknown) {
          const off = applyIcon(el, (next as DivIcon) ?? null);
          marker.setOffset(off);
        },
        on(ev: string, fn: () => void) {
          const set = pin.listeners.get(ev) ?? new Set();
          set.add(fn);
          pin.listeners.set(ev, set);
        },
        bindTooltip() {
          return handle;
        },
      };
      return handle;
    },
    circle: (c: [number, number], o?: Record<string, unknown>) => makeCircle(c, o),
    polyline: (c: [number, number][], o?: Record<string, unknown>) => makeLine(c, o),
  };
  return ns as unknown as LeafletNS;
}

function makeLine(coords: [number, number][], style?: Record<string, unknown>) {
  const id = `wump-line-${++seq}`;
  let current = coords.slice();
  let reg: Reg | null = null;
  let hooked = false;
  const data = () => ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: current.map(([lat, lng]) => [lng, lat]) },
  });
  const paint: Record<string, unknown> = {
    "line-color": typeof style?.color === "string" ? style.color : "#0ea5e9",
    "line-width": typeof style?.weight === "number" ? style.weight : 4,
    "line-opacity": typeof style?.opacity === "number" ? style.opacity : 0.9,
  };
  const dash = dashArray(style?.dashArray);
  if (dash) paint["line-dasharray"] = dash;
  const attach = () => {
    if (!reg || !reg.mlMap.isStyleLoaded()) return;
    const map = reg.mlMap;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    map.addSource(id, { type: "geojson", data: data() });
    map.addLayer({
      id,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint,
    });
  };
  const hook = (next: Reg) => {
    reg = next;
    if (hooked) return;
    hooked = true;
    next.mlMap.on("style.load", attach);
  };
  return {
    addTo(map: LMap) {
      const found = regs.get(map);
      if (!found) return this;
      hook(found);
      if (found.mlMap.isStyleLoaded()) attach();
      return this;
    },
    setLatLngs(next: [number, number][]) {
      current = next.slice();
      reg?.mlMap.getSource(id)?.setData(data());
    },
    remove() {
      if (!reg) return;
      const map = reg.mlMap;
      map.off("style.load", attach);
      try {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* map already gone */
      }
      reg = null;
    },
  };
}

function makeCircle(center: [number, number], style?: Record<string, unknown>) {
  const id = `wump-circle-${++seq}`;
  let lat = center[0];
  let lng = center[1];
  let radius = typeof style?.radius === "number" ? style.radius : 40;
  let reg: Reg | null = null;
  let hooked = false;
  const data = () => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [circleRing(lat, lng, Math.max(1, radius))] },
  });
  const attach = () => {
    if (!reg || !reg.mlMap.isStyleLoaded()) return;
    const map = reg.mlMap;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    map.addSource(id, { type: "geojson", data: data() });
    map.addLayer({
      id,
      type: "fill",
      source: id,
      paint: {
        "fill-color": typeof style?.fillColor === "string" ? style.fillColor : typeof style?.color === "string" ? style.color : "#38bdf8",
        "fill-opacity": typeof style?.fillOpacity === "number" ? style.fillOpacity : 0.15,
      },
    });
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: id,
      paint: {
        "line-color": typeof style?.color === "string" ? style.color : "#38bdf8",
        "line-width": typeof style?.weight === "number" ? style.weight : 1,
        "line-opacity": 0.8,
      },
    });
  };
  const sync = () => reg?.mlMap.getSource(id)?.setData(data());
  const api: LCircle = {
    addTo(map: LMap) {
      const found = regs.get(map as object);
      if (!found) return api;
      reg = found;
      if (!hooked) {
        hooked = true;
        found.mlMap.on("style.load", attach);
      }
      if (found.mlMap.isStyleLoaded()) attach();
      return api;
    },
    remove() {
      if (!reg) return;
      const map = reg.mlMap;
      map.off("style.load", attach);
      try {
        if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* map already gone */
      }
      reg = null;
    },
    setLatLng(c: [number, number]) {
      lat = c[0];
      lng = c[1];
      sync();
    },
    setRadius(r: number) {
      radius = r;
      sync();
    },
  };
  return api;
}

function rebuildClusters(reg: Reg) {
  const map = reg.mlMap;
  for (const b of reg.bubbles) b.remove();
  reg.bubbles = [];
  const show = (pin: Pin) => {
    pin.hidden = false;
    pin.marker.setLngLat([pin.lng, pin.lat]);
    if (!pin.onMap) {
      pin.marker.addTo(map);
      pin.onMap = true;
    }
  };
  const hide = (pin: Pin) => {
    pin.hidden = true;
    if (pin.onMap) {
      pin.marker.remove();
      pin.onMap = false;
    }
  };
  const live = reg.pins.filter((p) => !p.removed);
  const singles = live.filter((p) => !p.cluster);
  const grouped = live.filter((p) => p.cluster);
  singles.forEach(show);
  if (!grouped.length || !map.isStyleLoaded()) {
    grouped.forEach(show);
    return;
  }
  const cell = 58;
  const buckets = new Map<string, Pin[]>();
  for (const pin of grouped) {
    let pt: { x: number; y: number };
    try {
      pt = map.project([pin.lng, pin.lat]);
    } catch {
      show(pin);
      continue;
    }
    const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;
    const list = buckets.get(key) ?? [];
    list.push(pin);
    buckets.set(key, list);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) {
      show(list[0]);
      continue;
    }
    list.forEach(hide);
    const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
    const lng = list.reduce((s, p) => s + p.lng, 0) / list.length;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "wump-pin";
    el.setAttribute("aria-label", `${list.length} people`);
    el.innerHTML = `<span style="display:grid;place-items:center;width:42px;height:42px;border-radius:999px;background:#0284c7;color:#fff;font:800 14px system-ui;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.35)">${list.length}</span>`;
    const bubble = new reg.ml.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = boundsOf(list.map((p) => [p.lat, p.lng]));
      if (!b) return;
      const zoom = map.getZoom();
      map.fitBounds(b, { padding: { top: 70, bottom: 70, left: 70, right: 70 }, maxZoom: Math.min(18, zoom + 2) });
    });
    reg.bubbles.push(bubble);
  }
}

export async function newWumpGlMap(
  el: HTMLElement,
  center: [number, number] = [47.5, 19.05],
  zoom = 14,
  style: WumpMapStyle = "streets",
): Promise<{ map: LMap; setStyle: (s: WumpMapStyle) => void; style: () => WumpMapStyle }> {
  const ml = await loadMl();
  if (!ml.supported()) throw new Error("This device can’t show the map");
  let current = style;
  const mlMap = new ml.Map({
    container: el,
    style: resolveWumpStyle(style),
    center: [center[1], center[0]],
    zoom,
    minZoom: 2,
    maxZoom: 20,
    attributionControl: { compact: true },
    dragRotate: true,
    pitchWithRotate: false,
    touchZoomRotate: true,
    touchPitch: false,
    maxPitch: 0,
    fadeDuration: 0,
    refreshExpiredTiles: false,
  });
  const listeners = new Map<string, Set<(e: { latlng: { lat: number; lng: number } }) => void>>();
  const emit = (ev: string, lat = 0, lng = 0) => {
    const payload = { latlng: { lat, lng } };
    listeners.get(ev)?.forEach((fn) => fn(payload));
  };
  const forward = (ev: string) => (e: { lngLat?: MlLngLat }) => emit(ev, e.lngLat?.lat ?? 0, e.lngLat?.lng ?? 0);
  const onClick = forward("click");
  const onDrag = forward("dragstart");
  const onZoom = forward("zoomstart");
  const onRotate = forward("rotate");
  mlMap.on("click", onClick);
  mlMap.on("dragstart", onDrag);
  mlMap.on("zoomstart", onZoom);
  mlMap.on("rotate", onRotate);

  let press: number | null = null;
  let sx = 0;
  let sy = 0;
  let swallowed = false;
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.(".wump-pin")) return;
    sx = e.clientX;
    sy = e.clientY;
    swallowed = false;
    press = window.setTimeout(() => {
      press = null;
      swallowed = true;
      const rect = el.getBoundingClientRect();
      const ll = mlMap.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      emit("longpress", ll.lat, ll.lng);
    }, 480);
  };
  const move = (e: PointerEvent) => {
    if (press != null && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) {
      window.clearTimeout(press);
      press = null;
    }
  };
  const up = () => {
    if (press != null) window.clearTimeout(press);
    press = null;
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  // A long-press also synthesises a click. Drop that one click.
  const origClick = onClick;
  mlMap.off("click", origClick);
  mlMap.on("click", (e) => {
    if (swallowed) {
      swallowed = false;
      return;
    }
    origClick(e);
  });

  let clusterTimer = 0;
  const reg: Reg = {
    mlMap,
    ml,
    pins: [],
    bubbles: [],
    schedule: () => {
      window.clearTimeout(clusterTimer);
      clusterTimer = window.setTimeout(() => rebuildClusters(reg), 60);
    },
  };

  const api: LMap = {
    setView(c, z) {
      mlMap.jumpTo({ center: [c[1], c[0]], zoom: z });
      return api;
    },
    on(ev, fn) {
      const set = listeners.get(ev) ?? new Set();
      set.add(fn);
      listeners.set(ev, set);
    },
    off(ev, fn) {
      if (!fn) listeners.delete(ev);
      else listeners.get(ev)?.delete(fn);
    },
    invalidateSize() {
      mlMap.resize();
    },
    fitBounds(pts, o) {
      const b = boundsOf(pts);
      if (!b) return;
      mlMap.fitBounds(b, { padding: paddingOf(o), maxZoom: typeof o?.maxZoom === "number" ? o.maxZoom : 17 });
    },
    remove() {
      window.clearTimeout(clusterTimer);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      for (const b of reg.bubbles) b.remove();
      for (const p of reg.pins) {
        if (p.onMap) p.marker.remove();
      }
      reg.pins = [];
      try {
        mlMap.remove();
      } catch {
        /* already removed */
      }
      regs.delete(api);
    },
    getZoom: () => mlMap.getZoom(),
    removeLayer(layer: unknown) {
      (layer as { remove?: () => void } | null)?.remove?.();
    },
    flyTo(c, z, o) {
      const dur = typeof o?.duration === "number" ? o.duration : 0.6;
      mlMap.flyTo({ center: [c[1], c[0]], zoom: z ?? mlMap.getZoom(), duration: dur > 20 ? dur : dur * 1000 });
      return api;
    },
    getCenter: () => {
      const c = mlMap.getCenter();
      return { lat: c.lat, lng: c.lng };
    },
    getBearing: () => mlMap.getBearing(),
    resetNorth: () => mlMap.easeTo({ bearing: 0, pitch: 0, duration: 280 }),
  };

  regs.set(api, reg);
  mlMap.on("moveend", () => reg.schedule());
  mlMap.on("zoomend", () => reg.schedule());
  const resize = () => mlMap.resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(el);
  const prevRemove = api.remove.bind(api);
  api.remove = () => {
    ro.disconnect();
    prevRemove();
  };

  const setStyle = (s: WumpMapStyle) => {
    current = s;
    mlMap.setStyle(resolveWumpStyle(s));
  };
  return { map: api, setStyle, style: () => current };
}
