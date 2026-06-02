// Ikuti host dari URL yang dibuka — supaya QR scan dari HP / device lain tetap bisa
const API_BASE = window.SIGNDOC_API || location.origin;

function getToken() {
  return localStorage.getItem("signdoc_token");
}

function setAuth(token, username, userId) {
  localStorage.setItem("signdoc_token", token);
  localStorage.setItem("signdoc_username", username);
  localStorage.setItem("signdoc_user_id", String(userId));
}

function clearAuth() {
  localStorage.removeItem("signdoc_token");
  localStorage.removeItem("signdoc_username");
  localStorage.removeItem("signdoc_user_id");
}

function isLoggedIn() {
  return Boolean(getToken());
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let detail = res.statusText;
    if (contentType.includes("application/json")) {
      const err = await res.json();
      detail =
        err.detail ||
        (typeof err.detail === "string" ? err.detail : JSON.stringify(err));
      if (Array.isArray(err.detail))
        detail = err.detail.map((d) => d.msg).join(", ");
    }
    throw new Error(detail);
  }

  if (contentType.includes("application/json")) return res.json();
  return res;
}

const SignDocAPI = {
  register: (username, email, password) =>
    apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    }),
  login: (username, password) =>
    apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  me: () => apiFetch("/api/auth/me"),
  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiFetch("/api/documents/upload", { method: "POST", body: fd });
  },
  listDocuments: () => apiFetch("/api/documents"),
  history: () => apiFetch("/api/documents/history"),
  sign: (documentId, password) =>
    apiFetch(`/api/documents/${documentId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  downloadSignature: (documentId) =>
    apiFetch(`/api/documents/${documentId}/signature-file`),
  getDocumentInfo: (documentId) =>
    apiFetch(`/api/documents/${documentId}/info`),
  verify: (documentFile, signatureFile) => {
    const fd = new FormData();
    fd.append("document", documentFile);
    fd.append("signature_file", signatureFile);
    return apiFetch("/api/verify", { method: "POST", body: fd });
  },
  publicVerify: (documentId) => apiFetch(`/api/verify/public/${documentId}`),
  exportPdfReport: async (documentFile, signatureFile) => {
    const fd = new FormData();
    fd.append("document", documentFile);
    fd.append("signature_file", signatureFile);
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_BASE}/api/verify/report-pdf`, {
      method: "POST",
      headers,
      body: fd,
    });
    if (!res.ok) throw new Error("Gagal membuat laporan PDF");
    return res.blob();
  },
};

window.SignDocAPI = SignDocAPI;
window.SignDocAuth = { getToken, setAuth, clearAuth, isLoggedIn };
