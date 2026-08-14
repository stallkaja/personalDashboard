import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import { colors } from "../styles/theme";

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// A slim banner across the top of the content area: a time-aware greeting,
// the full date, and a live clock. Complements the left sidebar navigation.
export default function Header() {
  const { user, token } = useAuth();
  const isMobile = useIsMobile();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const name = token ? (user?.username || "") : "";

  return (
    <header style={{ ...styles.header, padding: isMobile ? "16px 16px" : "22px 28px" }}>
      <div style={styles.left}>
        <div style={{ ...styles.greeting, fontSize: isMobile ? 20 : 26 }}>
          {greetingFor(now.getHours())}{name ? `, ${name}` : ""} <span role="img" aria-label="wave">👋</span>
        </div>
        <div style={styles.date}>{dateStr}</div>
      </div>
      <div style={{ ...styles.clock, fontSize: isMobile ? 18 : 22 }}>{timeStr}</div>
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
  clock: { fontWeight: "bold", opacity: 0.95, flexShrink: 0, fontVariantNumeric: "tabular-nums" }
};
