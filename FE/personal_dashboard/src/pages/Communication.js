import { useEffect, useState, useCallback } from "react";
import theme, { colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import useUserTimezone from "../hooks/useUserTimezone";
import { API_URL } from "../config";

export default function Communication() {
  const { token } = useAuth();
  const tz = useUserTimezone();

  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/messages`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => setError("Could not load messages."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    const text = body.trim();
    if (!text) return;
    setError("");
    try {
      const res = await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: text })
      });
      if (!res.ok) { setError("Could not post message."); return; }
      setBody("");
      load();
    } catch {
      setError("Network error posting message.");
    }
  };

  const remove = async (id) => {
    try {
      await fetch(`${API_URL}/messages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError("Could not delete message.");
    }
  };

  const fmt = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        timeZone: tz || undefined,
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
      });
    } catch { return ""; }
  };

  return (
    <div style={theme.page}>
      <h1>💬 Communication</h1>
      <p style={styles.muted}>A shared space for the family to leave notes and updates.</p>

      <div style={theme.card}>
        <textarea
          style={styles.textarea}
          rows={3}
          placeholder="Write a note for the family…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
          maxLength={2000}
        />
        <div style={styles.postRow}>
          <span style={styles.hint}>Tip: Ctrl/⌘ + Enter to post</span>
          <button style={theme.button} onClick={post} disabled={!body.trim()}>Post</button>
        </div>
        {error && <div style={theme.error}>{error}</div>}
      </div>

      {loading ? (
        <p style={styles.muted}>Loading…</p>
      ) : messages.length === 0 ? (
        <div style={theme.card}><p style={styles.muted}>No messages yet. Be the first to post!</p></div>
      ) : (
        messages.map((m) => (
          <div key={m.id} style={theme.card}>
            <div style={styles.head}>
              <strong>{m.author}</strong>
              <span style={styles.time}>{fmt(m.created_at)}</span>
            </div>
            <div style={styles.body}>{m.body}</div>
            {m.is_mine && (
              <button style={styles.deleteBtn} onClick={() => remove(m.id)}>Delete</button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const styles = {
  muted: { opacity: 0.75, lineHeight: 1.5, marginBottom: 12 },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.surfaceAlt,
    color: colors.text,
    fontSize: 15,
    fontFamily: "inherit",
    resize: "vertical"
  },
  postRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  hint: { fontSize: 12, opacity: 0.6 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  time: { fontSize: 12, opacity: 0.6 },
  body: { whiteSpace: "pre-wrap", lineHeight: 1.5 },
  deleteBtn: {
    marginTop: 10,
    padding: "4px 10px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 13
  }
};
