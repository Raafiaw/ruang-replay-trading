# Ruang Replay gratis melalui GitHub Pages

Anda memilih hosting GitHub Pages dengan repository publik. Website dan data candle publik disajikan sebagai file; replay, simulasi, dan Pine berjalan di browser. Sesi, gambar pada chart, jurnal, dan dataset impor pribadi disimpan di browser pengguna. Dataset publik ditambahkan melalui GitHub.

Cloudflare, D1, R2, password admin server, API token, dan domain berbayar tidak diperlukan untuk jalur ini. GitHub Pages tersedia pada repository publik di GitHub Free. [Ketentuan GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 1. Ubah repository menjadi publik

Buka repository `Raafiaw/ruang-replay-trading` → **Settings → General**. Gulir ke **Danger Zone**, pilih **Change repository visibility → Change visibility → Public**, lalu ikuti konfirmasi nama repository. Kode dan file candle di repository akan terlihat oleh semua orang, sesuai pilihan Anda. [Pengaturan visibilitas](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)

Paket yang disiapkan berisi contoh sintetis, kode, dan template konfigurasi. Kata sandi, API token, atau file `.env` berisi nilai rahasia tidak dimasukkan ke paket.

## 2. Aktifkan GitHub Pages

Masih di **Settings**, pilih **Pages** pada menu kiri. Pada **Build and deployment → Source**, pilih **GitHub Actions**. Workflow publikasi sudah disiapkan; Anda tidak perlu memilih template lain. [Pengaturan Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 3. Unggah pembaruan kode

Unduh dan ekstrak `Ruang-Replay-GitHub-Pages.zip`. Paket ini berisi 17 file untuk memperbarui kode yang sudah ada di repository Anda.

Di halaman utama repository, pilih **Add file → Upload files**. Seret folder **app, lib, pages, public, scripts, tests, docs** dari hasil ekstrak. Seret juga file utama **vite.pages.config.ts** dan **.gitignore**. Struktur folder harus dipertahankan; jangan hanya memilih file di dalam setiap folder melalui dialog yang menghilangkan nama foldernya.

Simpan dengan **Commit changes**. Jika file pada lokasi yang sama sudah ada, isinya akan diperbarui. File ZIP tidak diunggah sebagai pengganti isinya.

Folder `public/datasets` berisi contoh candle sintetis dan `sources.json` untuk daftar dataset publik. Contoh tersebut bukan data pasar nyata.

## 4. Tambahkan workflow publikasi

Jika folder `.github` dari paket sudah berhasil diunggah dan berisi `workflows/pages.yml`, lanjut ke langkah 5.

Jika belum, gunakan **Add file → Create new file**. Ketik nama persis:

```text
.github/workflows/pages.yml
```

Salin seluruh teks dari file `pages-workflow.txt` yang disediakan bersama paket, lalu tempel sebagai isinya. Klik **Commit changes**. GitHub membuat folder dari tanda `/` pada nama tersebut.

Workflow akan memasang dependensi, memeriksa kode, membuat file website, lalu memublikasikannya melalui GitHub Pages. Tidak memerlukan API token atau Secret buatan Anda. [Workflow GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 5. Tunggu publikasi berhasil

Buka tab **Actions**, lalu pilih **Publish Ruang Replay to GitHub Pages**. Tunggu pekerjaan **build** dan **deploy** berwarna hijau. Jika workflow belum berjalan, pilih **Run workflow** untuk branch `main`.

Jika gagal, buka pekerjaan merah dan lihat langkah yang gagal. Jika Pages baru diaktifkan setelah percobaan pertama, jalankan ulang workflow.

Setelah deploy berhasil, buka **Settings → Pages → Visit site**. Alamat yang diharapkan untuk repository ini adalah:

```text
https://raafiaw.github.io/ruang-replay-trading/
```

Alamat tersebut belum diklaim online sampai GitHub menunjukkan deploy berhasil. Situs memakai jalur `/ruang-replay-trading/`; jangan mengganti nama repository tanpa memperbarui `base` pada `vite.pages.config.ts` dan tautan katalog pada `lib/site-client.ts`.

## 6. Periksa website

1. Pastikan chart candle muncul dan tombol maju/mundur replay bekerja.
2. Buka menu **Dataset** dan pilih contoh sintetis dari katalog GitHub.
3. Jalankan indikator contoh di Pine Editor. Dukungan Pine tetap subset, dengan batas 5.000 candle dan 3 detik.
4. Simpan sesi, muat ulang halaman, dan periksa posisi replay serta gambar pada chart.
5. Buka daftar sesi dan coba buka simpanan tersebut.
6. Coba **Unduh cadangan sesi**. Berkas JSON dapat dibuka melalui **Buka cadangan sesi** pada browser atau perangkat lain.

Penyimpanan sesi memakai browser ini; membersihkan data situs atau memakai perangkat/browser lain tidak otomatis memindahkan simpanan. Browser yang memblokir penyimpanan tetap dapat membuka dataset publik, tetapi tidak dapat menyimpan sesi. Cadangan maksimal 12 MB; impor lokal tetap dibatasi 50.000 candle.

## 7. Tambahkan candle Anda ke katalog publik

Untuk penggunaan pribadi, tombol **Impor MT5 → Gunakan di perangkat** cukup. File tersebut tetap di browser dan tidak diterbitkan ke GitHub.

Untuk penggunaan oleh semua pengunjung:

1. Unggah CSV/TSV Anda ke folder `public/datasets` pada repository. Gunakan nama file sederhana, misalnya `eurusd-m5-2026-10.csv`.
2. Edit `public/datasets/sources.json` melalui ikon pensil. Tambahkan satu objek ke array `datasets`, dengan koma pemisah antarobjek. Contoh berikut untuk EURUSD; spesifikasi simbol harus sesuai instrumen dan broker Anda.

```json
{
  "id": "eurusd-m5-2026-10",
  "name": "EURUSD M5 Oktober 2026",
  "file": "eurusd-m5-2026-10.csv",
  "minutes": 5,
  "timezone": "UTC+03:00",
  "duplicate": "reject",
  "sample": false,
  "symbol": {
    "symbol": "EURUSD", "digits": 5, "tickSize": 0.00001,
    "point": 0.00001, "pip": 0.0001, "contractSize": 100000,
    "quoteCurrency": "USD", "minLot": 0.01, "maxLot": 100, "lotStep": 0.01
  }
}
```

3. Sesuaikan `minutes`, zona waktu broker, nama file, dan spesifikasi simbol. Header MT5 standar dipetakan otomatis. Header lain dapat diberi objek `mapping`, seperti `{"date":"DATE","time":"TIME","open":"OPEN","high":"HIGH","low":"LOW","close":"CLOSE","volume":"TICKVOL","spread":"SPREAD"}`.
4. Simpan dengan **Commit changes**. Actions memvalidasi candle dan memperbarui website. Data tidak valid akan menghentikan build; deployment sebelumnya tetap aktif.

File sumber maksimal 12 MB dan 50.000 candle per dataset. Untuk sejarah yang panjang, pecah file menurut bulan atau periode yang lebih kecil. Katalog dibatasi 100 dataset oleh pembuat paket ini.

CSV berada di repository GitHub. Build menghasilkan katalog dan JSON candle untuk dibaca website; JSON hasil build tidak perlu Anda buat manual.

## Batas hosting gratis

GitHub Pages bukan penyimpanan tanpa batas. Ukuran website yang dipublikasikan dibatasi 1 GB, dengan batas bandwidth lunak 100 GB per bulan. Upload melalui halaman GitHub dibatasi 25 MiB per file; batas 12 MB aplikasi berada di bawahnya. [Batas Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [batas file](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)

Workflow memakai runner standar Ubuntu dan repository publik. Jalur ini tidak mengaktifkan paket hosting berbayar atau langganan bulanan. Cloudflare yang sudah Anda buka tidak dipakai oleh versi GitHub Pages; tidak perlu melanjutkan aktivasi R2 untuk website ini.

## Hasil pemeriksaan

Pada 13 Oktober 2026, seluruh 71 tes lokal lulus, pemeriksaan TypeScript lulus, dan build GitHub Pages berhasil. Jalur HTML, CSS, JavaScript, ikon, worker Pine, dan katalog dataset sudah disiapkan untuk subfolder repository.

Pemeriksaan browser belum berhasil: koneksi preview lokal mengalami timeout meskipun server sudah dimulai ulang setelah izin jaringan diberikan. Tampilan, IndexedDB browser nyata, dan deployment GitHub belum diverifikasi. Pemeriksaan ini dilanjutkan setelah workflow GitHub menunjukkan deploy berhasil.
