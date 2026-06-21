import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";

const LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/weather-center", label: "Weather Center" },
  { to: "/calendar", label: "Calendar" },
  { to: "/chores", label: "Chores" },
  { to: "/meal-planner", label: "Meals" },
  { to: "/shopping-list", label: "Shopping List" },
  { to: "/photo-gallery", label: "Photos" },
  { to: "/accounts", label: "Accounts" },
  { to: "/settings", label: "Settings" }
];

export default function Navbar() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    ...LINKS,
    ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : [])
  ];

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate("/login");
  };

  const handleLinkClick = () => {
    if (isMobile) setMenuOpen(false);
  };

  if (isMobile) {
    return (
      <nav style={styles.navbar}>
        <div style={styles.mobileHeader}>
          <button
            style={styles.hamburger}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          <span style={styles.brand}>Family Dashboard</span>

          {token ? (
            <button style={styles.button} onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <button style={styles.button} onClick={() => navigate("/login")}>
              Login
            </button>
          )}
        </div>

        {menuOpen && (
          <div style={styles.mobileMenu}>
            {token && (
              <div style={styles.userText}>
                {user?.username || "Logged in"}
                {user?.role ? ` (${user.role})` : ""}
              </div>
            )}

            {links.map((link) => (
              <Link
                key={link.to}
                style={styles.mobileLink}
                to={link.to}
                onClick={handleLinkClick}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav style={styles.navbar}>
      <div style={styles.left}>
        {links.map((link) => (
          <Link key={link.to} style={styles.link} to={link.to}>
            {link.label}
          </Link>
        ))}
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
    background: "#111827",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    gap: 16
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    overflowX: "auto",
    minWidth: 0
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0
  },
  link: {
    color: "white",
    textDecoration: "none",
    whiteSpace: "nowrap",
    flexShrink: 0
  },
  userText: {
    opacity: 0.85
  },
  button: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    flexShrink: 0
  },
  mobileHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    gap: 10
  },
  hamburger: {
    background: "transparent",
    border: "none",
    color: "white",
    fontSize: 22,
    cursor: "pointer",
    padding: "4px 8px"
  },
  brand: {
    fontWeight: "bold",
    fontSize: 15,
    flex: 1,
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  mobileMenu: {
    display: "flex",
    flexDirection: "column",
    padding: "8px 14px 16px",
    borderTop: "1px solid #334155"
  },
  mobileLink: {
    color: "white",
    textDecoration: "none",
    padding: "12px 4px",
    borderBottom: "1px solid #1f2937",
    fontSize: 16
  }
};
