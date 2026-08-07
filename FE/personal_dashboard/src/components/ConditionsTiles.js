import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { colors } from "../styles/theme";

// Ambient-Weather-style live dashboard: a uniform grid of sensor tiles. Each
// tile shows a graphic (a gauge dial or compass) AND the actual reading as a
// large, always-visible number so the value is never hidden inside the SVG.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Format a numeric value; shows an em dash if the value is missing.
const fmt = (n, dp = 0) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toFixed(dp);

function uvInfo(uv) {
  if (uv >= 11) return { label: "Extreme", color: "#a855f7" };
  if (uv >= 8) return { label: "Very High", color: "#ef4444" };
  if (uv >= 6) return { label: "High", color: "#f97316" };
  if (uv >= 3) return { label: "Moderate", color: "#eab308" };
  return { label: "Low", color: "#22c55e" };
}

function compassDir(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function Tile({ title, accent, children }) {
  return (
    <div style={styles.tile}>
      <div style={{ ...styles.tileTitle, color: accent || colors.textMuted }}>{title}</div>
      <div style={styles.tileBody}>{children}</div>
    </div>
  );
}

// A gauge dial (graphic) with the value shown as large text beneath it.
function GaugeTile({ title, accent, percent, color, value, unit, caption }) {
  return (
    <Tile title={title} accent={accent}>
      <div style={styles.gaugeWrap}>
        <CircularProgressbar
          value={clamp(percent, 0, 100)}
          strokeWidth={10}
          styles={buildStyles({
            pathColor: color,
            trailColor: colors.border,
            strokeLinecap: "round",
            pathTransitionDuration: 0.6
          })}
        />
      </div>
      <div style={styles.value}>
        {value}<span style={styles.unit}>{unit}</span>
      </div>
      {caption && <div style={{ ...styles.caption, color }}>{caption}</div>}
    </Tile>
  );
}

export default function ConditionsTiles({
  temp, feelsLike, dewPoint, humidity, wind, gust, windDir, pressure, uv, rain, solar
}) {
  const uvi = uvInfo(uv);

  return (
    <div style={styles.grid}>
      {/* Outdoor temperature — the headline tile */}
      <Tile title="OUTDOOR TEMP" accent="#ff7a45">
        <div style={styles.bigTemp}>
          {fmt(temp)}<span style={styles.deg}>°F</span>
        </div>
        <div style={styles.subRow}>
          <span>Feels <strong>{fmt(feelsLike)}°</strong></span>
          <span>Dew <strong>{fmt(dewPoint)}°</strong></span>
        </div>
      </Tile>

      {/* Wind compass */}
      <Tile title="WIND" accent="#38bdf8">
        <div style={styles.compass}>
          <span style={{ ...styles.cardDir, top: 4, left: "50%", transform: "translateX(-50%)" }}>N</span>
          <span style={{ ...styles.cardDir, right: 6, top: "50%", transform: "translateY(-50%)" }}>E</span>
          <span style={{ ...styles.cardDir, bottom: 4, left: "50%", transform: "translateX(-50%)" }}>S</span>
          <span style={{ ...styles.cardDir, left: 6, top: "50%", transform: "translateY(-50%)" }}>W</span>
          <div style={{ ...styles.needle, transform: `translate(-50%, -100%) rotate(${windDir}deg)` }} />
          <div style={styles.compassCenter} />
        </div>
        <div style={styles.value}>
          {fmt(wind, 1)}<span style={styles.unit}> mph</span>
        </div>
        <div style={styles.caption}>{compassDir(windDir)} ({fmt(windDir)}°) · gust {fmt(gust, 1)}</div>
      </Tile>

      <GaugeTile
        title="HUMIDITY" accent="#60a5fa"
        percent={humidity} color="#60a5fa" value={fmt(humidity)} unit="%"
      />

      <GaugeTile
        title="UV INDEX" accent={uvi.color}
        percent={(clamp(uv, 0, 12) / 12) * 100} color={uvi.color}
        value={fmt(uv, uv >= 10 ? 0 : 1)} unit="" caption={uvi.label}
      />

      <GaugeTile
        title="PRESSURE" accent="#34d399"
        percent={((clamp(pressure, 29, 31) - 29) / 2) * 100} color="#34d399"
        value={fmt(pressure, 2)} unit=" inHg"
      />

      <GaugeTile
        title="SOLAR" accent="#facc15"
        percent={(clamp(solar, 0, 1000) / 1000) * 100} color="#facc15"
        value={fmt(solar)} unit=" W/m²"
      />

      {/* Rain today */}
      <Tile title="RAIN TODAY" accent="#a78bfa">
        <div style={styles.rainDrop}>💧</div>
        <div style={styles.value}>
          {fmt(rain, 2)}<span style={styles.unit}> in</span>
        </div>
      </Tile>
    </div>
  );
}

const TILE_MIN = 210;

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${TILE_MIN}px, 1fr))`,
    gap: 16,
    marginBottom: 24
  },
  tile: {
    background: colors.surface,
    borderRadius: 16,
    padding: "16px 16px 18px",
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    minHeight: 210
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.8,
    marginBottom: 8
  },
  tileBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  },
  value: {
    fontSize: 30,
    fontWeight: "bold",
    lineHeight: 1.1,
    marginTop: 10
  },
  unit: { fontSize: 15, opacity: 0.7, fontWeight: "normal" },
  caption: { fontSize: 12, opacity: 0.85, marginTop: 4, fontWeight: "bold" },

  bigTemp: {
    fontSize: 52,
    fontWeight: "bold",
    lineHeight: 1.1
  },
  deg: { fontSize: 22, opacity: 0.7, fontWeight: "normal" },
  subRow: {
    display: "flex",
    gap: 14,
    marginTop: 12,
    fontSize: 13,
    opacity: 0.8
  },

  gaugeWrap: { width: 104, height: 104 },

  // compass
  compass: {
    position: "relative",
    width: 104,
    height: 104,
    borderRadius: "50%",
    border: `2px solid ${colors.border}`,
    background: `radial-gradient(circle, ${colors.surfaceAlt} 55%, ${colors.surface} 100%)`
  },
  cardDir: { position: "absolute", fontSize: 10, opacity: 0.6, fontWeight: "bold" },
  needle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 4,
    height: 42,
    background: "#38bdf8",
    transformOrigin: "bottom center",
    borderRadius: 999,
    transition: "transform 0.6s ease"
  },
  compassCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 11,
    height: 11,
    borderRadius: "50%",
    background: colors.text,
    transform: "translate(-50%, -50%)"
  },
  rainDrop: { fontSize: 44 }
};
