export const colors = {
  background: "#0f172a",
  surface: "#1e293b",
  surfaceAlt: "#1f2937",
  surfaceMuted: "#111827",
  border: "#334155",
  borderStrong: "#475569",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.7)",
  primary: "#38bdf8",
  primaryText: "#0f172a",
  danger: "#7f1d1d",
  dangerStrong: "#991b1b",
  dangerSolid: "#dc2626",
  success: "#166534",
  successSolid: "#16a34a"
};

export const theme = {
  page: {
    padding: 20,
    background: colors.background,
    minHeight: "100vh",
    color: colors.text
  },
  card: {
    background: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20
  },
  label: {
    display: "block",
    marginBottom: 6,
    opacity: 0.8,
    fontSize: 14
  },
  input: {
    display: "block",
    width: "100%",
    maxWidth: 400,
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    border: "none",
    fontSize: 15
  },
  button: {
    padding: "10px 15px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 15
  },
  smallButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14
  },
  dangerButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.dangerSolid,
    color: colors.text,
    fontSize: 14
  },
  successButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.successSolid,
    color: colors.text,
    fontSize: 14
  },
  neutralButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    fontSize: 14
  },
  tab: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    whiteSpace: "nowrap"
  },
  tabActive: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: colors.primary,
    color: colors.primaryText,
    fontWeight: "bold",
    whiteSpace: "nowrap"
  },
  error: {
    background: colors.danger,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
  status: {
    background: colors.success,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15
  },
  loading: {
    padding: 40,
    background: colors.background,
    minHeight: "100vh",
    color: colors.text
  }
};

export default theme;
