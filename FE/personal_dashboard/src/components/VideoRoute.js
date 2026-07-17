import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Allows admins and "special" users. Special users get the Videos page but no
// other admin abilities.
export default function VideoRoute({ children }) {
  const { token, user } = useAuth();

  if (!token) return <Navigate to="/login" replace />;

  if (user?.role !== "admin" && user?.role !== "special") {
    return <div style={{ padding: 20 }}>Access denied.</div>;
  }

  return children;
}
