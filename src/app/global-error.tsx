"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0b0d12", color: "#dbdee1", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <h2 style={{ margin: "12px 0 8px", fontSize: 28 }}>Nexus crashed</h2>
            <p style={{ color: "#949ba4", fontSize: 14 }}>{error.message || "A fatal UI error occurred."}</p>
            <button
              onClick={reset}
              style={{ marginTop: 20, background: "#2aabee", color: "#fff", border: 0, borderRadius: 999, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
