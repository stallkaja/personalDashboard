import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// A banner across the top of the content area: a time-aware greeting and date
// on the left, and constant at-a-glance info on the right — live weather from
// the station plus the current time.
export default function Header() {
  const { user, token } = useAuth();
  const isMobile = useIsMobile();
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // Poll the latest station reading (public endpoint, no auth needed).
  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(`${API_URL}/latest`)
        .then((r) => r.json())
        .then((d) => { if (active) setWeather(d.data || null); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 120000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const name = token ? (user?.username || "") : "";

  return (
    <header
      style={{
        ...styles.header,
        padding: isMobile ? "14px 16px" : "18px 28px",
        flexWrap: isMobile ? "wrap" : "nowrap"
      }}
    >
      <div style={styles.left}>
        <div style={{ ...styles.greeting, fontSize: isMobile ? 19 : 24 }}>
          {greetingFor(now.getHours())}{name ? `, ${name}` : ""} <span role="img" aria-label="wave">👋</span>
        </div>
        <div style={styles.date}>{dateStr}</div>
      </div>

      <div style={styles.info}>
        {weather && (
          <div style={styles.weather}>
            <span style={styles.temp}>{Math.round(weather.tempf)}°F</span>
            <span style={styles.metric}>
              Feels {Math.round(weather.feels_like ?? weather.tempf)}°
            </span>
            <span style={styles.metric}><span role="img" aria-label="humidity">💧</span> {weather.humidity}%</span>
            <span style={styles.metric}>
              <span role="img" aria-label="wind">💨</span> {Math.round(weather.windspeedmph)} mph
            </span>
          </div>
        )}
        <div style={{ ...styles.clock, fontSize: isMobile ? 16 : 20 }}>{timeStr}</div>
      </div>
    </header>
  );
}

const styles = {
  header: {
    background: `linear-gradient(120deg, ${colors.primary}, ${colors.primaryStrong})`,
    color: colors.onSolid,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  left: { minWidth: 0 },
  greeting: { fontWeight: "bold", lineHeight: 1.2 },
  date: { opacity: 0.9, fontSize: 14, marginTop: 4 },
  info: { display: "flex", alignItems: "center", gap: 14, flexShrink: 0 },
  weather: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(255,255,255,0.16)",
    padding: "8px 14px",
    borderRadius: 12
  },
  temp: { fontWeight: "bold", fontSize: 20 },
  metric: { fontSize: 13, opacity: 0.95, whiteSpace: "nowrap" },
  clock: { fontWeight: "bold", opacity: 0.95, fontVariantNumeric: "tabular-nums" }
};
