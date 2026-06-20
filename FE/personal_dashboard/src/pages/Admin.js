import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL = "http://192.168.1.72:8132";

export default function Admin() {
  const { token, user, logout } = useAuth();

  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  }), [token]);

  const loadUsers = useCallback(async () => {
    if (!token) {
      setError("No login token found. Please log in again.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setStatus("");

      const res = await fetch(`${API_URL}/admin/users`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      console.log("ADMIN USERS RAW RESPONSE:", data);
      console.log("ADMIN USERS COUNT:", data.users?.length);

      if (!res.ok) {
        setUsers([]);
        setError(data.error || data.msg || "Failed to load users");

        if (data.msg === "Subject must be a string") {
          setError("Old/bad JWT token detected. Log out, clear localStorage, and log in again.");
        }

        return;
      }

      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      console.error(err);
      setError("Network error loading users");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const createUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      setError("Username and password are required");
      return;
    }

    try {
      setError("");
      setStatus("");

      const res = await fetch(`${API_URL}/admin/users`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.msg || "Failed to create user");
        return;
      }

      setStatus("User created successfully");
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      loadUsers();
    } catch (err) {
      console.error(err);
      setError("Network error creating user");
    }
  };

  const updateRole = async (id, role) => {
    try {
      setError("");
      setStatus("");

      const res = await fetch(`${API_URL}/admin/users/${id}/role`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ role })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.msg || "Failed to update role");
        return;
      }

      setStatus("Role updated successfully");
      loadUsers();
    } catch (err) {
      console.error(err);
      setError("Network error updating role");
    }
  };

  const resetPassword = async (id, username) => {
    const password = window.prompt(`Enter a new password for ${username}:`);
    if (!password) return;

    try {
      setError("");
      setStatus("");

      const res = await fetch(`${API_URL}/admin/users/${id}/password`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.msg || "Failed to reset password");
        return;
      }

      setStatus(`Password reset for ${username}`);
    } catch (err) {
      console.error(err);
      setError("Network error resetting password");
    }
  };

  const deleteUser = async (id, username) => {
    if (Number(id) === Number(user?.id)) {
      setError("You cannot delete your own logged-in account.");
      return;
    }

    if (!window.confirm(`Delete user "${username}"?`)) return;

    try {
      setError("");
      setStatus("");

      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: "DELETE",
        headers: authHeaders
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.msg || "Failed to delete user");
        return;
      }

      setStatus("User deleted successfully");
      loadUsers();
    } catch (err) {
      console.error(err);
      setError("Network error deleting user");
    }
  };

  const clearSession = () => {
    localStorage.clear();
    logout?.();
    window.location.href = "/login";
  };

  return (
    <div style={styles.page}>
      <h1>🛠 Admin Panel</h1>

      <div style={styles.card}>
        <h2>Current Admin</h2>
        <p><strong>Username:</strong> {user?.username || "Unknown"}</p>
        <p><strong>Role:</strong> {user?.role || "Unknown"}</p>
        <p><strong>User ID:</strong> {user?.id || "Unknown"}</p>
        <button style={styles.smallButton} onClick={clearSession}>
          Clear Session / Re-login
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {status && <div style={styles.status}>{status}</div>}

      <div style={styles.card}>
        <h2>Create User</h2>

        <div style={styles.formRow}>
          <input
            style={styles.input}
            placeholder="Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <select
            style={styles.input}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>

          <button style={styles.button} onClick={createUser}>
            Create
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h2>User Management</h2>
            <p style={styles.muted}>Users returned by backend: {users.length}</p>
          </div>

          <button style={styles.button} onClick={loadUsers}>
            Refresh
          </button>
        </div>

        {loading && <p>Loading users...</p>}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Username</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Created</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={styles.td}>{u.id}</td>
                  <td style={styles.td}>{u.username}</td>

                  <td style={styles.td}>
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                      style={styles.smallInput}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>

                  <td style={styles.td}>
                    {u.created_at ? new Date(u.created_at).toLocaleString() : "N/A"}
                  </td>

                  <td style={styles.td}>
                    <button
                      style={styles.smallButton}
                      onClick={() => resetPassword(u.id, u.username)}
                    >
                      Reset Password
                    </button>

                    <button
                      style={{
                        ...styles.dangerButton,
                        opacity: Number(u.id) === Number(user?.id) ? 0.5 : 1
                      }}
                      onClick={() => deleteUser(u.id, u.username)}
                      disabled={Number(u.id) === Number(user?.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && users.length === 0 && !error && (
          <p>No users found.</p>
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
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  formRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
  },
  input: {
    padding: 10,
    borderRadius: 8,
    border: "none",
    minWidth: 180
  },
  smallInput: {
    padding: 6,
    borderRadius: 6,
    border: "none"
  },
  button: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer"
  },
  smallButton: {
    marginRight: 8,
    padding: "6px 10px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer"
  },
  dangerButton: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: "#dc2626",
    color: "white"
  },
  error: {
    background: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
  status: {
    background: "#166534",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
  tableWrap: {
    overflowX: "auto"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse"
  },
  th: {
    textAlign: "left",
    borderBottom: "1px solid #475569",
    padding: 10
  },
  td: {
    borderBottom: "1px solid #334155",
    padding: 10
  },
  muted: {
    opacity: 0.7,
    marginTop: -8
  }
};