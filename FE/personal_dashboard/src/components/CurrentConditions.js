import { colors } from "../styles/theme";

export default function CurrentConditions({
  temp,
  feelsLike,
  dewPoint,
  humidity,
  wind,
  gust,
  pressure,
  uv,
  rain,
  solar
}) {
  return (
    <div style={styles.card}>
      <h2>Current Conditions</h2>

      <div style={styles.tempRow}>
        <div style={styles.temp}>{Math.round(temp)}°</div>
        <div style={styles.feelsLike}>Feels like {Math.round(feelsLike)}°</div>
      </div>

      <div style={styles.grid}>
        <Metric label="Dew Point" value={`${Math.round(dewPoint)}°`} />
        <Metric label="Humidity" value={`${humidity}%`} />
        <Metric label="Wind" value={`${wind} mph`} />
        <Metric label="Wind Gust" value={`${gust} mph`} />
        <Metric label="Pressure" value={`${pressure} inHg`} />
        <Metric label="UV Index" value={uv} />
        <Metric label="Rain Today" value={`${rain} in`} />
        <Metric label="Solar Radiation" value={`${Math.round(solar)} W/m²`} />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.metric}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{value}</div>
    </div>
  );
}

const styles = {
  card: {
    background: colors.surface,
    borderRadius: 16,
    padding: 20,
    color: colors.text
  },

  tempRow: {
    textAlign: "center",
    marginBottom: 20
  },

  temp: {
    fontSize: 72,
    fontWeight: "bold",
    lineHeight: 1
  },

  feelsLike: {
    opacity: 0.7,
    fontSize: 16,
    marginTop: 4
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
    gap: 15
  },

  metric: {
    background: colors.border,
    borderRadius: 10,
    padding: 12
  },

  label: {
    opacity: 0.7,
    fontSize: 14
  },

  value: {
    fontSize: 22,
    fontWeight: "bold"
  }
};
