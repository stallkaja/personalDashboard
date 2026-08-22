import { useCallback, useEffect, useRef, useState } from "react";
import useIsMobile from "../../hooks/useIsMobile";
import theme, { colors } from "../../styles/theme";
import { API_URL } from "../../config";

function formatSize(bytes) {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

let nextLocalId = 1;

export default function TransferFiles({ token }) {
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);

  const [remotePath, setRemotePath] = useState(""); // "" = share list (root)
  const [remotePathHistory, setRemotePathHistory] = useState([]);
  const [remoteEntries, setRemoteEntries] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");

  const [localFiles, setLocalFiles] = useState([]); // [{id, file}]
  const [transferStatus, setTransferStatus] = useState({}); // id/path -> "uploading"|"downloading"|"done"|"error"
  const [dragOver, setDragOver] = useState(false);

  const loadRemote = useCallback(async (path) => {
    if (!token) return;
    try {
      setRemoteLoading(true);
      setRemoteError("");
      const url = new URL(`${API_URL}/admin/sftp/remote/list`);
      if (path) url.searchParams.set("path", path);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) {
        setRemoteEntries([]);
        setRemoteError(data.error || "Failed to list host folder");
        return;
      }
      setRemoteEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (err) {
      console.error(err);
      setRemoteError("Network error browsing the host over the dashboard API");
    } finally {
      setRemoteLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadRemote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drillInto = (entry) => {
    setRemotePathHistory((h) => [...h, remotePath]);
    setRemotePath(entry.path);
    loadRemote(entry.path);
  };

  const goBack = () => {
    setRemotePathHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setRemotePath(prev);
      loadRemote(prev);
      return h.slice(0, -1);
    });
  };

  const addLocalFiles = (fileList) => {
    const picked = Array.from(fileList || []).map((file) => ({ id: nextLocalId++, file }));
    setLocalFiles((prev) => [...prev, ...picked]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addLocalFiles(e.dataTransfer.files);
  };

  const removeLocalFile = (id) => {
    setLocalFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFile = async (staged) => {
    if (!remotePath) {
      setRemoteError("Open a share folder on the right before uploading (can't upload to the share list itself).");
      return;
    }
    setTransferStatus((s) => ({ ...s, [staged.id]: "uploading" }));
    try {
      const form = new FormData();
      form.append("path", remotePath);
      form.append("file", staged.file, staged.file.name);
      const res = await fetch(`${API_URL}/admin/sftp/remote/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const data = await res.json();
      if (!res.ok) {
        setRemoteError(data.error || "Upload failed");
        setTransferStatus((s) => ({ ...s, [staged.id]: "error" }));
        return;
      }
      setTransferStatus((s) => ({ ...s, [staged.id]: "done" }));
      setLocalFiles((prev) => prev.filter((f) => f.id !== staged.id));
      loadRemote(remotePath);
    } catch (err) {
      console.error(err);
      setRemoteError("Network error uploading file");
      setTransferStatus((s) => ({ ...s, [staged.id]: "error" }));
    }
  };

  const downloadFile = async (entry) => {
    setTransferStatus((s) => ({ ...s, [entry.path]: "downloading" }));
    try {
      const url = new URL(`${API_URL}/admin/sftp/remote/download`);
      url.searchParams.set("path", entry.path);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRemoteError(data.error || "Download failed");
        setTransferStatus((s) => ({ ...s, [entry.path]: "error" }));
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      setTransferStatus((s) => ({ ...s, [entry.path]: "done" }));
    } catch (err) {
      console.error(err);
      setRemoteError("Network error downloading file");
      setTransferStatus((s) => ({ ...s, [entry.path]: "error" }));
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>Transfer Files</h2>
      <p style={styles.muted}>
        Copy files between this device and the host, within whatever folders are shared
        (see the SFTP Shares tab to add more). Browsers can't show a live tree of your own
        computer's drives, so the local side works by drag-and-drop / file picker instead.
      </p>

      {remoteError && <div style={theme.error}>{remoteError}</div>}

      <div style={{ ...styles.dualPane, flexDirection: isMobile ? "column" : "row" }}>
        {/* LEFT: this device (staging area, drag-and-drop or picker) */}
        <div style={styles.pane}>
          <div style={styles.paneHeader}>
            <strong>This Device</strong>
            <button style={styles.smallButton} onClick={() => fileInputRef.current?.click()}>
              Choose files…
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { addLocalFiles(e.target.files); e.target.value = ""; }}
          />
          <div
            style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {localFiles.length === 0
              ? "Drag files here, or use \"Choose files…\""
              : `${localFiles.length} file(s) staged`}
          </div>
          <ul style={styles.folderList}>
            {localFiles.map((staged) => (
              <li key={staged.id} style={styles.folderRow}>
                <span style={styles.folderName}>
                  📄 {staged.file.name} <span style={styles.sizeTag}>{formatSize(staged.file.size)}</span>
                </span>
                <div style={styles.folderRowActions}>
                  <button
                    style={styles.smallButton}
                    disabled={transferStatus[staged.id] === "uploading"}
                    onClick={() => uploadFile(staged)}
                  >
                    {transferStatus[staged.id] === "uploading" ? "Uploading…" : "Upload →"}
                  </button>
                  <button style={theme.neutralButton} onClick={() => removeLocalFile(staged.id)}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* RIGHT: the host, browsed over the SFTP share filesystem */}
        <div style={styles.pane}>
          <div style={styles.paneHeader}>
            <strong>Host</strong>
            {remotePathHistory.length > 0 && (
              <button style={styles.smallButton} onClick={goBack}>← Back</button>
            )}
          </div>
          <div style={styles.breadcrumb}>/{remotePath || ""}</div>
          {remoteLoading && <p style={styles.muted}>Loading…</p>}
          <ul style={styles.folderList}>
            {remoteEntries.map((entry) => (
              <li key={entry.path} style={styles.folderRow}>
                <span
                  style={styles.folderName}
                  onDoubleClick={() => entry.is_dir && drillInto(entry)}
                >
                  {entry.is_dir ? "📁" : "📄"} {entry.name}{" "}
                  {!entry.is_dir && <span style={styles.sizeTag}>{formatSize(entry.size)}</span>}
                </span>
                <div style={styles.folderRowActions}>
                  {entry.is_dir ? (
                    <button style={styles.smallButton} onClick={() => drillInto(entry)}>Open</button>
                  ) : (
                    <button
                      style={styles.smallButton}
                      disabled={transferStatus[entry.path] === "downloading"}
                      onClick={() => downloadFile(entry)}
                    >
                      {transferStatus[entry.path] === "downloading" ? "Downloading…" : "← Download"}
                    </button>
                  )}
                </div>
              </li>
            ))}
            {!remoteLoading && remoteEntries.length === 0 && (
              <li style={styles.muted}>Empty.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: theme.card,
  h2: { marginTop: 0 },
  muted: { opacity: 0.7, marginTop: -4 },
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
  dropZone: {
    border: `2px dashed ${colors.border}`,
    borderRadius: 8,
    padding: 20,
    textAlign: "center",
    fontSize: 13,
    opacity: 0.75,
    marginBottom: 8
  },
  dropZoneActive: {
    borderColor: colors.primary,
    opacity: 1
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
  },
  sizeTag: {
    opacity: 0.6,
    fontSize: 12
  }
};
