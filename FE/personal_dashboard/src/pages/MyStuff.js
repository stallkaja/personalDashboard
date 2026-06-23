import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function MyStuff() {
  const { token, user } = useAuth();

  const [myChores, setMyChores] = useState([]);
  const [myPhotos, setMyPhotos] = useState([]);
  const [myEvents, setMyEvents] = useState([]);

  useEffect(() => {
    if (!token || !user) return;

    const headers = { Authorization: `Bearer ${token}` };
    const username = (user.username || "").toLowerCase();

    fetch(`${API_URL}/chores`, { headers })
      .then((res) => res.json())
      .then((data) => {
        const mine = (data.chores || []).filter(
          (c) => !c.is_done && (c.assigned_to || "").toLowerCase() === username
        );
        setMyChores(mine);
      })
      .catch(() => {});

    fetch(`${API_URL}/photos?scope=mine`, { headers })
      .then((res) => res.json())
      .then((data) => setMyPhotos(data.photos || []))
      .catch(() => {});

    fetch(`${API_URL}/events`, { headers })
      .then((res) => res.json())
      .then((data) => {
        const now = new Date();
        const upcoming = (data.events || [])
          .filter((e) => e.created_by === user.id && new Date(e.start_time) >= now)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
          .slice(0, 10);
        setMyEvents(upcoming);
      })
      .catch(() => {});
  }, [token, user]);

  return (
    <div style={theme.page}>
      <h1>🙋 My Stuff</h1>
      <p style={{ opacity: 0.7 }}>
        Chores assigned to you, your private photos, and events you created.
      </p>

      <div style={theme.card}>
        <h2>My Chores</h2>

        {myChores.length === 0 ? (
          <p>Nothing assigned to you right now.</p>
        ) : (
          myChores.map((chore) => (
            <div key={chore.occurrence_id} style={styles.row}>
              <strong>{chore.title}</strong>
              {chore.due_date && (
                <span style={styles.meta}> — due {new Date(chore.due_date).toLocaleDateString()}</span>
              )}
            </div>
          ))
        )}

        <Link to="/chores" style={styles.link}>Open Chores →</Link>
      </div>

      <div style={theme.card}>
        <h2>My Upcoming Events</h2>

        {myEvents.length === 0 ? (
          <p>No upcoming events created by you.</p>
        ) : (
          myEvents.map((ev) => (
            <div key={ev.occurrence_id} style={styles.row}>
              <strong>{ev.title}</strong>
              <span style={styles.meta}> — {new Date(ev.start_time).toLocaleString()}</span>
            </div>
          ))
        )}

        <Link to="/calendar" style={styles.link}>Open Calendar →</Link>
      </div>

      <div style={theme.card}>
        <h2>My Private Photos</h2>

        {myPhotos.length === 0 ? (
          <p>You haven't uploaded any photos yet.</p>
        ) : (
          <div style={styles.grid}>
            {myPhotos.slice(0, 8).map((photo) => (
              <img
                key={photo.id}
                src={`${API_URL}${photo.url}`}
                alt={photo.caption || "My photo"}
                style={styles.thumb}
              />
            ))}
          </div>
        )}

        <Link to="/photo-gallery" style={styles.link}>Open Photo Gallery →</Link>
      </div>
    </div>
  );
}

const styles = {
  row: {
    borderTop: `1px solid ${colors.border}`,
    padding: "10px 0"
  },
  meta: {
    opacity: 0.6,
    fontSize: 14
  },
  link: {
    display: "inline-block",
    marginTop: 14,
    color: colors.primary,
    textDecoration: "none",
    fontSize: 14
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: 8
  },
  thumb: {
    width: "100%",
    height: 80,
    objectFit: "cover",
    borderRadius: 8
  }
};
