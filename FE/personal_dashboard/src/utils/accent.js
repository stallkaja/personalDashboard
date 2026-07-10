// Applies a family-wide accent color by overriding the --color-primary CSS
// variable on :root. An inline style on the root element wins over the
// stylesheet in index.css, so it survives dark/light theme switches. Passing an
// empty/falsy value clears the override and restores the theme default.
export function applyAccent(color) {
  const root = document.documentElement;
  if (color) {
    root.style.setProperty("--color-primary", color);
    root.style.setProperty("--color-primary-text", pickTextColor(color));
  } else {
    root.style.removeProperty("--color-primary");
    root.style.removeProperty("--color-primary-text");
  }
}

// Choose black or white text for contrast against the accent (YIQ heuristic).
function pickTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#0f172a" : "#ffffff";
}
