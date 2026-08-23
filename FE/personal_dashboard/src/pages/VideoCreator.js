import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

const STATUS_LABEL = {
  queued: "Queued...",
  running: "Downloading...",
  done: "Done",
  failed: "Failed"
};

export default function VideoCreator() {
  const { token } = useAuth();

  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDownloads = async () => {
    try {
      const res = await fetch(`${API_URL}/video-downloads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDownloads(data.downloads || []);
    } catch {
      // keep showing whatever we last had; the poll will retry
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadDownloads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Poll while anything is still in flight, same pattern as local-video conversion.
  useEffect(() => {
    const pending = downloads.some((d) => d.status === "queued" || d.status === "running");
    if (!pending || !token) return;

    const interval = setInterval(loadDownloads, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloads, token]);

  const submit = async () => {
    setError("");

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a link first.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/video-downloads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url: trimmed, caption: caption.trim() || null, visibility })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Failed to queue download.");
        setSubmitting(false);
        return;
      }

      setUrl("");
      setCaption("");
      setSubmitting(false);
      loadDownloads();
    } catch {
      setError("Network error queuing the download.");
      setSubmitting(false);
    }
  };

  const clearEntry = async (id) => {
    try {
      await fetch(`${API_URL}/video-downloads/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setDownloads((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError("Failed to clear that entry.");
    }
  };

  return (
    <div style={styles.page}>
      <h1>🔗 Video Creator</h1>
      <p style={styles.muted}>
        Paste a link to a video -- Reddit/v.redd.it, redgifs, gfycat, imgur, YouTube, and most
        other video sites are supported -- and it's downloaded and added to the{" "}
        <Link to="/video-library" style={styles.inlineLink}>Video Library</Link>.
      </p>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <label style={styles.label}>Link</label>
        <input
          style={styles.input}
          placeholder="https://www.reddit.com/r/... or https://www.redgifs.com/watch/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <label style={styles.label}>Caption (optional)</label>
        <input
          style={styles.input}
          placeholder="Defaults to the video's title"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <label style={styles.label}>Visibility</label>
        <select
          style={styles.input}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="private">Private — only visible to me</option>
          <option value="shared">Shared — visible to everyone logged in</option>
        </select>

        <button style={styles.button} onClick={submit} disabled={submitting}>
          {submitting ? "Queuing..." : "Fetch Video"}
        </button>
      </div>

      <div style={styles.card}>
        <h2>Recent Downloads</h2>

        {loading ? (
          <p>Loading...</p>
        ) : downloads.length === 0 ? (
          <p style={styles.muted}>Nothing downloaded yet.</p>
        ) : (
          <div style={styles.list}>
            {downloads.map((d) => (
              <div key={d.id} style={styles.row}>
                <div style={styles.rowMain}>
                  <div style={styles.rowTitle}>{d.title || d.source_url}</div>
                  <div style={styles.rowUrl}>{d.source_url}</div>
                  {d.status === "failed" && d.error_message && (
                    <div style={styles.rowError} title={d.error_message}>
                      {d.error_message.length > 140
                        ? `${d.error_message.slice(0, 140)}...`
                        : d.error_message}
                    </div>
                  )}
                </div>

                <div style={styles.rowActions}>
                  <span
                    style={
                      d.status === "failed"
                        ? styles.statusFailed
                        : d.status === "done"
                        ? styles.statusDone
                        : styles.statusPending
                    }
                  >
                    {STATUS_LABEL[d.status] || d.status}
                  </span>

                  {d.status === "done" && d.video_url && (
                    <Link to="/video-library" style={styles.playLink}>
                      View in Library
                    </Link>
                  )}

                  <button style={styles.clearButton} onClick={() => clearEntry(d.id)}>
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  label: theme.label,
  input: theme.input,
  button: theme.button,
  error: theme.error,
  muted: {
    opacity: 0.7,
    fontSize: 14,
    marginBottom: 12
  },
  inlineLink: {
    color: colors.primary
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    background: colors.surfaceMuted,
    borderRadius: 12,
    padding: 14,
    border: `1px solid ${colors.border}`
  },
  rowMain: {
    minWidth: 0,
    flex: 1
  },
  rowTitle: {
    fontWeight: "bold",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  rowUrl: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  rowError: {
    marginTop: 6,
    fontSize: 12,
    color: colors.dangerSolid,
    cursor: "help"
  },
  rowActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0
  },
  statusPending: {
    fontSize: 13,
    opacity: 0.7,
    whiteSpace: "nowrap"
  },
  statusDone: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "bold",
    whiteSpace: "nowrap"
  },
  statusFailed: {
    fontSize: 13,
    color: colors.dangerSolid,
    fontWeight: "bold",
    whiteSpace: "nowrap"
  },
  playLink: {
    fontSize: 13,
    color: colors.primary,
    whiteSpace: "nowrap"
  },
  clearButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.danger,
    color: colors.text,
    fontSize: 13,
    whiteSpace: "nowrap"
  }
};
