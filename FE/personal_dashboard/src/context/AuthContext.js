import { createContext, useContext, useEffect, useRef, useState } from "react";
import { API_URL } from "../config";

const AuthContext = createContext();

let refreshInFlight = null;

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");

    if (!saved || saved === "undefined" || saved === "null") {
      return null;
    }

    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  });

  const tokenRef = useRef(token);
  tokenRef.current = token;

  const login = (token, user, refreshToken) => {
    setToken(token);
    setUser(user);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("refresh_token");
  };

  // Transparently refresh expired access tokens for any request to the API.
  // Installed once per app lifetime; reads the latest token via tokenRef so
  // it always uses the current value without needing to be reinstalled.
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const isApiRequest = url.startsWith(API_URL);
      const isAuthRoute = url.startsWith(`${API_URL}/login`) || url.startsWith(`${API_URL}/refresh`);

      const response = await originalFetch(input, init);

      if (!isApiRequest || isAuthRoute || response.status !== 401) {
        return response;
      }

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) return response;

      if (!refreshInFlight) {
        refreshInFlight = originalFetch(`${API_URL}/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${refreshToken}` }
        })
          .then(async (res) => {
            if (!res.ok) return null;
            const data = await res.json();
            return data.token;
          })
          .catch(() => null)
          .finally(() => {
            refreshInFlight = null;
          });
      }

      const newToken = await refreshInFlight;

      if (!newToken) {
        logout();
        window.location.href = "/login";
        return response;
      }

      localStorage.setItem("token", newToken);
      setToken(newToken);
      tokenRef.current = newToken;

      const retryHeaders = new Headers(init.headers || {});
      retryHeaders.set("Authorization", `Bearer ${newToken}`);

      return originalFetch(input, { ...init, headers: retryHeaders });
    };

    return () => {
      window.fetch = originalFetch;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}