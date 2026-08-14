import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// A banner across the top of the content area: a time-aware greeting and date
// on the left; live weather, the clock, and an expandable profile menu on the
// right.
export default function Header() {
  const { user, token, logout } = useAuth();
  const { themeName, toggleTheme } = useThemeMode();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  // Close the profile menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const name = token ? (user?.username || "") : "";
  const initial = (user?.username || "?").charAt(0).toUpperCase();

  const go = (path) => { setMenuOpen(false); navigate(path); };
  const handleLogout = () => { setMenuOpen(false); logout(); navigate("/login"); };

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

        {token ? (
          <div style={styles.profileWrap} ref={menuRef}>
            <button
              style={styles.avatarBtn}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Profile menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span style={styles.avatar}>{initial}</span>
              {!isMobile && <span style={styles.avatarName}>{user?.username || "Account"}</span>}
              <span style={styles.caret}>▾</span>
            </button>

            {menuOpen && (
              <div style={styles.menu} role="menu">
                <div style={styles.menuHeader}>
                  <div style={styles.menuName}>{user?.username || "Logged in"}</div>
                  {user?.role && <div style={styles.menuRole}>{user.role}</div>}
                </div>
                <button style={styles.menuItem} role="menuitem" onClick={() => go("/accounts")}>
                  <span style={styles.menuIcon} role="img" aria-label="profile">👤</span> Profile
                </button>
                <button style={styles.menuItem} role="menuitem" onClick={() => go("/settings")}>
                  <span style={styles.menuIcon} role="img" aria-label="settings">⚙️</span> Settings
                </button>
                <button style={styles.menuItem} role="menuitem" onClick={() => go("/change-password")}>
                  <span style={styles.menuIcon} role="img" aria-label="password">🔑</span> Change password
                </button>
                <div style={styles.menuDivider} />
                <button style={styles.menuItem} role="menuitem" onClick={toggleTheme}>
                  <span style={styles.menuIcon} role="img" aria-label="theme">{themeName === "dark" ? "☀️" : "🌙"}</span>
                  {themeName === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <div style={styles.menuDivider} />
                <button style={{ ...styles.menuItem, ...styles.menuDanger }} role="menuitem" onClick={handleLogout}>
                  <span style={styles.menuIcon} role="img" aria-label="log out">⎋</span> Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button style={styles.loginBtn} onClick={() => navigate("/login")}>Log in</button>
        )}
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
  clock: { fontWeight: "bold", opacity: 0.95, fontVariantNumeric: "tabular-nums" },

  // ---- Profile menu ----
  profileWrap: { position: "relative", flexShrink: 0 },
  avatarBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(255,255,255,0.16)",
    border: "none",
    cursor: "pointer",
    color: colors.onSolid,
    padding: "6px 10px",
    borderRadius: 22
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: colors.onSolid,
    color: colors.primary,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: 14,
    flexShrink: 0
  },
  avatarName: {
    fontWeight: "bold",
    fontSize: 14,
    maxWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  caret: { fontSize: 12, opacity: 0.9 },
  menu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    minWidth: 210,
    background: colors.surface,
    color: colors.text,
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
    border: `1px solid ${colors.border}`,
    padding: 6,
    zIndex: 400
  },
  menuHeader: {
    padding: "8px 10px",
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 4
  },
  menuName: { fontWeight: "bold", fontSize: 14 },
  menuRole: { fontSize: 12, opacity: 0.6, textTransform: "capitalize" },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: colors.text,
    padding: "10px 10px",
    borderRadius: 8,
    fontSize: 14
  },
  menuIcon: { width: 18, textAlign: "center", flexShrink: 0 },
  menuDivider: { height: 1, background: colors.border, margin: "4px 0" },
  menuDanger: { color: colors.dangerSolid, fontWeight: "bold" },
  loginBtn: {
    background: "rgba(255,255,255,0.16)",
    border: "none",
    cursor: "pointer",
    color: colors.onSolid,
    padding: "8px 16px",
    borderRadius: 10,
    fontWeight: "bold",
    fontSize: 14
  }
};
