import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }) {
  const { token, user } = useAuth();

  if (!token) return <Navigate to="/login" replace />;

  if (user?.role !== "admin") {
    return <div style={{ padding: 20 }}>Access denied. Admins only.</div>;
  }

  return children;
}