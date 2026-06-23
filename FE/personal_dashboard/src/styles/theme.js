export const colors = {
  background: "var(--color-background)",
  surface: "var(--color-surface)",
  surfaceAlt: "var(--color-surface-alt)",
  surfaceMuted: "var(--color-surface-muted)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  primary: "var(--color-primary)",
  primaryText: "var(--color-primary-text)",
  danger: "var(--color-danger)",
  dangerStrong: "var(--color-danger-strong)",
  dangerSolid: "var(--color-danger-solid)",
  success: "var(--color-success)",
  successSolid: "var(--color-success-solid)",
  onSolid: "#ffffff",
  primaryStrong: "#1d4ed8"
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
    color: colors.onSolid,
    fontSize: 14
  },
  successButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.successSolid,
    color: colors.onSolid,
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
