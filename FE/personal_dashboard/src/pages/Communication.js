import { useEffect, useState, useCallback } from "react";
import theme, { colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import useUserTimezone from "../hooks/useUserTimezone";
import { API_URL } from "../config";

export default function Communication() {
  const { token, user } = useAuth();
  const tz = useUserTimezone();
  const isMobile = useIsMobile();

  const [box, setBox] = useState("inbox");           // "inbox" | "sent"
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);    // full message being read
  const [composing, setComposing] = useState(false);
  const [users, setUsers] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Compose form state
  const [toId, setToId] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [parentId, setParentId] = useState(null);
  const [sending, setSending] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadList = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/direct-messages?box=${box}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => setError("Could not load messages."))
      .finally(() => setLoading(false));
  }, [token, box]);

  const loadUnread = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/direct-messages/unread-count`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setUnread(data.unread || 0))
      .catch(() => {});
  }, [token]);

  const loadUsers = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setUsers((data.users || []).filter((u) => !u.is_me)))
      .catch(() => {});
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadUnread(); loadUsers(); }, [loadUnread, loadUsers]);

  const openMessage = async (m) => {
    setError("");
    try {
      const res = await fetch(`${API_URL}/direct-messages/${m.id}`, { headers: authHeaders });
      if (!res.ok) { setError("Could not open message."); return; }
      const data = await res.json();
      setSelected(data.message);
      // Reflect read state in the list + badge without a full reload.
      if (box === "inbox" && !m.is_read) {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)));
        setUnread((n) => Math.max(0, n - 1));
      }
    } catch {
      setError("Network error opening message.");
    }
  };

  const startCompose = () => {
    setParentId(null);
    setToId("");
    setSubject("");
    setBodyText("");
    setSelected(null);
    setComposing(true);
    setError("");
  };

  const startReply = (m) => {
    const base = m.subject && m.subject !== "(no subject)" ? m.subject : "";
    setParentId(m.id);
    setToId(String(m.sender_id));
    setSubject(base.startsWith("Re:") ? base : `Re: ${base}`.trim());
    setBodyText("");
    setSelected(null);
    setComposing(true);
    setError("");
  };

  const cancelCompose = () => {
    setComposing(false);
    setParentId(null);
  };

  const send = async () => {
    if (!toId) { setError("Please choose a recipient."); return; }
    if (!bodyText.trim()) { setError("Message body cannot be empty."); return; }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/direct-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          recipient_id: Number(toId),
          subject: subject.trim(),
          body: bodyText.trim(),
          parent_id: parentId
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not send message.");
        return;
      }
      setComposing(false);
      setParentId(null);
      setBox("sent");
      loadList();
    } catch {
      setError("Network error sending message.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    try {
      await fetch(`${API_URL}/direct-messages/${id}`, { method: "DELETE", headers: authHeaders });
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selected && selected.id === id) setSelected(null);
      loadUnread();
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

  const partyLabel = (m) => (box === "inbox" ? m.sender_name : `To: ${m.recipient_name}`);

  // ---- Compose view -------------------------------------------------------
  if (composing) {
    return (
      <div style={theme.page}>
        <h1>✉️ {parentId ? "Reply" : "New Message"}</h1>

        <div style={theme.card}>
          <label style={theme.label}>To</label>
          <select style={theme.input} value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Select a recipient…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>

          <label style={theme.label}>Subject</label>
          <input
            style={theme.input}
            placeholder="Subject (optional)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={255}
          />

          <label style={theme.label}>Message</label>
          <textarea
            style={styles.textarea}
            rows={8}
            placeholder="Write your message…"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            maxLength={5000}
          />

          {error && <div style={theme.error}>{error}</div>}

          <div style={styles.actionRow}>
            <button style={theme.button} onClick={send} disabled={sending || !toId || !bodyText.trim()}>
              {sending ? "Sending…" : "Send"}
            </button>
            <button style={styles.neutralBtn} onClick={cancelCompose} disabled={sending}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Reading view -------------------------------------------------------
  if (selected) {
    return (
      <div style={theme.page}>
        <button style={styles.backBtn} onClick={() => setSelected(null)}>‹ Back</button>

        <div style={theme.card}>
          <h2 style={{ marginTop: 0 }}>{selected.subject}</h2>
          <div style={styles.metaLine}>
            <strong>From:</strong> {selected.sender_name}
            {selected.sender_id === user?.id ? " (you)" : ""}
          </div>
          <div style={styles.metaLine}>
            <strong>To:</strong> {selected.recipient_name}
            {selected.recipient_id === user?.id ? " (you)" : ""}
          </div>
          <div style={styles.metaTime}>{fmt(selected.created_at)}</div>

          <div style={styles.readBody}>{selected.body}</div>

          <div style={styles.actionRow}>
            {selected.recipient_id === user?.id && (
              <button style={theme.button} onClick={() => startReply(selected)}>Reply</button>
            )}
            <button style={styles.deleteBtn} onClick={() => remove(selected.id)}>Delete</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- List view ----------------------------------------------------------
  return (
    <div style={theme.page}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>💬 Communication</h1>
        <button style={theme.button} onClick={startCompose}>✉️ New Message</button>
      </div>
      <p style={styles.muted}>Private messages between members — like an internal inbox.</p>

      <div style={styles.tabs}>
        <button
          style={box === "inbox" ? styles.tabActive : styles.tab}
          onClick={() => { setBox("inbox"); setSelected(null); }}
        >
          Inbox{unread > 0 ? ` (${unread})` : ""}
        </button>
        <button
          style={box === "sent" ? styles.tabActive : styles.tab}
          onClick={() => { setBox("sent"); setSelected(null); }}
        >
          Sent
        </button>
      </div>

      {error && <div style={theme.error}>{error}</div>}

      {loading ? (
        <p style={styles.muted}>Loading…</p>
      ) : messages.length === 0 ? (
        <div style={theme.card}>
          <p style={styles.muted}>
            {box === "inbox" ? "Your inbox is empty." : "You haven't sent any messages yet."}
          </p>
        </div>
      ) : (
        <div style={theme.card}>
          {messages.map((m, idx) => {
            const unreadRow = box === "inbox" && !m.is_read;
            return (
              <div
                key={m.id}
                style={{
                  ...styles.row,
                  padding: isMobile ? "12px 2px" : "12px 4px",
                  ...(idx === 0 ? { borderTop: "none" } : {}),
                  ...(unreadRow ? styles.rowUnread : {})
                }}
                onClick={() => openMessage(m)}
              >
                <div style={styles.rowMain}>
                  <div style={styles.rowTop}>
                    <span style={{ fontWeight: unreadRow ? 700 : 500 }}>
                      {unreadRow ? "● " : ""}{partyLabel(m)}
                    </span>
                    <span style={styles.rowTime}>{fmt(m.created_at)}</span>
                  </div>
                  <div style={{ ...styles.rowSubject, fontWeight: unreadRow ? 700 : 400 }}>
                    {m.subject}
                  </div>
                  <div style={styles.rowSnippet}>
                    {m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body}
                  </div>
                </div>
                <button
                  style={styles.rowDelete}
                  onClick={(e) => { e.stopPropagation(); remove(m.id); }}
                  aria-label="Delete message"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap"
  },
  muted: { opacity: 0.75, lineHeight: 1.5, marginBottom: 12 },
  tabs: { display: "flex", gap: 8, marginBottom: 16 },
  tab: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: colors.surfaceAlt,
    color: colors.text,
    fontSize: 14
  },
  tabActive: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: colors.primary,
    color: colors.primaryText,
    fontWeight: "bold",
    fontSize: 14
  },
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
    resize: "vertical",
    marginBottom: 12
  },
  actionRow: { display: "flex", gap: 10, alignItems: "center", marginTop: 4 },
  neutralBtn: {
    padding: "10px 15px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 15
  },
  backBtn: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    marginBottom: 16
  },
  metaLine: { fontSize: 14, opacity: 0.85, marginBottom: 2 },
  metaTime: { fontSize: 13, opacity: 0.6, marginTop: 6, marginBottom: 16 },
  readBody: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    fontSize: 15,
    borderTop: `1px solid ${colors.border}`,
    paddingTop: 16,
    marginBottom: 16
  },
  deleteBtn: {
    padding: "10px 15px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 15
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 4px",
    borderTop: `1px solid ${colors.border}`,
    cursor: "pointer"
  },
  rowUnread: { background: colors.surfaceAlt, borderRadius: 8 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" },
  rowTime: { fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" },
  rowSubject: { fontSize: 15, margin: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowSnippet: { fontSize: 13, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowDelete: {
    background: "transparent",
    border: "none",
    color: colors.text,
    opacity: 0.4,
    cursor: "pointer",
    fontSize: 14,
    padding: 4,
    flexShrink: 0
  }
};
