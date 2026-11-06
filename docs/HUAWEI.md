# Readlify di Huawei MatePad T (dan perangkat Huawei/Honor lain)

Readlify **tidak memakai layanan Google (GMS) maupun Huawei Mobile Services (HMS)**. Semua fitur (notifikasi
lokal, penyimpanan, pembaca dokumen, Village) berjalan di tablet yang tidak punya Google Play. Cukup pasang `.apk`-nya.

## Memasang
1. Salin `readlify-*.apk` ke tablet (USB, kartu SD, atau kirim lewat aplikasi lain).
2. Buka lewat **Berkas**; jika diminta, izinkan *Pasang dari sumber ini*.
3. Butuh Android 7.0+ (API 24). MatePad T8/T10 dan seri lain yang lebih baru memenuhi syarat.
4. Bisa juga diunggah ke **AppGallery** (build `.apk`/`.aab` standar; tidak butuh SDK tambahan).

## Tampilan
Sisi layar terpendek ≥ 500 dp dianggap tablet. MatePad T8 (≈ 533 dp potret) dan T10 (≈ 600 dp) memakai **tampilan seperti
versi desktop**: sidebar kiri (ikon saja di potret sempit), papan tugas, dialog di tengah. Di HP biasa tampilan memakai tab bar bawah.

## Agar alarm dan pengingat tepat waktu (penting!)
EMUI/HarmonyOS menghentikan aplikasi di latar belakang demi hemat baterai. Setelah pemasangan:
1. **Pengaturan → Baterai → Peluncuran aplikasi** → cari **Readlify** → matikan *Kelola otomatis* →
   aktifkan **Peluncuran otomatis**, **Peluncuran sekunder**, dan **Jalankan di latar belakang**.
2. **Pengaturan → Aplikasi → Readlify → Notifikasi**: izinkan notifikasi (juga saat layar terkunci).
3. Android 12+/HarmonyOS: di Readlify → *Pengaturan → Pengingat*, izinkan **Alarm & pengingat**.
4. Opsional: kunci Readlify di layar *aplikasi terbaru* supaya tidak ditutup pembersih memori.

Panduan yang sama ada di dalam aplikasi (Pengaturan → "Alarm gak bunyi pas layar mati?"), dan terbuka otomatis di perangkat Huawei.

## Catatan kompatibilitas
- WebView Huawei bisa tertinggal jauh dari Chrome. Karena itu kode dibatasi ke JS ES2019, PDF.js memakai build *legacy*,
  dan CSS memiliki cadangan untuk fitur baru (`npm run check` menjaga ini).
- PDF besar membutuhkan RAM; manifest memakai `largeHeap`. Tutup aplikasi lain bila dokumen sangat besar gagal dibuka.
- Tidak ada Google Drive/Play Services: cadangan dikirim lewat menu **Bagikan** (simpan ke Berkas, kirim ke aplikasi lain, dsb.).

## Melapor
Sertakan model (mis. AGS3-W09), versi EMUI/HarmonyOS, dan versi WebView (tertera di Pengaturan → bagian bawah).
