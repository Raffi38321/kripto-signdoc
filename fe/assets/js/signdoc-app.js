document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    bindAuth();
    bindDocuments();
    bindSign();
    bindVerify();
    refreshAuthUI();
});

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const tab = e.target.dataset.tab;
            document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
            document.getElementById(tab).classList.add("active");
            e.target.classList.add("active");
            if (tab === "documents" || tab === "sign") loadDocuments();
            if (tab === "history") loadHistory();
        });
    });
}

function notify(title, msg, type = "info") {
    if (window.SignDocModal) window.SignDocModal.show(title, msg, type);
    else alert(`${title}: ${msg}`);
}

function refreshAuthUI() {
    const loggedIn = SignDocAuth.isLoggedIn();
    document.getElementById("authStatus").textContent = loggedIn
        ? `Login sebagai ${localStorage.getItem("signdoc_username")}`
        : "Belum login";
    document.getElementById("logoutBtn").classList.toggle("hidden", !loggedIn);
    document.getElementById("profileCard").classList.toggle("hidden", !loggedIn);

    if (loggedIn) {
        SignDocAPI.me()
            .then((p) => {
                document.getElementById("profileUsername").textContent = p.username;
                document.getElementById("profilePublicKey").value = p.public_key_pem;
            })
            .catch(() => SignDocAuth.clearAuth());
    }
}

function bindAuth() {
    document.getElementById("registerBtn").addEventListener("click", async () => {
        try {
            const res = await SignDocAPI.register(
                document.getElementById("regUsername").value.trim(),
                document.getElementById("regEmail").value.trim(),
                document.getElementById("regPassword").value
            );
            SignDocAuth.setAuth(res.access_token, res.username, res.user_id);
            notify("Sukses", "Registrasi berhasil. Kunci RSA-2048 dibuat & privat terenkripsi.", "success");
            refreshAuthUI();
        } catch (e) {
            notify("Error", e.message, "error");
        }
    });

    document.getElementById("loginBtn").addEventListener("click", async () => {
        try {
            const res = await SignDocAPI.login(
                document.getElementById("loginUsername").value.trim(),
                document.getElementById("loginPassword").value
            );
            SignDocAuth.setAuth(res.access_token, res.username, res.user_id);
            notify("Sukses", "Login berhasil", "success");
            refreshAuthUI();
        } catch (e) {
            notify("Error", e.message, "error");
        }
    });

    document.getElementById("logoutBtn").addEventListener("click", () => {
        SignDocAuth.clearAuth();
        refreshAuthUI();
        notify("Info", "Anda telah keluar", "info");
    });
}

function requireAuth() {
    if (!SignDocAuth.isLoggedIn()) {
        notify("Login diperlukan", "Silakan login atau daftar terlebih dahulu", "warning");
        throw new Error("auth");
    }
}

function bindDocuments() {
    document.getElementById("uploadBtn").addEventListener("click", async () => {
        try {
            requireAuth();
            const file = document.getElementById("uploadFile").files[0];
            if (!file) return notify("Peringatan", "Pilih file dulu", "warning");
            const doc = await SignDocAPI.upload(file);
            const box = document.getElementById("uploadResult");
            box.classList.remove("hidden");
            box.innerHTML = `<strong>Upload berhasil</strong><br>ID: ${doc.id}<br>Hash SHA-256: <code>${doc.content_hash}</code>`;
            notify("Sukses", "Dokumen diunggah & hash dihitung", "success");
            loadDocuments();
        } catch (e) {
            if (e.message !== "auth") notify("Error", e.message, "error");
        }
    });
}

async function loadDocuments() {
    if (!SignDocAuth.isLoggedIn()) return;
    try {
        const docs = await SignDocAPI.listDocuments();
        const list = document.getElementById("documentsList");
        const select = document.getElementById("signDocSelect");

        if (!docs.length) {
            list.innerHTML = "<p class='description'>Belum ada dokumen.</p>";
            select.innerHTML = "<option value=''>— pilih dokumen —</option>";
            return;
        }

        list.innerHTML = docs
            .map((d) => {
                const tamper = d.tampered
                    ? '<span class="badge badge-danger">DIMODIFIKASI</span>'
                    : "";
                const signers = (d.signers || [])
                    .map((s) => `<li>${s.username} — ${s.status} (${s.signed_at})</li>`)
                    .join("");
                return `
                <div class="doc-item ${d.tampered ? "tampered" : ""}">
                    <h4>${d.filename} ${tamper}</h4>
                    <p>ID: <code>${d.id}</code></p>
                    <p>Hash: <code>${d.content_hash}</code></p>
                    <p>Tanda tangan: ${d.signature_count}</p>
                    ${signers ? `<ul>${signers}</ul>` : "<p>Belum ada penanda tangan</p>"}
                </div>`;
            })
            .join("");

        select.innerHTML =
            "<option value=''>— pilih dokumen —</option>" +
            docs.map((d) => `<option value="${d.id}">${d.filename}</option>`).join("");
    } catch (e) {
        notify("Error", e.message, "error");
    }
}

function bindSign() {
    document.getElementById("signBtn").addEventListener("click", async () => {
        try {
            requireAuth();
            const docId = document.getElementById("signDocSelect").value;
            const password = document.getElementById("signPassword").value;
            if (!docId || !password) return notify("Peringatan", "Pilih dokumen & masukkan password", "warning");

            const res = await SignDocAPI.sign(docId, password);
            const box = document.getElementById("signResult");
            box.classList.remove("hidden");
            box.innerHTML = `<strong>${res.message}</strong><pre>${JSON.stringify(res.signature_file, null, 2)}</pre>`;

            showQR(docId);
            notify("Sukses", "Dokumen ditandatangani", "success");
            loadDocuments();
        } catch (e) {
            if (e.message !== "auth") notify("Error", e.message, "error");
        }
    });
}

function showQR(documentId) {
    const container = document.getElementById("qrContainer");
    container.classList.remove("hidden");
    const canvas = document.getElementById("qrCanvas");
    canvas.innerHTML = "";
    const url = `${location.origin}${location.pathname.replace("app.html", "verify.html")}?doc=${documentId}`;
    new QRCode(canvas, { text: url, width: 180, height: 180 });
}

function bindVerify() {
    document.getElementById("verifyBtn").addEventListener("click", async () => {
        const docFile = document.getElementById("verifyDocFile").files[0];
        const sigFile = document.getElementById("verifySigFile").files[0];
        if (!docFile || !sigFile) return notify("Peringatan", "Upload dokumen & file signature", "warning");
        try {
            const r = await SignDocAPI.verify(docFile, sigFile);
            displayVerifyResult(r);
        } catch (e) {
            notify("Error", e.message, "error");
        }
    });

    document.getElementById("exportPdfBtn").addEventListener("click", async () => {
        const docFile = document.getElementById("verifyDocFile").files[0];
        const sigFile = document.getElementById("verifySigFile").files[0];
        if (!docFile || !sigFile) return notify("Peringatan", "Upload dokumen & signature dulu", "warning");
        try {
            const blob = await SignDocAPI.exportPdfReport(docFile, sigFile);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "signdoc_verification_report.pdf";
            a.click();
            notify("Sukses", "Laporan PDF diunduh", "success");
        } catch (e) {
            notify("Error", e.message, "error");
        }
    });
}

function displayVerifyResult(r) {
    const result = document.getElementById("verificationResult");
    const content = document.getElementById("resultContent");
    result.classList.remove("hidden", "success", "error");
    result.classList.add(r.valid ? "success" : "error");
    content.innerHTML = `<strong>${r.status === "VALID" ? "✅ VALID" : "❌ INVALID"}</strong><p>${r.message}</p>`;

    document.getElementById("verificationDetails").classList.remove("hidden");
    document.getElementById("verifyStatus").value = r.status;
    document.getElementById("verifyDocHash").value = r.document_hash;
    document.getElementById("verifyExpectedHash").value = r.expected_hash || "-";
    document.getElementById("verifyTampered").value = r.tampered ? "Ya — dokumen dimodifikasi!" : "Tidak";
    document.getElementById("verifySigner").value = r.signer || (r.signers?.[0]?.username) || "-";
    document.getElementById("verifySignedAt").value = r.signed_at || (r.signers?.[0]?.signed_at) || "-";

    const ms = document.getElementById("multiSignerList");
    if (r.signers?.length) {
        ms.innerHTML = "<h4>Status per penanda tangan</h4><ul>" +
            r.signers.map((s) => `<li>${s.username}: ${s.status} ${s.valid ? "✅" : "❌"}</li>`).join("") +
            "</ul>";
    }

    if (r.tampered) notify("Peringatan", "Dokumen yang ditandatangani terdeteksi dimodifikasi!", "warning");
}

async function loadHistory() {
    if (!SignDocAuth.isLoggedIn()) return;
    try {
        const items = await SignDocAPI.history();
        const tbody = document.getElementById("historyBody");
        if (!items.length) {
            tbody.innerHTML = "<tr><td colspan='4'>Belum ada riwayat</td></tr>";
            return;
        }
        tbody.innerHTML = items
            .map(
                (h) => `
            <tr>
                <td>${h.filename}</td>
                <td><code>${h.content_hash.slice(0, 16)}…</code></td>
                <td>${h.signed_at}</td>
                <td><button class="btn btn-sm btn-secondary" data-id="${h.document_id}">Unduh .sig.json</button></td>
            </tr>`
            )
            .join("");

        tbody.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("click", async () => {
                try {
                    const data = await SignDocAPI.downloadSignature(btn.dataset.id);
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `signature_${btn.dataset.id.slice(0, 8)}.sig.json`;
                    a.click();
                } catch (e) {
                    notify("Error", e.message, "error");
                }
            });
        });
    } catch (e) {
        notify("Error", e.message, "error");
    }
}
