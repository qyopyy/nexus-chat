import { ImageResponse } from "next/og";

export const alt = "Nexus Distro — music distribution to Spotify, Apple Music, TikTok and 150+ stores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card for /distro and the store pages — red/black 999 look. */
export default function Image() {
  const stores = ["Spotify", "Apple Music", "TikTok", "YouTube Music", "Amazon", "Deezer", "+150"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(ellipse 90% 70% at 50% -10%, #6b0000 0%, #120303 55%, #050101 100%)", color: "#f7eeee", fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", right: 40, bottom: -40, fontSize: 380, fontWeight: 900, letterSpacing: -30, color: "rgba(225,6,0,0.10)" }}>999</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, background: "#e10600", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, borderRadius: 10 }}>NX</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>Nexus Distro</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 }}>Put your music everywhere.</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, color: "#c49a9a" }}>Keep all of it.</div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {stores.map((s) => (
            <div key={s} style={{ display: "flex", padding: "10px 18px", border: "1px solid #5a1818", borderRadius: 8, fontSize: 24, color: "#ecd8d8", background: "rgba(20,5,5,0.7)" }}>
              {s}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
