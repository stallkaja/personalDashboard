import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

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
  const [expandedMealId, setExpandedMealId] = useState(null);
  const [ingredientsByMeal, setIngredientsByMeal] = useState({});
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");

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

  const addToShoppingList = async (meal) => {
    try {
      await fetch(`${API_URL}/meals/${meal.id}/add-to-shopping-list`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {
      setError("Failed to add to shopping list.");
    }
  };

  const loadIngredients = async (mealId) => {
    try {
      const res = await fetch(`${API_URL}/meals/${mealId}/ingredients`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setIngredientsByMeal((prev) => ({ ...prev, [mealId]: data.ingredients || [] }));
    } catch {
      setError("Failed to load ingredients.");
    }
  };

  const toggleIngredients = (mealId) => {
    if (expandedMealId === mealId) {
      setExpandedMealId(null);
      return;
    }

    setExpandedMealId(mealId);
    loadIngredients(mealId);
  };

  const addIngredient = async (mealId) => {
    if (!newIngredientName.trim()) return;

    try {
      await fetch(`${API_URL}/meals/${mealId}/ingredients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newIngredientName, quantity: newIngredientQty || null })
      });

      setNewIngredientName("");
      setNewIngredientQty("");
      loadIngredients(mealId);
    } catch {
      setError("Failed to add ingredient.");
    }
  };

  const deleteIngredient = async (mealId, ingredientId) => {
    try {
      await fetch(`${API_URL}/meal-ingredients/${ingredientId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadIngredients(mealId);
    } catch {
      setError("Failed to delete ingredient.");
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
                  <div key={meal.id} style={styles.mealBlock}>
                    <div style={styles.mealRow}>
                      <div>
                        <strong>{meal.title}</strong>
                        {meal.notes && <div style={styles.mealNotes}>{meal.notes}</div>}
                      </div>

                      <div style={styles.mealActions}>
                        <button style={styles.shopButton} onClick={() => toggleIngredients(meal.id)}>
                          {expandedMealId === meal.id ? "Hide Ingredients" : "Ingredients"}
                        </button>

                        <button style={styles.shopButton} onClick={() => addToShoppingList(meal)}>
                          Add to List
                        </button>

                        <button style={styles.deleteButton} onClick={() => deleteMeal(meal.id)}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {expandedMealId === meal.id && (
                      <div style={styles.ingredientsPanel}>
                        {(ingredientsByMeal[meal.id] || []).map((ing) => (
                          <div key={ing.id} style={styles.ingredientRow}>
                            <span>{ing.name}{ing.quantity ? ` — ${ing.quantity}` : ""}</span>

                            <button
                              style={styles.deleteButton}
                              onClick={() => deleteIngredient(meal.id, ing.id)}
                            >
                              Delete
                            </button>
                          </div>
                        ))}

                        <div style={styles.ingredientForm}>
                          <input
                            style={styles.ingredientInput}
                            placeholder="Ingredient name"
                            value={newIngredientName}
                            onChange={(e) => setNewIngredientName(e.target.value)}
                          />

                          <input
                            style={styles.ingredientInput}
                            placeholder="Qty (optional)"
                            value={newIngredientQty}
                            onChange={(e) => setNewIngredientQty(e.target.value)}
                          />

                          <button style={styles.button} onClick={() => addIngredient(meal.id)}>
                            Add
                          </button>
                        </div>
                      </div>
                    )}
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
  page: theme.page,
  card: theme.card,
  label: theme.label,
  input: theme.input,
  button: theme.button,
  backButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    marginBottom: 16
  },
  deleteButton: theme.deleteButton,
  shopButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text
  },
  mealActions: {
    display: "flex",
    gap: 8
  },
  error: theme.error,
  typeGroup: {
    marginBottom: 16
  },
  mealBlock: {
    borderTop: `1px solid ${colors.border}`,
    padding: "10px 0"
  },
  mealRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  ingredientsPanel: {
    marginTop: 10,
    paddingLeft: 12,
    borderLeft: `2px solid ${colors.border}`
  },
  ingredientRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0"
  },
  ingredientForm: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap"
  },
  ingredientInput: {
    padding: 8,
    borderRadius: 6,
    border: "none",
    flex: "1 1 140px"
  },
  mealNotes: {
    opacity: 0.7,
    fontSize: 14,
    marginTop: 4
  }
};
