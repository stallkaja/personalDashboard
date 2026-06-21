import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://192.168.1.72:8132";

function toDateKey(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export default function MealPlanner() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [meals, setMeals] = useState([]);
  const [error, setError] = useState("");

  const loadMeals = async () => {
    try {
      const res = await fetch(`${API_URL}/meals`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setMeals(data.meals || []);
    } catch {
      setError("Failed to load meals.");
    }
  };

  useEffect(() => {
    if (token) loadMeals();
  }, [token]);

  const mealsByDate = meals.reduce((acc, meal) => {
    acc[meal.meal_date] = acc[meal.meal_date] || [];
    acc[meal.meal_date].push(meal);
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

  return (
    <div style={styles.page}>
      <h1>🍽️ Meal Planner</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <div style={styles.monthHeader}>
          <button style={styles.navButton} onClick={goPrevMonth}>‹</button>
          <h2 style={styles.monthLabel}>{monthLabel}</h2>
          <button style={styles.navButton} onClick={goNextMonth}>›</button>
        </div>

        <div style={styles.weekRow}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} style={styles.weekdayLabel}>{d}</div>
          ))}
        </div>

        <div style={styles.grid}>
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={idx} style={styles.emptyCell} />;
            }

            const dateKey = toDateKey(viewYear, viewMonth, day);
            const dayMeals = mealsByDate[dateKey] || [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={idx}
                style={{
                  ...styles.dayCell,
                  ...(isToday ? styles.todayCell : {})
                }}
                onClick={() => navigate(`/meal-planner/${dateKey}`)}
              >
                <div style={styles.dayNumber}>{day}</div>

                {dayMeals.slice(0, 3).map((meal) => (
                  <div key={meal.id} style={styles.mealChip}>
                    {meal.meal_type}: {meal.title}
                  </div>
                ))}

                {dayMeals.length > 3 && (
                  <div style={styles.moreChip}>+{dayMeals.length - 3} more</div>
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
  page: {
    padding: 20,
    background: "#0f172a",
    minHeight: "100vh",
    color: "white"
  },
  card: {
    background: "#1e293b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20
  },
  error: {
    background: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
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
    background: "#334155",
    color: "white",
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
    background: "#111827",
    borderRadius: 8,
    padding: 6,
    cursor: "pointer",
    border: "1px solid #334155",
    overflow: "hidden"
  },
  todayCell: {
    border: "1px solid #38bdf8"
  },
  dayNumber: {
    fontWeight: "bold",
    marginBottom: 4,
    fontSize: 14
  },
  mealChip: {
    fontSize: 11,
    opacity: 0.8,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  moreChip: {
    fontSize: 11,
    opacity: 0.5
  }
};
