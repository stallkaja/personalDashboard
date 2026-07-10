import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../config";
import { applyAccent } from "../utils/accent";

// Fetches the family-wide accent color from app settings and applies it
// globally. Renders nothing. Mounted once, high in the tree, so the color
// affects every page (navbar, buttons, links).
export default function AccentApplier() {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/settings/app`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => applyAccent(data.accent_color))
      .catch(() => {});
  }, [token]);

  return null;
}
