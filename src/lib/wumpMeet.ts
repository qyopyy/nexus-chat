/** Great-circle helpers for meeting a friend halfway on the Wump map. */

export type LatLng = { lat: number; lng: number };

const EARTH_M = 6_371_000;

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

function deg(radian: number) {
  return (radian * 180) / Math.PI;
}

function wrapLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function distanceMeters(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north, 0–360. */
export function bearingDegrees(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point halfway along the great-circle path. */
export function geographicMidpoint(a: LatLng, b: LatLng): LatLng {
  const lat1 = rad(a.lat);
  const lng1 = rad(a.lng);
  const lat2 = rad(b.lat);
  const dLng = rad(b.lng - a.lng);
  const bx = Math.cos(lat2) * Math.cos(dLng);
  const by = Math.cos(lat2) * Math.sin(dLng);
  const lat = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2),
  );
  const lng = lng1 + Math.atan2(by, Math.cos(lat1) + bx);
  return { lat: deg(lat), lng: wrapLng(deg(lng)) };
}
