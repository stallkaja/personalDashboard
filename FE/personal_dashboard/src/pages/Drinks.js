import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

const CATEGORY_ORDER = ["alcohol", "liqueur", "mixer", "fruit", "garnish", "other"];
const CATEGORY_LABELS = {
  alcohol: "Alcohols",
  liqueur: "Liqueurs",
  mixer: "Mixers",
  fruit: "Fruit",
  garnish: "Garnishes",
  other: "Other"
};

export default function Drinks() {
  const { token, user } = useAuth();
  const isMobile = useIsMobile();

  const [ingredients, setIngredients] = useState([]);
  const [bar, setBar] = useState(() => new Set());
  const [match, setMatch] = useState({ can_make: [], missing_one: [] });
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [selected, setSelected] = useState(null); // drink detail modal
  const [seeding, setSeeding] = useState(false);
  const [garnishOptional, setGarnishOptional] = useState(true);
  const [alcoholicOnly, setAlcoholicOnly] = useState(true);

  const saveTimer = useRef(null);

  const authFetch = useMemo(
    () => (path, opts = {}) =>
      fetch(`${API_URL}${path}`, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
          ...(opts.headers || {})
        }
      }),
    [token]
  );

  // Initial load: ingredient catalog + this user's saved bar.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [ingRes, barRes] = await Promise.all([
          authFetch("/drinks/ingredients"),
          authFetch("/drinks/bar")
        ]);
        if (!ingRes.ok) throw new Error("Failed to load ingredients");
        const ingData = await ingRes.json();
        const barData = barRes.ok ? await barRes.json() : { ingredient_ids: [] };
        if (!alive) return;
        setIngredients(ingData.ingredients || []);
        setBar(new Set(barData.ingredient_ids || []));
      } catch (e) {
        if (alive) setError(e.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, authFetch]);

  const runMatch = useMemo(
    () => async () => {
      try {
        setMatching(true);
        const res = await authFetch(
          `/drinks/match?garnish_optional=${garnishOptional ? 1 : 0}&alcoholic_only=${
            alcoholicOnly ? 1 : 0
          }`
        );
        if (!res.ok) throw new Error("Match failed");
        const data = await res.json();
        setMatch({ can_make: data.can_make || [], missing_one: data.missing_one || [] });
      } catch (e) {
        setError(e.message || "Match failed");
      } finally {
        setMatching(false);
      }
    },
    [authFetch, garnishOptional, alcoholicOnly]
  );

  // Re-match whenever the (loaded) bar or options change.
  useEffect(() => {
    if (!token || loading) return;
    runMatch();
  }, [token, loading, runMatch, bar]);

  const persistBar = (nextSet) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      authFetch("/drinks/bar", {
        method: "PUT",
        body: JSON.stringify({ ingredient_ids: Array.from(nextSet) })
      }).catch(() => {});
    }, 500);
  };

  const toggleIngredient = (id) => {
    setBar((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistBar(next);
      return next;
    });
  };

  const clearBar = () => {
    const empty = new Set();
    setBar(empty);
    persistBar(empty);
  };

  const runSeed = async () => {
    try {
      setSeeding(true);
      setError("");
      const res = await authFetch("/drinks/seed", { method: "POST" });
      if (!res.ok) throw new Error("Seeding requires admin access");
      const ingRes = await authFetch("/drinks/ingredients");
      setIngredients((await ingRes.json()).ingredients || []);
    } catch (e) {
      setError(e.message || "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const g = {};
    for (const ing of ingredients) {
      if (q && !ing.name.toLowerCase().includes(q)) continue;
      const cat = CATEGORY_LABELS[ing.category] ? ing.category : "other";
      (g[cat] = g[cat] || []).push(ing);
    }
    return g;
  }, [ingredients, filter]);

  if (loading) return <div style={theme.loading}>Loading drinks…</div>;

  const catalogEmpty = ingredients.length === 0;

  return (
    <div style={theme.page}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>🍸 Drinks</h1>
        <div style={styles.subtle}>
          {bar.size} in your bar · {match.can_make.length} you can make
        </div>
      </div>

      {error && <div style={theme.error}>{error}</div>}

      {catalogEmpty ? (
        <div style={theme.card}>
          <p>The cocktail database hasn’t been loaded yet.</p>
          {user?.role === "admin" ? (
            <button style={{ ...theme.button, background: colors.primary, color: colors.primaryText }} onClick={runSeed} disabled={seeding}>
              {seeding ? "Importing… (this takes ~30s)" : "Import cocktail database"}
            </button>
          ) : (
            <p style={styles.subtle}>Ask an admin to import it from the Drinks page.</p>
          )}
        </div>
      ) : (
        <>
          {/* My Bar picker */}
          <div style={theme.card}>
            <div style={styles.barHeader}>
              <strong>My Bar — tap what you have on hand</strong>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={styles.search}
                  placeholder="Filter ingredients…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                {bar.size > 0 && (
                  <button style={theme.neutralButton} onClick={clearBar}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((cat) => (
              <div key={cat} style={{ marginTop: 14 }}>
                <button
                  style={styles.groupToggle}
                  onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                >
                  {collapsed[cat] ? "▸" : "▾"} {CATEGORY_LABELS[cat]}{" "}
                  <span style={styles.subtle}>({grouped[cat].length})</span>
                </button>
                {!collapsed[cat] && (
                  <div style={styles.chips}>
                    {grouped[cat].map((ing) => {
                      const on = bar.has(ing.id);
                      return (
                        <button
                          key={ing.id}
                          onClick={() => toggleIngredient(ing.id)}
                          style={{
                            ...styles.chip,
                            background: on ? colors.primary : colors.surfaceMuted,
                            color: on ? colors.primaryText : colors.text,
                            fontWeight: on ? 700 : 400
                          }}
                          title={`${ing.drink_count} drinks`}
                        >
                          {on ? "✓ " : ""}
                          {ing.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Options */}
          <div style={{ ...theme.card, display: "flex", gap: 18, flexWrap: "wrap" }}>
            <label style={styles.opt}>
              <input
                type="checkbox"
                checked={garnishOptional}
                onChange={(e) => setGarnishOptional(e.target.checked)}
              />{" "}
              Garnishes optional
            </label>
            <label style={styles.opt}>
              <input
                type="checkbox"
                checked={alcoholicOnly}
                onChange={(e) => setAlcoholicOnly(e.target.checked)}
              />{" "}
              Alcoholic only
            </label>
            {matching && <span style={styles.subtle}>Updating…</span>}
          </div>

          {/* Results */}
          <Section
            title={`You can make now (${match.can_make.length})`}
            drinks={match.can_make}
            emptyText={
              bar.size === 0
                ? "Add ingredients to your bar to see what you can make."
                : "Nothing fully makeable yet — check “only missing one” below."
            }
            isMobile={isMobile}
            onOpen={setSelected}
          />

          <Section
            title={`Only missing one 🛒 (${match.missing_one.length})`}
            drinks={match.missing_one}
            emptyText="No almost-there drinks right now."
            isMobile={isMobile}
            onOpen={setSelected}
            showMissing
          />
        </>
      )}

      {selected && (
        <DrinkModal drinkId={selected} authFetch={authFetch} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Section({ title, drinks, emptyText, isMobile, onOpen, showMissing }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, margin: "8px 0 12px" }}>{title}</h2>
      {drinks.length === 0 ? (
        <div style={{ ...theme.card, opacity: 0.75 }}>{emptyText}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(180px, 1fr))"
          }}
        >
          {drinks.map((d) => (
            <button key={d.id} style={cardStyles.card} onClick={() => onOpen(d.id)}>
              {d.thumb ? (
                <img src={d.thumb} alt={d.name} style={cardStyles.thumb} loading="lazy" />
              ) : (
                <div style={{ ...cardStyles.thumb, ...cardStyles.thumbFallback }}>🍹</div>
              )}
              <div style={cardStyles.name}>{d.name}</div>
              {showMissing && d.missing?.length > 0 && (
                <div style={cardStyles.missing}>missing: {d.missing.join(", ")}</div>
              )}
              <div style={cardStyles.meta}>
                {d.have_count}/{d.required_count} ingredients
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DrinkModal({ drinkId, authFetch, onClose }) {
  const [drink, setDrink] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    authFetch(`/drinks/${drinkId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((d) => alive && setDrink(d))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [drinkId, authFetch]);

  return (
    <div style={cardStyles.overlay} onClick={onClose}>
      <div style={cardStyles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={cardStyles.close} onClick={onClose} aria-label="Close">
          ✕
        </button>
        {err && <div style={theme.error}>{err}</div>}
        {!drink && !err ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          drink && (
            <>
              {drink.thumb && <img src={drink.thumb} alt={drink.name} style={cardStyles.modalImg} />}
              <h2 style={{ margin: "12px 0 4px" }}>{drink.name}</h2>
              <div style={cardStyles.meta}>
                {[drink.category, drink.alcoholic, drink.glass].filter(Boolean).join(" · ")}
              </div>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Ingredients</h3>
              <ul style={{ margin: "0 0 14px", paddingLeft: 18 }}>
                {drink.ingredients.map((ing, i) => (
                  <li key={i}>
                    {ing.measure ? `${ing.measure} ` : ""}
                    {ing.name}
                    {ing.is_garnish ? " (garnish)" : ""}
                  </li>
                ))}
              </ul>
              {drink.instructions && (
                <>
                  <h3 style={{ fontSize: 15, marginBottom: 6 }}>Instructions</h3>
                  <p style={{ marginTop: 0, lineHeight: 1.5 }}>{drink.instructions}</p>
                </>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}

const styles = {
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12
  },
  subtle: { color: colors.textMuted, fontSize: 13 },
  barHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  search: {
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.surfaceMuted,
    color: colors.text,
    fontSize: 14
  },
  groupToggle: {
    background: "transparent",
    border: "none",
    color: colors.text,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    padding: "4px 0"
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13
  },
  opt: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14 }
};

const cardStyles = {
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 10,
    cursor: "pointer",
    textAlign: "left",
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    gap: 6
  },
  thumb: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8 },
  thumbFallback: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 40,
    background: colors.surfaceMuted
  },
  name: { fontWeight: 700, fontSize: 14 },
  missing: { fontSize: 12, color: colors.primary },
  meta: { fontSize: 12, color: colors.textMuted },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000
  },
  modal: {
    background: colors.surface,
    borderRadius: 14,
    padding: 20,
    maxWidth: 460,
    width: "100%",
    maxHeight: "88vh",
    overflowY: "auto",
    position: "relative"
  },
  modalImg: { width: "100%", borderRadius: 10 },
  close: {
    position: "absolute",
    top: 10,
    right: 10,
    background: colors.surfaceMuted,
    color: colors.text,
    border: "none",
    borderRadius: 8,
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: 16
  }
};
