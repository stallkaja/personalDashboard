import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

const STATUSES = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "phone_screen", label: "Phone screen" },
  { value: "interview", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" }
];

const SOURCES = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "company", label: "Company site" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" }
];

const STATUS_COLORS = {
  saved: colors.border,
  applied: colors.primary,
  phone_screen: colors.primary,
  interview: colors.successSolid,
  offer: colors.successSolid,
  accepted: colors.successSolid,
  rejected: colors.dangerSolid
};

const QUICK_LINKS = [
  { label: "LinkedIn", href: "https://www.linkedin.com/feed/" },
  { label: "LinkedIn Jobs", href: "https://www.linkedin.com/jobs/" },
  { label: "Indeed", href: "https://www.indeed.com/" },
  { label: "Indeed — My Jobs", href: "https://myjobs.indeed.com/" }
];

const labelFor = (list, value) =>
  (list.find((o) => o.value === value) || {}).label || value;

const EMPTY_FORM = {
  company: "",
  role: "",
  source: "linkedin",
  status: "applied",
  location: "",
  url: "",
  applied_date: "",
  notes: ""
};

export default function Career() {
  const { token } = useAuth();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const [resumes, setResumes] = useState([]);
  const [applications, setApplications] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // resume upload
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeLabel, setResumeLabel] = useState("");
  const [uploading, setUploading] = useState(false);

  // application add/edit form
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const loadResumes = useCallback(() => {
    fetch(`${API_URL}/resumes`, { headers })
      .then((res) => res.json())
      .then((data) => setResumes(data.resumes || []))
      .catch(() => {});
  }, [headers]);

  const loadApplications = useCallback(() => {
    fetch(`${API_URL}/job-applications`, { headers })
      .then((res) => res.json())
      .then((data) => setApplications(data.applications || []))
      .catch(() => {});
  }, [headers]);

  useEffect(() => {
    if (!token) return;
    loadResumes();
    loadApplications();
  }, [token, loadResumes, loadApplications]);

  const flash = (msg) => {
    setMessage(msg);
    setError("");
    setTimeout(() => setMessage(""), 3000);
  };

  // ----- resume actions -----
  const uploadResume = async (e) => {
    e.preventDefault();
    if (!resumeFile) return;
    setUploading(true);
    setError("");

    const body = new FormData();
    body.append("file", resumeFile);
    if (resumeLabel) body.append("label", resumeLabel);

    try {
      const res = await fetch(`${API_URL}/resumes`, {
        method: "POST",
        headers, // do NOT set Content-Type; browser adds the multipart boundary
        body
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      setResumeFile(null);
      setResumeLabel("");
      e.target.reset();
      loadResumes();
      flash("Resume uploaded.");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteResume = async (id) => {
    if (!window.confirm("Delete this resume?")) return;
    await fetch(`${API_URL}/resumes/${id}`, { method: "DELETE", headers });
    loadResumes();
  };

  // ----- application actions -----
  const setField = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const startEdit = (app) => {
    setEditingId(app.id);
    setForm({
      company: app.company || "",
      role: app.role || "",
      source: app.source || "other",
      status: app.status || "saved",
      location: app.location || "",
      url: app.url || "",
      applied_date: app.applied_date || "",
      notes: app.notes || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submitApplication = async (e) => {
    e.preventDefault();
    if (!form.company.trim() || !form.role.trim()) {
      setError("Company and role are required.");
      return;
    }
    const payload = { ...form, applied_date: form.applied_date || null };
    const url = editingId
      ? `${API_URL}/job-applications/${editingId}`
      : `${API_URL}/job-applications`;
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Save failed");
      return;
    }
    cancelEdit();
    loadApplications();
    flash(editingId ? "Application updated." : "Application added.");
  };

  const changeStatus = async (app, status) => {
    // PUT replaces the full record, so send the existing fields plus new status
    await fetch(`${API_URL}/job-applications/${app.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ...app, status })
    });
    loadApplications();
  };

  const deleteApplication = async (id) => {
    if (!window.confirm("Delete this application?")) return;
    await fetch(`${API_URL}/job-applications/${id}`, {
      method: "DELETE",
      headers
    });
    loadApplications();
  };

  const counts = useMemo(() => {
    const c = {};
    applications.forEach((a) => {
      c[a.status] = (c[a.status] || 0) + 1;
    });
    return c;
  }, [applications]);

  const currentResume = resumes[0];

  return (
    <div style={theme.page}>
      <h1>💼 Job Search</h1>
      <p style={{ opacity: 0.7 }}>
        Your resume, an application tracker, and quick links to your job-search
        accounts.
      </p>

      {message && <div style={theme.status}>{message}</div>}
      {error && <div style={theme.error}>{error}</div>}

      {/* Quick links */}
      <div style={theme.card}>
        <h2>Quick links</h2>
        <div style={styles.linkRow}>
          {QUICK_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.linkButton}
            >
              {l.label} ↗
            </a>
          ))}
        </div>
        <p style={styles.hint}>
          LinkedIn and Indeed don't offer a personal data API, so these open your
          accounts in a new tab. Log applications below to track them here.
        </p>
      </div>

      {/* Resume */}
      <div style={theme.card}>
        <h2>Resume</h2>

        <form onSubmit={uploadResume} style={{ marginBottom: 16 }}>
          <label style={theme.label}>Upload a PDF resume</label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setResumeFile(e.target.files[0] || null)}
            style={{ marginBottom: 10 }}
          />
          <input
            type="text"
            placeholder="Label (optional, e.g. 'Backend Engineer v2')"
            value={resumeLabel}
            onChange={(e) => setResumeLabel(e.target.value)}
            style={theme.input}
          />
          <button
            type="submit"
            style={{ ...theme.button, background: colors.primary, color: colors.primaryText }}
            disabled={!resumeFile || uploading}
          >
            {uploading ? "Uploading…" : "Upload resume"}
          </button>
        </form>

        {currentResume ? (
          <>
            <div style={styles.resumeHeader}>
              <strong>{currentResume.label || currentResume.original_name}</strong>
              <span style={styles.meta}>
                {" "}
                — uploaded{" "}
                {currentResume.created_at
                  ? new Date(currentResume.created_at).toLocaleDateString()
                  : ""}
              </span>
            </div>
            <iframe
              title="Current resume"
              src={`${API_URL}${currentResume.url}`}
              style={styles.pdfFrame}
            />
            <div style={styles.linkRow}>
              <a
                href={`${API_URL}${currentResume.download_url}`}
                style={styles.linkButton}
              >
                ⬇ Download
              </a>
              <a
                href={`${API_URL}${currentResume.url}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.linkButton}
              >
                Open in new tab ↗
              </a>
            </div>
          </>
        ) : (
          <p>No resume uploaded yet.</p>
        )}

        {resumes.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Previous versions</h3>
            {resumes.slice(1).map((r) => (
              <div key={r.id} style={styles.row}>
                <span>
                  {r.label || r.original_name}{" "}
                  <span style={styles.meta}>
                    ({r.created_at ? new Date(r.created_at).toLocaleDateString() : ""})
                  </span>
                </span>
                <span style={styles.rowActions}>
                  <a href={`${API_URL}${r.download_url}`} style={styles.smallLink}>
                    Download
                  </a>
                  <button style={theme.dangerButton} onClick={() => deleteResume(r.id)}>
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {currentResume && (
          <button
            style={{ ...theme.dangerButton, marginTop: 12 }}
            onClick={() => deleteResume(currentResume.id)}
          >
            Delete current resume
          </button>
        )}
      </div>

      {/* Application tracker form */}
      <div style={theme.card}>
        <h2>{editingId ? "Edit application" : "Add application"}</h2>
        <form onSubmit={submitApplication}>
          <div style={styles.formGrid}>
            <div>
              <label style={theme.label}>Company *</label>
              <input style={theme.input} value={form.company} onChange={setField("company")} />
            </div>
            <div>
              <label style={theme.label}>Role *</label>
              <input style={theme.input} value={form.role} onChange={setField("role")} />
            </div>
            <div>
              <label style={theme.label}>Source</label>
              <select style={theme.input} value={form.source} onChange={setField("source")}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={theme.label}>Status</label>
              <select style={theme.input} value={form.status} onChange={setField("status")}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={theme.label}>Location</label>
              <input style={theme.input} value={form.location} onChange={setField("location")} />
            </div>
            <div>
              <label style={theme.label}>Date applied</label>
              <input
                type="date"
                style={theme.input}
                value={form.applied_date || ""}
                onChange={setField("applied_date")}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={theme.label}>Posting URL</label>
              <input
                style={{ ...theme.input, maxWidth: "none" }}
                value={form.url}
                onChange={setField("url")}
                placeholder="https://..."
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={theme.label}>Notes</label>
              <textarea
                style={{ ...theme.input, maxWidth: "none", minHeight: 60 }}
                value={form.notes}
                onChange={setField("notes")}
              />
            </div>
          </div>
          <div style={styles.linkRow}>
            <button
              type="submit"
              style={{ ...theme.button, background: colors.primary, color: colors.primaryText }}
            >
              {editingId ? "Save changes" : "Add application"}
            </button>
            {editingId && (
              <button type="button" style={theme.neutralButton} onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Application list */}
      <div style={theme.card}>
        <h2>Applications ({applications.length})</h2>

        {applications.length > 0 && (
          <div style={styles.summaryRow}>
            {STATUSES.filter((s) => counts[s.value]).map((s) => (
              <span key={s.value} style={styles.summaryBadge}>
                {s.label}: <strong>{counts[s.value]}</strong>
              </span>
            ))}
          </div>
        )}

        {applications.length === 0 ? (
          <p>No applications logged yet. Add your first one above.</p>
        ) : (
          applications.map((app) => (
            <div key={app.id} style={styles.appCard}>
              <div style={styles.appTop}>
                <div>
                  <strong style={{ fontSize: 16 }}>{app.role}</strong>
                  <span style={styles.meta}> @ {app.company}</span>
                  {app.location && <span style={styles.meta}> · {app.location}</span>}
                </div>
                <span
                  style={{
                    ...styles.statusBadge,
                    background: STATUS_COLORS[app.status] || colors.border,
                    color: app.status === "saved" ? colors.text : colors.onSolid
                  }}
                >
                  {labelFor(STATUSES, app.status)}
                </span>
              </div>

              <div style={styles.appMeta}>
                <span style={styles.meta}>{labelFor(SOURCES, app.source)}</span>
                {app.applied_date && (
                  <span style={styles.meta}>
                    {" · applied "}
                    {new Date(app.applied_date).toLocaleDateString()}
                  </span>
                )}
                {app.url && (
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.smallLink}
                  >
                    View posting ↗
                  </a>
                )}
              </div>

              {app.notes && <p style={styles.notes}>{app.notes}</p>}

              <div style={styles.appActions}>
                <select
                  value={app.status}
                  onChange={(e) => changeStatus(app, e.target.value)}
                  style={styles.statusSelect}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <button style={theme.neutralButton} onClick={() => startEdit(app)}>
                  Edit
                </button>
                <button style={theme.dangerButton} onClick={() => deleteApplication(app.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  linkRow: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" },
  linkButton: {
    display: "inline-block",
    padding: "8px 14px",
    borderRadius: 8,
    background: colors.surfaceAlt,
    color: colors.text,
    textDecoration: "none",
    fontSize: 14
  },
  hint: { opacity: 0.6, fontSize: 13, marginTop: 12, marginBottom: 0 },
  resumeHeader: { marginBottom: 10 },
  pdfFrame: {
    width: "100%",
    height: 600,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: "#fff"
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTop: `1px solid ${colors.border}`,
    padding: "10px 0"
  },
  rowActions: { display: "flex", gap: 10, alignItems: "center" },
  meta: { opacity: 0.6, fontSize: 14 },
  smallLink: { color: colors.primary, textDecoration: "none", fontSize: 14 },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "0 16px"
  },
  summaryRow: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  summaryBadge: {
    background: colors.surfaceAlt,
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 13
  },
  appCard: {
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12
  },
  appTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  },
  appMeta: { marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  notes: {
    marginTop: 8,
    marginBottom: 0,
    fontSize: 14,
    opacity: 0.85,
    whiteSpace: "pre-wrap"
  },
  statusBadge: {
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: "bold",
    whiteSpace: "nowrap"
  },
  statusSelect: {
    padding: 8,
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.surface,
    color: colors.text
  },
  appActions: { display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }
};
