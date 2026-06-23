import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token") || "";
  const hasInvite = !!inviteToken;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [autoApproved, setAutoApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async () => {
    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const body = { username: username.trim(), password };
      if (inviteToken) body.invite_token = inviteToken;

      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      setAutoApproved(!!data.auto_approved);
      setSubmitted(true);
    } catch {
      setError("Network error submitting account.");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>{autoApproved ? "Account Created!" : "Request Submitted"}</h1>
          <p>
            {autoApproved
              ? "Your account is ready. You can log in now."
              : "Your account request has been sent to an admin for approval. You'll be able to log in once it's approved."}
          </p>
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
        <h1>Create Account</h1>
        <p style={styles.muted}>
          {hasInvite
            ? "You've been invited to join the Dashboard. Choose a username and password to get started."
            : "New accounts require admin approval before you can log in."}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <input
          style={styles.input}
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRegister()}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRegister()}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRegister()}
        />

        <button style={styles.button} onClick={handleRegister} disabled={submitting}>
          {submitting ? "Creating..." : hasInvite ? "Create Account" : "Request Account"}
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
