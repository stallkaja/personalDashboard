import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav style={styles.navbar}>
      <div style={styles.left}>
        <Link style={styles.link} to="/">Dashboard</Link>
		<Link style={styles.link} to="/weather-center">
  Weather Center
</Link>
        <Link style={styles.link} to="/calendar">Calendar</Link>
        <Link style={styles.link} to="/chores">Chores</Link>
        <Link style={styles.link} to="/meal-planner">Meals</Link>
        <Link style={styles.link} to="/accounts">Accounts</Link>
        <Link style={styles.link} to="/settings">Settings</Link>

        {user?.role === "admin" && (
          <Link style={styles.link} to="/admin">Admin</Link>
        )}
      </div>

      <div style={styles.right}>
        {token ? (
          <>
            <span style={styles.userText}>
              {user?.username || "Logged in"}
              {user?.role ? ` (${user.role})` : ""}
            </span>

            <button style={styles.button} onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <button style={styles.button} onClick={() => navigate("/login")}>
            Login
          </button>
        )}
      </div>
    </nav>
  );
}

const styles = {
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    background: "#111827",
    color: "white"
  },
  left: {
    display: "flex",
    gap: 16
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },
  link: {
    color: "white",
    textDecoration: "none"
  },
  userText: {
    opacity: 0.85
  },
  button: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer"
  }
};