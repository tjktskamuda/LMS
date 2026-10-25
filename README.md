# LMS Sekolah

Learning Management System bergaya Moodle untuk sekolah, dengan tampilan **Liquid Glass** ala iOS.

| Bagian | Teknologi | Lokasi |
|---|---|---|
| Tampilan (frontend) | HTML + CSS + JavaScript murni | repo ini, di-hosting **GitHub Pages** |
| Backend API | Google Apps Script | satu file: [`backend/Code.gs`](backend/Code.gs) |
| Database | Google Sheets | 14 tab dibuat otomatis oleh backend |

- **Aplikasi:** `https://<akun>.github.io/LMS/`
- **Panduan pemasangan backend:** `https://<akun>.github.io/LMS/setup.html`
- **Demo tanpa backend:** `https://<akun>.github.io/LMS/demo.html` (data hanya tersimpan di browser)

## Pemasangan singkat

1. Buka **setup.html** di situs GitHub Pages, lalu klik **Salin Code.gs**.
2. Buat Google Sheet → **Ekstensi → Apps Script** → tempel ke `Code.gs` → simpan.
3. Jalankan fungsi `setup` (izinkan akses).
4. **Terapkan → Deployment baru → Aplikasi web** · Jalankan sebagai **Saya** · Akses **Siapa saja** → salin URL `/exec`.
5. Tempel URL itu ke [`assets/js/config.js`](assets/js/config.js) (edit langsung di GitHub → Commit).
6. Buka situs, masuk dengan `admin` / `admin123`, lalu segera ganti password.

Memperbarui backend: tempel `Code.gs` baru → **Kelola deployment → Edit → Versi baru → Terapkan** (URL tetap).

## Fitur

- **Siswa:** dasbor & linimasa tenggat, kalender, katalog dan daftar mandiri dengan kunci, progres per mapel, tugas (teks + berkas), kuis dengan timer, forum, laporan nilai.
- **Guru:** mata pelajaran dengan topik, mode edit, 7 jenis aktivitas (Tugas, Kuis, Forum, Halaman, Berkas, Tautan URL, Teks & Media), penilaian tugas, bank soal (PG, PG kompleks, benar/salah, isian), impor soal dari **Excel** atau format **Aiken**, buku nilai + ekspor CSV, impor siswa dari **Excel** langsung ke mata pelajaran.
- **Admin:** kelola pengguna (impor Excel/CSV, reset password, nonaktifkan), kategori, semua mapel, pengumuman, pengaturan situs.
- **Tampilan:** tema terang/gelap, 5 wallpaper, animasi pegas ala iOS, efek refraksi kaca (Chrome/Edge desktop), nyaman di HP.

## Struktur

```
index.html            aplikasi
setup.html            panduan pemasangan backend + uji koneksi
demo.html             demo (backend disimulasikan di browser)
assets/css/app.css    tampilan Liquid Glass
assets/js/config.js   URL backend (API_URL)
assets/js/app.js      aplikasi (SPA, hash router)
assets/js/demo-backend.js  simulasi Apps Script & Sheets untuk demo
backend/Code.gs       backend Google Apps Script
templates/*.xlsx      templat impor siswa & soal kuis
```

## Cara kerja API

Frontend mengirim `POST` ke URL aplikasi web dengan `Content-Type: text/plain` dan isi
`{"action":"...","token":"...","payload":{...}}`. Backend selalu membalas JSON
`{"ok":true,"data":...}` atau `{"ok":false,"error":"..."}`. `GET ?action=ping` untuk cek koneksi.
Password disimpan sebagai hash SHA-256 + salt; sesi login berlaku 7 hari.
