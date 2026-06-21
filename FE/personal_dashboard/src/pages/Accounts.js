import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import theme from "../styles/theme";

import { API_URL } from "../config";

export default function Accounts() {
  const { user, token, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const tokenInfo = useMemo(() => {
    try {
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));

      return {
        issued: new Date(payload.iat * 1000),
        expires: new Date(payload.exp * 1000),
        username: payload.username,
        role: payload.role,
        subject: payload.sub
      };
    } catch {
      return null;
    }
  }, [token]);

  const changePassword = async () => {
    setStatus("");
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/account/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.msg || "Failed to change password.");
        return;
      }

      setStatus("Password changed successfully. Please log in again.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        logout();
        window.location.href = "/login";
      }, 1500);
    } catch {
      setError("Network error changing password.");
    }
  };

  if (!user) {
    return (
      <div style={styles.page}>
        <h1>👤 Account</h1>
        <p>No user loaded.</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1>👤 Account Profile</h1>

      {error && <div style={styles.error}>{error}</div>}
      {status && <div style={styles.status}>{status}</div>}

      <div style={styles.card}>
        <h2>Account Information</h2>
        <p><strong>Username:</strong> {user.username}</p>
        <p><strong>Role:</strong> {user.role}</p>
        <p><strong>User ID:</strong> {user.id}</p>
      </div>

      <div style={styles.card}>
        <h2>Session Information</h2>

        {tokenInfo ? (
          <>
            <p><strong>JWT Subject:</strong> {tokenInfo.subject}</p>
            <p><strong>Issued:</strong> {tokenInfo.issued.toLocaleString()}</p>
            <p><strong>Expires:</strong> {tokenInfo.expires.toLocaleString()}</p>
            <p><strong>Authenticated User:</strong> {tokenInfo.username}</p>
            <p><strong>Role Claim:</strong> {tokenInfo.role}</p>
          </>
        ) : (
          <p>No token information available.</p>
        )}
      </div>

      <div style={styles.card}>
        <h2>Change Password</h2>

        <input
          style={styles.input}
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <button style={styles.button} onClick={changePassword}>
          Change Password
        </button>
      </div>

      <div style={styles.card}>
        <h2>Token Preview</h2>
        <code style={styles.token}>{token}</code>
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  input: theme.input,
  button: theme.button,
  error: theme.error,
  status: theme.status,
  token: {
    display: "block",
    wordBreak: "break-all",
    whiteSpace: "pre-wrap"
  }
};