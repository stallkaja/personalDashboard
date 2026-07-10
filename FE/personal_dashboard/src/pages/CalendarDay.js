import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useUserTimezone from "../hooks/useUserTimezone";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";
import { dayKeyInTz, formatTimeInTz, tzAbbrev } from "../utils/time";

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
];

export default function CalendarDay() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { date } = useParams();
  const tz = useUserTimezone();

  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState(`${date}T09:00`);
  const [endTime, setEndTime] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [error, setError] = useState("");

  const loadEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setEvents((data.events || []).filter((e) => dayKeyInTz(e.start_time, tz) === date));
    } catch {
      setError("Failed to load events.");
    }
  };

  useEffect(() => {
    if (token) loadEvents();
  }, [token, date, tz]);

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
          end_time: endTime || null,
          timezone: tz,
          recurrence_rule: recurrenceRule,
          recurrence_end: recurrenceRule !== "none" ? (recurrenceEnd || null) : null
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
      setRecurrenceRule("none");
      setRecurrenceEnd("");
      loadEvents();
    } catch {
      setError("Network error creating event.");
    }
  };

  const deleteEvent = async (event) => {
    if (event.is_generated && !window.confirm(
      "This is a generated occurrence of a repeating event. Deleting will remove the entire series. Continue?"
    )) {
      return;
    }

    try {
      await fetch(`${API_URL}/events/${event.id}`, {
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
        <p style={styles.tzNote}>Times are entered and shown in {tz} ({tzAbbrev(tz)})</p>

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

        <label style={styles.label}>Repeats</label>
        <select
          style={styles.input}
          value={recurrenceRule}
          onChange={(e) => setRecurrenceRule(e.target.value)}
        >
          {RECURRENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {recurrenceRule !== "none" && (
          <>
            <label style={styles.label}>Repeat until (optional)</label>
            <input
              style={styles.input}
              type="date"
              value={recurrenceEnd}
              onChange={(e) => setRecurrenceEnd(e.target.value)}
            />
          </>
        )}

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
            <div key={ev.occurrence_id} style={styles.eventRow}>
              <div>
                <strong>{ev.recurrence_rule !== "none" ? "🔁 " : ""}{ev.title}</strong>
                <div style={styles.eventTime}>
                  {formatTimeInTz(ev.start_time, tz)}
                  {ev.end_time ? ` – ${formatTimeInTz(ev.end_time, tz)}` : ""}
                </div>
                {ev.description && <div style={styles.eventDesc}>{ev.description}</div>}
              </div>

              <button style={styles.deleteButton} onClick={() => deleteEvent(ev)}>
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
  page: theme.page,
  card: theme.card,
  label: theme.label,
  input: theme.input,
  button: theme.button,
  backButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    marginBottom: 16
  },
  deleteButton: theme.deleteButton,
  error: theme.error,
  tzNote: {
    opacity: 0.6,
    fontSize: 13,
    marginTop: -4,
    marginBottom: 12
  },
  eventRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderTop: `1px solid ${colors.border}`,
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
