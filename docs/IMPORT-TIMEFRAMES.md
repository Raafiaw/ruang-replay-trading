# Upload candle M1 sampai mingguan

Website: https://raafiaw.github.io/ruang-replay-trading/

## Cara paling praktis: satu file M1

1. Ekspor candle **M1** dari MT5 sebagai CSV atau TSV.
2. Buka website → **Dataset → Impor MT5** → pilih file tersebut.
3. Periksa **Timeframe file = M1 · 1 menit**. Jika nama file memuat `_M1_` atau `-M1-`, pilihan M1 diisi otomatis. Nama yang tidak menunjukkan timeframe perlu dipilih sendiri.
4. Pilih **zona waktu broker** sesuai waktu pada file; jangan selalu memilih UTC jika waktu ekspor berasal dari server broker yang berbeda.
5. Periksa pemetaan tanggal, waktu, OHLC, volume, spread, serta spesifikasi simbol dan ukuran kontrak.
6. Setelah data valid, klik **Gunakan di perangkat**.
7. Di atas chart, pilih M1, M2, M3, M5, M10, M15, M30, H1, H2, H4, D1, atau W1.

Semua candle yang lebih besar dihitung dari candle M1 yang sudah sampai pada posisi replay. Open memakai harga pertama, High/Low memakai nilai maksimum/minimum, Close memakai harga terakhir, dan volume dijumlahkan. Candle terakhir boleh masih parsial. Tidak ada candle masa depan atau candle pengisi untuk gap.

Contoh **EURUSD · Contoh M1** menyediakan 14.400 candle selama 10 hari untuk mencoba semua pilihan. Seluruh harga contoh dibuat secara sintetis, bukan data pasar asli. Gunakan **Unduh contoh M1** untuk mencoba format file.

## Bila Anda punya file terpisah untuk setiap timeframe

Impor file satu per satu dan pilih timeframe sesuai isi file:

| File | Pilihan timeframe | Menit |
| --- | --- | --- |
| M1 | M1 · 1 menit | 1 |
| M2 | M2 · 2 menit | 2 |
| M3 | M3 · 3 menit | 3 |
| M5 | M5 · 5 menit | 5 |
| M10 | M10 · 10 menit | 10 |
| M15 | M15 · 15 menit | 15 |
| M30 | M30 · 30 menit | 30 |
| 1 jam | H1 · 1 jam | 60 |
| 2 jam | H2 · 2 jam | 120 |
| 4 jam | H4 · 4 jam | 240 |
| Harian | D1 · 1 hari | 1440 |
| Mingguan | W1 · 1 minggu | 10080 |

File M5 tidak menyediakan M1, M2, atau M3. File M2 tidak menyediakan M3 atau M5. Pilihan yang tidak dapat dibentuk dari dataset aktif akan terlihat redup. Impor M1 untuk menyediakan seluruh pilihan.

D1 hasil penggabungan dimulai pukul **00.00 UTC**. W1 dimulai **Senin 00.00 UTC**. Batas ini dapat berbeda dari candle harian/mingguan pada server broker. Jika ingin candle D1/W1 persis seperti ekspor broker, impor file D1/W1 tersebut langsung; timestamp aslinya dipertahankan ketika ditampilkan pada timeframe yang sama.

Ukuran satu file maksimal **12 MB** dan **50.000 candle**. Untuk riwayat M1 yang panjang, bagi rentang tanggal menjadi beberapa dataset.

## Menaruh data di GitHub agar semua pengunjung dapat memakainya

Impor melalui website disimpan di browser. Katalog publik diambil dari repository GitHub.

1. Buka `Raafiaw/ruang-replay-trading` → folder **public/datasets**.
2. Pilih **Add file → Upload files**, unggah CSV, misalnya `eurusd-M1-2026.csv`, lalu **Commit changes** ke `main`.
3. Edit **public/datasets/sources.json**. Tambahkan satu entri untuk setiap file pada daftar `datasets`, dengan ID yang berbeda. Pertahankan entri yang sudah ada.
4. Isi `minutes` sesuai tabel di atas, `timezone` sesuai waktu broker, dan `symbol` sesuai spesifikasi instrumen Anda.
5. Simpan ke `main`. Proses GitHub Actions akan memeriksa file, membuat data website, dan menerbitkannya.
6. Setelah proses terbaru hijau, muat ulang website dan buka **Dataset**.

Contoh entri untuk **EURUSD M1**, ditambahkan di dalam daftar `datasets`:

```json
{
  "id": "eurusd-m1-2026",
  "name": "EURUSD M1 2026",
  "file": "eurusd-M1-2026.csv",
  "minutes": 1,
  "timezone": "UTC+02:00",
  "duplicate": "reject",
  "symbol": {
    "symbol": "EURUSD",
    "digits": 5,
    "tickSize": 0.00001,
    "point": 0.00001,
    "pip": 0.0001,
    "contractSize": 100000,
    "quoteCurrency": "USD",
    "minLot": 0.01,
    "maxLot": 100,
    "lotStep": 0.01
  }
}
```

Nama file, zona waktu, dan spesifikasi di contoh harus disesuaikan dengan file dan broker Anda. Untuk simbol lain seperti XAUUSD, jangan menyalin spesifikasi EURUSD. Data dalam repository publik bisa dilihat siapa pun; simpan hanya data candle yang ingin dibagikan.

Rujukan label timeframe MT5: https://www.mql5.com/en/docs/constants/chartconstants/enum_timeframes
