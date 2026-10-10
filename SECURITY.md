# Keamanan

## Melaporkan kerentanan
Kalau menemukan celah keamanan (mis. data bisa bocor, notifikasi/tautan bisa disalahgunakan,
rahasia ter-commit), **jangan** membuat Issue publik.

Gunakan **Security → Report a vulnerability** di repositori ini (laporan privat). Sertakan langkah
untuk mereproduksi, versi aplikasi, dan versi Android. Aku akan membalas secepatnya dan menyebut
namamu di catatan rilis kalau kamu mau.

## Ruang lingkup
Aplikasi ini sepenuhnya offline dan menyimpan data hanya di perangkat, jadi permukaan serangnya kecil:
penyimpanan lokal, impor berkas cadangan, notifikasi, dan tautan eksternal (hanya `http(s)`).

## Untuk yang membuat build sendiri
- **Jangan pernah** meng-commit berkas `.jks`/`.keystore`, password, atau berkas `.env`.
- Simpan kunci tanda tangan hanya di **GitHub Secrets** dan cadangan pribadi (lihat
  [docs/PENANDATANGANAN.md](docs/PENANDATANGANAN.md)).
- **Jangan membuat kunci lewat workflow di repositori publik**: artifact dari repositori publik
  bisa diunduh siapa saja.
