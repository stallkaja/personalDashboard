import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../config";

// Shows the admin-set "special note" (e.g. "Remember dinner at 5 tonight") as a
// dismissible banner. Stays dismissed (per device) until the note text changes.
export default function AnnouncementBanner() {
  const { token } = useAuth();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/settings/app`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setNote((data.announcement || "").trim()))
      .catch(() => {});
  }, [token]);

  if (!token || !note) return null;
  if (localStorage.getItem("announcementDismissed") === note) return null;

  return (
    <div style={styles.banner}>
      <span style={styles.icon}>📌</span>
      <span style={styles.text}>{note}</span>
      <button
        style={styles.dismiss}
        onClick={() => {
          localStorage.setItem("announcementDismissed", note);
          setNote("");
        }}
        aria-label="Dismiss note"
      >
        ✕
      </button>
    </div>
  );
}

const styles = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#f59e0b",
    color: "#1f2937",
    padding: "10px 20px",
    fontWeight: 600
  },
  icon: { fontSize: 18 },
  text: { flex: 1, lineHeight: 1.4 },
  dismiss: {
    border: "none",
    background: "transparent",
    color: "#1f2937",
    cursor: "pointer",
    fontSize: 16
  }
};
