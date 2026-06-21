import { Link } from "react-router-dom";

export default function Dashboard() {
  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <h1 style={styles.title}>Weather Station Dashboard</h1>

        <p style={styles.subtitle}>
          Monitor live weather station data, radar, wind, historical charts,
          analytics, and account tools from one local dashboard.
        </p>

        <div style={styles.actions}>
          <Link to="/weather-center" style={styles.primaryButton}>
            Open Weather Center
          </Link>

          <Link to="/accounts" style={styles.secondaryButton}>
            View Account
          </Link>
        </div>
      </section>


    </div>
  );
}

function FeatureCard({ title, text }) {
  return (
    <div style={styles.card}>
      <h2>{title}</h2>
      <p style={styles.cardText}>{text}</p>
    </div>
  );
}

const styles = {
  page: {
    padding: 20,
    background: "#0f172a",
    minHeight: "100vh",
    color: "white"
  },
  hero: {
    background: "#1e293b",
    borderRadius: 20,
    padding: 40,
    marginBottom: 30
  },
  title: {
    fontSize: 46,
    marginBottom: 15
  },
  subtitle: {
    fontSize: 20,
    maxWidth: 800,
    opacity: 0.8,
    lineHeight: 1.5
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 25
  },
  primaryButton: {
    background: "#38bdf8",
    color: "#0f172a",
    padding: "12px 18px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: "bold"
  },
  secondaryButton: {
    background: "#334155",
    color: "white",
    padding: "12px 18px",
    borderRadius: 10,
    textDecoration: "none"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 20
  },
  card: {
    background: "#1e293b",
    borderRadius: 16,
    padding: 20
  },
  cardText: {
    opacity: 0.75,
    lineHeight: 1.5
  }
};