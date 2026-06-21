import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://192.168.1.72:8132";
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"];

export default function MealDay() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { date } = useParams();

  const [meals, setMeals] = useState([]);
  const [mealType, setMealType] = useState(MEAL_TYPES[0]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const loadMeals = async () => {
    try {
      const res = await fetch(`${API_URL}/meals`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setMeals((data.meals || []).filter((m) => m.meal_date === date));
    } catch {
      setError("Failed to load meals.");
    }
  };

  useEffect(() => {
    if (token) loadMeals();
  }, [token, date]);

  const addMeal = async () => {
    setError("");

    if (!title) {
      setError("Title is required.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/meals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          meal_date: date,
          meal_type: mealType,
          title,
          notes
        })
      });

      if (!res.ok) {
        setError("Failed to create meal.");
        return;
      }

      setTitle("");
      setNotes("");
      loadMeals();
    } catch {
      setError("Network error creating meal.");
    }
  };

  const deleteMeal = async (id) => {
    try {
      await fetch(`${API_URL}/meals/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadMeals();
    } catch {
      setError("Failed to delete meal.");
    }
  };

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("default", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <div style={styles.page}>
      <button style={styles.backButton} onClick={() => navigate("/meal-planner")}>
        ‹ Back to Calendar
      </button>

      <h1>🍽️ {dateLabel}</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <h2>Add Meal</h2>

        <label style={styles.label}>Meal</label>
        <select
          style={styles.input}
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
        >
          {MEAL_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <input
          style={styles.input}
          placeholder="What's cooking?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button style={styles.button} onClick={addMeal}>
          Add Meal
        </button>
      </div>

      <div style={styles.card}>
        <h2>Menu for the Day</h2>

        {meals.length === 0 ? (
          <p>No meals planned for this day.</p>
        ) : (
          MEAL_TYPES.map((type) => {
            const typeMeals = meals.filter((m) => m.meal_type === type);
            if (typeMeals.length === 0) return null;

            return (
              <div key={type} style={styles.typeGroup}>
                <h3>{type}</h3>

                {typeMeals.map((meal) => (
                  <div key={meal.id} style={styles.mealRow}>
                    <div>
                      <strong>{meal.title}</strong>
                      {meal.notes && <div style={styles.mealNotes}>{meal.notes}</div>}
                    </div>

                    <button style={styles.deleteButton} onClick={() => deleteMeal(meal.id)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            );
          })
        )}
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
  label: {
    display: "block",
    marginBottom: 6,
    opacity: 0.8,
    fontSize: 14
  },
  input: {
    display: "block",
    width: "100%",
    maxWidth: 400,
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    border: "none"
  },
  button: {
    padding: "10px 15px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  },
  backButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#334155",
    color: "white",
    marginBottom: 16
  },
  deleteButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#7f1d1d",
    color: "white"
  },
  error: {
    background: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
  typeGroup: {
    marginBottom: 16
  },
  mealRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderTop: "1px solid #334155",
    padding: "10px 0"
  },
  mealNotes: {
    opacity: 0.7,
    fontSize: 14,
    marginTop: 4
  }
};
