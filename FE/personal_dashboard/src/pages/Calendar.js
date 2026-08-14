import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import useUserTimezone from "../hooks/useUserTimezone";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";
import { dayKeyInTz, tzAbbrev } from "../utils/time";

function toDateKey(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export default function Calendar() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const tz = useUserTimezone();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [chores, setChores] = useState([]);
  const [meals, setMeals] = useState([]);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [ev, ch, me] = await Promise.all([
        fetch(`${API_URL}/events`, { headers }).then((r) => r.json()),
        fetch(`${API_URL}/chores`, { headers }).then((r) => r.json()),
        fetch(`${API_URL}/meals`, { headers }).then((r) => r.json())
      ]);
      setEvents(ev.events || []);
      setChores(ch.chores || []);
      setMeals(me.meals || []);
    } catch {
      setError("Failed to load calendar items.");
    }
  }, [token]);

  useEffect(() => {
    if (token) loadAll();
  }, [token, loadAll]);

  // Combine events, to-dos, and meals into a single per-day list of chips.
  const itemsByDate = {};
  const push = (key, item) => {
    if (!key) return;
    (itemsByDate[key] = itemsByDate[key] || []).push(item);
  };
  events.forEach((e) =>
    push(dayKeyInTz(e.start_time, tz), {
      id: `e-${e.occurrence_id}`, icon: "📅", label: e.title, done: false
    })
  );
  chores.forEach((c) =>
    push(c.due_date, {
      id: `c-${c.occurrence_id}`, icon: "✅", label: c.title, done: c.is_done
    })
  );
  meals.forEach((m) =>
    push(m.meal_date, {
      id: `m-${m.id}`, icon: "🍽️", label: m.title, done: false
    })
  );

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const monthLabel = firstOfMonth.toLocaleString("default", { month: "long", year: "numeric" });
  const todayKey = dayKeyInTz(today.toISOString(), tz);

  return (
    <div style={{ ...styles.page, padding: isMobile ? 10 : 20 }}>
      <h1>📅 Family Calendar</h1>
      <p style={styles.tzNote}>
        Events, to-dos, and meals in one place · times in {tz} ({tzAbbrev(tz)})
      </p>

      <div style={styles.legend}>
        <span style={styles.legendItem}>📅 Event</span>
        <span style={styles.legendItem}>✅ To-Do</span>
        <span style={styles.legendItem}>🍽️ Meal</span>
        <span style={styles.legendHint}>Tap a day to add or edit</span>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={{ ...styles.card, padding: isMobile ? 10 : 20 }}>
        <div style={styles.monthHeader}>
          <button style={styles.navButton} onClick={goPrevMonth}>‹</button>
          <h2 style={{ ...styles.monthLabel, minWidth: isMobile ? 140 : 220, fontSize: isMobile ? 16 : 22 }}>
            {monthLabel}
          </h2>
          <button style={styles.navButton} onClick={goNextMonth}>›</button>
        </div>

        <div style={styles.weekRow}>
          {(isMobile
            ? ["S", "M", "T", "W", "T", "F", "S"]
            : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
          ).map((d, idx) => (
            <div key={idx} style={styles.weekdayLabel}>{d}</div>
          ))}
        </div>

        <div style={styles.grid}>
          {cells.map((day, idx) => {
            if (day === null) return <div key={idx} style={styles.emptyCell} />;

            const dateKey = toDateKey(viewYear, viewMonth, day);
            const dayItems = itemsByDate[dateKey] || [];
            const isToday = dateKey === todayKey;
            const maxChips = isMobile ? 2 : 4;

            return (
              <div
                key={idx}
                style={{
                  ...styles.dayCell,
                  minHeight: isMobile ? 56 : 92,
                  padding: isMobile ? 3 : 6,
                  ...(isToday ? styles.todayCell : {})
                }}
                onClick={() => navigate(`/calendar/${dateKey}`)}
              >
                <div style={{ ...styles.dayNumber, fontSize: isMobile ? 12 : 14 }}>{day}</div>

                {dayItems.slice(0, maxChips).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      ...styles.chip,
                      fontSize: isMobile ? 9 : 11,
                      ...(item.done ? styles.chipDone : {})
                    }}
                  >
                    {item.icon} {item.label}
                  </div>
                ))}

                {dayItems.length > maxChips && (
                  <div style={styles.moreChip}>+{dayItems.length - maxChips}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  error: theme.error,
  tzNote: { opacity: 0.6, fontSize: 13, marginTop: -8, marginBottom: 12 },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 16,
    fontSize: 13
  },
  legendItem: { opacity: 0.85 },
  legendHint: { opacity: 0.5, fontStyle: "italic" },
  monthHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: 16
  },
  monthLabel: { margin: 0, minWidth: 220, textAlign: "center" },
  navButton: {
    padding: "6px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 18
  },
  weekRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 },
  weekdayLabel: { textAlign: "center", opacity: 0.6, fontSize: 13, padding: "4px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 },
  emptyCell: { minHeight: 92 },
  dayCell: {
    minHeight: 92,
    background: colors.surfaceMuted,
    borderRadius: 8,
    padding: 6,
    cursor: "pointer",
    border: `1px solid ${colors.border}`,
    overflow: "hidden"
  },
  todayCell: { border: `1px solid ${colors.primary}` },
  dayNumber: { fontWeight: "bold", marginBottom: 4, fontSize: 14 },
  chip: {
    fontSize: 11,
    opacity: 0.85,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    lineHeight: 1.5
  },
  chipDone: { opacity: 0.45, textDecoration: "line-through" },
  moreChip: { fontSize: 11, opacity: 0.5 }
};
