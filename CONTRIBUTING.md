# Berkontribusi ke Readlify

Terima kasih sudah mau membantu! Readlify adalah asisten kuliah yang ramah, tenang, dan ramah ADHD,
dan kontribusi apa pun, dari typo sampai fitur, sangat berarti.

## Jati diri aplikasi (tolong dijaga)
- **Nada bicara hangat dan tidak menghakimi.** Tidak ada rasa bersalah, tekanan, atau bahasa "kamu gagal".
- **Tenang secara visual**: palet krem + hijau sage + aksen clay (token ada di awal `www/styles.css`).
- **Data tetap lokal.** Tanpa akun, tanpa server, tanpa pelacak, tanpa iklan. Fitur yang butuh itu tidak akan digabung.
- Teks aplikasi memakai **Bahasa Indonesia**.

## Menjalankan di komputer (tanpa Android)
Aplikasinya HTML/CSS/JS biasa tanpa bundler, jadi bisa dicoba langsung di browser:

```bash
npm install            # sekali saja
npm run build:web      # menyalin runtime Capacitor ke www/
cd www && python -m http.server 8080   # lalu buka http://localhost:8080
```
Di browser, penyimpanan memakai `localStorage` dan fitur khusus Android (notifikasi, getar, bagikan
berkas) dilewati dengan aman. Gunakan mode responsif di DevTools untuk memeriksa tampilan HP
(< 500px) dan tablet (≥ 500px).

## Peta kode
| Berkas | Isi |
|---|---|
| `www/index.html` | struktur layar (sidebar tablet + tab bar HP) |
| `www/styles.css` | token desain, komponen desktop (= tablet), lapisan `html.is-phone`, lapisan `html.is-wide` |
| `www/app.js` | logika inti: state, tugas, Pomodoro (berbasis `endAt`), Mode Fokus, pustaka, catatan, pengingat, siklus hidup Android |
| `www/bridge.js` | satu-satunya tempat yang bicara dengan Android (`window.api`) |
| `www/eddoc.js`, `docs-store.js`, `docs-parse.js` | pembaca dokumen; penyimpanan pustaka (Filesystem) dan pembaca Word/ODT/RTF |
| `www/desa.js`, `achievements.js` | Village dan Pencapaian |
| `scripts/check-compat.mjs` | `npm run check`: JS harus ES2019, CSS tanpa fitur baru |
| `scripts/prepare-android.mjs` | menyiapkan proyek `android/` saat build |

Aturan praktis: logika aplikasi di `app.js`, apa pun yang menyentuh platform di `bridge.js`.

**Kompatibilitas WebView lama** (tablet Huawei tanpa pembaruan Chrome): jangan pakai `?.`, `??`, `replaceAll`, `.at()`,
`structuredClone`, CSS `inset`, `:has()`, `:is()`, `dvh`. Jalankan `npm run check` sebelum commit. Tata letak dipilih JS:
`<html>` diberi `is-wide` (sisi layar terpendek ≥ 500 dp) atau `is-phone`; tulis aturan HP dengan awalan `html.is-phone`.

`www/styles.css` dihasilkan dari CSS desktop + lapisan Android; bila mengubah desktop, sinkronkan ke berkas ini.

## Membuat build sendiri
Fork repositori ini, lalu **Actions → Build APK & AAB Android → Run workflow**. Tanpa keystore hasilnya
APK/AAB *debug* (cukup untuk mencoba). Untuk build bertanda tangan lihat
[docs/PENANDATANGANAN.md](docs/PENANDATANGANAN.md).

## Sebelum mengirim Pull Request
- Satu PR = satu perubahan yang jelas. PR kecil lebih cepat ditinjau.
- Coba di browser (HP dan tablet) dan, kalau menyentuh notifikasi/penyimpanan, di perangkat Android.
- Kalau mengubah tampilan, lampirkan tangkapan layar sebelum/sesudah.
- Pastikan tidak ada rahasia atau berkas `.jks` yang ikut ter-commit.
- Tulis pesan commit yang menjelaskan *kenapa*, bukan hanya *apa*.

## Melaporkan bug / mengusulkan fitur
Gunakan template di tab **Issues**. Untuk bug, sebutkan merek/model perangkat dan versi Android, karena
banyak masalah (notifikasi, area aman layar) bergantung pada pabrikan.

Dengan berkontribusi, kamu setuju kontribusimu dirilis di bawah [Lisensi MIT](LICENSE).
