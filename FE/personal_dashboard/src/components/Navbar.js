import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

const LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/weather-center", label: "Weather Center" },
  { to: "/calendar", label: "Calendar" },
  { to: "/chores", label: "Chores" },
  { to: "/meal-planner", label: "Meals" },
  { to: "/drinks", label: "Drinks" },
  { to: "/shopping-list", label: "Shopping List" },
  { to: "/photo-gallery", label: "Photos" },
  { to: "/communication", label: "Messages" },
  { to: "/career", label: "Job Search" },
  { to: "/accounts", label: "Accounts" },
  { to: "/settings", label: "Settings" }
];

export default function Navbar() {
  const { user, token, logout } = useAuth();
  const { themeName, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/direct-messages/unread-count`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setUnread(data.unread || 0))
      .catch(() => {});
  }, [token]);

  // Poll the unread count, and refresh it on every navigation (e.g. after
  // reading or sending a message the badge updates without a page reload).
  useEffect(() => {
    if (!token) { setUnread(0); return; }
    loadUnread();
    const id = setInterval(loadUnread, 60000);
    return () => clearInterval(id);
  }, [token, loadUnread, location.pathname]);

  const canVideos = user?.role === "admin" || user?.role === "special";
  const links = [
    ...LINKS,
    ...(canVideos ? [{ to: "/video-library", label: "Videos" }] : []),
    ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : [])
  ];

  const renderLabel = (link) =>
    link.to === "/communication" && unread > 0 ? (
      <>
        {link.label}
        <span style={styles.badge}>{unread > 99 ? "99+" : unread}</span>
      </>
    ) : (
      link.label
    );

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

          <button style={styles.hamburger} onClick={toggleTheme} aria-label="Toggle theme">
            {themeName === "dark" ? "☀️" : "🌙"}
          </button>

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
                {renderLabel(link)}
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
            {renderLabel(link)}
          </Link>
        ))}
      </div>

      <div style={styles.right}>
        <button style={styles.themeToggle} onClick={toggleTheme} aria-label="Toggle theme">
          {themeName === "dark" ? "☀️" : "🌙"}
        </button>

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
    background: colors.surfaceMuted,
    color: colors.text,
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
    color: colors.text,
    textDecoration: "none",
    whiteSpace: "nowrap",
    flexShrink: 0
  },
  badge: {
    display: "inline-block",
    marginLeft: 6,
    minWidth: 18,
    padding: "0 5px",
    borderRadius: 9,
    background: colors.danger,
    color: colors.text,
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: "18px"
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
  themeToggle: {
    background: "transparent",
    border: "none",
    fontSize: 18,
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
    color: colors.text,
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
    borderTop: `1px solid ${colors.border}`
  },
  mobileLink: {
    color: colors.text,
    textDecoration: "none",
    padding: "12px 4px",
    borderBottom: `1px solid ${colors.surfaceAlt}`,
    fontSize: 16
  }
};
