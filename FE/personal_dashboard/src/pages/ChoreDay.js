import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import theme from "../styles/theme";
import { API_URL } from "../config";

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
];

export default function ChoreDay() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { date } = useParams();

  const [chores, setChores] = useState([]);
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [error, setError] = useState("");

  const loadChores = async () => {
    try {
      const res = await fetch(`${API_URL}/chores`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setChores((data.chores || []).filter((c) => c.due_date === date));
    } catch {
      setError("Failed to load chores.");
    }
  };

  useEffect(() => {
    if (token) loadChores();
  }, [token, date]);

  const addChore = async () => {
    setError("");

    if (!title) {
      setError("Title is required.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/chores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          assigned_to: assignedTo || null,
          due_date: date,
          recurrence_rule: recurrenceRule,
          recurrence_end: recurrenceRule !== "none" ? (recurrenceEnd || null) : null
        })
      });

      if (!res.ok) {
        setError("Failed to create chore.");
        return;
      }

      setTitle("");
      setAssignedTo("");
      setRecurrenceRule("none");
      setRecurrenceEnd("");
      loadChores();
    } catch {
      setError("Network error creating chore.");
    }
  };

  const toggleChore = async (chore) => {
    if (chore.is_generated && !window.confirm(
      "This is a generated occurrence of a repeating chore. Marking it done will mark the whole series done. Continue?"
    )) {
      return;
    }

    try {
      await fetch(`${API_URL}/chores/${chore.id}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadChores();
    } catch {
      setError("Failed to update chore.");
    }
  };

  const deleteChore = async (chore) => {
    if (chore.is_generated && !window.confirm(
      "This is a generated occurrence of a repeating chore. Deleting will remove the entire series. Continue?"
    )) {
      return;
    }

    try {
      await fetch(`${API_URL}/chores/${chore.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadChores();
    } catch {
      setError("Failed to delete chore.");
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
      <button style={styles.backButton} onClick={() => navigate("/chores")}>
        ‹ Back to Calendar
      </button>

      <h1>🧹 {dateLabel}</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <h2>Add Chore</h2>

        <input
          style={styles.input}
          placeholder="Chore title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Assigned to"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
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

        <button style={styles.button} onClick={addChore}>
          Add Chore
        </button>
      </div>

      <div style={styles.card}>
        <h2>Chores for the Day</h2>

        {chores.length === 0 ? (
          <p>No chores due this day.</p>
        ) : (
          chores.map((chore) => (
            <div key={chore.occurrence_id} style={styles.choreRow}>
              <div
                style={{
                  ...styles.choreInfo,
                  textDecoration: chore.is_done ? "line-through" : "none",
                  opacity: chore.is_done ? 0.5 : 1
                }}
              >
                <strong>{chore.recurrence_rule !== "none" ? "🔁 " : ""}{chore.title}</strong>
                {chore.assigned_to && <span> — {chore.assigned_to}</span>}
              </div>

              <div style={styles.actions}>
                <button style={styles.toggleButton} onClick={() => toggleChore(chore)}>
                  {chore.is_done ? "Undo" : "Done"}
                </button>

                <button style={styles.deleteButton} onClick={() => deleteChore(chore)}>
                  Delete
                </button>
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
  button: theme.button,
  backButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#334155",
    color: "white",
    marginBottom: 16
  },
  toggleButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#166534",
    color: "white"
  },
  deleteButton: theme.deleteButton,
  error: theme.error,
  choreRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: "1px solid #334155",
    padding: "12px 0"
  },
  choreInfo: {
    flex: 1
  },
  assigneeBadge: {
    display: "inline-block",
    marginLeft: 10,
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 12,
    color: "white"
  },
  actions: {
    display: "flex",
    gap: 8
  }
};
