import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function IcarusServers() {
  const { token } = useAuth();

  const [servers, setServers] = useState([]);
  const [tab, setTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});     // name -> "starting" | "stopping"
  const [showSecret, setShowSecret] = useState({}); // name -> bool

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  }), [token]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/icarus-servers`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load servers."); return; }
      setServers(data.servers || []);
      setError("");
      setTab((prev) => prev || (data.servers && data.servers[0]?.name) || null);
    } catch {
      setError("Network error loading servers.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { if (token) load(); }, [token, load]);

  // Poll every 5s while this page is open so status/log tails stay live.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [token, load]);

  const startServer = async (name) => {
    setBusy((b) => ({ ...b, [name]: "starting" }));
    setError("");
    try {
      const res = await fetch(`${API_URL}/icarus-servers/${name}/start`, {
        method: "POST",
        headers: authHeaders
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Failed to start server.");
      await load();
    } catch {
      setError("Network error starting server.");
    } finally {
      setBusy((b) => ({ ...b, [name]: null }));
    }
  };

  const stopServer = async (name) => {
    setBusy((b) => ({ ...b, [name]: "stopping" }));
    setError("");
    try {
      const res = await fetch(`${API_URL}/icarus-servers/${name}/stop`, {
        method: "POST",
        headers: authHeaders
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Failed to stop server.");
      await load();
    } catch {
      setError("Network error stopping server.");
    } finally {
      setBusy((b) => ({ ...b, [name]: null }));
    }
  };

  const active = servers.find((s) => s.name === tab);

  const fmtUptime = (startedAt) => {
    if (!startedAt) return null;
    const ms = Date.now() - new Date(startedAt).getTime();
    if (ms < 0) return null;
    const mins = Math.floor(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div style={styles.page}>
      <h1 style={{ marginTop: 0 }}>🛰️ Icarus Servers</h1>
      <p style={styles.muted}>
        Start, stop, and monitor the dedicated Icarus servers running on this machine.
      </p>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : servers.length === 0 ? (
        <p style={styles.muted}>No Icarus servers are configured.</p>
      ) : (
        <>
          <div style={styles.tabs}>
            {servers.map((s) => (
              <button
                key={s.name}
                style={tab === s.name ? styles.tabActive : styles.tab}
                onClick={() => setTab(s.name)}
              >
                <span style={s.running ? styles.dotOn : styles.dotOff} />
                {s.label}
              </button>
            ))}
          </div>

          {active && (
            <div style={styles.card}>
              <div style={styles.headerRow}>
                <div>
                  <h2 style={{ margin: 0 }}>{active.label}</h2>
                  <div style={styles.statusLine}>
                    <span style={active.running ? styles.dotOn : styles.dotOff} />
                    {active.running ? "Running" : "Stopped"}
                    {active.running && active.pid && ` · PID ${active.pid}`}
                    {active.running && fmtUptime(active.started_at) && ` · up ${fmtUptime(active.started_at)}`}
                  </div>
                </div>

                <div style={styles.actions}>
                  {active.running ? (
                    <button
                      style={theme.dangerButton}
                      onClick={() => stopServer(active.name)}
                      disabled={!!busy[active.name]}
                    >
                      {busy[active.name] === "stopping" ? "Stopping..." : "⏹ Stop"}
                    </button>
                  ) : (
                    <button
                      style={theme.successButton}
                      onClick={() => startServer(active.name)}
                      disabled={!!busy[active.name] || !active.installed}
                    >
                      {busy[active.name] === "starting" ? "Starting..." : "▶ Start"}
                    </button>
                  )}
                </div>
              </div>

              {!active.installed && (
                <div style={styles.warning}>
                  IcarusServer.exe was not found for this instance — check the install path.
                </div>
              )}

              <div style={styles.grid}>
                <div style={styles.field}>
                  <div style={styles.label}>Game Port</div>
                  <div>{active.port} / UDP</div>
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>Query Port</div>
                  <div>{active.query_port} / UDP</div>
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>Max Players</div>
                  <div>{active.max_players || "—"}</div>
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>Join Password</div>
                  <div style={styles.secretRow}>
                    <span>{showSecret[active.name] ? (active.join_password || "(none)") : "••••••••"}</span>
                    <button
                      style={styles.secretToggle}
                      onClick={() => setShowSecret((s) => ({ ...s, [active.name]: !s[active.name] }))}
                    >
                      {showSecret[active.name] ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>Admin Password</div>
                  <div style={styles.secretRow}>
                    <span>{showSecret[active.name] ? (active.admin_password || "(none)") : "••••••••"}</span>
                    <button
                      style={styles.secretToggle}
                      onClick={() => setShowSecret((s) => ({ ...s, [active.name]: !s[active.name] }))}
                    >
                      {showSecret[active.name] ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

              <h3 style={styles.h3}>Live Log</h3>
              {active.running ? (
                active.log_tail && active.log_tail.length > 0 ? (
                  <pre style={styles.log}>{active.log_tail.join("\n")}</pre>
                ) : (
                  <p style={styles.muted}>No log output yet.</p>
                )
              ) : (
                <p style={styles.muted}>Start the server to see live log output.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  error: theme.error,
  muted: {
    opacity: 0.7,
    fontSize: 14,
    marginBottom: 12
  },
  tabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16
  },
  tab: { ...theme.tab, display: "flex", alignItems: "center", gap: 8 },
  tabActive: { ...theme.tabActive, display: "flex", alignItems: "center", gap: 8 },
  dotOn: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: colors.successSolid,
    display: "inline-block",
    flexShrink: 0
  },
  dotOff: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: colors.textMuted,
    display: "inline-block",
    flexShrink: 0,
    opacity: 0.5
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap"
  },
  statusLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    fontSize: 14,
    opacity: 0.8
  },
  actions: {
    display: "flex",
    gap: 10
  },
  warning: {
    background: colors.danger,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
    fontSize: 13
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 20
  },
  field: {
    background: colors.surfaceMuted,
    borderRadius: 10,
    padding: 12
  },
  label: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 4
  },
  secretRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  secretToggle: {
    padding: "2px 8px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 11
  },
  h3: {
    marginBottom: 8,
    fontSize: 15
  },
  log: {
    background: "#0d1117",
    color: "#c9d1d9",
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    fontFamily: "Consolas, Monaco, monospace",
    overflowX: "auto",
    maxHeight: 320,
    overflowY: "auto",
    margin: 0
  }
};
