# SignDoc — Alur Penggunaan Lengkap

Dokumen ini menjelaskan alur penggunaan SignDoc dari registrasi hingga verifikasi laporan PDF.

---

## Prasyarat

```bash
cd be
pip install -e .
python main.py
```

Buka `http://127.0.0.1:8000/fe/app.html` di browser.

---

## Langkah 1 — Registrasi

Buka tab **Akun**, isi form registrasi, lalu klik **Daftar & Generate Kunci**.

```
POST /api/auth/register
Body: { "username": "alice", "email": "alice@mail.com", "password": "secret123" }
```

**Yang terjadi di server:**

1. Bangkitkan **RSA-2048 key pair** (`public_key` + `private_key`)
2. Enkripsi `private_key` menggunakan **PBKDF2-HMAC-SHA256** (390.000 iterasi) → **Fernet (AES-128-CBC)**, dengan password sebagai bahan derivasi kunci
3. Hash password dengan **bcrypt**
4. Simpan ke database: `public_key` (plaintext), `encrypted_private_key`, `key_salt`, `password_hash`
5. Kembalikan **JWT token** (berlaku 24 jam)

> Kunci privat **tidak pernah dikirim ke client**. Server hanya menyimpan versi terenkripsinya.

---

## Langkah 2 — Login

Jika sudah punya akun, buka tab **Akun**, isi form login, klik **Masuk**.

```
POST /api/auth/login
Body: { "username": "alice", "password": "secret123" }
```

Server memverifikasi password dengan `bcrypt.checkpw` lalu mengembalikan JWT token baru.
Token disimpan di `localStorage` dan dikirim otomatis di header `Authorization: Bearer <token>` untuk semua request selanjutnya.

---

## Langkah 3 — Upload Dokumen

Buka tab **Dokumen**, pilih file (PDF, TXT, MD, JSON, CSV — maks 10 MB), klik **Upload & Hash**.

```
POST /api/documents/upload
Header: Authorization: Bearer <token>
Body: multipart/form-data — field "file"
```

**Yang terjadi di server:**

1. Validasi ekstensi dan ukuran file
2. Simpan file di `be/data/uploads/` dengan nama UUID
3. Hitung **SHA-256** dari byte file → `content_hash`
4. Simpan metadata (filename, path, hash, mime type, owner) ke database
5. Kembalikan `document_id` dan `content_hash`

`content_hash` adalah sidik jari dokumen — satu byte berubah → hash berubah total.

Di daftar dokumen, setiap dokumen memiliki tombol **Salin ID** untuk menyalin `document_id` ke clipboard — digunakan untuk berbagi ke user lain dalam alur multi-sign.

---

## Langkah 4 — Tanda Tangan Dokumen

Buka tab **Tanda Tangan**, pilih dokumen dari dropdown, masukkan password akun, klik **Tanda Tangani**.

```
POST /api/documents/{document_id}/sign
Header: Authorization: Bearer <token>
Body: { "password": "secret123" }
```

**Yang terjadi di server:**

1. Verifikasi JWT
2. Cek dokumen ada dan belum ditandatangani oleh user ini
3. Re-hash file di disk → bandingkan dengan `content_hash` saat upload; **jika berbeda, signing ditolak**
4. Dekripsi kunci privat menggunakan password (PBKDF2 + Fernet)
5. Hitung tanda tangan: `RSA.sign(content_hash, private_key, PKCS1v15 + Prehashed(SHA-256))`
6. Simpan signature (base64) ke tabel `signatures`
7. Kembalikan **signature payload** dan tampilkan **QR code** verifikasi

Setelah berhasil, QR code muncul otomatis. URL di dalam QR mengikuti hostname yang sedang digunakan sehingga bisa dipindai dari device lain di jaringan yang sama.

**Contoh isi `.sig.json` yang dihasilkan:**

```json
{
  "version": 1,
  "algorithm": "RSA-2048+SHA-256",
  "document_id": "3ab2e6f7-...",
  "filename": "kontrak.pdf",
  "document_hash": "a3f29c1d...",
  "signature": "base64==",
  "signer": "alice",
  "signer_id": 1,
  "signed_at": "2024-06-01T10:00:00+00:00",
  "all_signers": [...]
}
```

---

## Langkah 5 — Multi-Signer

Dokumen yang sama bisa ditandatangani lebih dari satu user. Setiap signer menggunakan kunci privatnya sendiri.

### Sisi User A (pemilik dokumen):

1. Upload dokumen → tandatangani seperti biasa
2. Di tab **Dokumen**, klik tombol **Salin ID** pada dokumen yang ingin ditandatangani bersama
3. Kirim ID tersebut ke User B (via chat, email, dll)

### Sisi User B (penanda tangan kedua):

1. Buka `http://127.0.0.1:8000/fe/app.html` — bisa di browser berbeda atau mode incognito
2. Register atau login dengan akun sendiri
3. Buka tab **Tanda Tangan**
4. Paste document ID di field **"Cari Dokumen via ID"** → klik **Cari**
5. Info dokumen muncul: nama file, pemilik, daftar yang sudah tanda tangan
6. Dokumen otomatis masuk ke dropdown pilih dokumen
7. Masukkan password akun B → klik **Tanda Tangani**

```
GET  /api/documents/{document_id}/info   ← lookup info dokumen
POST /api/documents/{document_id}/sign   ← tanda tangan dengan kunci User B
```

**Hasilnya:** Database menyimpan dua signature terpisah — satu dari User A, satu dari User B — masing-masing dengan public key berbeda. Saat verifikasi, kedua signature diverifikasi secara independen dan status per signer ditampilkan.

> Database memiliki constraint `UNIQUE(document_id, user_id)` — satu user hanya bisa menandatangani satu kali per dokumen.

---

## Langkah 6 — Download File Signature

Dari tab **Riwayat**, klik **Unduh .sig.json** pada dokumen yang diinginkan.

```
GET /api/documents/{document_id}/signature-file
Header: Authorization: Bearer <token>
```

Bagikan file `.sig.json` ini beserta **dokumen asli** kepada pihak yang ingin memverifikasi.

---

## Langkah 7 — Verifikasi Tanda Tangan

Buka tab **Verifikasi**, unggah dokumen asli + file `.sig.json`, klik **Verifikasi**.
Tidak perlu login — siapapun bisa melakukan verifikasi.

```
POST /api/verify
Body: multipart/form-data
  - document:       <file asli>
  - signature_file: <file .sig.json>
```

**Yang terjadi di server:**

1. Hitung SHA-256 dari dokumen yang diunggah → `current_hash`
2. Bandingkan `current_hash` dengan `document_hash` di `.sig.json`
3. Ambil `public_key` signer dari database (via `document_id` atau `signer`)
4. Jalankan: `RSA.verify(current_hash, signature, public_key, PKCS1v15)`
5. Kembalikan hasil lengkap termasuk status per signer (untuk multi-sign)

| Kondisi                      | Status                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| Hash cocok + signature valid | **VALID ✅** — dokumen utuh, signer terverifikasi            |
| Hash berbeda                 | **INVALID ❌** — dokumen dimodifikasi setelah ditandatangani |
| Signature tidak cocok        | **INVALID ❌** — signature bukan dari kunci yang sesuai      |

---

## Langkah 8 — Verifikasi via QR Code

Setelah menandatangani, QR code otomatis muncul di UI. URL di dalam QR mengikuti hostname aktual:

```
http://<hostname>:8000/fe/verify.html?doc={document_id}
```

Siapa saja memindai QR → halaman verifikasi publik terbuka → tampil status dokumen, daftar signer, dan timestamp **tanpa login**.

```
GET /api/verify/public/{document_id}
```

> Untuk akses dari HP/device lain: pastikan komputer dan HP terhubung ke WiFi yang sama, lalu server otomatis bisa diakses via IP lokal komputer (mis. `192.168.x.x:8000`).

---

## Langkah 9 — Export Laporan PDF

Di tab **Verifikasi**, setelah hasil verifikasi muncul, klik **Export Laporan PDF**.

```
POST /api/verify/report-pdf
Body: multipart/form-data
  - document:       <file asli>
  - signature_file: <file .sig.json>
```

PDF berisi: status verifikasi, algoritma yang digunakan, hash dokumen (saat ini vs saat ditandatangani), nama penanda tangan, waktu tanda tangan, dan daftar lengkap multi-signer.

---

## Diagram Alur

```
Registrasi
    │  username + email + password
    ▼
Server: generate RSA-2048 keypair
    → encrypt private_key (PBKDF2 + Fernet + password)
    → hash password (bcrypt)
    → simpan ke DB
    → return JWT token
    │
    ▼
Upload Dokumen
    │  file + JWT token
    ▼
Server: simpan file ke disk
    → SHA-256(file) = content_hash
    → simpan metadata ke DB
    → return document_id
    │
    ├─────────────────────────────────────┐
    ▼                                     ▼
Tanda Tangan (User A)           Multi-Sign (User B)
    │  document_id + password       │  dapat document_id dari A
    ▼                               ▼
Server: re-hash → cek integritas   Lookup /info → info dokumen
    → decrypt private_key          → Sign dengan kunci B
    → RSA.sign(hash, key_A)        → RSA.sign(hash, key_B)
    → simpan signature A           → simpan signature B
    → return .sig.json + QR        → return .sig.json
    │
    ▼
Verifikasi  ← siapapun, tanpa login
    │  file asli + .sig.json
    ▼
Server: SHA-256(file) = current_hash
    → bandingkan dengan document_hash
    → ambil public_key A dan B dari DB
    → RSA.verify per signer
    → return VALID/INVALID + status per signer
    │
    ▼
Export PDF  (opsional)
    → laporan formal hasil verifikasi
```

---

## Ringkasan Endpoint

| Method | Endpoint                             | Auth | Fungsi                                   |
| ------ | ------------------------------------ | ---- | ---------------------------------------- |
| POST   | `/api/auth/register`                 | —    | Registrasi + generate RSA-2048 keypair   |
| POST   | `/api/auth/login`                    | —    | Login, return JWT                        |
| GET    | `/api/auth/me`                       | JWT  | Info profil + public key                 |
| POST   | `/api/documents/upload`              | JWT  | Upload dokumen + hitung SHA-256          |
| GET    | `/api/documents`                     | JWT  | Daftar dokumen milik/ditandatangani user |
| GET    | `/api/documents/history`             | JWT  | Riwayat penandatanganan                  |
| POST   | `/api/documents/{id}/sign`           | JWT  | Tanda tangani dokumen                    |
| GET    | `/api/documents/{id}/signature-file` | JWT  | Download `.sig.json`                     |
| GET    | `/api/documents/{id}/info`           | JWT  | Lookup info dokumen (untuk multi-sign)   |
| GET    | `/api/documents/{id}/qr`             | —    | Data QR verifikasi                       |
| POST   | `/api/verify`                        | —    | Verifikasi dokumen + signature           |
| GET    | `/api/verify/public/{id}`            | —    | Verifikasi publik via QR                 |
| POST   | `/api/verify/report-pdf`             | —    | Export laporan PDF                       |
| GET    | `/api/health`                        | —    | Health check                             |
