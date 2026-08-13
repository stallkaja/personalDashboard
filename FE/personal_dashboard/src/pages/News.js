import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, (Date.now() - then) / 1000);
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function News() {
  const { token } = useAuth();
  const isMobile = useIsMobile();

  const [articles, setArticles] = useState([]);
  const [sources, setSources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeSource, setActiveSource] = useState("All");
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/news?limit=150`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setArticles(d.articles || []);
        setSources(d.sources || []);
        setCategories(d.categories || []);
      })
      .catch(() => setError("Could not load news."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Only show category chips that actually have articles, in the server's order.
  const presentCategories = useMemo(() => {
    const have = new Set(articles.map((a) => a.category).filter(Boolean));
    return categories.filter((c) => have.has(c));
  }, [articles, categories]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (activeSource !== "All" && a.source !== activeSource) return false;
      if (activeCategory !== "All" && a.category !== activeCategory) return false;
      if (q) {
        const hay = `${a.title || ""} ${a.summary || ""} ${a.source || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [articles, activeSource, activeCategory, query]);

  return (
    <div style={theme.page}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>📰 News</h1>
        <button style={styles.refresh} onClick={load}>↻ Refresh</button>
      </div>
      <p style={styles.muted}>Headlines aggregated from major outlets. Tap a story to read it at the source.</p>

      {error && <div style={theme.error}>{error}</div>}

      <input
        style={styles.search}
        placeholder="🔍 Search headlines…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {presentCategories.length > 0 && (
        <>
          <div style={styles.filterLabel}>Topic</div>
          <div style={styles.filters}>
            {["All", ...presentCategories].map((c) => (
              <button
                key={c}
                style={activeCategory === c ? styles.chipActive : styles.chip}
                onClick={() => setActiveCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={styles.filterLabel}>Source</div>
      <div style={styles.filters}>
        {["All", ...sources].map((s) => (
          <button
            key={s}
            style={activeSource === s ? styles.chipActive : styles.chip}
            onClick={() => setActiveSource(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={styles.resultCount}>{shown.length} stor{shown.length === 1 ? "y" : "ies"}</div>

      {loading ? (
        <p style={styles.muted}>Loading the latest headlines…</p>
      ) : shown.length === 0 ? (
        <p style={styles.muted}>No stories to show.</p>
      ) : (
        <div style={styles.list}>
          {shown.map((a, i) => (
            <a
              key={`${a.link}-${i}`}
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.card, flexDirection: isMobile ? "column" : "row" }}
            >
              {a.image && (
                <img
                  src={a.image}
                  alt=""
                  style={{ ...styles.thumb, width: isMobile ? "100%" : 160, height: isMobile ? 160 : 110 }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <div style={styles.body}>
                <div style={styles.meta}>
                  <span style={styles.source}>{a.source}</span>
                  {a.published && <span style={styles.time}>· {timeAgo(a.published)}</span>}
                </div>
                <div style={styles.title}>{a.title}</div>
                {a.summary && <div style={styles.summary}>{a.summary}</div>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  refresh: {
    padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
    background: colors.border, color: colors.text, fontSize: 14
  },
  muted: { opacity: 0.7, lineHeight: 1.5, marginBottom: 14 },
  search: {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text,
    fontSize: 15, marginBottom: 14
  },
  filterLabel: { fontSize: 11, fontWeight: "bold", opacity: 0.55, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  resultCount: { fontSize: 13, opacity: 0.6, marginBottom: 14 },
  filters: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, overflowX: "auto" },
  chip: {
    padding: "6px 12px", borderRadius: 999, border: `1px solid ${colors.border}`,
    background: "transparent", color: colors.text, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap"
  },
  chipActive: {
    padding: "6px 12px", borderRadius: 999, border: "none",
    background: colors.primary, color: colors.primaryText, cursor: "pointer",
    fontSize: 13, fontWeight: "bold", whiteSpace: "nowrap"
  },
  list: { display: "flex", flexDirection: "column", gap: 14 },
  card: {
    display: "flex", gap: 14, background: colors.surface, borderRadius: 14,
    overflow: "hidden", border: `1px solid ${colors.border}`, textDecoration: "none",
    color: colors.text
  },
  thumb: { objectFit: "cover", flexShrink: 0, background: colors.surfaceMuted },
  body: { padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  meta: { fontSize: 12, opacity: 0.7, display: "flex", gap: 6, alignItems: "center" },
  source: { fontWeight: "bold", color: colors.primary },
  time: { opacity: 0.7 },
  title: { fontWeight: "bold", fontSize: 16, lineHeight: 1.3 },
  summary: {
    fontSize: 14, opacity: 0.8, lineHeight: 1.4,
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
  }
};
