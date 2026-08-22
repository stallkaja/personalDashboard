import { useCallback, useEffect, useState } from "react";
import useIsMobile from "../../hooks/useIsMobile";
import theme, { colors } from "../../styles/theme";
import { API_URL } from "../../config";

export default function SftpShares({ token }) {
  const isMobile = useIsMobile();

  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");

  const [browsePath, setBrowsePath] = useState(""); // "" = drive list
  const [pathHistory, setPathHistory] = useState([]);
  const [folders, setFolders] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");

  const [shares, setShares] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesError, setSharesError] = useState("");

  const [selectedFolder, setSelectedFolder] = useState(null); // {name, path}
  const [newShareName, setNewShareName] = useState("");
  const [adding, setAdding] = useState(false);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      setStatusError("");
      const res = await fetch(`${API_URL}/admin/sftp/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusError(data.error || "Failed to load SFTP status");
        return;
      }
      setStatus(data);
    } catch (err) {
      console.error(err);
      setStatusError("Network error loading SFTP status");
    }
  }, [token]);

  const loadShares = useCallback(async () => {
    if (!token) return;
    try {
      setSharesLoading(true);
      setSharesError("");
      const res = await fetch(`${API_URL}/admin/sftp/shares`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setShares([]);
        setSharesError(data.error || "Failed to load shares");
        return;
      }
      setShares(Array.isArray(data.shares) ? data.shares : []);
    } catch (err) {
      console.error(err);
      setSharesError("Network error loading shares");
    } finally {
      setSharesLoading(false);
    }
  }, [token]);

  const loadFolders = useCallback(async (path) => {
    if (!token) return;
    try {
      setBrowseLoading(true);
      setBrowseError("");
      const url = new URL(`${API_URL}/admin/sftp/browse`);
      if (path) url.searchParams.set("path", path);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setFolders([]);
        setBrowseError(data.error || "Failed to browse folder");
        return;
      }
      setFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch (err) {
      console.error(err);
      setBrowseError("Network error browsing local filesystem");
    } finally {
      setBrowseLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
    loadShares();
    loadFolders("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drillInto = (folder) => {
    setPathHistory((h) => [...h, browsePath]);
    setBrowsePath(folder.path);
    loadFolders(folder.path);
  };

  const goBack = () => {
    setPathHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setBrowsePath(prev);
      loadFolders(prev);
      return h.slice(0, -1);
    });
  };

  const selectFolder = (folder) => {
    setSelectedFolder(folder);
    setNewShareName(folder.name.replace(/[:\\]/g, "") || folder.name);
  };

  const addShare = async () => {
    if (!selectedFolder || !newShareName.trim()) return;
    try {
      setAdding(true);
      setSharesError("");
      const res = await fetch(`${API_URL}/admin/sftp/shares`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: newShareName.trim(), path: selectedFolder.path })
      });
      const data = await res.json();
      if (!res.ok) {
        setSharesError(data.error || "Failed to add share");
        return;
      }
      setSelectedFolder(null);
      setNewShareName("");
      loadShares();
    } catch (err) {
      console.error(err);
      setSharesError("Network error adding share");
    } finally {
      setAdding(false);
    }
  };

  const removeShare = async (share) => {
    if (!window.confirm(
      `Stop sharing "/${share.name}"? The real folder on disk will not be deleted.`
    )) return;

    try {
      setSharesError("");
      const res = await fetch(`${API_URL}/admin/sftp/shares/${share.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setSharesError(data.error || "Failed to remove share");
        return;
      }
      loadShares();
    } catch (err) {
      console.error(err);
      setSharesError("Network error removing share");
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>SFTP Shares</h2>
      <p style={styles.muted}>
        Expose local folders over SFTP to Windows Administrator accounts on this machine.
        Login uses real Windows credentials, not dashboard accounts.
      </p>

      {status?.running && (
        <p style={styles.muted}>
          Server running on port {status.port} · fingerprint {status.fingerprint}
        </p>
      )}
      {statusError && <div style={theme.error}>{statusError}</div>}
      {sharesError && <div style={theme.error}>{sharesError}</div>}

      <div style={{ ...styles.dualPane, flexDirection: isMobile ? "column" : "row" }}>
        {/* LEFT: local filesystem browser */}
        <div style={styles.pane}>
          <div style={styles.paneHeader}>
            <strong>Local Folders</strong>
            {pathHistory.length > 0 && (
              <button style={styles.smallButton} onClick={goBack}>← Back</button>
            )}
          </div>
          <div style={styles.breadcrumb}>{browsePath || "This PC"}</div>
          {browseError && <div style={theme.error}>{browseError}</div>}
          {browseLoading && <p style={styles.muted}>Loading…</p>}
          <ul style={styles.folderList}>
            {folders.map((f) => (
              <li
                key={f.path}
                style={{
                  ...styles.folderRow,
                  ...(selectedFolder?.path === f.path ? styles.folderRowSelected : {})
                }}
              >
                <span style={styles.folderName} onDoubleClick={() => drillInto(f)}>
                  📁 {f.name}
                </span>
                <div style={styles.folderRowActions}>
                  <button style={styles.smallButton} onClick={() => drillInto(f)}>Open</button>
                  <button style={styles.smallButton} onClick={() => selectFolder(f)}>Select</button>
                </div>
              </li>
            ))}
            {!browseLoading && folders.length === 0 && (
              <li style={styles.muted}>No subfolders here.</li>
            )}
          </ul>
        </div>

        {/* MIDDLE: add action */}
        <div style={styles.paneAction}>
          <label style={theme.label}>Share name</label>
          <input
            style={theme.input}
            placeholder="e.g. Videos"
            value={newShareName}
            onChange={(e) => setNewShareName(e.target.value)}
          />
          <button
            style={styles.button}
            disabled={!selectedFolder || !newShareName.trim() || adding}
            onClick={addShare}
          >
            {adding ? "Adding…" : "Add →"}
          </button>
          {selectedFolder && <p style={styles.muted}>{selectedFolder.path}</p>}
        </div>

        {/* RIGHT: current shares */}
        <div style={styles.pane}>
          <div style={styles.paneHeader}>
            <strong>Current Shares (server)</strong>
            <button style={styles.smallButton} onClick={loadShares}>Refresh</button>
          </div>
          {sharesLoading && <p style={styles.muted}>Loading…</p>}
          {!sharesLoading && shares.length === 0 ? (
            <p style={styles.muted}>No shares configured.</p>
          ) : (
            <ul style={styles.folderList}>
              {shares.map((s) => (
                <li key={s.id} style={styles.folderRow}>
                  <span style={styles.folderName}>📁 /{s.name} → {s.real_path}</span>
                  <button style={theme.dangerButton} onClick={() => removeShare(s)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: theme.card,
  h2: { marginTop: 0 },
  muted: { opacity: 0.7, marginTop: -4 },
  button: theme.button,
  smallButton: theme.smallButton,
  dualPane: {
    display: "flex",
    gap: 16,
    marginTop: 12,
    alignItems: "stretch"
  },
  pane: {
    flex: 1,
    minWidth: 0,
    background: colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column"
  },
  paneAction: {
    width: 220,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignSelf: "flex-start",
    padding: "12px 0"
  },
  paneHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  breadcrumb: {
    fontSize: 12,
    opacity: 0.65,
    marginBottom: 8,
    wordBreak: "break-all"
  },
  folderList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    overflowY: "auto",
    maxHeight: 360
  },
  folderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    padding: "8px 6px",
    borderBottom: `1px solid ${colors.border}`
  },
  folderRowSelected: {
    background: colors.surfaceMuted,
    borderRadius: 6
  },
  folderRowActions: {
    display: "flex",
    gap: 6,
    flexShrink: 0
  },
  folderName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: "pointer"
  }
};
