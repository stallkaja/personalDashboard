import { useEffect, useState, useCallback, useRef } from "react";
import theme, { colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import useUserTimezone from "../hooks/useUserTimezone";
import { API_URL } from "../config";

export default function Communication() {
  const { token, user } = useAuth();
  const tz = useUserTimezone();
  const isMobile = useIsMobile();

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);

  const [users, setUsers] = useState([]);           // all users (for the picker)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const [activeUser, setActiveUser] = useState(null); // { id, username }
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef(null);
  const activeIdRef = useRef(null);
  const prevCountRef = useRef(0);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // ---- data loading -------------------------------------------------------
  const loadConversations = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/direct-messages/conversations`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setConversations(data.conversations || []))
      .catch(() => {})
      .finally(() => setConvLoading(false));
  }, [token]);

  const loadUsers = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => setUsers((data.users || []).filter((u) => !u.is_me)))
      .catch(() => {});
  }, [token]);

  const loadThread = useCallback((otherId, { silent } = {}) => {
    if (!token || !otherId) return;
    if (!silent) setThreadLoading(true);
    fetch(`${API_URL}/direct-messages/thread/${otherId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        // Ignore late responses if the user switched threads mid-flight.
        if (activeIdRef.current !== otherId) return;
        setThreadMessages(data.messages || []);
        if (data.user) setActiveUser(data.user);
      })
      .catch(() => setError("Could not load conversation."))
      .finally(() => { if (!silent) setThreadLoading(false); });
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    loadConversations();
    const id = setInterval(loadConversations, 20000);
    return () => clearInterval(id);
  }, [loadConversations]);

  // Poll the open thread so incoming replies appear without a manual refresh.
  useEffect(() => {
    if (!activeUser) return;
    const id = setInterval(() => {
      loadThread(activeUser.id, { silent: true });
      loadConversations();
    }, 8000);
    return () => clearInterval(id);
  }, [activeUser, loadThread, loadConversations]);

  // Auto-scroll to the newest message when the thread grows or opens.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (threadMessages.length !== prevCountRef.current) {
      el.scrollTop = el.scrollHeight;
      prevCountRef.current = threadMessages.length;
    }
  }, [threadMessages, activeUser]);

  // ---- actions ------------------------------------------------------------
  const openThread = (otherUser) => {
    setError("");
    setPickerOpen(false);
    setPickerQuery("");
    setComposerText("");
    prevCountRef.current = 0;
    activeIdRef.current = otherUser.id;
    setActiveUser({ id: otherUser.id, username: otherUser.username });
    setThreadMessages([]);
    loadThread(otherUser.id);
    // Clearing unread happens server-side on thread open; refresh the list.
    setTimeout(loadConversations, 400);
  };

  const closeThread = () => {
    activeIdRef.current = null;
    setActiveUser(null);
    setThreadMessages([]);
  };

  const send = async () => {
    const text = composerText.trim();
    if (!text || !activeUser) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/direct-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ recipient_id: activeUser.id, body: text })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not send message.");
        return;
      }
      setComposerText("");
      loadThread(activeUser.id, { silent: true });
      loadConversations();
    } catch {
      setError("Network error sending message.");
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (id) => {
    try {
      await fetch(`${API_URL}/direct-messages/${id}`, { method: "DELETE", headers: authHeaders() });
      setThreadMessages((prev) => prev.filter((m) => m.id !== id));
      loadConversations();
    } catch {
      setError("Could not delete message.");
    }
  };

  const onComposerKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const fmtTime = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString(undefined, {
        timeZone: tz || undefined, hour: "numeric", minute: "2-digit"
      });
    } catch { return ""; }
  };

  const fmtWhen = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return d.toLocaleString(undefined, sameDay
        ? { timeZone: tz || undefined, hour: "numeric", minute: "2-digit" }
        : { timeZone: tz || undefined, month: "short", day: "numeric" });
    } catch { return ""; }
  };

  const initials = (name) => (name || "?").trim().charAt(0).toUpperCase();

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(pickerQuery.trim().toLowerCase())
  );

  const showSidebar = !isMobile || !activeUser;
  const showThread = !isMobile || !!activeUser;

  // ---- sidebar (conversation list) ---------------------------------------
  const sidebar = (
    <aside style={{ ...styles.sidebar, ...(isMobile ? styles.sidebarMobile : {}) }}>
      <div style={styles.sidebarHeader}>
        <h2 style={styles.sidebarTitle}>Messages</h2>
        <button style={theme.button} onClick={() => { setPickerOpen(true); setPickerQuery(""); }}>
          ✏️ New
        </button>
      </div>

      {convLoading ? (
        <p style={styles.muted}>Loading…</p>
      ) : conversations.length === 0 ? (
        <p style={styles.muted}>No conversations yet. Start one with “New”.</p>
      ) : (
        <div style={styles.convList}>
          {conversations.map((c) => {
            const active = activeUser && activeUser.id === c.user_id;
            return (
              <button
                key={c.user_id}
                style={{ ...styles.convItem, ...(active ? styles.convItemActive : {}) }}
                onClick={() => openThread({ id: c.user_id, username: c.username })}
              >
                <span style={styles.avatar}>{initials(c.username)}</span>
                <span style={styles.convMain}>
                  <span style={styles.convTop}>
                    <span style={{ fontWeight: c.unread ? 700 : 600 }}>{c.username}</span>
                    <span style={styles.convTime}>{fmtWhen(c.last_time)}</span>
                  </span>
                  <span style={styles.convPreview}>
                    <span style={{ ...styles.convText, fontWeight: c.unread ? 600 : 400 }}>
                      {c.last_from_me ? "You: " : ""}{c.last_message}
                    </span>
                    {c.unread > 0 && <span style={styles.unreadDot}>{c.unread}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );

  // ---- thread pane --------------------------------------------------------
  const threadPane = (
    <section style={styles.threadPane}>
      {!activeUser ? (
        <div style={styles.emptyThread}>
          <p style={styles.muted}>Select a conversation or start a new one.</p>
        </div>
      ) : (
        <>
          <div style={styles.threadHeader}>
            {isMobile && (
              <button style={styles.backBtn} onClick={closeThread} aria-label="Back">‹</button>
            )}
            <span style={styles.avatar}>{initials(activeUser.username)}</span>
            <strong style={{ fontSize: 16 }}>{activeUser.username}</strong>
          </div>

          <div style={styles.messages} ref={scrollRef}>
            {threadLoading ? (
              <p style={styles.muted}>Loading…</p>
            ) : threadMessages.length === 0 ? (
              <p style={styles.mutedCenter}>No messages yet. Say hello 👋</p>
            ) : (
              threadMessages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} style={{ ...styles.bubbleRow, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    <div style={{ ...styles.bubble, ...(mine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                      <div style={styles.bubbleBody}>{m.body}</div>
                      <div style={{ ...styles.bubbleTime, color: mine ? colors.primaryText : colors.textMuted }}>
                        {fmtTime(m.created_at)}
                        <button
                          style={{ ...styles.msgDelete, color: mine ? colors.primaryText : colors.text }}
                          onClick={() => deleteMessage(m.id)}
                          title="Delete for me"
                          aria-label="Delete message"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {error && <div style={{ ...theme.error, margin: "0 12px 8px" }}>{error}</div>}

          <div style={styles.composer}>
            <textarea
              style={styles.composerInput}
              rows={1}
              placeholder={`Message ${activeUser.username}…`}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={onComposerKey}
              maxLength={5000}
            />
            <button
              style={{ ...theme.button, opacity: !composerText.trim() || sending ? 0.5 : 1 }}
              onClick={send}
              disabled={!composerText.trim() || sending}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        </>
      )}
    </section>
  );

  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        {showSidebar && sidebar}
        {showThread && threadPane}
      </div>

      {pickerOpen && (
        <div style={styles.overlay} onClick={() => setPickerOpen(false)}>
          <div style={styles.picker} onClick={(e) => e.stopPropagation()}>
            <div style={styles.pickerHeader}>
              <strong>New message</strong>
              <button style={styles.iconBtn} onClick={() => setPickerOpen(false)} aria-label="Close">✕</button>
            </div>
            <input
              style={theme.input}
              autoFocus
              placeholder="Search people…"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
            />
            <div style={styles.pickerList}>
              {filteredUsers.length === 0 ? (
                <p style={styles.muted}>No matching people.</p>
              ) : (
                filteredUsers.map((u) => (
                  <button key={u.id} style={styles.pickerItem} onClick={() => openThread(u)}>
                    <span style={styles.avatar}>{initials(u.username)}</span>
                    {u.username}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PANE_HEIGHT = "calc(100vh - 96px)";

const styles = {
  page: { ...theme.page, paddingBottom: 12 },
  layout: {
    display: "flex",
    gap: 16,
    height: PANE_HEIGHT,
    minHeight: 0
  },
  muted: { opacity: 0.7, lineHeight: 1.5, padding: "4px 4px" },
  mutedCenter: { opacity: 0.6, textAlign: "center", marginTop: 24 },

  // Sidebar
  sidebar: {
    width: 320,
    flexShrink: 0,
    background: colors.surface,
    borderRadius: 12,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    minHeight: 0
  },
  sidebarMobile: { width: "100%" },
  sidebarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  sidebarTitle: { margin: 0, fontSize: 20 },
  convList: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 },
  convItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 8px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    color: colors.text,
    cursor: "pointer",
    textAlign: "left",
    width: "100%"
  },
  convItemActive: { background: colors.surfaceAlt },
  convMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  convTop: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" },
  convTime: { fontSize: 11, opacity: 0.6, whiteSpace: "nowrap" },
  convPreview: { display: "flex", alignItems: "center", gap: 6 },
  convText: {
    flex: 1, minWidth: 0, fontSize: 13, opacity: 0.75,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  },
  unreadDot: {
    flexShrink: 0,
    minWidth: 18, height: 18, padding: "0 5px",
    borderRadius: 9, background: colors.primary, color: colors.primaryText,
    fontSize: 11, fontWeight: "bold", lineHeight: "18px", textAlign: "center"
  },
  avatar: {
    flexShrink: 0,
    width: 34, height: 34, borderRadius: "50%",
    background: colors.primary, color: colors.primaryText,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontWeight: "bold", fontSize: 15
  },

  // Thread
  threadPane: {
    flex: 1,
    minWidth: 0,
    background: colors.surface,
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    minHeight: 0
  },
  emptyThread: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  threadHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottom: `1px solid ${colors.border}`
  },
  backBtn: {
    background: "transparent", border: "none", color: colors.text,
    fontSize: 26, lineHeight: 1, cursor: "pointer", padding: "0 6px 0 0"
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 0
  },
  bubbleRow: { display: "flex" },
  bubble: { maxWidth: "72%", padding: "8px 12px", borderRadius: 14 },
  bubbleMine: { background: colors.primary, color: colors.primaryText, borderBottomRightRadius: 4 },
  bubbleTheirs: { background: colors.surfaceAlt, color: colors.text, borderBottomLeftRadius: 4 },
  bubbleBody: { whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.4, fontSize: 15 },
  bubbleTime: {
    fontSize: 10.5, opacity: 0.8, marginTop: 3,
    display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end"
  },
  msgDelete: {
    background: "transparent", border: "none", cursor: "pointer",
    fontSize: 10, opacity: 0.6, padding: 0
  },
  composer: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    padding: 12,
    borderTop: `1px solid ${colors.border}`
  },
  composerInput: {
    flex: 1,
    resize: "none",
    maxHeight: 120,
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.surfaceAlt,
    color: colors.text,
    fontSize: 15,
    fontFamily: "inherit",
    lineHeight: 1.4
  },

  // New-message picker
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "10vh 16px 16px", zIndex: 1000
  },
  picker: {
    width: "100%", maxWidth: 420,
    background: colors.surface, borderRadius: 12, padding: 16,
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)"
  },
  pickerHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12
  },
  iconBtn: {
    background: "transparent", border: "none", color: colors.text,
    fontSize: 16, cursor: "pointer", opacity: 0.7
  },
  pickerList: { marginTop: 8, maxHeight: "40vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 },
  pickerItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 8px", borderRadius: 10, border: "none",
    background: "transparent", color: colors.text, cursor: "pointer",
    textAlign: "left", width: "100%", fontSize: 15
  }
};
