import { CircularProgressbarWithChildren, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { colors } from "../styles/theme";

// Ambient-Weather-style live dashboard: a uniform grid of sensor tiles, each
// focused on one reading with a big readout or a gauge dial.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

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
      {children}
    </div>
  );
}

function Gauge({ percent, color, big, small }) {
  return (
    <div style={styles.gaugeWrap}>
      <CircularProgressbarWithChildren
        value={clamp(percent, 0, 100)}
        strokeWidth={9}
        styles={buildStyles({
          pathColor: color,
          trailColor: colors.border,
          strokeLinecap: "round",
          pathTransitionDuration: 0.6
        })}
      >
        <div style={styles.gaugeBig}>{big}</div>
        {small && <div style={styles.gaugeSmall}>{small}</div>}
      </CircularProgressbarWithChildren>
    </div>
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
          {Math.round(temp)}<span style={styles.deg}>°F</span>
        </div>
        <div style={styles.subRow}>
          <span>Feels <strong>{Math.round(feelsLike)}°</strong></span>
          <span>Dew <strong>{Math.round(dewPoint)}°</strong></span>
        </div>
      </Tile>

      {/* Wind compass */}
      <Tile title="WIND" accent="#38bdf8">
        <div style={styles.gaugeWrap}>
          <div style={styles.compass}>
            <span style={{ ...styles.card_dir, top: 4, left: "50%", transform: "translateX(-50%)" }}>N</span>
            <span style={{ ...styles.card_dir, right: 6, top: "50%", transform: "translateY(-50%)" }}>E</span>
            <span style={{ ...styles.card_dir, bottom: 4, left: "50%", transform: "translateX(-50%)" }}>S</span>
            <span style={{ ...styles.card_dir, left: 6, top: "50%", transform: "translateY(-50%)" }}>W</span>
            <div style={{ ...styles.needle, transform: `translate(-50%, -100%) rotate(${windDir}deg)` }} />
            <div style={styles.compassCenter} />
          </div>
        </div>
        <div style={styles.windRead}>
          <strong>{compassDir(windDir)}</strong> · {wind.toFixed(1)} mph
        </div>
        <div style={styles.subRow}><span>Gust {gust.toFixed(1)} mph</span></div>
      </Tile>

      {/* Humidity gauge */}
      <Tile title="HUMIDITY" accent="#60a5fa">
        <Gauge percent={humidity} color="#60a5fa" big={`${Math.round(humidity)}%`} />
      </Tile>

      {/* UV index gauge (0–12 scale) */}
      <Tile title="UV INDEX" accent={uvi.color}>
        <Gauge
          percent={(clamp(uv, 0, 12) / 12) * 100}
          color={uvi.color}
          big={Number.isInteger(uv) ? uv : uv.toFixed(1)}
          small={uvi.label}
        />
      </Tile>

      {/* Barometric pressure gauge (typical 29.0–31.0 inHg window) */}
      <Tile title="PRESSURE" accent="#34d399">
        <Gauge
          percent={((clamp(pressure, 29, 31) - 29) / 2) * 100}
          color="#34d399"
          big={pressure.toFixed(2)}
          small="inHg"
        />
      </Tile>

      {/* Solar radiation gauge (0–1000 W/m²) */}
      <Tile title="SOLAR" accent="#facc15">
        <Gauge
          percent={(clamp(solar, 0, 1000) / 1000) * 100}
          color="#facc15"
          big={Math.round(solar)}
          small="W/m²"
        />
      </Tile>

      {/* Rain today */}
      <Tile title="RAIN TODAY" accent="#a78bfa">
        <div style={styles.rainWrap}>
          <div style={styles.rainDrop}>💧</div>
          <div style={styles.bigTemp}>
            {rain.toFixed(2)}<span style={styles.deg}> in</span>
          </div>
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
    alignItems: "center",
    minHeight: 210
  },
  tileTitle: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.8,
    marginBottom: 8
  },
  bigTemp: {
    fontSize: 52,
    fontWeight: "bold",
    lineHeight: 1.1,
    marginTop: "auto"
  },
  deg: { fontSize: 22, opacity: 0.7, fontWeight: "normal" },
  subRow: {
    display: "flex",
    gap: 14,
    marginTop: 10,
    marginBottom: "auto",
    fontSize: 13,
    opacity: 0.8
  },
  gaugeWrap: {
    width: 130,
    height: 130,
    margin: "auto 0"
  },
  gaugeBig: { fontSize: 24, fontWeight: "bold" },
  gaugeSmall: { fontSize: 12, opacity: 0.7, marginTop: 2 },

  // compass
  compass: {
    position: "relative",
    width: 130,
    height: 130,
    borderRadius: "50%",
    border: `2px solid ${colors.border}`,
    background: `radial-gradient(circle, ${colors.surfaceAlt} 55%, ${colors.surface} 100%)`
  },
  card_dir: { position: "absolute", fontSize: 11, opacity: 0.6, fontWeight: "bold" },
  needle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 4,
    height: 52,
    background: "#38bdf8",
    transformOrigin: "bottom center",
    borderRadius: 999,
    transition: "transform 0.6s ease"
  },
  compassCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: colors.text,
    transform: "translate(-50%, -50%)"
  },
  windRead: { marginTop: 10, fontSize: 15 },

  rainWrap: {
    margin: "auto 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  },
  rainDrop: { fontSize: 40, marginBottom: 4 }
};
