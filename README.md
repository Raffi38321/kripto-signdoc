# SignDoc — Sistem Tanda Tangan Digital

Tema 1 UAS Kriptografi Modern: verifikasi keaslian dokumen dan identitas penanda tangan dengan **RSA-2048 + SHA-256**.

## Struktur

| Folder | Isi                                                             |
| ------ | --------------------------------------------------------------- |
| `be/`  | Backend FastAPI, SQLite, kriptografi server-side                |
| `fe/`  | Frontend HTML/JS (demo client-side + aplikasi terintegrasi API) |

## Menjalankan

```bash
cd be
pip install -e .
python main.py
```

Server berjalan di `http://127.0.0.1:8000` dan juga bisa diakses dari jaringan lokal via IP komputer (mis. `http://192.168.x.x:8000`).

| URL                        | Keterangan                                               |
| -------------------------- | -------------------------------------------------------- |
| `/fe/app.html`             | Aplikasi utama (login, upload, sign, verify, multi-sign) |
| `/fe/index.html`           | Demo client-side tanpa akun                              |
| `/fe/verify.html?doc={id}` | Verifikasi publik via QR — tanpa login                   |
| `/docs`                    | Swagger API docs                                         |

## Fitur Wajib

| Fitur                     | Implementasi                                                                |
| ------------------------- | --------------------------------------------------------------------------- |
| Registrasi + key pair RSA | `POST /api/auth/register` — privat dienkripsi PBKDF2+Fernet dengan password |
| Upload dokumen + hash     | `POST /api/documents/upload` — SHA-256 atas byte file                       |
| Tanda tangan              | `POST /api/documents/{id}/sign` — PKCS#1 v1.5 + Prehashed(SHA-256)          |
| Verifikasi                | `POST /api/verify` — unggah dokumen + `.sig.json` → VALID/INVALID + detail  |
| Riwayat                   | `GET /api/documents/history`                                                |

## Fitur Pengembangan (nilai A)

- **Multi-signer:** beberapa user menandatangani dokumen yang sama — User B bisa lookup via Document ID di tab Sign, kemudian menandatangani dengan password akunnya sendiri
- **QR verifikasi:** setelah sign, QR otomatis muncul menuju `verify.html?doc=...` (tanpa login); URL mengikuti hostname aktual sehingga bisa dipindai dari device lain di jaringan yang sama
- **Notifikasi modifikasi:** flag `tampered` jika hash file ≠ hash saat upload/sign, ditampilkan di daftar dokumen dan hasil verifikasi
- **Export PDF:** `POST /api/verify/report-pdf` — laporan formal hasil verifikasi menggunakan ReportLab

## Ringkasan Endpoint API

| Method | Endpoint                             | Auth | Fungsi                                   |
| ------ | ------------------------------------ | ---- | ---------------------------------------- |
| POST   | `/api/auth/register`                 | —    | Registrasi + generate RSA-2048 keypair   |
| POST   | `/api/auth/login`                    | —    | Login, return JWT (24 jam)               |
| GET    | `/api/auth/me`                       | JWT  | Info profil + public key PEM             |
| POST   | `/api/documents/upload`              | JWT  | Upload file + hitung SHA-256             |
| GET    | `/api/documents`                     | JWT  | Daftar dokumen milik/ditandatangani user |
| GET    | `/api/documents/history`             | JWT  | Riwayat penandatanganan                  |
| POST   | `/api/documents/{id}/sign`           | JWT  | Tanda tangani dokumen                    |
| GET    | `/api/documents/{id}/signature-file` | JWT  | Download `.sig.json`                     |
| GET    | `/api/documents/{id}/info`           | JWT  | Lookup dokumen by ID (untuk multi-sign)  |
| GET    | `/api/documents/{id}/qr`             | —    | Data QR verifikasi                       |
| POST   | `/api/verify`                        | —    | Verifikasi dokumen + signature file      |
| GET    | `/api/verify/public/{id}`            | —    | Verifikasi publik via QR                 |
| POST   | `/api/verify/report-pdf`             | —    | Export laporan verifikasi PDF            |
| GET    | `/api/health`                        | —    | Health check                             |

## Jawaban Pertanyaan Kriptografi (untuk laporan)

### Mengapa RSA-2048 (bukan ECDSA)?

RSA dipilih karena interoperabilitas luas, mudah dijelaskan di laporan, dan dukungan library matang. **ECDSA** (mis. P-256) menghasilkan kunci/signature lebih pendek dengan keamanan setara per bit, tetapi kurva dan format signature lebih rumit untuk tim pemula. Keduanya cocok untuk signing; RSA lebih lambat untuk sign/verify, ECDSA lebih efisien di perangkat lemah.

### Mengapa hash dulu, bukan sign seluruh dokumen?

1. **Efisiensi** — RSA hanya memproses blok kecil (hash 32 byte), bukan megabyte PDF.
2. **Keamanan praktis** — skema encrypt/sign langsung pada data panjang rentan (padding oracle, batasan ukuran).
3. **Separation** — hash function (SHA-256) dan signature scheme (RSA) dapat dianalisis terpisah.

### Jika kunci privat bocor?

Signature **lama tetap valid** secara kriptografis (dibuat dengan kunci yang sah saat itu), tetapi penyerang bisa **memalsukan** tanda tangan baru. Mitigasi: rotasi kunci, pencabutan, timestamp/CA, dan tidak menandatangani lagi dengan kunci yang bocor.

### Mengapa SHA-256, bukan MD5?

MD5 punya kerentanan collision praktis — penyerang bisa membuat dua file berbeda dengan hash sama, merusak integritas dokumen. SHA-256 masih dianggap aman untuk integritas dokumen standar.

## Alur singkat

```mermaid
sequenceDiagram
    participant A as User A
    participant B as User B
    participant S as Server

    A->>S: Register (password) → RSA keypair dibuat
    A->>S: Upload PDF → SHA-256 hash disimpan
    A->>S: Sign(doc_id, password) → signature disimpan
    A->>B: Bagikan document_id

    B->>S: Register/Login
    B->>S: Lookup(doc_id) → info dokumen + signer
    B->>S: Sign(doc_id, password_B) → signature B disimpan

    Note over A,S: Siapapun bisa verifikasi
    A->>S: Verify(file, sig.json) → VALID/INVALID per signer
    A->>S: QR scan → verify.html?doc=id → status publik
```
