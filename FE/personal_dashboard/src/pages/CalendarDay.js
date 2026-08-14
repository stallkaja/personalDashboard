import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useUserTimezone from "../hooks/useUserTimezone";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";
import { dayKeyInTz, formatTimeInTz, tzAbbrev, toDatetimeLocalInTz } from "../utils/time";

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
];

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"];

const ADD_TABS = [
  { key: "event", label: "📅 Event" },
  { key: "todo", label: "✅ To-Do" },
  { key: "meal", label: "🍽️ Meal" }
];

export default function CalendarDay() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { date } = useParams();
  const tz = useUserTimezone();

  const [addType, setAddType] = useState("event");
  const [error, setError] = useState("");

  // ---- Events ----
  const [events, setEvents] = useState([]);
  const [evTitle, setEvTitle] = useState("");
  const [evDescription, setEvDescription] = useState("");
  const [evStart, setEvStart] = useState(`${date}T09:00`);
  const [evEnd, setEvEnd] = useState("");
  const [evRecurrence, setEvRecurrence] = useState("none");
  const [evRecurrenceEnd, setEvRecurrenceEnd] = useState("");
  const [evEditingId, setEvEditingId] = useState(null);

  // ---- To-Dos ----
  const [chores, setChores] = useState([]);
  const [choreTitle, setChoreTitle] = useState("");
  const [choreAssignedTo, setChoreAssignedTo] = useState("");
  const [choreRecurrence, setChoreRecurrence] = useState("none");
  const [choreRecurrenceEnd, setChoreRecurrenceEnd] = useState("");
  const [rotationNames, setRotationNames] = useState("");

  // ---- Meals ----
  const [meals, setMeals] = useState([]);
  const [mealType, setMealType] = useState(MEAL_TYPES[0]);
  const [mealTitle, setMealTitle] = useState("");
  const [mealNotes, setMealNotes] = useState("");
  const [expandedMealId, setExpandedMealId] = useState(null);
  const [ingredientsByMeal, setIngredientsByMeal] = useState({});
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/events`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setEvents((data.events || []).filter((e) => dayKeyInTz(e.start_time, tz) === date));
    } catch { setError("Failed to load events."); }
  }, [token, date, tz]);

  const loadChores = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/chores`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setChores((data.chores || []).filter((c) => c.due_date === date));
    } catch { setError("Failed to load to-dos."); }
  }, [token, date]);

  const loadMeals = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/meals`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setMeals((data.meals || []).filter((m) => m.meal_date === date));
    } catch { setError("Failed to load meals."); }
  }, [token, date]);

  useEffect(() => {
    if (!token) return;
    loadEvents(); loadChores(); loadMeals();
  }, [token, loadEvents, loadChores, loadMeals]);

  // ---- Event handlers ----
  const resetEventForm = () => {
    setEvEditingId(null);
    setEvTitle(""); setEvDescription("");
    setEvStart(`${date}T09:00`); setEvEnd("");
    setEvRecurrence("none"); setEvRecurrenceEnd("");
  };

  const startEditEvent = (event) => {
    if (event.is_generated && !window.confirm(
      "This is a generated occurrence of a repeating event. Editing will change the entire series. Continue?"
    )) return;
    setError("");
    setAddType("event");
    setEvEditingId(event.id);
    setEvTitle(event.title || "");
    setEvDescription(event.description || "");
    setEvStart(toDatetimeLocalInTz(event.start_time, tz) || `${date}T09:00`);
    setEvEnd(event.end_time ? toDatetimeLocalInTz(event.end_time, tz) : "");
    setEvRecurrence(event.recurrence_rule || "none");
    setEvRecurrenceEnd(event.recurrence_end || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitEvent = async () => {
    setError("");
    if (!evTitle || !evStart) { setError("Event title and start time are required."); return; }
    const isEdit = evEditingId !== null;
    try {
      const res = await fetch(isEdit ? `${API_URL}/events/${evEditingId}` : `${API_URL}/events`, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: evTitle,
          description: evDescription,
          start_time: evStart,
          end_time: evEnd || null,
          timezone: tz,
          recurrence_rule: evRecurrence,
          recurrence_end: evRecurrence !== "none" ? (evRecurrenceEnd || null) : null
        })
      });
      if (!res.ok) { setError(isEdit ? "Failed to update event." : "Failed to create event."); return; }
      resetEventForm();
      loadEvents();
    } catch { setError("Network error saving event."); }
  };

  const deleteEvent = async (event) => {
    if (event.is_generated && !window.confirm(
      "This is a generated occurrence of a repeating event. Deleting will remove the entire series. Continue?"
    )) return;
    try {
      await fetch(`${API_URL}/events/${event.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      });
      loadEvents();
    } catch { setError("Failed to delete event."); }
  };

  // ---- To-Do handlers ----
  const addChore = async () => {
    setError("");
    if (!choreTitle) { setError("To-do title is required."); return; }
    const rotationMembers = rotationNames.split(",").map((n) => n.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_URL}/chores`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: choreTitle,
          assigned_to: choreAssignedTo || null,
          due_date: date,
          recurrence_rule: choreRecurrence,
          recurrence_end: choreRecurrence !== "none" ? (choreRecurrenceEnd || null) : null,
          rotation_members: choreRecurrence !== "none" && rotationMembers.length > 1 ? rotationMembers : null
        })
      });
      if (!res.ok) { setError("Failed to create to-do."); return; }
      setChoreTitle(""); setChoreAssignedTo("");
      setChoreRecurrence("none"); setChoreRecurrenceEnd(""); setRotationNames("");
      loadChores();
    } catch { setError("Network error creating to-do."); }
  };

  const toggleChore = async (chore) => {
    if (chore.is_generated && !window.confirm(
      "This is a generated occurrence of a repeating to-do. Marking it done will mark the whole series done. Continue?"
    )) return;
    try {
      await fetch(`${API_URL}/chores/${chore.id}/toggle`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }
      });
      loadChores();
    } catch { setError("Failed to update to-do."); }
  };

  const deleteChore = async (chore) => {
    if (chore.is_generated && !window.confirm(
      "This is a generated occurrence of a repeating to-do. Deleting will remove the entire series. Continue?"
    )) return;
    try {
      await fetch(`${API_URL}/chores/${chore.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      });
      loadChores();
    } catch { setError("Failed to delete to-do."); }
  };

  // ---- Meal handlers ----
  const addMeal = async () => {
    setError("");
    if (!mealTitle) { setError("Meal title is required."); return; }
    try {
      const res = await fetch(`${API_URL}/meals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meal_date: date, meal_type: mealType, title: mealTitle, notes: mealNotes })
      });
      if (!res.ok) { setError("Failed to create meal."); return; }
      setMealTitle(""); setMealNotes("");
      loadMeals();
    } catch { setError("Network error creating meal."); }
  };

  const deleteMeal = async (id) => {
    try {
      await fetch(`${API_URL}/meals/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      loadMeals();
    } catch { setError("Failed to delete meal."); }
  };

  const addToShoppingList = async (meal) => {
    try {
      await fetch(`${API_URL}/meals/${meal.id}/add-to-shopping-list`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }
      });
    } catch { setError("Failed to add to shopping list."); }
  };

  const loadIngredients = async (mealId) => {
    try {
      const res = await fetch(`${API_URL}/meals/${mealId}/ingredients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setIngredientsByMeal((prev) => ({ ...prev, [mealId]: data.ingredients || [] }));
    } catch { setError("Failed to load ingredients."); }
  };

  const toggleIngredients = (mealId) => {
    if (expandedMealId === mealId) { setExpandedMealId(null); return; }
    setExpandedMealId(mealId);
    loadIngredients(mealId);
  };

  const addIngredient = async (mealId) => {
    if (!newIngredientName.trim()) return;
    try {
      await fetch(`${API_URL}/meals/${mealId}/ingredients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newIngredientName, quantity: newIngredientQty || null })
      });
      setNewIngredientName(""); setNewIngredientQty("");
      loadIngredients(mealId);
    } catch { setError("Failed to add ingredient."); }
  };

  const deleteIngredient = async (mealId, ingredientId) => {
    try {
      await fetch(`${API_URL}/meal-ingredients/${ingredientId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      });
      loadIngredients(mealId);
    } catch { setError("Failed to delete ingredient."); }
  };

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("default", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  return (
    <div style={styles.page}>
      <button style={styles.backButton} onClick={() => navigate("/calendar")}>‹ Back to Calendar</button>

      <h1>📅 {dateLabel}</h1>

      {error && <div style={styles.error}>{error}</div>}

      {/* ---- Add card with type tabs ---- */}
      <div style={styles.card}>
        <div style={styles.tabs}>
          {ADD_TABS.map((t) => (
            <button
              key={t.key}
              style={addType === t.key ? styles.tabActive : styles.tab}
              onClick={() => { setAddType(t.key); setError(""); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {addType === "event" && (
          <>
            <h2>{evEditingId ? "Edit Event" : "Add Event"}</h2>
            <p style={styles.tzNote}>Times are entered and shown in {tz} ({tzAbbrev(tz)})</p>
            <input style={styles.input} placeholder="Title" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} />
            <input style={styles.input} placeholder="Description" value={evDescription} onChange={(e) => setEvDescription(e.target.value)} />
            <label style={styles.label}>Start</label>
            <input style={styles.input} type="datetime-local" value={evStart} onChange={(e) => setEvStart(e.target.value)} />
            <label style={styles.label}>End (optional)</label>
            <input style={styles.input} type="datetime-local" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} />
            <label style={styles.label}>Repeats</label>
            <select style={styles.input} value={evRecurrence} onChange={(e) => setEvRecurrence(e.target.value)}>
              {RECURRENCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {evRecurrence !== "none" && (
              <>
                <label style={styles.label}>Repeat until (optional)</label>
                <input style={styles.input} type="date" value={evRecurrenceEnd} onChange={(e) => setEvRecurrenceEnd(e.target.value)} />
              </>
            )}
            <div style={styles.formActions}>
              <button style={styles.button} onClick={submitEvent}>{evEditingId ? "Save Changes" : "Add Event"}</button>
              {evEditingId && <button style={styles.cancelButton} onClick={resetEventForm}>Cancel</button>}
            </div>
          </>
        )}

        {addType === "todo" && (
          <>
            <h2>Add To-Do</h2>
            <input style={styles.input} placeholder="To-do title" value={choreTitle} onChange={(e) => setChoreTitle(e.target.value)} />
            <input style={styles.input} placeholder="Assigned to" value={choreAssignedTo} onChange={(e) => setChoreAssignedTo(e.target.value)} />
            <label style={styles.label}>Repeats</label>
            <select style={styles.input} value={choreRecurrence} onChange={(e) => setChoreRecurrence(e.target.value)}>
              {RECURRENCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {choreRecurrence !== "none" && (
              <>
                <label style={styles.label}>Repeat until (optional)</label>
                <input style={styles.input} type="date" value={choreRecurrenceEnd} onChange={(e) => setChoreRecurrenceEnd(e.target.value)} />
                <label style={styles.label}>
                  Rotate between (comma-separated names, optional — overrides "Assigned to" per occurrence)
                </label>
                <input style={styles.input} placeholder="e.g. Alice, Bob, Charlie" value={rotationNames} onChange={(e) => setRotationNames(e.target.value)} />
              </>
            )}
            <button style={styles.button} onClick={addChore}>Add To-Do</button>
          </>
        )}

        {addType === "meal" && (
          <>
            <h2>Add Meal</h2>
            <label style={styles.label}>Meal</label>
            <select style={styles.input} value={mealType} onChange={(e) => setMealType(e.target.value)}>
              {MEAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input style={styles.input} placeholder="What's cooking?" value={mealTitle} onChange={(e) => setMealTitle(e.target.value)} />
            <input style={styles.input} placeholder="Notes (optional)" value={mealNotes} onChange={(e) => setMealNotes(e.target.value)} />
            <button style={styles.button} onClick={addMeal}>Add Meal</button>
          </>
        )}
      </div>

      {/* ---- Events list ---- */}
      <div style={styles.card}>
        <h2>📅 Events</h2>
        {events.length === 0 ? (
          <p style={styles.muted}>No events scheduled.</p>
        ) : (
          events.map((ev) => (
            <div key={ev.occurrence_id} style={styles.row}>
              <div>
                <strong>{ev.recurrence_rule !== "none" ? "🔁 " : ""}{ev.title}</strong>
                <div style={styles.rowMeta}>
                  {formatTimeInTz(ev.start_time, tz)}
                  {ev.end_time ? ` – ${formatTimeInTz(ev.end_time, tz)}` : ""}
                </div>
                {ev.description && <div style={styles.rowDesc}>{ev.description}</div>}
                <div style={styles.rowByline}>
                  Added by {ev.created_by_name || "Unknown"}
                  {ev.created_at ? ` · ${new Date(ev.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </div>
              </div>
              <div style={styles.rowActions}>
                <button style={styles.editButton} onClick={() => startEditEvent(ev)}>Edit</button>
                <button style={styles.deleteButton} onClick={() => deleteEvent(ev)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---- To-Dos list ---- */}
      <div style={styles.card}>
        <h2>✅ To-Do</h2>
        {chores.length === 0 ? (
          <p style={styles.muted}>Nothing to do this day.</p>
        ) : (
          chores.map((chore) => (
            <div key={chore.occurrence_id} style={styles.row}>
              <div style={{ textDecoration: chore.is_done ? "line-through" : "none", opacity: chore.is_done ? 0.5 : 1 }}>
                <strong>{chore.recurrence_rule !== "none" ? "🔁 " : ""}{chore.title}</strong>
                {chore.assigned_to && <span> — {chore.assigned_to}</span>}
                {chore.rotation_members && (
                  <div style={styles.rowMeta}>Rotating: {chore.rotation_members.join(" → ")}</div>
                )}
              </div>
              <div style={styles.rowActions}>
                <button style={styles.toggleButton} onClick={() => toggleChore(chore)}>{chore.is_done ? "Undo" : "Done"}</button>
                <button style={styles.deleteButton} onClick={() => deleteChore(chore)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---- Meals list ---- */}
      <div style={styles.card}>
        <h2>🍽️ Menu</h2>
        {meals.length === 0 ? (
          <p style={styles.muted}>No meals planned for this day.</p>
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
                        {meal.notes && <div style={styles.rowDesc}>{meal.notes}</div>}
                      </div>
                      <div style={styles.rowActions}>
                        <button style={styles.neutralButton} onClick={() => toggleIngredients(meal.id)}>
                          {expandedMealId === meal.id ? "Hide Ingredients" : "Ingredients"}
                        </button>
                        <button style={styles.neutralButton} onClick={() => addToShoppingList(meal)}>Add to List</button>
                        <button style={styles.deleteButton} onClick={() => deleteMeal(meal.id)}>Delete</button>
                      </div>
                    </div>

                    {expandedMealId === meal.id && (
                      <div style={styles.ingredientsPanel}>
                        {(ingredientsByMeal[meal.id] || []).map((ing) => (
                          <div key={ing.id} style={styles.ingredientRow}>
                            <span>{ing.name}{ing.quantity ? ` — ${ing.quantity}` : ""}</span>
                            <button style={styles.deleteButton} onClick={() => deleteIngredient(meal.id, ing.id)}>Delete</button>
                          </div>
                        ))}
                        <div style={styles.ingredientForm}>
                          <input style={styles.ingredientInput} placeholder="Ingredient name" value={newIngredientName} onChange={(e) => setNewIngredientName(e.target.value)} />
                          <input style={styles.ingredientInput} placeholder="Qty (optional)" value={newIngredientQty} onChange={(e) => setNewIngredientQty(e.target.value)} />
                          <button style={styles.button} onClick={() => addIngredient(meal.id)}>Add</button>
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
  tab: theme.tab,
  tabActive: theme.tabActive,
  neutralButton: theme.neutralButton,
  deleteButton: theme.deleteButton,
  error: theme.error,
  muted: { opacity: 0.7 },
  backButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    marginBottom: 16
  },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  editButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text
  },
  toggleButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.success,
    color: colors.text
  },
  formActions: { display: "flex", gap: 10, alignItems: "center" },
  cancelButton: {
    padding: "10px 15px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 15
  },
  tzNote: { opacity: 0.6, fontSize: 13, marginTop: -4, marginBottom: 12 },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderTop: `1px solid ${colors.border}`,
    padding: "12px 0",
    gap: 10
  },
  rowMeta: { opacity: 0.7, fontSize: 14, marginTop: 2 },
  rowDesc: { opacity: 0.6, fontSize: 14, marginTop: 4 },
  rowByline: { opacity: 0.5, fontSize: 12, marginTop: 6, fontStyle: "italic" },
  rowActions: { display: "flex", gap: 8, flexShrink: 0 },
  typeGroup: { marginBottom: 16 },
  mealBlock: { borderTop: `1px solid ${colors.border}`, padding: "10px 0" },
  mealRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  ingredientsPanel: { marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${colors.border}` },
  ingredientRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" },
  ingredientForm: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" },
  ingredientInput: { padding: 8, borderRadius: 6, border: "none", flex: "1 1 140px" }
};
