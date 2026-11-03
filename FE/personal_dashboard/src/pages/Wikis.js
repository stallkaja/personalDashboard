import { Link } from "react-router-dom";
import useIsMobile from "../hooks/useIsMobile";
import theme, { colors } from "../styles/theme";
import { WIKIS } from "../wikis/registry";

export default function Wikis() {
  const isMobile = useIsMobile();

  return (
    <div style={{ ...theme.page, padding: isMobile ? 12 : 20 }}>
      <h2 style={{ margin: "0 0 4px" }}>Wikis</h2>
      <p style={{ margin: "0 0 18px", color: colors.textMuted }}>
        Game guides and reference wikis. Pick one to open it.
      </p>

      <div style={styles.grid}>
        {WIKIS.map((w) => (
          <Link key={w.id} to={`/wikis/${w.id}`} style={styles.card}>
            <div style={styles.cardHead}>
              <span style={{ ...styles.badge, borderColor: w.accent, color: w.accent }}>{w.initials}</span>
              <div style={{ minWidth: 0 }}>
                <div style={styles.name}>{w.name}</div>
                <div style={styles.tagline}>{w.tagline}</div>
              </div>
            </div>
            <p style={styles.desc}>{w.description}</p>
            <div style={styles.tags}>
              {w.tags.map((t) => (
                <span key={t} style={styles.tag}>{t}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16
  },
  card: {
    ...theme.card,
    marginBottom: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    color: colors.text,
    textDecoration: "none",
    border: `1px solid ${colors.border}`
  },
  cardHead: { display: "flex", alignItems: "center", gap: 12 },
  badge: {
    width: 46,
    height: 46,
    flexShrink: 0,
    borderRadius: 10,
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontWeight: "bold",
    fontSize: 18,
    letterSpacing: 1
  },
  name: { fontSize: 18, fontWeight: "bold" },
  tagline: { fontSize: 14, color: colors.textMuted },
  desc: { margin: 0, fontSize: 14, lineHeight: 1.5, opacity: 0.9 },
  tags: { display: "flex", flexWrap: "wrap", gap: 6 },
  tag: {
    fontSize: 12,
    padding: "2px 10px",
    borderRadius: 999,
    background: colors.surfaceMuted,
    border: `1px solid ${colors.border}`
  }
};
