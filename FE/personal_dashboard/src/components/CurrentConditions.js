export default function CurrentConditions({
  temp,
  humidity,
  wind,
  gust,
  pressure,
  uv,
  rain
}) {
  return (
    <div style={styles.card}>
      <h2>Current Conditions</h2>

      <div style={styles.temp}>
        {Math.round(temp)}°
      </div>

      <div style={styles.grid}>
        <Metric label="Humidity" value={`${humidity}%`} />
        <Metric label="Wind" value={`${wind} mph`} />
        <Metric label="Wind Gust" value={`${gust} mph`} />
        <Metric label="Pressure" value={`${pressure} inHg`} />
        <Metric label="UV Index" value={uv} />
        <Metric label="Rain Today" value={`${rain} in`} />
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
    background: "#1e293b",
    borderRadius: 16,
    padding: 20,
    color: "white"
  },

  temp: {
    textAlign: "center",
    fontSize: 72,
    fontWeight: "bold",
    marginBottom: 20
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
    gap: 15
  },

  metric: {
    background: "#334155",
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