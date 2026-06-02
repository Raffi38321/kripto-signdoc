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

Buka tab **Account**, isi form registrasi, lalu klik **Daftar**.

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

Jika sudah punya akun, buka tab **Account**, isi form login, klik **Masuk**.

```
POST /api/auth/login
Body: { "username": "alice", "password": "secret123" }
```

Server memverifikasi password dengan `bcrypt.checkpw` lalu mengembalikan JWT token baru.  
Token disimpan di `localStorage` dan dikirim otomatis di header `Authorization: Bearer <token>`.

---

## Langkah 3 — Upload Dokumen

Buka tab **Documents**, pilih file (PDF, TXT, MD, JSON, CSV — maks 10 MB), klik **Upload**.

```
POST /api/documents/upload
Header: Authorization: Bearer <token>
Body: multipart/form-data — field "file"
```

**Yang terjadi di server:**

1. Validasi ekstensi dan ukuran
2. Simpan file di `be/data/uploads/` dengan nama UUID
3. Hitung **SHA-256** dari byte file → `content_hash`
4. Simpan metadata (filename, path, hash, mime type, owner) ke database
5. Kembalikan `document_id` dan `content_hash`

`content_hash` adalah sidik jari dokumen — satu byte berubah → hash berubah total.

---

## Langkah 4 — Tanda Tangan Dokumen

Buka tab **Sign**, pilih dokumen dari dropdown, masukkan password akun, klik **Tandatangani**.

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

## Langkah 5 — Multi-Signer (Opsional)

Dokumen yang sama bisa ditandatangani lebih dari satu user.

1. User lain (misal Bob) login dengan akunnya
2. Bob membuka tab **Documents** → dokumen milik Alice muncul jika Alice berbagi `document_id`
3. Bob memilih dokumen yang sama di tab **Sign**, masukkan password Bob, klik **Tandatangani**
4. Database mencatat signature Bob secara terpisah (`UNIQUE(document_id, user_id)`)

Di daftar dokumen, setiap signer tampil dengan nama, status `signed`, dan timestamp masing-masing.  
Saat verifikasi, tiap signature diverifikasi secara independen dengan public key masing-masing.

---

## Langkah 6 — Download File Signature

Dari tab **History**, klik **Unduh .sig.json** pada dokumen yang diinginkan.

```
GET /api/documents/{document_id}/signature-file
Header: Authorization: Bearer <token>
```

Bagikan file `.sig.json` ini beserta **dokumen asli** kepada pihak yang ingin melakukan verifikasi.

---

## Langkah 7 — Verifikasi Tanda Tangan

Buka tab **Verify**, unggah dokumen asli + file `.sig.json`, klik **Verifikasi**.  
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
5. Kembalikan hasil lengkap

| Kondisi                      | Status                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| Hash cocok + signature valid | **VALID ✅** — dokumen utuh, signer terverifikasi            |
| Hash berbeda                 | **INVALID ❌** — dokumen dimodifikasi setelah ditandatangani |
| Signature tidak cocok        | **INVALID ❌** — signature bukan dari kunci yang sesuai      |

---

## Langkah 8 — Verifikasi via QR Code

Setelah menandatangani, QR code otomatis muncul di UI. QR berisi URL:

```
http://127.0.0.1:8000/fe/verify.html?doc={document_id}
```

Siapa saja memindai QR → halaman verifikasi publik terbuka → tampil status dokumen, daftar signer, dan timestamp, **tanpa login**.

```
GET /api/verify/public/{document_id}
```

---

## Langkah 9 — Export Laporan PDF

Di tab **Verify**, setelah verifikasi selesai, klik **Export PDF**.

```
POST /api/verify/report-pdf
Body: multipart/form-data
  - document:       <file asli>
  - signature_file: <file .sig.json>
```

PDF berisi: status verifikasi, algoritma yang digunakan, hash dokumen (saat ini vs saat ditandatangani), nama penanda tangan, waktu tanda tangan, dan daftar multi-signer.

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
    ▼
Tanda Tangan
    │  document_id + password + JWT token
    ▼
Server: re-hash file → cek integritas
    → decrypt private_key pakai password
    → signature = RSA.sign(content_hash, private_key)
    → simpan signature ke DB
    → return .sig.json + QR code URL
    │
    ▼
Verifikasi  ← siapapun, tanpa login
    │  file asli + .sig.json
    ▼
Server: SHA-256(file) = current_hash
    → bandingkan dengan document_hash
    → ambil public_key dari DB
    → RSA.verify(current_hash, signature, public_key)
    → return VALID / INVALID + detail
    │
    ▼
Export PDF  (opsional)
    → laporan formal hasil verifikasi
```

---

## Ringkasan Endpoint

| Method | Endpoint                             | Auth | Fungsi                                   |
| ------ | ------------------------------------ | ---- | ---------------------------------------- |
| POST   | `/api/auth/register`                 | —    | Registrasi + generate RSA keypair        |
| POST   | `/api/auth/login`                    | —    | Login, return JWT                        |
| GET    | `/api/auth/me`                       | JWT  | Info profil + public key                 |
| POST   | `/api/documents/upload`              | JWT  | Upload dokumen + hitung SHA-256          |
| GET    | `/api/documents`                     | JWT  | Daftar dokumen milik/ditandatangani user |
| GET    | `/api/documents/history`             | JWT  | Riwayat penandatanganan                  |
| POST   | `/api/documents/{id}/sign`           | JWT  | Tanda tangani dokumen                    |
| GET    | `/api/documents/{id}/signature-file` | JWT  | Download `.sig.json`                     |
| POST   | `/api/verify`                        | —    | Verifikasi dokumen + signature           |
| GET    | `/api/verify/public/{id}`            | —    | Verifikasi publik via QR                 |
| POST   | `/api/verify/report-pdf`             | —    | Export laporan PDF                       |
