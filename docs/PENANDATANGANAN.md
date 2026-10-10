# Menandatangani APK / AAB sendiri

Android hanya mau memperbarui aplikasi kalau tanda tangannya **sama** dengan versi yang terpasang.
Tanpa keystore sendiri, build memakai kunci debug acak (cukup untuk mencoba, tapi tidak bisa
saling menimpa antar-build dan **tidak boleh** diunggah ke Google Play).

> ⚠️ **Jangan pernah membuat atau menyimpan kunci lewat workflow di repositori publik.**
> Artifact dari repositori publik bisa diunduh siapa saja. Buat kunci di komputermu sendiri.

## 1. Buat keystore (sekali saja, di komputermu)
Butuh JDK 21 (mis. Temurin dari adoptium.net) agar perintah `keytool` tersedia.

```bash
keytool -genkeypair -v -keystore readlify.jks -storetype PKCS12 \
  -alias readlify -keyalg RSA -keysize 2048 -validity 10000
```
Pilih password (pakai yang sama untuk keystore dan key), catat, dan **simpan `readlify.jks` beserta
passwordnya di tempat aman di luar repositori** (mis. pengelola password atau drive pribadi).
Kalau hilang, kamu tidak bisa lagi memperbarui aplikasi yang sudah terpasang.

## 2. Ubah jadi teks base64
```powershell
# Windows PowerShell (hasil disalin ke clipboard)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("readlify.jks")) | Set-Clipboard
```
```bash
# Linux / macOS
base64 -w0 readlify.jks
```

## 3. Simpan sebagai GitHub Secrets
Di repositori (atau fork-mu): **Settings → Secrets and variables → Actions → New repository secret**.

| Name | Isi |
|---|---|
| `KEYSTORE_BASE64` | teks base64 dari langkah 2 |
| `KEYSTORE_PASSWORD` | password keystore |
| `KEY_ALIAS` | `readlify` |
| `KEY_PASSWORD` | password key (sama dengan di atas) |

## 4. Build
**Actions → Build APK & AAB Android → Run workflow.** Langkah *"Build APK + AAB (release, bertanda
tangan)"* harus hijau. Hasilnya di **Artifacts** (`.apk` untuk dipasang, `.aab` untuk Google Play).

Rilis publik: beri tag, mis. `git tag v1.2.0 && git push --tags`. Workflow membuat **Release** otomatis,
*hanya* jika keystore terpasang (build debug tidak dirilis).

## Catatan
- **Google Play:** unggah `.aab` bertanda tangan. Kunci ini menjadi *upload key*; dengan Play App
  Signing, Google yang menandatangani ulang untuk pengguna. APK hasil Play dan APK manual
  bertanda tangan berbeda, jadi tidak bisa saling menimpa.
- **Fork dan pull request** tidak menerima secrets dari GitHub, jadi selalu menghasilkan build debug. Itu disengaja.
- Mengganti kunci = dianggap aplikasi berbeda: pengguna harus uninstall dulu. Ekspor cadangan sebelum itu.
