# Catatan Perubahan

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/).

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
