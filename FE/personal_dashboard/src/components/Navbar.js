import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { colors } from "../styles/theme";
import { API_URL } from "../config";

const LINKS = [
  { to: "/", label: "Dashboard", icon: "🏠" },
  { to: "/weather-center", label: "Weather Center", icon: "🌤️" },
  { to: "/calendar", label: "Calendar", icon: "📅" },
  { to: "/chores", label: "Chores", icon: "🧹" },
  { to: "/meal-planner", label: "Menu", icon: "🍽️" },
  { to: "/shopping-list", label: "Shopping List", icon: "🛒" },
  { to: "/photo-gallery", label: "Photos", icon: "🖼️" },
  { to: "/communication", label: "Messages", icon: "💬" },
  { to: "/video-call", label: "Video Call", icon: "📹" },
  { to: "/career", label: "Job Search", icon: "💼" },
  { to: "/accounts", label: "Accounts", icon: "👤" },
  { to: "/settings", label: "Settings", icon: "⚙️" }
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

  // Close the drawer whenever the route changes.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (isMobile && menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isMobile, menuOpen]);

  const canVideos = user?.role === "admin" || user?.role === "special";
  const links = [
    ...LINKS,
    ...(canVideos ? [{ to: "/video-library", label: "Videos", icon: "🎬" }] : []),
    ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin", icon: "🛠️" }] : [])
  ];

  const isActive = (to) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

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

  // ---- Mobile: sticky top bar + slide-in drawer over a dimmed backdrop ----
  if (isMobile) {
    return (
      <>
        <nav style={styles.mobileBar}>
          <button
            style={styles.iconButton}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open menu"
          >
            ☰
            {unread > 0 && <span style={styles.hamburgerDot} />}
          </button>

          <span style={styles.brand}>Family Dashboard</span>

          <button style={styles.iconButton} onClick={toggleTheme} aria-label="Toggle theme">
            {themeName === "dark" ? "☀️" : "🌙"}
          </button>
        </nav>

        <div
          style={{
            ...styles.backdrop,
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none"
          }}
          onClick={() => setMenuOpen(false)}
        />

        <aside
          style={{
            ...styles.drawer,
            transform: menuOpen ? "translateX(0)" : "translateX(-100%)"
          }}
        >
          <div style={styles.drawerHeader}>
            <span style={styles.drawerTitle}>Menu</span>
            <button style={styles.iconButton} onClick={() => setMenuOpen(false)} aria-label="Close menu">
              ✕
            </button>
          </div>

          {token && (
            <div style={styles.drawerUser}>
              <span style={styles.avatar}>
                {(user?.username || "?").charAt(0).toUpperCase()}
              </span>
              <div>
                <div style={styles.drawerName}>{user?.username || "Logged in"}</div>
                {user?.role && <div style={styles.drawerRole}>{user.role}</div>}
              </div>
            </div>
          )}

          <div style={styles.drawerLinks}>
            {links.map((link) => {
              const active = isActive(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{ ...styles.drawerLink, ...(active ? styles.drawerLinkActive : {}) }}
                  onClick={() => setMenuOpen(false)}
                >
                  <span style={styles.drawerIcon}>{link.icon}</span>
                  <span style={styles.drawerLinkLabel}>{renderLabel(link)}</span>
                </Link>
              );
            })}
          </div>

          <div style={styles.drawerFooter}>
            {token ? (
              <button style={styles.logoutButton} onClick={handleLogout}>Log out</button>
            ) : (
              <button style={styles.logoutButton} onClick={() => { setMenuOpen(false); navigate("/login"); }}>
                Log in
              </button>
            )}
          </div>
        </aside>
      </>
    );
  }

  // ---- Desktop: horizontal bar --------------------------------------------
  return (
    <nav style={styles.navbar}>
      <div style={styles.left}>
        {links.map((link) => (
          <Link
            key={link.to}
            style={{ ...styles.link, ...(isActive(link.to) ? styles.linkActive : {}) }}
            to={link.to}
          >
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

const DRAWER_WIDTH = 280;

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
    flexShrink: 0,
    opacity: 0.75
  },
  linkActive: {
    opacity: 1,
    fontWeight: "bold",
    color: colors.primary
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
    flexShrink: 0,
    background: colors.border,
    color: colors.text
  },
  themeToggle: {
    background: "transparent",
    border: "none",
    fontSize: 18,
    cursor: "pointer",
    flexShrink: 0
  },

  // ---- Mobile top bar ----
  mobileBar: {
    position: "sticky",
    top: 0,
    zIndex: 200,
    background: colors.surfaceMuted,
    color: colors.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    gap: 8,
    borderBottom: `1px solid ${colors.border}`
  },
  iconButton: {
    position: "relative",
    background: "transparent",
    border: "none",
    color: colors.text,
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
    padding: "6px 10px",
    borderRadius: 8
  },
  hamburgerDot: {
    position: "absolute",
    top: 4,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: colors.danger
  },
  brand: {
    fontWeight: "bold",
    fontSize: 16,
    flex: 1,
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },

  // ---- Mobile drawer ----
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 300,
    transition: "opacity 0.2s ease"
  },
  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    maxWidth: "82vw",
    background: colors.surface,
    color: colors.text,
    zIndex: 301,
    display: "flex",
    flexDirection: "column",
    boxShadow: "2px 0 24px rgba(0,0,0,0.35)",
    transition: "transform 0.25s ease",
    willChange: "transform"
  },
  drawerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 8px 12px 16px",
    borderBottom: `1px solid ${colors.border}`
  },
  drawerTitle: { fontWeight: "bold", fontSize: 16, opacity: 0.7 },
  drawerUser: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderBottom: `1px solid ${colors.border}`
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: colors.primary,
    color: colors.primaryText,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: 18,
    flexShrink: 0
  },
  drawerName: { fontWeight: "bold", fontSize: 15 },
  drawerRole: { fontSize: 12, opacity: 0.6, textTransform: "capitalize" },
  drawerLinks: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  drawerLink: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 12px",
    borderRadius: 10,
    color: colors.text,
    textDecoration: "none",
    fontSize: 16
  },
  drawerLinkActive: {
    background: colors.primary,
    color: colors.primaryText,
    fontWeight: "bold"
  },
  drawerIcon: { fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 },
  drawerLinkLabel: { display: "flex", alignItems: "center" },
  drawerFooter: {
    padding: 12,
    borderTop: `1px solid ${colors.border}`
  },
  logoutButton: {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 15,
    fontWeight: "bold"
  }
};
