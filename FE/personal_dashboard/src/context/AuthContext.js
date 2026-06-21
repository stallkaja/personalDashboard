import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

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

  const login = (token, user) => {
    setToken(token);
    setUser(user);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);

    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}