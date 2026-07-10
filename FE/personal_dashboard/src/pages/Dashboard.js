import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import useUserTimezone from "../hooks/useUserTimezone";
import theme, { colors } from "../styles/theme";

import { API_URL } from "../config";
import { dayKeyInTz, formatTimeInTz } from "../utils/time";

export default function Dashboard() {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const tz = useUserTimezone();

  const [todayEvents, setTodayEvents] = useState([]);
  const [todayChores, setTodayChores] = useState([]);
  const [todayMeals, setTodayMeals] = useState([]);
  const [weather, setWeather] = useState(null);
  const [dashboardTitle, setDashboardTitle] = useState("Family Dashboard");
  const [familyPhoto, setFamilyPhoto] = useState("");

  const todayKey = dayKeyInTz(new Date().toISOString(), tz);

  useEffect(() => {
    fetch(`${API_URL}/latest`)
      .then((res) => res.json())
      .then((data) => setWeather(data.data || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/settings/app`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.dashboard_title) setDashboardTitle(data.dashboard_title);
        setFamilyPhoto(data.family_photo || "");
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/events`, { headers })
      .then((res) => res.json())
      .then((data) => {
        const events = (data.events || []).filter(
          (e) => dayKeyInTz(e.start_time, tz) === todayKey
        );
        events.sort((a, b) => a.start_time.localeCompare(b.start_time));
        setTodayEvents(events);
      })
      .catch(() => {});

    fetch(`${API_URL}/chores`, { headers })
      .then((res) => res.json())
      .then((data) => {
        setTodayChores((data.chores || []).filter((c) => c.due_date === todayKey));
      })
      .catch(() => {});

    fetch(`${API_URL}/meals`, { headers })
      .then((res) => res.json())
      .then((data) => {
        setTodayMeals((data.meals || []).filter((m) => m.meal_date === todayKey));
      })
      .catch(() => {});
  }, [token, todayKey]);

  return (
    <div style={{ ...styles.page, padding: isMobile ? 12 : 20 }}>
      {familyPhoto && (
        <img
          src={`${API_URL}/photos/file/${familyPhoto}`}
          alt="Family"
          style={{ ...styles.familyPhoto, height: isMobile ? 160 : 280 }}
        />
      )}

      <section style={{ ...styles.hero, padding: isMobile ? 20 : 40 }}>
        <h1 style={{ ...styles.title, fontSize: isMobile ? 28 : 46 }}>
          {dashboardTitle}
        </h1>

        <p style={{ ...styles.subtitle, fontSize: isMobile ? 15 : 20 }}>
          Monitor live weather station data, radar, wind, historical charts,
          analytics, and account tools from one local dashboard.
        </p>

        <div style={styles.actions}>
          <Link to="/weather-center" style={styles.primaryButton}>
            Open Weather Center
          </Link>

          <Link to="/calendar" style={styles.secondaryButton}>
            Calendar
          </Link>

          <Link to="/chores" style={styles.secondaryButton}>
            Chores
          </Link>

          <Link to="/meal-planner" style={styles.secondaryButton}>
            Meal Planner
          </Link>

          <Link to="/shopping-list" style={styles.secondaryButton}>
            Shopping List
          </Link>

          <Link to="/accounts" style={styles.secondaryButton}>
            View Account
          </Link>
        </div>
      </section>

      <h2 style={styles.todayHeading}>Today</h2>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h3>🌤️ Weather Now</h3>

          {weather ? (
            <>
              <div style={styles.weatherTemp}>{Math.round(weather.tempf)}°F</div>
              <div style={styles.itemMeta}>
                Feels like {Math.round(weather.feels_like ?? weather.tempf)}° · {weather.humidity}% humidity
              </div>
              <div style={styles.itemMeta}>
                Wind {Math.round(weather.windspeedmph)} mph
                {weather.windgustmph ? ` (gust ${Math.round(weather.windgustmph)})` : ""}
              </div>
            </>
          ) : (
            <p style={styles.cardText}>Weather data unavailable.</p>
          )}

          <Link to="/weather-center" style={styles.cardLink}>Open Weather Center →</Link>
        </div>

        <div style={styles.card}>
          <h3>📅 Events</h3>

          {todayEvents.length === 0 ? (
            <p style={styles.cardText}>Nothing on the calendar today.</p>
          ) : (
            todayEvents.map((ev) => (
              <div key={ev.occurrence_id} style={styles.itemRow}>
                <strong>{ev.title}</strong>
                <div style={styles.itemMeta}>
                  {formatTimeInTz(ev.start_time, tz)}
                </div>
              </div>
            ))
          )}

          <Link to="/calendar" style={styles.cardLink}>Open Calendar →</Link>
        </div>

        <div style={styles.card}>
          <h3>🧹 Chores Due</h3>

          {todayChores.length === 0 ? (
            <p style={styles.cardText}>No chores due today.</p>
          ) : (
            todayChores.map((chore) => (
              <div key={chore.occurrence_id} style={styles.itemRow}>
                <strong
                  style={{
                    textDecoration: chore.is_done ? "line-through" : "none",
                    opacity: chore.is_done ? 0.5 : 1
                  }}
                >
                  {chore.title}
                </strong>
                {chore.assigned_to && <div style={styles.itemMeta}>{chore.assigned_to}</div>}
              </div>
            ))
          )}

          <Link to="/chores" style={styles.cardLink}>Open Chores →</Link>
        </div>

        <div style={styles.card}>
          <h3>🍽️ Today's Menu</h3>

          {todayMeals.length === 0 ? (
            <p style={styles.cardText}>No meals planned today.</p>
          ) : (
            todayMeals.map((meal) => (
              <div key={meal.id} style={styles.itemRow}>
                <strong>{meal.meal_type}:</strong> {meal.title}
              </div>
            ))
          )}

          <Link to="/meal-planner" style={styles.cardLink}>Open Meal Planner →</Link>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  familyPhoto: {
    width: "100%",
    objectFit: "cover",
    borderRadius: 20,
    marginBottom: 20,
    display: "block"
  },
  hero: {
    background: colors.surface,
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
    background: colors.primary,
    color: colors.primaryText,
    padding: "12px 18px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: "bold"
  },
  secondaryButton: {
    background: colors.border,
    color: colors.text,
    padding: "12px 18px",
    borderRadius: 10,
    textDecoration: "none"
  },
  todayHeading: {
    marginBottom: 16
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: 20
  },
  card: {
    background: colors.surface,
    borderRadius: 16,
    padding: 20,
    display: "flex",
    flexDirection: "column"
  },
  cardText: {
    opacity: 0.75,
    lineHeight: 1.5
  },
  itemRow: {
    borderTop: `1px solid ${colors.border}`,
    padding: "10px 0"
  },
  itemMeta: {
    opacity: 0.6,
    fontSize: 13
  },
  weatherTemp: {
    fontSize: 36,
    fontWeight: "bold",
    marginBottom: 6
  },
  cardLink: {
    color: colors.primary,
    textDecoration: "none",
    marginTop: 14,
    fontSize: 14
  }
};
