import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

const MEAL_TYPES = ["breakfast", "lunch", "dinner"];
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function PlanMeals() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState("suggestions");
  const [recipes, setRecipes] = useState([]);
  const [pantry, setPantry] = useState([]);
  const [planDate, setPlanDate] = useState(todayKey());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadRecipes = useCallback(() => {
    fetch(`${API_URL}/recipes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setRecipes(d.recipes || []))
      .catch(() => setError("Could not load recipes."))
      .finally(() => setLoading(false));
  }, [token]);

  const loadPantry = useCallback(() => {
    fetch(`${API_URL}/pantry`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setPantry(d.pantry || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => { loadRecipes(); loadPantry(); }, [loadRecipes, loadPantry]);

  const flash = (msg) => { setStatus(msg); setError(""); setTimeout(() => setStatus(""), 4000); };

  const seed = async () => {
    const res = await fetch(`${API_URL}/recipes/seed`, { method: "POST", headers });
    if (res.ok) { loadRecipes(); flash("Loaded starter recipes."); }
  };

  const planRecipe = async (recipe) => {
    const res = await fetch(`${API_URL}/recipes/${recipe.id}/plan`, {
      method: "POST", headers,
      body: JSON.stringify({ meal_date: planDate, meal_type: recipe.meal_type })
    });
    const d = await res.json();
    if (res.ok) flash(d.message || "Planned."); else setError(d.error || "Could not plan.");
  };

  const addMissing = async (recipe) => {
    const res = await fetch(`${API_URL}/recipes/${recipe.id}/add-missing-to-shopping-list`, {
      method: "POST", headers
    });
    const d = await res.json();
    if (res.ok) flash(d.message || "Added to shopping list."); else setError(d.error || "Failed.");
  };

  const deleteRecipe = async (recipe) => {
    if (!window.confirm(`Delete "${recipe.name}" from your library?`)) return;
    await fetch(`${API_URL}/recipes/${recipe.id}`, { method: "DELETE", headers });
    loadRecipes();
  };

  const byType = useMemo(() => {
    const groups = { breakfast: [], lunch: [], dinner: [], other: [] };
    recipes.forEach((r) => (groups[r.meal_type] ? groups[r.meal_type] : groups.other).push(r));
    return groups;
  }, [recipes]);

  return (
    <div style={theme.page}>
      <button style={styles.back} onClick={() => navigate("/meal-planner")}>‹ Back to Calendar</button>
      <h1>🍳 Meal Planner</h1>

      <div style={styles.tabs}>
        {[["suggestions", "Suggestions"], ["discover", "Discover"], ["pantry", `Pantry${pantry.length ? ` (${pantry.length})` : ""}`]].map(([key, label]) => (
          <button key={key} style={tab === key ? styles.tabActive : styles.tab} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div style={theme.error}>{error}</div>}
      {status && <div style={theme.status}>{status}</div>}

      {tab === "suggestions" && (
        <SuggestionsTab
          loading={loading} byType={byType} isMobile={isMobile}
          planDate={planDate} setPlanDate={setPlanDate}
          onPlan={planRecipe} onAddMissing={addMissing} onDelete={deleteRecipe}
          onSeed={seed} hasRecipes={recipes.length > 0}
          headers={headers} onCreated={loadRecipes}
        />
      )}

      {tab === "discover" && (
        <DiscoverTab headers={headers} isMobile={isMobile} onImported={() => { loadRecipes(); flash("Recipe imported to your library."); }} />
      )}

      {tab === "pantry" && (
        <PantryTab pantry={pantry} headers={headers} onChange={loadPantry} />
      )}
    </div>
  );
}

// ---- Suggestions ---------------------------------------------------------
function SuggestionsTab({
  loading, byType, isMobile, planDate, setPlanDate,
  onPlan, onAddMissing, onDelete, onSeed, hasRecipes, headers, onCreated
}) {
  const [adding, setAdding] = useState(false);

  if (loading) return <p style={styles.muted}>Loading recipes…</p>;

  if (!hasRecipes) {
    return (
      <div style={theme.card}>
        <p style={styles.muted}>Your recipe library is empty.</p>
        <button style={theme.button} onClick={onSeed}>Load starter recipes</button>
        <button style={{ ...styles.ghost, marginLeft: 8 }} onClick={() => setAdding(true)}>+ New recipe</button>
        {adding && <NewRecipeForm headers={headers} onDone={() => { setAdding(false); onCreated(); }} onCancel={() => setAdding(false)} />}
      </div>
    );
  }

  return (
    <>
      <div style={styles.planBar}>
        <label style={styles.planLabel}>Plan for:</label>
        <input type="date" style={styles.dateInput} value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
        <div style={{ flex: 1 }} />
        <button style={styles.ghost} onClick={() => setAdding(true)}>+ New recipe</button>
      </div>

      {adding && (
        <div style={theme.card}>
          <NewRecipeForm headers={headers} onDone={() => { setAdding(false); onCreated(); }} onCancel={() => setAdding(false)} />
        </div>
      )}

      {["breakfast", "lunch", "dinner", "other"].map((type) => {
        const list = byType[type] || [];
        if (list.length === 0) return null;
        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <h2 style={styles.typeHeading}>{type === "other" ? "Other" : type[0].toUpperCase() + type.slice(1)}</h2>
            <div style={{ ...styles.cardGrid, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))" }}>
              {list.map((r) => (
                <RecipeCard key={r.id} recipe={r} planDate={planDate}
                  onPlan={() => onPlan(r)} onAddMissing={() => onAddMissing(r)} onDelete={() => onDelete(r)} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function RecipeCard({ recipe, planDate, onPlan, onAddMissing, onDelete }) {
  const ings = recipe.ingredients || [];
  return (
    <div style={styles.recipeCard}>
      {recipe.thumb && <img src={recipe.thumb} alt={recipe.name} style={styles.thumb} />}
      <div style={styles.recipeBody}>
        <div style={styles.recipeName}>{recipe.name}</div>
        <div style={styles.ingList}>
          {ings.slice(0, 6).map((i) => i.name).join(", ")}{ings.length > 6 ? "…" : ""}
        </div>
        <div style={styles.cardActions}>
          <button style={styles.primarySmall} onClick={onPlan}>Plan for {planDate.slice(5)}</button>
          <button style={styles.secondarySmall} onClick={onAddMissing}>🛒 Add missing</button>
          <button style={styles.deleteX} onClick={onDelete} title="Delete recipe">✕</button>
        </div>
      </div>
    </div>
  );
}

function NewRecipeForm({ headers, onDone, onCancel }) {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState("dinner");
  const [ingText, setIngText] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const ingredients = ingText.split("\n").map((line) => {
      const [n, ...q] = line.split(",");
      return { name: (n || "").trim(), quantity: q.join(",").trim() || null };
    }).filter((i) => i.name);
    await fetch(`${API_URL}/recipes`, {
      method: "POST", headers,
      body: JSON.stringify({ name: name.trim(), meal_type: mealType, ingredients })
    });
    setSaving(false);
    onDone();
  };

  return (
    <div style={styles.newForm}>
      <input style={theme.input} placeholder="Recipe name" value={name} onChange={(e) => setName(e.target.value)} />
      <select style={theme.input} value={mealType} onChange={(e) => setMealType(e.target.value)}>
        {MEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <label style={theme.label}>Ingredients — one per line, "name, quantity"</label>
      <textarea style={styles.textarea} rows={5} placeholder={"eggs, 3\nbread, 2 slices"} value={ingText} onChange={(e) => setIngText(e.target.value)} />
      <div style={styles.actionRow}>
        <button style={theme.button} onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save recipe"}</button>
        <button style={styles.ghost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---- Discover (TheMealDB) ------------------------------------------------
function DiscoverTab({ headers, isMobile, onImported }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [typeById, setTypeById] = useState({});

  const search = async () => {
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/recipes/discover?q=${encodeURIComponent(q)}`, { headers });
      const d = await res.json();
      setResults(d.results || []);
    } catch { /* ignore */ } finally { setSearching(false); }
  };

  const importOne = async (r) => {
    await fetch(`${API_URL}/recipes/import`, {
      method: "POST", headers,
      body: JSON.stringify({ external_id: r.external_id, meal_type: typeById[r.external_id] || "dinner" })
    });
    onImported();
  };

  return (
    <>
      <div style={styles.planBar}>
        <input style={theme.input} placeholder="Search recipes (e.g. chicken, pasta, salad)…"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <button style={theme.button} onClick={search} disabled={searching}>{searching ? "Searching…" : "Search"}</button>
      </div>
      <p style={styles.muted}>Recipes from TheMealDB — choose a meal type and import into your library.</p>

      <div style={{ ...styles.cardGrid, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(240px,1fr))" }}>
        {results.map((r) => (
          <div key={r.external_id} style={styles.recipeCard}>
            {r.thumb && <img src={r.thumb} alt={r.name} style={styles.thumb} />}
            <div style={styles.recipeBody}>
              <div style={styles.recipeName}>{r.name}</div>
              <div style={styles.ingList}>{[r.category, r.area].filter(Boolean).join(" · ")}</div>
              <div style={styles.cardActions}>
                <select style={styles.smallSelect} value={typeById[r.external_id] || "dinner"}
                  onChange={(e) => setTypeById((p) => ({ ...p, [r.external_id]: e.target.value }))}>
                  {MEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button style={styles.primarySmall} onClick={() => importOne(r)}>Import</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Pantry --------------------------------------------------------------
function PantryTab({ pantry, headers, onChange }) {
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    await fetch(`${API_URL}/pantry`, { method: "POST", headers, body: JSON.stringify({ name: name.trim() }) });
    setName(""); onChange();
  };
  const remove = async (id) => {
    await fetch(`${API_URL}/pantry/${id}`, { method: "DELETE", headers });
    onChange();
  };

  return (
    <div style={theme.card}>
      <p style={styles.muted}>
        List what you keep on hand. When you tap “Add missing” on a recipe, anything already in your
        pantry is skipped — only what you don’t have goes on the shopping list.
      </p>
      <div style={styles.planBar}>
        <input style={theme.input} placeholder="Add pantry item (e.g. salt, olive oil, rice)…"
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button style={theme.button} onClick={add}>Add</button>
      </div>
      {pantry.length === 0 ? (
        <p style={styles.muted}>Your pantry is empty.</p>
      ) : (
        <div style={styles.pantryGrid}>
          {pantry.map((p) => (
            <span key={p.id} style={styles.pantryChip}>
              {p.name}
              <button style={styles.chipX} onClick={() => remove(p.id)} title="Remove">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  back: {
    padding: "8px 14px", border: "none", borderRadius: 8, cursor: "pointer",
    background: colors.border, color: colors.text, marginBottom: 12
  },
  tabs: { display: "flex", gap: 8, margin: "8px 0 16px", flexWrap: "wrap" },
  tab: { ...theme.tab },
  tabActive: { ...theme.tabActive },
  muted: { opacity: 0.7, lineHeight: 1.5 },

  planBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" },
  planLabel: { fontWeight: "bold", opacity: 0.8 },
  dateInput: { ...theme.input, width: "auto", marginBottom: 0, maxWidth: 200 },

  typeHeading: { marginBottom: 10 },
  cardGrid: { display: "grid", gap: 14 },
  recipeCard: {
    background: colors.surface, borderRadius: 14, overflow: "hidden",
    display: "flex", flexDirection: "column", border: `1px solid ${colors.border}`
  },
  thumb: { width: "100%", height: 130, objectFit: "cover" },
  recipeBody: { padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  recipeName: { fontWeight: "bold", fontSize: 16 },
  ingList: { fontSize: 13, opacity: 0.7, flex: 1, lineHeight: 1.4 },
  cardActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  primarySmall: {
    padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer",
    background: colors.primary, color: colors.primaryText, fontWeight: "bold", fontSize: 13
  },
  secondarySmall: {
    padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer",
    background: colors.border, color: colors.text, fontSize: 13
  },
  deleteX: {
    marginLeft: "auto", background: "transparent", border: "none", color: colors.text,
    opacity: 0.4, cursor: "pointer", fontSize: 14
  },
  ghost: {
    padding: "8px 14px", borderRadius: 8, border: `1px solid ${colors.border}`,
    background: "transparent", color: colors.text, cursor: "pointer"
  },
  smallSelect: { padding: "6px 8px", borderRadius: 8, border: "none", fontSize: 13 },

  newForm: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 },
  textarea: {
    width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8,
    border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text,
    fontFamily: "inherit", fontSize: 14, resize: "vertical", marginBottom: 8
  },
  actionRow: { display: "flex", gap: 10 },

  pantryGrid: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pantryChip: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
    borderRadius: 999, background: colors.surfaceAlt, fontSize: 14
  },
  chipX: { background: "transparent", border: "none", color: colors.text, opacity: 0.5, cursor: "pointer", fontSize: 13 }
};
