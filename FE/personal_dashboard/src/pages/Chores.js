import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

function toDateKey(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export default function Chores() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [chores, setChores] = useState([]);
  const [error, setError] = useState("");

  const loadChores = async () => {
    try {
      const res = await fetch(`${API_URL}/chores`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setChores(data.chores || []);
    } catch {
      setError("Failed to load chores.");
    }
  };

  useEffect(() => {
    if (token) loadChores();
  }, [token]);

  const choresByDate = chores.reduce((acc, chore) => {
    if (!chore.due_date) return acc;
    acc[chore.due_date] = acc[chore.due_date] || [];
    acc[chore.due_date].push(chore);
    return acc;
  }, {});

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const monthLabel = firstOfMonth.toLocaleString("default", {
    month: "long",
    year: "numeric"
  });

  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const undatedChores = chores.filter((c) => !c.due_date);

  return (
    <div style={{ ...styles.page, padding: isMobile ? 10 : 20 }}>
      <h1>🧹 Chores</h1>

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
            if (day === null) {
              return <div key={idx} style={styles.emptyCell} />;
            }

            const dateKey = toDateKey(viewYear, viewMonth, day);
            const dayChores = choresByDate[dateKey] || [];
            const isToday = dateKey === todayKey;
            const maxChips = isMobile ? 1 : 3;

            return (
              <div
                key={idx}
                style={{
                  ...styles.dayCell,
                  minHeight: isMobile ? 56 : 90,
                  padding: isMobile ? 3 : 6,
                  ...(isToday ? styles.todayCell : {})
                }}
                onClick={() => navigate(`/chores/${dateKey}`)}
              >
                <div style={{ ...styles.dayNumber, fontSize: isMobile ? 12 : 14 }}>{day}</div>

                {dayChores.slice(0, maxChips).map((chore) => (
                  <div
                    key={chore.occurrence_id}
                    style={{
                      ...styles.choreChip,
                      fontSize: isMobile ? 9 : 11,
                      textDecoration: chore.is_done ? "line-through" : "none",
                      opacity: chore.is_done ? 0.5 : 0.8
                    }}
                  >
                    {chore.recurrence_rule !== "none" ? "🔁 " : ""}{chore.title}
                  </div>
                ))}

                {dayChores.length > maxChips && (
                  <div style={styles.moreChip}>+{dayChores.length - maxChips}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {undatedChores.length > 0 && (
        <div style={{ ...styles.card, padding: isMobile ? 10 : 20 }}>
          <h2>No Due Date</h2>

          {undatedChores.map((chore) => (
            <div
              key={chore.id}
              style={{
                ...styles.undatedRow,
                textDecoration: chore.is_done ? "line-through" : "none",
                opacity: chore.is_done ? 0.5 : 1
              }}
            >
              <strong>{chore.title}</strong>
              {chore.assigned_to && <span> — {chore.assigned_to}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  error: theme.error,
  monthHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: 16
  },
  monthLabel: {
    margin: 0,
    minWidth: 220,
    textAlign: "center"
  },
  navButton: {
    padding: "6px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 18
  },
  weekRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    marginBottom: 6
  },
  weekdayLabel: {
    textAlign: "center",
    opacity: 0.6,
    fontSize: 13,
    padding: "4px 0"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6
  },
  emptyCell: {
    minHeight: 90
  },
  dayCell: {
    minHeight: 90,
    background: colors.surfaceMuted,
    borderRadius: 8,
    padding: 6,
    cursor: "pointer",
    border: `1px solid ${colors.border}`,
    overflow: "hidden"
  },
  todayCell: {
    border: `1px solid ${colors.primary}`
  },
  dayNumber: {
    fontWeight: "bold",
    marginBottom: 4,
    fontSize: 14
  },
  choreChip: {
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  moreChip: {
    fontSize: 11,
    opacity: 0.5
  },
  undatedRow: {
    borderTop: `1px solid ${colors.border}`,
    padding: "10px 0"
  }
};
