import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error);
      return;
    }

    login(data.token, data.user, data.refresh_token);
    navigate("/");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Login</h1>

        <input
          style={styles.input}
          type="email"
          placeholder="email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />

        <button style={styles.button} onClick={handleLogin}>Login</button>

        <button style={styles.linkButton} onClick={() => navigate("/forgot-password")}>
          Forgot password?
        </button>

        <button style={styles.linkButton} onClick={() => navigate("/register")}>
          Create an account
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
  }
};