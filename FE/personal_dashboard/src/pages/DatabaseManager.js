import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

const PAGE_SIZE = 100;

// Convention: a cell whose text is exactly NULL (any case) is sent as SQL NULL.
const toWire = (s) => (s.trim().toUpperCase() === "NULL" ? null : s);
const fromCell = (v) => (v === null || v === undefined ? "NULL" : String(v));

export default function DatabaseManager() {
  const { token } = useAuth();
  const [tab, setTab] = useState("browse");     // "browse" | "sql"
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  }), [token]);

  // ---- table browser -----------------------------------------------------
  const [tables, setTables] = useState([]);
  const [dbName, setDbName] = useState("");
  const [active, setActive] = useState(null);   // table name
  const [meta, setMeta] = useState({ columns: [], primary_key: [], rows: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [loadingTable, setLoadingTable] = useState(false);

  const [editKey, setEditKey] = useState(null);  // JSON of the row's pk being edited
  const [editVals, setEditVals] = useState({});
  const [adding, setAdding] = useState(false);
  const [newVals, setNewVals] = useState({});

  const loadTables = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/db/tables`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load tables."); return; }
      setTables(data.tables || []);
      setDbName(data.database || "");
    } catch { setError("Network error loading tables."); }
  }, [authHeaders]);

  const loadTable = useCallback(async (name, off = 0) => {
    setLoadingTable(true);
    setError(""); setStatus("");
    setEditKey(null); setAdding(false); setNewVals({});
    try {
      const res = await fetch(`${API_URL}/admin/db/table/${encodeURIComponent(name)}?limit=${PAGE_SIZE}&offset=${off}`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load table."); return; }
      setActive(name);
      setOffset(off);
      setMeta({ columns: data.columns, primary_key: data.primary_key, rows: data.rows, total: data.total });
    } catch { setError("Network error loading table."); }
    finally { setLoadingTable(false); }
  }, [authHeaders]);

  useEffect(() => { loadTables(); }, [loadTables]);

  const pkOf = (row) => {
    const pk = {};
    meta.primary_key.forEach((c) => { pk[c] = row[c]; });
    return pk;
  };
  const rowKey = (row, idx) =>
    meta.primary_key.length ? JSON.stringify(pkOf(row)) : `idx-${idx}`;

  const startEdit = (row, idx) => {
    const vals = {};
    meta.columns.forEach((c) => { vals[c.name] = fromCell(row[c.name]); });
    setEditVals(vals);
    setEditKey(rowKey(row, idx));
  };

  const saveEdit = async (row) => {
    const changed = {};
    meta.columns.forEach((c) => {
      const orig = fromCell(row[c.name]);
      if (editVals[c.name] !== orig) changed[c.name] = toWire(editVals[c.name]);
    });
    if (Object.keys(changed).length === 0) { setEditKey(null); return; }
    try {
      const res = await fetch(`${API_URL}/admin/db/table/${encodeURIComponent(active)}/rows`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ pk: pkOf(row), values: changed })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Update failed."); return; }
      setStatus(`Updated ${data.affected} row(s).`);
      setEditKey(null);
      loadTable(active, offset);
    } catch { setError("Network error updating row."); }
  };

  const deleteRow = async (row) => {
    if (!window.confirm("Delete this row? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_URL}/admin/db/table/${encodeURIComponent(active)}/rows`, {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ pk: pkOf(row) })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Delete failed."); return; }
      setStatus(`Deleted ${data.affected} row(s).`);
      loadTable(active, offset);
    } catch { setError("Network error deleting row."); }
  };

  const addRow = async () => {
    const values = {};
    Object.keys(newVals).forEach((c) => {
      if (newVals[c] !== undefined && newVals[c] !== "") values[c] = toWire(newVals[c]);
    });
    if (Object.keys(values).length === 0) { setError("Enter at least one value."); return; }
    try {
      const res = await fetch(`${API_URL}/admin/db/table/${encodeURIComponent(active)}/rows`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ values })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Insert failed."); return; }
      setStatus(`Inserted row (id ${data.inserted_id}).`);
      setAdding(false); setNewVals({});
      loadTable(active, offset);
    } catch { setError("Network error inserting row."); }
  };

  const canEdit = meta.primary_key.length > 0;

  // ---- SQL console -------------------------------------------------------
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const runSql = async () => {
    if (!sql.trim()) return;
    setRunning(true); setError(""); setStatus(""); setResult(null);
    try {
      const res = await fetch(`${API_URL}/admin/db/query`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ sql })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Query failed."); return; }
      setResult(data);
      if (data.type === "write") setStatus(`${data.affected} row(s) affected.`);
      // Table data may have changed underneath the browser.
      loadTables();
      if (active) loadTable(active, offset);
    } catch { setError("Network error running query."); }
    finally { setRunning(false); }
  };

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={{ margin: 0 }}>🗄️ Database Manager</h1>
        <Link to="/admin" style={styles.backLink}>‹ Back to Admin</Link>
      </div>
      <p style={styles.muted}>
        Connected to <strong>{dbName || "…"}</strong>. Changes here write directly to the live database.
      </p>

      <div style={styles.tabs}>
        <button style={tab === "browse" ? styles.tabActive : styles.tab} onClick={() => setTab("browse")}>
          Tables &amp; Rows
        </button>
        <button style={tab === "sql" ? styles.tabActive : styles.tab} onClick={() => setTab("sql")}>
          SQL Console
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {status && <div style={styles.status}>{status}</div>}

      {tab === "browse" ? (
        <div style={styles.browseLayout}>
          <aside style={styles.tableList}>
            <div style={styles.tableListHead}>Tables ({tables.length})</div>
            {tables.map((t) => (
              <button
                key={t.name}
                style={{ ...styles.tableItem, ...(active === t.name ? styles.tableItemActive : {}) }}
                onClick={() => loadTable(t.name, 0)}
              >
                <span>{t.name}</span>
                <span style={styles.rowCount}>{t.approx_rows}</span>
              </button>
            ))}
          </aside>

          <section style={styles.tableView}>
            {!active ? (
              <p style={styles.muted}>Select a table to browse its rows.</p>
            ) : loadingTable ? (
              <p style={styles.muted}>Loading…</p>
            ) : (
              <>
                <div style={styles.tableToolbar}>
                  <strong>{active}</strong>
                  <span style={styles.muted}>{meta.total} rows</span>
                  {!canEdit && <span style={styles.warnPill}>No primary key — read-only (use SQL console)</span>}
                  <div style={{ flex: 1 }} />
                  {canEdit && (
                    <button style={styles.smallButton} onClick={() => { setAdding(true); setNewVals({}); }}>
                      + Add row
                    </button>
                  )}
                  <button style={styles.smallButton} onClick={() => loadTable(active, offset)}>Refresh</button>
                </div>

                <div style={styles.gridWrap}>
                  <table style={styles.grid}>
                    <thead>
                      <tr>
                        {meta.columns.map((c) => (
                          <th key={c.name} style={styles.th} title={`${c.type}${c.key === "PRI" ? " · PK" : ""}`}>
                            {c.name}{c.key === "PRI" ? " 🔑" : ""}
                          </th>
                        ))}
                        {canEdit && <th style={styles.th}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {adding && (
                        <tr style={styles.addRow}>
                          {meta.columns.map((c) => (
                            <td key={c.name} style={styles.td}>
                              <input
                                style={styles.cellInput}
                                placeholder={c.extra?.includes("auto_increment") ? "(auto)" : c.type}
                                value={newVals[c.name] ?? ""}
                                onChange={(e) => setNewVals((p) => ({ ...p, [c.name]: e.target.value }))}
                              />
                            </td>
                          ))}
                          <td style={styles.td}>
                            <button style={styles.smallButton} onClick={addRow}>Save</button>
                            <button style={styles.linkBtn} onClick={() => { setAdding(false); setNewVals({}); }}>Cancel</button>
                          </td>
                        </tr>
                      )}
                      {meta.rows.map((row, idx) => {
                        const key = rowKey(row, idx);
                        const editing = editKey === key;
                        return (
                          <tr key={key} style={editing ? styles.editingRow : undefined}>
                            {meta.columns.map((c) => (
                              <td key={c.name} style={styles.td}>
                                {editing ? (
                                  <input
                                    style={styles.cellInput}
                                    value={editVals[c.name] ?? ""}
                                    onChange={(e) => setEditVals((p) => ({ ...p, [c.name]: e.target.value }))}
                                  />
                                ) : (
                                  <span style={row[c.name] === null ? styles.nullCell : undefined}>
                                    {row[c.name] === null ? "NULL" : String(row[c.name])}
                                  </span>
                                )}
                              </td>
                            ))}
                            {canEdit && (
                              <td style={styles.td}>
                                {editing ? (
                                  <>
                                    <button style={styles.smallButton} onClick={() => saveEdit(row)}>Save</button>
                                    <button style={styles.linkBtn} onClick={() => setEditKey(null)}>Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button style={styles.linkBtn} onClick={() => startEdit(row, idx)}>Edit</button>
                                    <button style={styles.dangerLink} onClick={() => deleteRow(row)}>Delete</button>
                                  </>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {meta.total > PAGE_SIZE && (
                  <div style={styles.pager}>
                    <button
                      style={styles.smallButton}
                      disabled={offset === 0}
                      onClick={() => loadTable(active, Math.max(0, offset - PAGE_SIZE))}
                    >
                      ‹ Prev
                    </button>
                    <span style={styles.muted}>
                      {offset + 1}–{Math.min(offset + PAGE_SIZE, meta.total)} of {meta.total}
                    </span>
                    <button
                      style={styles.smallButton}
                      disabled={offset + PAGE_SIZE >= meta.total}
                      onClick={() => loadTable(active, offset + PAGE_SIZE)}
                    >
                      Next ›
                    </button>
                  </div>
                )}
                <p style={styles.hint}>Tip: type <code>NULL</code> in a cell to store a SQL NULL.</p>
              </>
            )}
          </section>
        </div>
      ) : (
        <div style={styles.card}>
          <div style={styles.warnBanner}>
            ⚠️ This runs raw SQL against the live database. There is no undo — <code>UPDATE</code>/<code>DELETE</code>
            without a <code>WHERE</code> will affect every row.
          </div>
          <textarea
            style={styles.sqlInput}
            rows={6}
            spellCheck={false}
            placeholder="SELECT * FROM users LIMIT 20;"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runSql(); }}
          />
          <div style={styles.sqlBar}>
            <span style={styles.hint}>Ctrl/⌘ + Enter to run</span>
            <button style={theme.button} onClick={runSql} disabled={running || !sql.trim()}>
              {running ? "Running…" : "Run"}
            </button>
          </div>

          {result && result.type === "result" && (
            <div style={styles.gridWrap}>
              <div style={styles.muted}>
                {result.rowcount} row(s){result.truncated ? " (truncated at 2000)" : ""}
              </div>
              <table style={styles.grid}>
                <thead>
                  <tr>{result.columns.map((c) => <th key={c} style={styles.th}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j} style={styles.td}>
                          <span style={v === null ? styles.nullCell : undefined}>{v === null ? "NULL" : String(v)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rowcount === 0 && <p style={styles.muted}>No rows returned.</p>}
            </div>
          )}
          {result && result.type === "write" && (
            <div style={styles.status}>
              {result.affected} row(s) affected{result.lastrowid ? ` · last insert id ${result.lastrowid}` : ""}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  backLink: { color: colors.primary, textDecoration: "none" },
  muted: { opacity: 0.7, fontSize: 14 },
  hint: { opacity: 0.6, fontSize: 12, marginTop: 8 },
  error: theme.error,
  status: theme.status,
  tabs: { display: "flex", gap: 8, margin: "12px 0 16px" },
  tab: { ...theme.tab },
  tabActive: { ...theme.tabActive },

  browseLayout: { display: "flex", gap: 16, alignItems: "flex-start" },
  tableList: {
    width: 220, flexShrink: 0, background: colors.surface, borderRadius: 12,
    padding: 8, maxHeight: "70vh", overflowY: "auto"
  },
  tableListHead: { padding: "6px 8px", fontSize: 12, opacity: 0.6, textTransform: "uppercase" },
  tableItem: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
    width: "100%", padding: "8px 10px", border: "none", borderRadius: 8,
    background: "transparent", color: colors.text, cursor: "pointer", textAlign: "left", fontSize: 14
  },
  tableItemActive: { background: colors.surfaceAlt },
  rowCount: { fontSize: 11, opacity: 0.5 },

  tableView: { flex: 1, minWidth: 0, background: colors.surface, borderRadius: 12, padding: 16 },
  tableToolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" },
  warnPill: {
    fontSize: 12, padding: "2px 8px", borderRadius: 10,
    background: colors.danger, opacity: 0.85
  },
  gridWrap: { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: 8 },
  grid: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "8px 10px", whiteSpace: "nowrap",
    borderBottom: `1px solid ${colors.borderStrong}`, position: "sticky", top: 0,
    background: colors.surfaceMuted
  },
  td: { padding: "6px 10px", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap", verticalAlign: "top" },
  cellInput: {
    padding: "4px 6px", borderRadius: 6, border: `1px solid ${colors.border}`,
    background: colors.surfaceAlt, color: colors.text, fontSize: 13, minWidth: 80, maxWidth: 260
  },
  nullCell: { opacity: 0.4, fontStyle: "italic" },
  editingRow: { background: colors.surfaceAlt },
  addRow: { background: colors.surfaceAlt },
  pager: { display: "flex", alignItems: "center", gap: 12, marginTop: 12 },

  smallButton: { ...theme.smallButton, background: colors.border, color: colors.text, marginRight: 6 },
  linkBtn: {
    background: "transparent", border: "none", color: colors.primary,
    cursor: "pointer", fontSize: 13, marginRight: 8, padding: 0
  },
  dangerLink: {
    background: "transparent", border: "none", color: colors.danger,
    cursor: "pointer", fontSize: 13, padding: 0
  },

  warnBanner: {
    background: colors.danger, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14, lineHeight: 1.5
  },
  sqlInput: {
    width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 8,
    border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text,
    fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 14, resize: "vertical"
  },
  sqlBar: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 16px" }
};
