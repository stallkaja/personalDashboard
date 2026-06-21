export default function WindCompass({ direction = 0, speed = 0, gust = 0 }) {
  const dir = Number(direction || 0);
  const compassLabel = getCompassDirection(dir);

  return (
    <div style={styles.card}>
      <h2>Wind Compass</h2>

      <div style={styles.compass}>
        <div style={styles.north}>N</div>
        <div style={styles.east}>E</div>
        <div style={styles.south}>S</div>
        <div style={styles.west}>W</div>

        <div
          style={{
            ...styles.needle,
            transform: `translate(-50%, -100%) rotate(${dir}deg)`
          }}
        />

        <div style={styles.centerDot} />
      </div>

      <div style={styles.info}>
        <div style={styles.bigDirection}>{compassLabel}</div>
        <div>{dir.toFixed(0)}°</div>
        <div>{Number(speed || 0).toFixed(1)} mph</div>
        <div>Gust {Number(gust || 0).toFixed(1)} mph</div>
      </div>
    </div>
  );
}

function getCompassDirection(degrees) {
  const directions = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW"
  ];

  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

const styles = {
  card: {
    background: "#1e293b",
    borderRadius: 16,
    padding: 20,
    color: "white",
    textAlign: "center"
  },
  compass: {
    position: "relative",
    width: 220,
    height: 220,
    margin: "20px auto",
    borderRadius: "50%",
    border: "3px solid #475569",
    background: "radial-gradient(circle, #334155 0%, #0f172a 70%)"
  },
  needle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 5,
    height: 85,
    background: "#38bdf8",
    transformOrigin: "bottom center",
    borderRadius: 999,
    transition: "transform 0.6s ease"
  },
  centerDot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 16,
    height: 16,
    background: "white",
    borderRadius: "50%",
    transform: "translate(-50%, -50%)"
  },
  north: {
    position: "absolute",
    top: 8,
    left: "50%",
    transform: "translateX(-50%)",
    fontWeight: "bold"
  },
  east: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    fontWeight: "bold"
  },
  south: {
    position: "absolute",
    bottom: 8,
    left: "50%",
    transform: "translateX(-50%)",
    fontWeight: "bold"
  },
  west: {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    fontWeight: "bold"
  },
  info: {
    fontSize: 16,
    lineHeight: 1.6
  },
  bigDirection: {
    fontSize: 32,
    fontWeight: "bold"
  }
};