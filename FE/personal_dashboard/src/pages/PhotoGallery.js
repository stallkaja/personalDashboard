import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function PhotoGallery() {
  const { token } = useAuth();
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState("mine");
  const [myPhotos, setMyPhotos] = useState([]);
  const [sharedPhotos, setSharedPhotos] = useState([]);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadPhotos = async () => {
    try {
      const [mineRes, sharedRes] = await Promise.all([
        fetch(`${API_URL}/photos?scope=mine`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/photos?scope=shared`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const mineData = await mineRes.json();
      const sharedData = await sharedRes.json();

      setMyPhotos(mineData.photos || []);
      setSharedPhotos(sharedData.photos || []);
    } catch {
      setError("Failed to load photos.");
    }
  };

  useEffect(() => {
    if (token) loadPhotos();
  }, [token]);

  const uploadPhoto = async () => {
    setError("");

    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setError("Choose a photo to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("visibility", visibility);
    if (caption) formData.append("caption", caption);

    setUploading(true);

    try {
      const res = await fetch(`${API_URL}/photos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        setError("Failed to upload photo.");
        setUploading(false);
        return;
      }

      setCaption("");
      setVisibility("private");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploading(false);
      loadPhotos();
    } catch {
      setError("Network error uploading photo.");
      setUploading(false);
    }
  };

  const deletePhoto = async (id) => {
    try {
      await fetch(`${API_URL}/photos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadPhotos();
    } catch {
      setError("Failed to delete photo.");
    }
  };

  const photos = tab === "mine" ? myPhotos : sharedPhotos;

  const albums = photos.reduce((acc, photo) => {
    const monthLabel = photo.created_at
      ? new Date(photo.created_at).toLocaleString("default", { month: "long", year: "numeric" })
      : "Undated";

    acc[monthLabel] = acc[monthLabel] || [];
    acc[monthLabel].push(photo);
    return acc;
  }, {});

  const albumOrder = Object.keys(albums).sort((a, b) => {
    const dateA = albums[a][0]?.created_at ? new Date(albums[a][0].created_at) : 0;
    const dateB = albums[b][0]?.created_at ? new Date(albums[b][0].created_at) : 0;
    return dateB - dateA;
  });

  return (
    <div style={styles.page}>
      <h1>📷 Family Photo Gallery</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <h2>Upload a Photo</h2>

        <input style={styles.fileInput} type="file" accept="image/*" ref={fileInputRef} />

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

        <button style={styles.button} onClick={uploadPhoto} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload Photo"}
        </button>
      </div>

      <div style={styles.card}>
        <div style={styles.tabRow}>
          <button
            style={tab === "mine" ? styles.tabActive : styles.tab}
            onClick={() => setTab("mine")}
          >
            My Photos
          </button>

          <button
            style={tab === "shared" ? styles.tabActive : styles.tab}
            onClick={() => setTab("shared")}
          >
            Shared Photos
          </button>
        </div>

        {photos.length === 0 ? (
          <p>
            {tab === "mine"
              ? "You haven't uploaded any photos yet."
              : "No photos have been shared yet."}
          </p>
        ) : (
          albumOrder.map((monthLabel) => (
            <div key={monthLabel} style={styles.album}>
              <h3 style={styles.albumHeading}>{monthLabel}</h3>

              <div style={styles.grid}>
                {albums[monthLabel].map((photo) => (
                  <div key={photo.id} style={styles.photoCard}>
                    <img
                      src={`${API_URL}${photo.url}`}
                      alt={photo.caption || photo.original_name || "Family photo"}
                      style={styles.photoImg}
                    />

                    {photo.caption && <div style={styles.caption}>{photo.caption}</div>}

                    {photo.is_mine && (
                      <button style={styles.deleteButton} onClick={() => deletePhoto(photo.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
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
    color: colors.text,
    marginTop: 8,
    width: "100%"
  },
  error: theme.error,
  tabRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16
  },
  tab: theme.tab,
  tabActive: theme.tabActive,
  album: {
    marginBottom: 24
  },
  albumHeading: {
    marginBottom: 12,
    opacity: 0.85
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16
  },
  photoCard: {
    background: colors.surfaceMuted,
    borderRadius: 12,
    padding: 10,
    border: `1px solid ${colors.border}`
  },
  photoImg: {
    width: "100%",
    height: 180,
    objectFit: "cover",
    borderRadius: 8,
    display: "block"
  },
  caption: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.8
  }
};
