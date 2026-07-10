import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send reset link.");
        setSubmitting(false);
        return;
      }

      setMessage(data.message || "If an account exists for that email, a reset link has been sent.");
    } catch {
      setError("Network error sending reset link.");
      setSubmitting(false);
    }
  };

  if (message) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>Check Your Email</h1>
          <p style={styles.muted}>{message}</p>
          <p style={styles.muted}>The link expires in 1 hour.</p>
          <button style={styles.button} onClick={() => navigate("/login")}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Forgot Password</h1>
        <p style={styles.muted}>
          Enter the email associated with your account and we'll send you a link to reset your password.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <input
          style={styles.input}
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <button style={styles.button} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Sending..." : "Send Reset Link"}
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
