import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import { API_URL } from "../config";

function toDateKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export default function ReminderBanner() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [reminders, setReminders] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };
    const now = new Date();
    const todayKey = toDateKey(now);
    const soonCutoff = new Date(now.getTime() + 60 * 60 * 1000);

    Promise.all([
      fetch(`${API_URL}/events`, { headers }).then((res) => res.json()),
      fetch(`${API_URL}/chores`, { headers }).then((res) => res.json())
    ])
      .then(([eventsData, choresData]) => {
        const upcomingEvents = (eventsData.events || []).filter((e) => {
          const start = new Date(e.start_time);
          return start >= now && start <= soonCutoff;
        });

        const dueChores = (choresData.chores || []).filter(
          (c) => c.due_date === todayKey && !c.is_done
        );

        const items = [
          ...upcomingEvents.map((e) => ({
            key: `event-${e.occurrence_id}`,
            text: `📅 "${e.title}" starts at ${new Date(e.start_time).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit"
            })}`,
            link: "/calendar"
          })),
          ...dueChores.map((c) => ({
            key: `chore-${c.occurrence_id}`,
            text: `🧹 "${c.title}" is due today`,
            link: "/chores"
          }))
        ];

        setReminders(items);
      })
      .catch(() => {});
  }, [token]);

  if (dismissed || reminders.length === 0 || !token) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.text}>
        {reminders.map((item) => (
          <span
            key={item.key}
            style={styles.item}
            onClick={() => navigate(item.link)}
          >
            {item.text}
          </span>
        ))}
      </div>

      <button style={styles.dismissButton} onClick={() => setDismissed(true)}>
        ✕
      </button>
    </div>
  );
}

const styles = {
  banner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#1d4ed8",
    color: "white",
    padding: "10px 20px",
    gap: 16
  },
  text: {
    display: "flex",
    gap: 24,
    flexWrap: "wrap"
  },
  item: {
    cursor: "pointer",
    textDecoration: "underline"
  },
  dismissButton: {
    border: "none",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontSize: 16
  }
};
