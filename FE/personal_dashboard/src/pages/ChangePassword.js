import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function ChangePassword() {
  const { token, user, login } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/account/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update password.");
        setSubmitting(false);
        return;
      }

      login(token, { ...user, must_change_password: false });
      navigate("/");
    } catch {
      setError("Network error updating password.");
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Set a New Password</h1>
        <p style={styles.muted}>
          {user?.must_change_password
            ? "Your account is using a default password. Please set a new one before continuing."
            : "Choose a new password for your account."}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <input
          style={styles.input}
          type="password"
          placeholder="current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="new password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <button style={styles.button} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving..." : "Set Password"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: colors.background,
    color: colors.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16
  },
  card: {
    background: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360
  },
  muted: {
    opacity: 0.7,
    fontSize: 14,
    marginBottom: 12
  },
  input: {
    display: "block",
    width: "100%",
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    border: "none",
    fontSize: 16
  },
  button: {
    width: "100%",
    padding: 12,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 16,
    fontWeight: "bold"
  },
  error: {
    background: "rgba(220, 38, 38, 0.15)",
    color: "#fca5a5",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14
  }
};
