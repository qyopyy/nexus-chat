/** Rich Wump place / route cards embedded in a Nexus message body. */

export type WumpCard =
  | { kind: "place"; lat: number; lng: number; name: string }
  | { kind: "route"; mode: "walk" | "bike" | "drive"; points: [number, number][]; name: string };

export const WUMP_CARD_RE = /\[wump-card:(place|route)\|([^\]]+)\]/;

function safeName(raw: string) {
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    /* keep the raw token */
  }
  return name.replace(/\s+/g, " ").trim().slice(0, 120);
}

function finitePair(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function formatWumpCard(card: WumpCard): string {
  if (card.kind === "place") {
    const name = encodeURIComponent(card.name.slice(0, 120));
    return `[wump-card:place|${card.lat.toFixed(5)}|${card.lng.toFixed(5)}|${name}]`;
  }
  const pts = card.points
    .slice(0, 8)
    .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join(";");
  const name = encodeURIComponent(card.name.slice(0, 120));
  return `[wump-card:route|${card.mode}|${pts}|${name}]`;
}

export function wumpCardMessage(card: WumpCard): string {
  const line = card.kind === "place" ? `📍 ${card.name}` : `🛣 ${card.name}`;
  return `${line}\n${formatWumpCard(card)}`;
}

export function parseWumpCard(text: string): WumpCard | null {
  const m = text.match(WUMP_CARD_RE);
  if (!m) return null;
  const rest = m[2].split("|");
  if (m[1] === "place") {
    const lat = Number(rest[0]);
    const lng = Number(rest[1]);
    if (!finitePair(lat, lng)) return null;
    return { kind: "place", lat, lng, name: safeName(rest.slice(2).join("|")) || "Pinned place" };
  }
  const mode = rest[0] === "bike" || rest[0] === "drive" ? rest[0] : "walk";
  const points = (rest[1] ?? "")
    .split(";")
    .map((pair) => {
      const [a, b] = pair.split(",").map(Number);
      return finitePair(a, b) ? ([a, b] as [number, number]) : null;
    })
    .filter((p): p is [number, number] => !!p);
  if (points.length < 2) return null;
  return { kind: "route", mode, points, name: safeName(rest.slice(2).join("|")) || "Route" };
}

export function wumpCardPreview(text: string): string | null {
  if (!text.includes("[wump-card:") && !text.includes("[bump-pin:")) return null;
  const clean = text
    .replace(WUMP_CARD_RE, "")
    .replace(/\[bump-pin:[^\]]+\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
  return clean || "📍 Location";
}
