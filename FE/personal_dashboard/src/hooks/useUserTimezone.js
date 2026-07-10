import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../config";
import { browserTimezone } from "../utils/time";

// Resolves the timezone events should be displayed in for the current viewer:
// the account's saved preference from /settings/user, falling back to the
// browser's detected zone until (or unless) one is set.
export default function useUserTimezone() {
  const { token } = useAuth();
  const [tz, setTz] = useState(browserTimezone());

  useEffect(() => {
    if (!token) return undefined;

    let active = true;
    fetch(`${API_URL}/settings/user`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && data && data.timezone) setTz(data.timezone);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [token]);

  return tz;
}
