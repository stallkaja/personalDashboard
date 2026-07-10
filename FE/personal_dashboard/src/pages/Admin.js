import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import theme, { colors } from "../styles/theme";

import { API_URL } from "../config";

export default function Admin() {
  const { token, user, logout } = useAuth();
  const isMobile = useIsMobile();

  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);

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
      setError("Name and password are required");
      return;
    }

    if (!newEmail.trim() || !newEmail.includes("@")) {
      setError("A valid email address is required");
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
          email: newEmail.trim(),
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
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
      loadUsers();
    } catch (err) {
      console.error(err);
      setError("Network error creating user");
    }
  };

  const pendingUsers = users.filter((u) => u.status === "pending");

  const approveUser = async (id) => {
    try {
      setError("");
      setStatus("");

      const res = await fetch(`${API_URL}/admin/users/${id}/approve`, {
        method: "POST",
        headers: authHeaders
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.msg || "Failed to approve account");
        return;
      }

      setStatus("Account approved");
      loadUsers();
    } catch (err) {
      console.error(err);
      setError("Network error approving account");
    }
  };

  const rejectUser = async (id, username) => {
    if (!window.confirm(`Reject account request for "${username}"? This cannot be undone.`)) return;

    try {
      setError("");
      setStatus("");

      const res = await fetch(`${API_URL}/admin/users/${id}/reject`, {
        method: "POST",
        headers: authHeaders
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.msg || "Failed to reject account");
        return;
      }

      setStatus("Account request rejected");
      loadUsers();
    } catch (err) {
      console.error(err);
      setError("Network error rejecting account");
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

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setInviteSending(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch(`${API_URL}/admin/invite`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ email: inviteEmail.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send invitation.");
        return;
      }

      setStatus(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch {
      setError("Network error sending invitation.");
    } finally {
      setInviteSending(false);
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
        <h2>Invite User by Email</h2>
        <p style={styles.muted}>Send an invitation link that lets someone create an account without waiting for approval.</p>
        <div style={styles.formRow}>
          <input
            style={{ ...styles.input, flex: 1 }}
            type="email"
            placeholder="someone@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendInvite()}
          />
          <button style={styles.button} onClick={sendInvite} disabled={inviteSending}>
            {inviteSending ? "Sending..." : "Send Invite"}
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <h2>Pending Account Requests {pendingUsers.length > 0 && `(${pendingUsers.length})`}</h2>

        {pendingUsers.length === 0 ? (
          <p style={styles.muted}>No pending account requests.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Username</th>
                  <th style={styles.th}>Requested</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {pendingUsers.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.td}>{u.username}</td>
                    <td style={styles.td}>
                      {u.created_at ? new Date(u.created_at).toLocaleString() : "N/A"}
                    </td>
                    <td style={styles.td}>
                      <button
                        style={{ ...styles.smallButton, marginRight: 8 }}
                        onClick={() => approveUser(u.id)}
                      >
                        Approve
                      </button>

                      <button
                        style={styles.dangerButton}
                        onClick={() => rejectUser(u.id, u.username)}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.card}>
        <h2>Create User</h2>

        <div style={styles.formRow}>
          <input
            style={styles.input}
            placeholder="Display name"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />

          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
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

        {isMobile ? (
          <div>
            {users.map((u) => (
              <div key={u.id} style={styles.userCard}>
                <div style={styles.userCardHeader}>
                  <strong>{u.username}</strong>
                  <span style={styles.statusBadge}>{u.status || "approved"}</span>
                </div>
                <div style={styles.userCardMeta}>{u.email || "no email"}</div>
                <div style={styles.userCardMeta}>ID: {u.id} · {u.created_at ? new Date(u.created_at).toLocaleDateString() : "N/A"}</div>
                <div style={{ marginTop: 8 }}>
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    style={{ ...styles.smallInput, marginBottom: 8, width: "100%" }}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div style={styles.userCardActions}>
                  <button style={styles.smallButton} onClick={() => resetPassword(u.id, u.username)}>
                    Reset Password
                  </button>
                  <button
                    style={{ ...styles.dangerButton, opacity: Number(u.id) === Number(user?.id) ? 0.5 : 1 }}
                    onClick={() => deleteUser(u.id, u.username)}
                    disabled={Number(u.id) === Number(user?.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.td}>{u.id}</td>
                    <td style={styles.td}>{u.username}</td>
                    <td style={styles.td}>{u.email || "—"}</td>
                    <td style={styles.td}>
                      <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} style={styles.smallInput}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td style={styles.td}>{u.status || "approved"}</td>
                    <td style={styles.td}>{u.created_at ? new Date(u.created_at).toLocaleString() : "N/A"}</td>
                    <td style={styles.td}>
                      <button style={{ ...styles.smallButton, marginRight: 8 }} onClick={() => resetPassword(u.id, u.username)}>
                        Reset Password
                      </button>
                      <button
                        style={{ ...styles.dangerButton, opacity: Number(u.id) === Number(user?.id) ? 0.5 : 1 }}
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
        )}

        {!loading && users.length === 0 && !error && (
          <p>No users found.</p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
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
    minWidth: 180,
    fontSize: 15
  },
  smallInput: {
    padding: 6,
    borderRadius: 6,
    border: "none"
  },
  button: theme.button,
  smallButton: theme.smallButton,
  dangerButton: theme.dangerButton,
  error: theme.error,
  status: theme.status,
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
    borderBottom: `1px solid ${colors.border}`,
    padding: 10
  },
  muted: {
    opacity: 0.7,
    marginTop: -8
  },
  userCard: {
    background: colors.surfaceAlt,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12
  },
  userCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  userCardMeta: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 6
  },
  userCardActions: {
    display: "flex",
    gap: 8,
    marginTop: 8
  },
  statusBadge: {
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 12,
    background: colors.border,
    opacity: 0.8
  }
};