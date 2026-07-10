import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");

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
      const res = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: newPassword })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reset password.");
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch {
      setError("Network error resetting password.");
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>Invalid Link</h1>
          <p style={styles.muted}>
            This reset link is missing its token. Please request a new password reset link.
          </p>
          <button style={styles.button} onClick={() => navigate("/forgot-password")}>
            Request New Link
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>Password Reset</h1>
          <p style={styles.muted}>Your password has been updated. You can now log in with your new password.</p>
          <button style={styles.button} onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Set a New Password</h1>
        <p style={styles.muted}>Choose a new password for your account.</p>

        {error && <div style={styles.error}>{error}</div>}

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
          {submitting ? "Saving..." : "Reset Password"}
        </button>

        <button style={styles.linkButton} onClick={() => navigate("/login")}>
          Back to Login
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
  linkButton: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    border: "none",
    background: "none",
    color: colors.primary,
    cursor: "pointer",
    fontSize: 14,
    textDecoration: "underline"
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
