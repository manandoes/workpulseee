import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "WorkPulse — Agency Operations & Employee Management";

/**
 * Generated rather than a static asset — no image to produce or keep in
 * sync, and it reads the same brand tokens (`app/globals.css`) the rest of
 * the marketing site uses.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 24,
          padding: "80px 96px",
          backgroundColor: "#4a3a2c",
          color: "#fffbf2",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 20px",
            borderRadius: 999,
            backgroundColor: "#f2b705",
            color: "#4a3a2c",
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          WorkPulse
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.15 }}>
          Run your whole agency
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.15 }}>
          from one dashboard.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#c9b8a4" }}>
          Employees · Projects · Tasks · Performance · Operations
        </div>
      </div>
    ),
    { ...size }
  );
}
