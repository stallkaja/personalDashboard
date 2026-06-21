import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://192.168.1.72:8132";

export default function CalendarDay() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { date } = useParams();

  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState(`${date}T09:00`);
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");

  const loadEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setEvents((data.events || []).filter((e) => e.start_time.startsWith(date)));
    } catch {
      setError("Failed to load events.");
    }
  };

  useEffect(() => {
    if (token) loadEvents();
  }, [token, date]);

  const addEvent = async () => {
    setError("");

    if (!title || !startTime) {
      setError("Title and start time are required.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          description,
          start_time: startTime,
          end_time: endTime || null
        })
      });

      if (!res.ok) {
        setError("Failed to create event.");
        return;
      }

      setTitle("");
      setDescription("");
      setStartTime(`${date}T09:00`);
      setEndTime("");
      loadEvents();
    } catch {
      setError("Network error creating event.");
    }
  };

  const deleteEvent = async (id) => {
    try {
      await fetch(`${API_URL}/events/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadEvents();
    } catch {
      setError("Failed to delete event.");
    }
  };

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("default", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <div style={styles.page}>
      <button style={styles.backButton} onClick={() => navigate("/calendar")}>
        ‹ Back to Calendar
      </button>

      <h1>📅 {dateLabel}</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <h2>Add Event</h2>

        <input
          style={styles.input}
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label style={styles.label}>Start</label>
        <input
          style={styles.input}
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />

        <label style={styles.label}>End (optional)</label>
        <input
          style={styles.input}
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />

        <button style={styles.button} onClick={addEvent}>
          Add Event
        </button>
      </div>

      <div style={styles.card}>
        <h2>Events for the Day</h2>

        {events.length === 0 ? (
          <p>No events scheduled.</p>
        ) : (
          events.map((ev) => (
            <div key={ev.id} style={styles.eventRow}>
              <div>
                <strong>{ev.title}</strong>
                <div style={styles.eventTime}>
                  {new Date(ev.start_time).toLocaleTimeString()}
                  {ev.end_time ? ` – ${new Date(ev.end_time).toLocaleTimeString()}` : ""}
                </div>
                {ev.description && <div style={styles.eventDesc}>{ev.description}</div>}
              </div>

              <button style={styles.deleteButton} onClick={() => deleteEvent(ev.id)}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 20,
    background: "#0f172a",
    minHeight: "100vh",
    color: "white"
  },
  card: {
    background: "#1e293b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20
  },
  label: {
    display: "block",
    marginBottom: 6,
    opacity: 0.8,
    fontSize: 14
  },
  input: {
    display: "block",
    width: "100%",
    maxWidth: 400,
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    border: "none"
  },
  button: {
    padding: "10px 15px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  },
  backButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#334155",
    color: "white",
    marginBottom: 16
  },
  deleteButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#7f1d1d",
    color: "white"
  },
  error: {
    background: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
  eventRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderTop: "1px solid #334155",
    padding: "12px 0"
  },
  eventTime: {
    opacity: 0.7,
    fontSize: 14
  },
  eventDesc: {
    opacity: 0.6,
    fontSize: 14,
    marginTop: 4
  }
};
