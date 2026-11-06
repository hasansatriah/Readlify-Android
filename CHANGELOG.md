# Catatan Perubahan

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/).

## [1.3.0] — 2026-11-06
Menyamakan fitur dengan Readlify untuk Windows 1.3.0 dan menambah dukungan **Huawei MatePad T**.
### Ditambahkan
- **EdDOC**: pembaca dokumen (PDF, Word .docx, ODT, RTF, TXT, MD, HTML, CSV, dll.) dengan pustaka folder di dalam aplikasi,
  mode Asli/Bersih, bionic reading, fokus strip (mengikuti jari), pencarian kata kunci, kutipan + sitasi sekali ketuk,
  catatan samping, dan tab dokumen. Blok teks dengan tekan-tahan memunculkan toolbar *Kutip / Catatan / Salin*.
- **Pencapaian** (level, misi harian/mingguan) dan **Village** (kampung yang tumbuh dari sesi fokus; geser satu jari, cubit dua jari untuk zoom).
- **Mode Fokus** layar penuh (status bar & tombol navigasi disembunyikan, layar tetap menyala) + pengingat "balik fokus"
  lewat notifikasi bila kamu pindah ke app lain saat sesi berjalan.
- **Daftar Pustaka** 5 gaya: APA 7, MLA 9, Chicago, IEEE, Vancouver.
- **Catatan** ala Keep (kartu berwarna, sematkan, daftar centang, cari, simpan .txt lewat menu Bagikan).
- Tablet memakai **tampilan yang sama dengan desktop** (sisi layar terpendek ≥ 500 dp, termasuk MatePad T8 potret);
  HP memakai tab bar bawah dengan menu *Lainnya*.
- **Huawei/Honor**: berjalan tanpa layanan Google (tanpa GMS/HMS), panduan *Peluncuran aplikasi* di Pengaturan, lihat `docs/HUAWEI.md`.
- `npm run check`: memeriksa kompatibilitas WebView lama (JS ES2019, CSS tanpa fitur baru, id lengkap).
### Diubah
- Struktur data tetap `readlify-data` sehingga data dari versi 1.1.0 dan berkas dari Windows tetap terbaca (cadangan kini juga memuat pencapaian & Village).
- PDF.js memakai build *legacy*; CSS memakai cadangan untuk `color-mix()` supaya aman di WebView lama.
### Belum ada di Android
- Format .doc lama (biner): simpan ulang sebagai .docx. Cetak PDF, widget timer mengambang, dan "Buka dengan" dari app lain belum tersedia.

## [1.1.0] — 2026-10-10
### Ditambahkan
- Tampilan adaptif: HP memakai tab bar bawah; tablet memakai tampilan seperti versi Windows
  (sidebar, papan tugas 2–3 kolom, dialog di tengah); tablet kecil potret memakai sidebar ramping.
- Build menghasilkan **.aab** (untuk Google Play) di samping .apk.
- Pengaturan *Jarak dari tombol navigasi HP* sebagai jaring pengaman di perangkat yang melaporkan area aman dengan keliru.
### Diperbaiki
- Tab bar bawah tidak lagi tertimpa tombol navigasi bawaan di sebagian HP (Oppo F11): area aman dibaca dari `env()` dan variabel Capacitor.

## [1.0.0] — 2026-10-09
### Ditambahkan
- Versi Android pertama (Capacitor) dari Readlify untuk Windows: Beranda, Tugas, Pomodoro, Daftar Pustaka APA 7th,
  Catatan Cepat, Panduan Format, pengingat ramah ADHD, tema terang/gelap.
- Timer Pomodoro yang bertahan saat layar mati / aplikasi ditutup; alarm lewat notifikasi dengan 5 pilihan suara.
- Ekspor/impor cadangan (.json), termasuk berkas data dari versi Windows.
### Diperbaiki
- "Hari ini" kini memakai jam lokal, bukan UTC (di WIB sebelumnya baru berganti pukul 07.00).
