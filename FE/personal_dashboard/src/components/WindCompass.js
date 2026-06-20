import React from "react";

export default function WindCompass({ direction = 0, speed = 0, gust = 0 }) {
  return (
    <div
      style={{
        background: "#1f2937",
        borderRadius: 12,
        padding: 20,
        color: "white",
        textAlign: "center"
      }}
    >
      <h3>Wind</h3>

      <div
        style={{
          position: "relative",
          width: 220,
          height: 220,
          margin: "0 auto"
        }}
      >
        {/* Compass Circle */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: "4px solid #4b5563"
          }}
        />

        {/* Cardinal Directions */}
        <div style={labelStyle("50%", "5px")}>N</div>
        <div style={labelStyle("95%", "50%")}>E</div>
        <div style={labelStyle("50%", "95%")}>S</div>
        <div style={labelStyle("5px", "50%")}>W</div>

        {/* Needle */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 4,
            height: 90,
            background: "#ef4444",
            transformOrigin: "bottom center",
            transform: `translate(-50%, -100%) rotate(${direction}deg)`,
            borderRadius: 2,
            transition: "transform 0.5s ease"
          }}
        />

        {/* Center Dot */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 16,
            height: 16,
            background: "white",
            borderRadius: "50%",
            transform: "translate(-50%, -50%)"
          }}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <div>Direction: {direction.toFixed(0)}°</div>
        <div>Speed: {speed.toFixed(1)} mph</div>
        <div>Gust: {gust.toFixed(1)} mph</div>
      </div>
    </div>
  );
}

function labelStyle(x, y) {
  return {
    position: "absolute",
    left: x,
    top: y,
    transform: "translate(-50%, -50%)",
    fontWeight: "bold",
    fontSize: 18
  };
}