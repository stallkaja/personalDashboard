import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://192.168.1.72:8132";

export default function ChoreDay() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { date } = useParams();

  const [chores, setChores] = useState([]);
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
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
          due_date: date
        })
      });

      if (!res.ok) {
        setError("Failed to create chore.");
        return;
      }

      setTitle("");
      setAssignedTo("");
      loadChores();
    } catch {
      setError("Network error creating chore.");
    }
  };

  const toggleChore = async (id) => {
    try {
      await fetch(`${API_URL}/chores/${id}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadChores();
    } catch {
      setError("Failed to update chore.");
    }
  };

  const deleteChore = async (id) => {
    try {
      await fetch(`${API_URL}/chores/${id}`, {
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
            <div key={chore.id} style={styles.choreRow}>
              <div
                style={{
                  ...styles.choreInfo,
                  textDecoration: chore.is_done ? "line-through" : "none",
                  opacity: chore.is_done ? 0.5 : 1
                }}
              >
                <strong>{chore.title}</strong>
                {chore.assigned_to && <span> — {chore.assigned_to}</span>}
              </div>

              <div style={styles.actions}>
                <button style={styles.toggleButton} onClick={() => toggleChore(chore.id)}>
                  {chore.is_done ? "Undo" : "Done"}
                </button>

                <button style={styles.deleteButton} onClick={() => deleteChore(chore.id)}>
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
  toggleButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#166534",
    color: "white"
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
  actions: {
    display: "flex",
    gap: 8
  }
};
