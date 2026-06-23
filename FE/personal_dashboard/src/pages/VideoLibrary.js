import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

function formatFileSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export default function VideoLibrary() {
  const { token } = useAuth();
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState("local");
  const [myVideos, setMyVideos] = useState([]);
  const [sharedVideos, setSharedVideos] = useState([]);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [localVideos, setLocalVideos] = useState([]);
  const [localFolders, setLocalFolders] = useState([]);
  const [localFolder, setLocalFolder] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [nowPlaying, setNowPlaying] = useState(null);

  const loadLocalVideos = async (path) => {
    setLocalLoading(true);
    setLocalError("");

    try {
      const res = await fetch(`${API_URL}/local-videos?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (data.error) {
        setLocalError(data.error);
      }

      setLocalFolder(data.folder || "");
      setLocalFolders(data.folders || []);
      setLocalVideos(data.videos || []);
    } catch {
      setLocalError("Failed to load local videos.");
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    if (token && tab === "local") {
      loadLocalVideos(currentPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, currentPath]);

  const breadcrumbs = currentPath
    ? currentPath.split("/").reduce((acc, segment) => {
        const parentPath = acc.length > 0 ? acc[acc.length - 1].path : "";
        acc.push({ name: segment, path: parentPath ? `${parentPath}/${segment}` : segment });
        return acc;
      }, [])
    : [];

  const requestConversion = async (video) => {
    setLocalVideos((prev) =>
      prev.map((v) => (v.path === video.path ? { ...v, conversion_status: "queued" } : v))
    );

    try {
      await fetch(`${API_URL}/local-videos/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ path: video.path })
      });
    } catch {
      setLocalError("Failed to start conversion.");
    }
  };

  useEffect(() => {
    const pending = localVideos.filter(
      (v) => v.conversion_status === "queued" || v.conversion_status === "running"
    );

    if (pending.length === 0 || !token) return;

    const interval = setInterval(async () => {
      for (const video of pending) {
        try {
          const res = await fetch(
            `${API_URL}/local-videos/convert-status?path=${encodeURIComponent(video.path)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await res.json();

          setLocalVideos((prev) =>
            prev.map((v) => {
              if (v.path !== video.path) return v;

              if (data.status === "done") {
                return { ...v, conversion_status: "done", playable_in_browser: true, url: data.url };
              }

              if (data.status === "failed") {
                return { ...v, conversion_status: "failed", conversion_error: data.error_message };
              }

              return { ...v, conversion_status: data.status };
            })
          );
        } catch {
          // keep polling on transient errors
        }
      }
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localVideos, token]);

  const loadVideos = async () => {
    try {
      const [mineRes, sharedRes] = await Promise.all([
        fetch(`${API_URL}/videos?scope=mine`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/videos?scope=shared`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const mineData = await mineRes.json();
      const sharedData = await sharedRes.json();

      setMyVideos(mineData.videos || []);
      setSharedVideos(sharedData.videos || []);
    } catch {
      setError("Failed to load videos.");
    }
  };

  useEffect(() => {
    if (token) loadVideos();
  }, [token]);

  const uploadVideo = async () => {
    setError("");

    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setError("Choose a video to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("visibility", visibility);
    if (caption) formData.append("caption", caption);

    setUploading(true);

    try {
      const res = await fetch(`${API_URL}/videos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to upload video.");
        setUploading(false);
        return;
      }

      setCaption("");
      setVisibility("private");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploading(false);
      loadVideos();
    } catch {
      setError("Network error uploading video. Large files can take a while — please wait and retry if needed.");
      setUploading(false);
    }
  };

  const deleteVideo = async (id) => {
    if (!window.confirm("Delete this video?")) return;

    try {
      await fetch(`${API_URL}/videos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadVideos();
    } catch {
      setError("Failed to delete video.");
    }
  };

  const videos = tab === "mine" ? myVideos : sharedVideos;

  return (
    <div style={styles.page}>
      <h1>🎬 Family Video Library</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <div style={styles.tabRow}>
          <button
            style={tab === "mine" ? styles.tabActive : styles.tab}
            onClick={() => setTab("mine")}
          >
            My Videos
          </button>

          <button
            style={tab === "shared" ? styles.tabActive : styles.tab}
            onClick={() => setTab("shared")}
          >
            Shared Videos
          </button>

          <button
            style={tab === "local" ? styles.tabActive : styles.tab}
            onClick={() => setTab("local")}
          >
            Local Folder
          </button>
        </div>

        {tab === "local" ? (
          <>
            {localError && <div style={styles.error}>{localError}</div>}

            <div style={styles.playerSection}>
              {nowPlaying ? (
                <div style={styles.videoCard}>
                  <video
                    controls
                    autoPlay
                    style={styles.video}
                    src={`${API_URL}${nowPlaying.url}`}
                  >
                    Your browser does not support video playback.
                  </video>
                  <div style={styles.videoMeta}>
                    <strong>{nowPlaying.name}</strong>
                    <button style={styles.deleteButton} onClick={() => setNowPlaying(null)}>
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.videoCard}>
                  <div style={styles.videoPlaceholder}>
                    <span style={styles.muted}>Select a file below to play it here.</span>
                  </div>
                </div>
              )}
            </div>

            <div style={styles.filesSection}>
              <div style={styles.breadcrumbRow}>
                <span
                  style={currentPath ? styles.breadcrumbLink : styles.breadcrumbCurrent}
                  onClick={() => currentPath && setCurrentPath("")}
                >
                  🏠 {localFolder || "Home"}
                </span>

                {breadcrumbs.map((crumb, index) => (
                  <span key={crumb.path}>
                    <span style={styles.breadcrumbSep}>›</span>
                    <span
                      style={index === breadcrumbs.length - 1 ? styles.breadcrumbCurrent : styles.breadcrumbLink}
                      onClick={() => index !== breadcrumbs.length - 1 && setCurrentPath(crumb.path)}
                    >
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </div>

              {localLoading ? (
                <p>Loading folder...</p>
              ) : localFolders.length === 0 && localVideos.length === 0 ? (
                !localError && <p>This folder is empty.</p>
              ) : (
                <div style={styles.localList}>
                  {currentPath && (
                    <div
                      style={styles.folderRow}
                      onClick={() => {
                        const parts = currentPath.split("/");
                        parts.pop();
                        setCurrentPath(parts.join("/"));
                      }}
                    >
                      <span style={styles.folderIcon}>⬆️</span>
                      <span style={styles.folderName}>.. (up one level)</span>
                    </div>
                  )}

                  {localFolders.map((folder) => (
                    <div
                      key={folder.path}
                      style={styles.folderRow}
                      onClick={() => setCurrentPath(folder.path)}
                    >
                      <span style={styles.folderIcon}>📁</span>
                      <span style={styles.folderName}>{folder.name}</span>
                    </div>
                  ))}

                  {localVideos.map((video) => (
                    <div key={video.path} style={styles.localRow}>
                      <div style={styles.localInfo}>
                        <span style={styles.fileIcon}>{video.playable_in_browser ? "🎬" : "🎞️"}</span>
                        <div>
                          <div>{video.name}</div>
                          <div style={styles.fileSize}>{formatFileSize(video.size)}</div>
                        </div>
                      </div>

                      <div style={styles.localActions}>
                        {video.playable_in_browser ? (
                          <button style={styles.button} onClick={() => setNowPlaying(video)}>
                            ▶ Play
                          </button>
                        ) : video.conversion_status === "queued" ? (
                          <span style={styles.unsupported}>Queued for conversion...</span>
                        ) : video.conversion_status === "running" ? (
                          <span style={styles.unsupported}>Converting...</span>
                        ) : (
                          <>
                            <span style={styles.unsupported}>Unsupported format</span>
                            <button style={styles.convertButton} onClick={() => requestConversion(video)}>
                              Convert to MP4
                            </button>
                          </>
                        )}
                      </div>

                      {video.conversion_status === "failed" && (
                        <div style={styles.conversionError} title={video.conversion_error}>
                          Conversion failed
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : videos.length === 0 ? (
          <p>
            {tab === "mine"
              ? "You haven't uploaded any videos yet."
              : "No videos have been shared yet."}
          </p>
        ) : (
          <div style={styles.list}>
            {videos.map((video) => (
              <div key={video.id} style={styles.videoCard}>
                <video controls style={styles.video} preload="metadata">
                  <source src={`${API_URL}${video.url}`} />
                  Your browser does not support video playback.
                </video>

                <div style={styles.videoMeta}>
                  <div>
                    <strong>{video.original_name || "Video"}</strong>
                    {video.caption && <div style={styles.caption}>{video.caption}</div>}
                    <div style={styles.fileSize}>{formatFileSize(video.file_size)}</div>
                  </div>

                  {video.is_mine && (
                    <button style={styles.deleteButton} onClick={() => deleteVideo(video.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <h2>Upload a Video</h2>
        <p style={styles.muted}>Supported formats: MP4, WebM, Ogg, MOV. Large files may take a while to upload.</p>

        <input
          style={styles.fileInput}
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime"
          ref={fileInputRef}
        />

        <input
          style={styles.input}
          placeholder="Caption (optional)"
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

        <button style={styles.button} onClick={uploadVideo} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload Video"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  label: theme.label,
  input: theme.input,
  fileInput: {
    display: "block",
    marginBottom: 12,
    color: colors.text
  },
  button: theme.button,
  deleteButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.danger,
    color: colors.text
  },
  error: theme.error,
  muted: {
    opacity: 0.7,
    fontSize: 14,
    marginBottom: 12
  },
  tabRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16
  },
  tab: theme.tab,
  tabActive: theme.tabActive,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 16
  },
  videoCard: {
    background: colors.surfaceMuted,
    borderRadius: 12,
    padding: 14,
    border: `1px solid ${colors.border}`
  },
  video: {
    width: "100%",
    maxHeight: 480,
    borderRadius: 8,
    background: "#000",
    display: "block"
  },
  videoPlaceholder: {
    width: "100%",
    aspectRatio: "16 / 9",
    maxHeight: 480,
    borderRadius: 8,
    background: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  videoMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 10,
    gap: 12
  },
  caption: {
    marginTop: 4,
    fontSize: 14,
    opacity: 0.8
  },
  fileSize: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.6
  },
  playerSection: {
    marginBottom: 20
  },
  filesSection: {
    borderTop: `1px solid ${colors.border}`,
    paddingTop: 16
  },
  breadcrumbRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 14,
    fontSize: 14
  },
  breadcrumbLink: {
    color: colors.primary,
    cursor: "pointer",
    textDecoration: "underline"
  },
  breadcrumbCurrent: {
    opacity: 0.85,
    fontWeight: "bold"
  },
  breadcrumbSep: {
    opacity: 0.4,
    margin: "0 4px"
  },
  localList: {
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  folderRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 6px",
    borderBottom: `1px solid ${colors.border}`,
    cursor: "pointer",
    borderRadius: 6
  },
  folderIcon: {
    fontSize: 18,
    flexShrink: 0
  },
  folderName: {
    fontWeight: 500
  },
  fileIcon: {
    fontSize: 18,
    flexShrink: 0
  },
  localRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 4px",
    borderBottom: `1px solid ${colors.border}`,
    gap: 12
  },
  localInfo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  unsupported: {
    fontSize: 12,
    opacity: 0.5,
    whiteSpace: "nowrap"
  },
  localActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0
  },
  convertButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.primary,
    color: colors.primaryText,
    fontSize: 13,
    whiteSpace: "nowrap"
  },
  conversionError: {
    fontSize: 11,
    color: colors.dangerSolid,
    cursor: "help"
  }
};
