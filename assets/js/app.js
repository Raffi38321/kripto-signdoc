// =============================================
// SignDoc - Digital Document Signature System
// RSA-2048 & SHA-256 Implementation
// =============================================

// ===== Configuration =====
const CONFIG = {
    RSA_KEY_SIZE: 2048,
    ALGORITHM: 'RSA-2048',
    HASH_ALGORITHM: 'SHA-256'
};

// ===== Global State =====
let appState = {
    publicKey: null,
    privateKey: null,
    currentDocument: null,
    currentSignature: null
};

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', function () {
    initializeEventListeners();
    console.log('SignDoc initialized successfully');
});

function initializeEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    // Key Generation
    document.getElementById('generateKeyBtn').addEventListener('click', generateKeys);

    // Document Signing
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('computeHashBtn').addEventListener('click', computeDocumentHash);
    document.getElementById('signDocBtn').addEventListener('click', signDocument);

    // Verification
    document.getElementById('verifyBtn').addEventListener('click', verifySignature);

    // Auto-compute hash when document text changes
    document.getElementById('documentText').addEventListener('change', () => {
        document.getElementById('documentHash').value = '';
        document.getElementById('signatureOutput').value = '';
    });
}

// ===== Tab Switching =====
function switchTab(e) {
    const tabName = e.target.dataset.tab;

    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    e.target.classList.add('active');
}

// ===== Key Generation =====
async function generateKeys() {
    const btn = document.getElementById('generateKeyBtn');
    const progressContainer = document.getElementById('keyProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    btn.disabled = true;
    progressContainer.classList.remove('hidden');

    try {
        progressText.textContent = 'Membangkitkan kunci RSA-2048... (ini memakan waktu 10-30 detik)';
        progressFill.style.width = '10%';

        // Generate RSA keys using JSEncrypt
        const encrypt = new JSEncrypt({ default_key_size: CONFIG.RSA_KEY_SIZE });

        // Simulate progress
        let progress = 10;
        const progressInterval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 15;
                progressFill.style.width = Math.min(progress, 90) + '%';
            }
        }, 500);

        // Generate key pair (this is async in nature)
        await new Promise((resolve) => {
            setTimeout(() => {
                encrypt.getKey();
                resolve();
            }, 100);
        });

        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        progressText.textContent = 'Kunci berhasil dibangkitkan!';

        // Get keys
        const publicKey = encrypt.getPublicKey();
        const privateKey = encrypt.getPrivateKey();

        // Store in app state
        appState.publicKey = publicKey;
        appState.privateKey = privateKey;

        // Display keys
        document.getElementById('publicKeyDisplay').value = publicKey;
        document.getElementById('privateKeyDisplay').value = privateKey;

        // Auto-fill in other tabs
        document.getElementById('verifyPublicKey').value = publicKey;

        showNotification('Sukses', 'Kunci RSA-2048 berhasil dibangkitkan!', 'success');

        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressFill.style.width = '0%';
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('Error generating keys:', error);
        showNotification('Error', 'Gagal membangkitkan kunci: ' + error.message, 'error');
        progressContainer.classList.add('hidden');
        btn.disabled = false;
    }
}

// ===== Document Hashing (SHA-256) =====
async function computeDocumentHash() {
    const documentText = document.getElementById('documentText').value;

    if (!documentText.trim()) {
        showNotification('Peringatan', 'Silakan masukkan dokumen terlebih dahulu', 'warning');
        return;
    }

    try {
        // Compute SHA-256 hash
        const hash = await sha256Hash(documentText);
        appState.currentDocument = documentText;

        document.getElementById('documentHash').value = hash;

        // Enable sign button
        document.getElementById('signDocBtn').disabled = false;

        showNotification('Sukses', 'Hash SHA-256 berhasil dihitung', 'success');
    } catch (error) {
        console.error('Error computing hash:', error);
        showNotification('Error', 'Gagal menghitung hash: ' + error.message, 'error');
    }
}

async function sha256Hash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// ===== Digital Signing =====
async function signDocument() {
    const privateKeyText = document.getElementById('privateKeyInput').value;
    const documentHash = document.getElementById('documentHash').value;

    if (!privateKeyText.trim()) {
        showNotification('Peringatan', 'Silakan masukkan kunci privat', 'warning');
        return;
    }

    if (!documentHash) {
        showNotification('Peringatan', 'Silakan hitung hash dokumen terlebih dahulu', 'warning');
        return;
    }

    try {
        const btn = document.getElementById('signDocBtn');
        btn.disabled = true;

        // Create signature
        const encrypt = new JSEncrypt();
        encrypt.setPrivateKey(privateKeyText);

        // Sign the hash (using RSA private key)
        const signature = encrypt.sign(
            documentHash,
            CryptoJS.SHA256,
            "sha256"
        );

        if (!signature) {
            throw new Error('Gagal membuat signature. Pastikan kunci privat valid.');
        }

        appState.currentSignature = signature;
        document.getElementById('signatureOutput').value = signature;

        showNotification('Sukses', 'Dokumen berhasil ditandatangani dengan RSA-2048!', 'success');
        btn.disabled = false;

    } catch (error) {
        console.error('Error signing document:', error);
        showNotification('Error', 'Gagal menandatangani dokumen: ' + error.message, 'error');
        document.getElementById('signDocBtn').disabled = false;
    }
}

// ===== Signature Verification =====
async function verifySignature() {
    const publicKeyText = document.getElementById('verifyPublicKey').value;
    const signatureText = document.getElementById('verifySignature').value;
    const documentText = document.getElementById('verifyDocumentText').value;

    if (!publicKeyText.trim() || !signatureText.trim() || !documentText.trim()) {
        showNotification('Peringatan', 'Silakan lengkapi semua field', 'warning');
        return;
    }

    try {
        // Compute hash of document
        const documentHash = await sha256Hash(documentText);

        // Verify signature
        const encrypt = new JSEncrypt();
        encrypt.setPublicKey(publicKeyText);

        const isValid = encrypt.verify(
            documentHash,
            signatureText,
            CryptoJS.SHA256
        );

        // Get signer info from input or use default
        const signerName = document.getElementById('signerName').value || 'Unknown Signer';

        // Display result
        const resultContainer = document.getElementById('verificationResult');
        const resultContent = document.getElementById('resultContent');

        if (isValid) {
            resultContainer.classList.remove('error');
            resultContainer.classList.add('success');
            resultContent.innerHTML = `
                <strong>✅ Tanda Tangan Valid!</strong>
                <p>Dokumen ini asli dan ditandatangani oleh ${signerName}.</p>
                <p>Integritas dokumen terjamin - dokumen tidak mengalami perubahan.</p>
            `;
            showNotification('Sukses', 'Tanda tangan terverifikasi dengan valid!', 'success');
        } else {
            resultContainer.classList.remove('success');
            resultContainer.classList.add('error');
            resultContent.innerHTML = `
                <strong>❌ Tanda Tangan Tidak Valid!</strong>
                <p>Tanda tangan tidak cocok dengan dokumen atau kunci publik.</p>
                <p>Dokumen mungkin telah diubah atau tanda tangan salah.</p>
            `;
            showNotification('Gagal Verifikasi', 'Tanda tangan tidak valid!', 'error');
        }

        resultContainer.classList.remove('hidden');

        // Show verification details
        const detailsContainer = document.getElementById('verificationDetails');
        document.getElementById('verifyDocHash').value = documentHash;
        document.getElementById('verifyStatus').value = isValid ? 'Valid ✅' : 'Invalid ❌';
        detailsContainer.classList.remove('hidden');

    } catch (error) {
        console.error('Error verifying signature:', error);
        showNotification('Error', 'Gagal memverifikasi tanda tangan: ' + error.message, 'error');
    }
}

// ===== File Handling =====
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (event) {
        document.getElementById('documentText').value = event.target.result;
        showNotification('Sukses', `File '${file.name}' berhasil diupload`, 'success');
    };

    reader.onerror = function () {
        showNotification('Error', 'Gagal membaca file', 'error');
    };

    reader.readAsText(file);
}

// ===== Download Functions =====
function downloadPrivateKey() {
    const privateKey = document.getElementById('privateKeyDisplay').value;

    if (!privateKey) {
        showNotification('Peringatan', 'Tidak ada kunci privat untuk diunduh', 'warning');
        return;
    }

    downloadFile(privateKey, 'private_key.pem', 'text/plain');
    showNotification('Peringatan', 'Kunci privat telah diunduh - Simpan dengan aman!', 'warning');
}

function downloadBothKeys() {
    const publicKey = document.getElementById('publicKeyDisplay').value;
    const privateKey = document.getElementById('privateKeyDisplay').value;

    if (!publicKey || !privateKey) {
        showNotification('Peringatan', 'Tidak ada kunci untuk diunduh', 'warning');
        return;
    }

    const content = `=== RSA-2048 Key Pair ===
Generated: ${new Date().toLocaleString('id-ID')}

--- PUBLIC KEY ---
${publicKey}

--- PRIVATE KEY (KEEP SECURE) ---
${privateKey}
`;

    downloadFile(content, 'rsa_keypair.txt', 'text/plain');
    showNotification('Sukses', 'Semua kunci telah diunduh', 'success');
}

function downloadSignature() {
    const signature = document.getElementById('signatureOutput').value;
    const documentHash = document.getElementById('documentHash').value;
    const signerName = document.getElementById('signerName').value || 'Unknown';

    if (!signature) {
        showNotification('Peringatan', 'Tidak ada tanda tangan untuk diunduh', 'warning');
        return;
    }

    const content = `=== Digital Signature ===
Created: ${new Date().toLocaleString('id-ID')}
Signer: ${signerName}
Algorithm: RSA-2048 + SHA-256

--- DOCUMENT HASH (SHA-256) ---
${documentHash}

--- SIGNATURE ---
${signature}
`;

    downloadFile(content, 'signature.txt', 'text/plain');
    showNotification('Sukses', 'Tanda tangan telah diunduh', 'success');
}

function downloadSignedDocument() {
    const document = document.getElementById('documentText').value;
    const signature = document.getElementById('signatureOutput').value;
    const documentHash = document.getElementById('documentHash').value;
    const signerName = document.getElementById('signerName').value || 'Unknown Signer';

    if (!document || !signature) {
        showNotification('Peringatan', 'Silakan tandatangani dokumen terlebih dahulu', 'warning');
        return;
    }

    const content = `=== DOKUMEN BERTANDA TANGAN DIGITAL ===
Tanggal: ${new Date().toLocaleString('id-ID')}
Penanda Tangan: ${signerName}
Algoritma: RSA-2048 + SHA-256

--- DOKUMEN ORIGINAL ---
${document}

--- HASH DOKUMEN (SHA-256) ---
${documentHash}

--- TANDA TANGAN DIGITAL (SIGNATURE) ---
${signature}

=== INSTRUKSI VERIFIKASI ===
1. Buka aplikasi SignDoc
2. Pergi ke tab "Verifikasi Tanda Tangan"
3. Masukkan dokumen original di atas
4. Masukkan tanda tangan di atas
5. Masukkan kunci publik penanda tangan
6. Klik "Verifikasi Tanda Tangan"
`;

    downloadFile(content, `signed_document_${Date.now()}.txt`, 'text/plain');
    showNotification('Sukses', 'Dokumen bertanda tangan telah diunduh', 'success');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// ===== Utility Functions =====
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.value || element.textContent;

    if (!text.trim()) {
        showNotification('Peringatan', 'Tidak ada teks untuk disalin', 'warning');
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        showNotification('Sukses', 'Teks berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
        showNotification('Error', 'Gagal menyalin ke clipboard', 'error');
    });
}

function showNotification(title, message, type = 'info') {
    if (window.SignDocModal) {
        window.SignDocModal.show(title, message, type);
    } else {
        showToast(message, type);
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===== Helper: Format Key for Display =====
function formatKeyDisplay(key) {
    return key.substring(0, 100) + '...' + key.substring(key.length - 100);
}

// ===== Export for Testing =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sha256Hash,
        CONFIG,
        appState
    };
}

console.log('%cSignDoc initialized', 'color: #2563eb; font-weight: bold; font-size: 14px;');
console.log('%cAlgorithms: RSA-2048 + SHA-256', 'color: #10b981;');
console.log('%cAll cryptographic operations run on the client-side', 'color: #64748b;');
