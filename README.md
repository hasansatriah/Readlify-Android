# Readlify untuk Android 📖

> **Readlify** — teman belajar & kerja yang cozy dan ramah ADHD. Tugas yang dipecah jadi langkah kecil, Pomodoro & Mode Fokus,
> pembaca dokumen EdDOC, daftar pustaka 5 gaya, Village, dan pengingat yang lembut. Versi HP & tablet Android dari Readlify untuk Windows.
>
> *English: a calm, ADHD-friendly study & work companion — tasks in small steps, Pomodoro + full-screen Focus Mode,
> EdDOC document reader, citation builder, gamified Village and gentle reminders. Fully offline: no account, no server,
> no ads, no tracking. Android app (Capacitor) for phones and tablets (incl. Huawei MatePad T, no Google services needed),
> open source (MIT). UI language: Indonesian.*

<p align="center">
  <img src="docs/screenshots/phone-beranda.png" width="19%" alt="Beranda di HP" />
  <img src="docs/screenshots/phone-tugas.png" width="19%" alt="Tugas dengan langkah kecil di HP" />
  <img src="docs/screenshots/phone-pomodoro-gelap.png" width="19%" alt="Pomodoro, tema gelap" />
</p>
<p align="center">
  <img src="docs/screenshots/tablet-tugas.png" width="62%" alt="Papan tugas di tablet" />
</p>

## Fitur
- **Tugas** (kerja, belajar, pribadi) dengan **langkah-langkah kecil** supaya tidak terasa berat.
- **Pomodoro** yang tetap jalan saat layar mati; alarm lewat notifikasi, dengan 5 pilihan suara.
- **Mode Fokus** layar penuh + pengingat "balik fokus" kalau kamu pindah app.
- **EdDOC**: baca PDF, Word, ODT, RTF, TXT dan lainnya; kutip + sitasi sekali ketuk; pustaka folder.
- **Daftar Pustaka** APA 7, MLA 9, Chicago, IEEE, Vancouver.
- **Pencapaian** dan **Village**: kampung kecil yang tumbuh dari sesi fokusmu.
- **Catatan** ala Keep: warna, sematkan, daftar centang, cari.
- **Pengingat lembut**: jam belajar, tenggat (H-3 / H-1 / Hari H), dan dorongan ringan, tidak menghakimi,
  tidak berulang-ulang.
- Tema terang/gelap, **Ekspor/Impor cadangan** (.json), dan bisa memindahkan data dari
  Readlify untuk Windows.
- **Privat sepenuhnya**: tanpa akun, server, iklan, ataupun pelacak. Lihat [PRIVACY.md](PRIVACY.md).

### Tampilan adaptif
| Layar | Tampilan |
|---|---|
| HP (sisi layar terpendek < 500 dp) | tab bar bawah, tab status tugas, form berbentuk bottom sheet |
| Tablet kecil potret (500–767 dp, mis. MatePad T8) | tampilan desktop dengan sidebar ikon |
| Tablet (≥ 768 dp) | **sama dengan versi desktop**: sidebar penuh, papan tugas 2–3 kolom, dialog di tengah |

Huawei MatePad T dan perangkat Huawei/Honor tanpa layanan Google didukung: aplikasi tidak memakai GMS/HMS.
Lihat [docs/HUAWEI.md](docs/HUAWEI.md).

## Unduh
Ambil `.apk` terbaru di halaman **[Releases](../../releases)**, kirim ke HP, lalu buka (izinkan
"pasang dari sumber ini" jika diminta). Butuh **Android 7.0 (API 24)** atau lebih baru. Berkas `.aab` untuk Google Play
juga disertakan di Releases.

> Status: versi 1.3.0 diuji di emulasi browser (HP, tablet potret & lanskap); uji perangkat nyata (termasuk Huawei MatePad T) masih dibutuhkan. Notifikasi dan alarm di latar belakang bergantung
> pada pabrikan (penghemat baterai ColorOS/MIUI/OneUI, dll.). Laporan dari perangkat lain sangat
> membantu, lihat [Issues](../../issues).

## Membuat build sendiri
Tanpa perlu Android Studio: **fork** repositori ini, lalu **Actions → Build APK & AAB Android → Run workflow**.
Unduh hasilnya dari **Artifacts**. Tanpa keystore hasilnya build *debug* (cukup untuk mencoba). Untuk build
bertanda tangan atau Google Play, ikuti [docs/PENANDATANGANAN.md](docs/PENANDATANGANAN.md).

Di komputer sendiri (Node.js 22+, JDK 21, Android SDK):
```bash
npm install
npm run android:add      # buat folder android/ + ikon + suara alarm + sinkron
npm run android:open     # buka di Android Studio
```
Setelah mengubah `www/`: `npm run android:sync`.

## Struktur
```
www/                   aplikasi web yang dibungkus Capacitor (index.html, styles.css, app.js, bridge.js,
                       eddoc.js, desa.js, achievements.js, docs-store.js, docs-parse.js, vendor/)
resources/native/      ikon notifikasi + 5 suara alarm (.wav), dipasang ke android/ saat build
assets/                sumber ikon & splash (dibuat dari logo)
scripts/               prepare-android.mjs (penyiapan build), build-web.mjs (pustaka pihak ketiga), check-compat.mjs, generator ikon & suara
.github/workflows/     build APK + AAB otomatis
docs/                  panduan tanda tangan, tangkapan layar
```
Folder `android/` sengaja tidak di-commit: dibuat otomatis oleh `npx cap add android` lalu disiapkan
`scripts/prepare-android.mjs`. Peta kode lengkap ada di [CONTRIBUTING.md](CONTRIBUTING.md).

## Berkontribusi
Isu, usul, dan PR sangat disambut. Baca dulu [CONTRIBUTING.md](CONTRIBUTING.md), terutama bagian
*jati diri aplikasi* (nada hangat, tenang, data tetap lokal). Celah keamanan: lihat [SECURITY.md](SECURITY.md).

## Dukung Readlify
Readlify gratis dan akan tetap gratis; tidak ada fitur yang terkunci. Kalau terasa bermanfaat dan kamu
ingin membantu pengembangannya, ada tautan donasi sukarela di dalam aplikasi (**Dukung Readlify**).
Memberi bintang ⭐, melaporkan bug, atau bercerita ke teman juga sangat berarti.

## Lisensi
[MIT](LICENSE). Font Nunito: SIL Open Font License (`www/fonts/NUNITO-OFL-LICENSE.txt`). Capacitor dan
pluginnya: MIT. PDF.js (Apache-2.0), mammoth (BSD-2), JSZip (MIT/GPL, dipakai sebagai MIT): lisensinya ada di `www/vendor/`. Nama dan logo Readlify sebaiknya tidak dipakai untuk versi modifikasi (fork).

Aplikasi ini dibuat dengan bantuan alat AI, lalu ditinjau dan disempurnakan oleh pengembang.
