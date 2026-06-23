import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import theme, { colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import usePushNotifications from "../hooks/usePushNotifications";
import { API_URL } from "../config";

export default function Settings() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const { themeName, toggleTheme } = useThemeMode();
  const { supported, subscribed, error: pushError, subscribe, unsubscribe } = usePushNotifications();

  const [userSettings, setUserSettings] = useState(null);
  const [userStatus, setUserStatus] = useState("");

  const [appSettings, setAppSettings] = useState(null);
  const [appStatus, setAppStatus] = useState("");
  const [appError, setAppError] = useState("");

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/settings/user`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setUserSettings(data))
      .catch(() => {});

    fetch(`${API_URL}/settings/app`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setAppSettings(data))
      .catch(() => {});
  }, [token]);

  const saveUserSettings = async (next) => {
    setUserSettings(next);
    setUserStatus("");

    try {
      await fetch(`${API_URL}/settings/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(next)
      });
      setUserStatus("Saved.");
    } catch {
      setUserStatus("Failed to save preference.");
    }
  };

  const saveAppSettings = async () => {
    setAppStatus("");
    setAppError("");

    try {
      const res = await fetch(`${API_URL}/settings/app`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(appSettings)
      });

      if (!res.ok) {
        setAppError("Failed to save weather station settings.");
        return;
      }

      setAppStatus("Saved. Forecast and alerts will use the new settings within a minute.");
    } catch {
      setAppError("Network error saving settings.");
    }
  };

  const clearLocalData = () => {
    if (!window.confirm("This will log you out and clear locally stored preferences on this device. Continue?")) {
      return;
    }

    localStorage.clear();
    logout();
    navigate("/login");
  };

  return (
    <div style={theme.page}>
      <h1>⚙️ Settings</h1>

      <div style={theme.card}>
        <h2>Appearance</h2>
        <p style={styles.muted}>Switch between dark and light mode for the whole app.</p>

        <button style={theme.button} onClick={toggleTheme}>
          {themeName === "dark" ? "☀️ Switch to Light Mode" : "🌙 Switch to Dark Mode"}
        </button>
      </div>

      <div style={theme.card}>
        <h2>Notifications</h2>

        {pushError && <div style={theme.error}>{pushError}</div>}

        {!supported ? (
          <p>Push notifications are not supported in this browser.</p>
        ) : subscribed ? (
          <>
            <p>You're subscribed to weather alert and reminder push notifications on this device.</p>
            <button style={theme.button} onClick={unsubscribe}>Disable Notifications</button>
          </>
        ) : (
          <>
            <p>Get a push notification on this device for severe weather alerts.</p>
            <button style={theme.button} onClick={subscribe}>Enable Notifications</button>
          </>
        )}

        {userSettings && (
          <div style={styles.checkGroup}>
            <h3 style={styles.subheading}>Alert types</h3>

            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={userSettings.notify_wind}
                onChange={(e) => saveUserSettings({ ...userSettings, notify_wind: e.target.checked })}
              />
              High wind gust alerts
            </label>

            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={userSettings.notify_uv}
                onChange={(e) => saveUserSettings({ ...userSettings, notify_uv: e.target.checked })}
              />
              High UV index alerts
            </label>

            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={userSettings.notify_rain}
                onChange={(e) => saveUserSettings({ ...userSettings, notify_rain: e.target.checked })}
              />
              Heavy rainfall alerts
            </label>

            {userStatus && <p style={styles.savedNote}>{userStatus}</p>}
          </div>
        )}
      </div>

      {isAdmin && appSettings && (
        <div style={theme.card}>
          <h2>Admin Settings</h2>
          <p style={styles.muted}>
            Controls the station location used for the forecast/radar, and the thresholds that
            trigger weather alerts and push notifications for everyone.
          </p>

          {appError && <div style={theme.error}>{appError}</div>}
          {appStatus && <div style={theme.status}>{appStatus}</div>}

          <label style={theme.label}>Dashboard Title</label>
          <input
            style={theme.input}
            value={appSettings.dashboard_title}
            onChange={(e) => setAppSettings({ ...appSettings, dashboard_title: e.target.value })}
          />

          <label style={theme.label}>Station Name</label>
          <input
            style={theme.input}
            value={appSettings.station_name}
            onChange={(e) => setAppSettings({ ...appSettings, station_name: e.target.value })}
          />

          <div style={styles.row}>
            <div>
              <label style={theme.label}>Latitude</label>
              <input
                style={theme.input}
                type="number"
                step="0.0001"
                value={appSettings.station_lat}
                onChange={(e) => setAppSettings({ ...appSettings, station_lat: e.target.value })}
              />
            </div>

            <div>
              <label style={theme.label}>Longitude</label>
              <input
                style={theme.input}
                type="number"
                step="0.0001"
                value={appSettings.station_lon}
                onChange={(e) => setAppSettings({ ...appSettings, station_lon: e.target.value })}
              />
            </div>
          </div>

          <h3 style={styles.subheading}>Alert Thresholds</h3>

          <div style={styles.row}>
            <div>
              <label style={theme.label}>Wind Gust (mph)</label>
              <input
                style={theme.input}
                type="number"
                value={appSettings.wind_alert_threshold}
                onChange={(e) => setAppSettings({ ...appSettings, wind_alert_threshold: e.target.value })}
              />
            </div>

            <div>
              <label style={theme.label}>UV Index</label>
              <input
                style={theme.input}
                type="number"
                value={appSettings.uv_alert_threshold}
                onChange={(e) => setAppSettings({ ...appSettings, uv_alert_threshold: e.target.value })}
              />
            </div>

            <div>
              <label style={theme.label}>Daily Rain (in)</label>
              <input
                style={theme.input}
                type="number"
                step="0.1"
                value={appSettings.rain_alert_threshold}
                onChange={(e) => setAppSettings({ ...appSettings, rain_alert_threshold: e.target.value })}
              />
            </div>
          </div>

          <h3 style={styles.subheading}>Local Video Library</h3>
          <label style={theme.label}>Folder Path (on the server)</label>
          <input
            style={theme.input}
            value={appSettings.local_video_folder}
            onChange={(e) => setAppSettings({ ...appSettings, local_video_folder: e.target.value })}
            placeholder="D:\Videos"
          />

          <button style={theme.button} onClick={saveAppSettings}>
            Save Settings
          </button>
        </div>
      )}

      <div style={theme.card}>
        <h2>Account & Security</h2>

        <div style={styles.linkRow}>
          <Link to="/accounts" style={styles.linkButton}>View Account / Change Password</Link>
          {isAdmin && <Link to="/admin" style={styles.linkButton}>Admin Panel</Link>}
        </div>
      </div>

      <div style={theme.card}>
        <h2>Data & Privacy</h2>
        <p style={styles.muted}>
          Clear your saved login and local preferences on this device. You'll need to log back in.
        </p>

        <button style={theme.dangerButton} onClick={clearLocalData}>
          Clear Local Data & Log Out
        </button>
      </div>

      <div style={theme.card}>
        <h2>About</h2>
        <p style={styles.muted}>
          Family Dashboard — weather station monitoring, calendar, chores, meal planning,
          shopping list, and photo gallery, all running on local infrastructure.
        </p>
        <p style={styles.muted}>
          Forecast data provided by the{" "}
          <a
            href="https://www.weather.gov/"
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.primary }}
          >
            National Weather Service
          </a>.
        </p>
      </div>
    </div>
  );
}

const styles = {
  muted: {
    opacity: 0.75,
    lineHeight: 1.5,
    marginBottom: 12
  },
  subheading: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 15,
    opacity: 0.85
  },
  checkGroup: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: `1px solid ${colors.border}`
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    cursor: "pointer"
  },
  savedNote: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 4
  },
  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap"
  },
  linkRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap"
  },
  linkButton: {
    display: "inline-block",
    padding: "10px 15px",
    borderRadius: 8,
    background: colors.border,
    color: colors.text,
    textDecoration: "none"
  }
};
