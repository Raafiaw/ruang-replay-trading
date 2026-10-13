# Ruang Replay

Terminal latihan trading berbahasa Indonesia. Proyek berada di `trading-replay-web/`. Data contoh EURUSD M5 adalah **sintetis**, deterministik, dan bukan kutipan pasar. Tidak ada koneksi broker atau uang nyata.

## Arsitektur

- React 19.2.6 + TypeScript 5.9.3; chart TradingView Lightweight Charts 5.2.1.
- Backend Vinext pada Cloudflare Workers, menggunakan starter resmi Sites. Vinext 1.0.0-beta.5 masih beta; komponen ini merupakan pengecualian terhadap target dependensi stabil dan perlu evaluasi sebelum pemakaian produksi berat.
- D1: metadata dataset, publikasi/draft, sesi pengunjung. R2: candle tervalidasi dalam JSON.
- CSV/TSV dibaca di perangkat untuk pratinjau; backend mengulangi validasi sebelum publikasi. Dataset dibatasi 12 MB / 50.000 candle; tidak ada interpolasi candle yang hilang.
- Sesi anonim memakai cookie HttpOnly SameSite; sesi terautentikasi menggunakan identitas ChatGPT dari platform. Semua query sesi dibatasi pemiliknya. Origin diperiksa pada operasi tulis. Admin publikasi harus cocok dengan `ADMIN_EMAIL` atau `ADMIN_USER_ID` di lingkungan backend; default adalah terkunci.
- Interpreter Pine internal menggunakan parser AST allowlist. Tidak memakai eval/new Function. Eksekusi ada di Web Worker, tanpa token, secret, atau data masa depan. Syntax call jaringan, import, loop, array, dan fungsi pengguna tidak diizinkan.

## Model data dan replay

Waktu candle = waktu buka dalam detik UTC. Replay indeks N berarti candle N telah selesai: seluruh OHLC N diketahui, N+1 belum diketahui. Chart dan worker menerima irisan data yang sesuai. Timeframe besar dibentuk dari irisan tersebut, sehingga bar HTF terakhir bisa parsial. Timeframe lebih kecil atau bukan kelipatan ditolak. Bar dikelompokkan pada interval UTC, bukan aturan sesi harian khusus broker.

Impor mendukung header MT5 `<DATE>`, `<TIME>`, `<OPEN>`, `<HIGH>`, `<LOW>`, `<CLOSE>`, `<TICKVOL>`, `<SPREAD>`, serta pemetaan manual dan timestamp gabungan. Volume/spread opsional. Tanggal kosong/invalid, angka nonfinite, volume negatif, OHLC tidak konsisten, dan spread negatif dilaporkan per baris. Semua masalah harus diperbaiki sebelum publikasi. Duplikat dapat ditolak, disimpan pertama, atau disimpan terakhir. Data diurutkan. Gap dilaporkan tanpa diisi. Zona IANA mengikuti DST; jam berulang ketika DST berakhir sebaiknya menggunakan offset UTC eksplisit.

Replay dipulihkan dengan menghitung ulang bar dan kejadian sampai indeks tujuan: order, cancel, modify, close, deposit, dan perubahan spread. Keputusan setelah mundur membuat cabang; kejadian masa depan tetap tersedia pada cabang sebelumnya. Posisi, pending order, trade history, dan saldo dipulihkan. Gambar tersimpan sebagai waktu/harga; undo/redo 30 langkah di perangkat. Gambar/jurnal merupakan anotasi sesi, bukan kejadian akun yang dimundurkan.

## Perhitungan

OHLC sumber adalah **Bid**. Ask = Bid + spread. Manual spread memakai pip, point MT5, atau satuan harga; spread dataset memakai point MT5 dan menggantikan manual. Nilai seperti 0,1 dan 0,25 dipertahankan. Spread pecahan tick tetap dihitung sebagai harga kontinu simulasi; harga order SL/TP/pending harus mengikuti tick size. Tampilan harga Bid mengikuti digit simbol.

- Buy entry Ask, exit/floating Bid. Sell entry Bid, exit/floating Ask.
- P/L = arah × lot × contract size × (exit − entry) × kurs quote-ke-akun.
- Margin = lot × contract size × harga × kurs / leverage. Margin berjalan dinilai pada Bid. Leverage tidak mengalikan P/L.
- Komisi dalam mata uang akun per lot per sisi; dikenakan saat entry dan exit. Slippage dalam point MT5, selalu merugikan pada fill.
- Kurs bersifat konstan dan dikonfigurasi manual. Model margin adalah linear notional; tidak mendukung kontrak inverse, margin futures tetap, hedged-margin khusus, atau stop-out otomatis.
- Market manual pada close candle yang terlihat. Strategi pada open candle berikutnya. SL/TP order manual baru hanya mulai diperiksa pada candle berikutnya.
- Long SL/TP memakai Bid; short memakai Ask. Gap stop diisi pada open yang lebih buruk. Gap limit diisi pada open yang lebih baik.
- Jika SL dan TP tersentuh bersama, **SL dahulu**, tandai ambigu. Pending entry dan exit pada candle sama juga ambigu karena urutan intrabar tidak diketahui. Tidak ada tick sintetis yang diklaim nyata.
- Setoran tersimpan terpisah. Statistik closed-trade net profit mengecualikan setoran dan posisi terbuka. Drawdown memakai equity close candle setelah mengeluarkan setoran. Tidak mencakup drawdown intrabar.

## Pine yang benar-benar didukung

Header `//@version=5` atau `//@version=6` wajib. Ini **subset internal**, bukan kompatibilitas penuh dengan versi tersebut atau TradingView. Contoh indikator dan strategi ada di editor.

Assignment/var, if terindentasi, operator aritmetik/perbandingan/boolean, ternary, histori positif `[n]`, OHLCV/time/bar_index/hl2/hlc3, input int/float/bool/string, plot/hline, math abs/min/max/round/sqrt, na/nz, ta SMA/EMA/RMA/RSI/ATR/highest/lowest/stdev/crossover/crossunder, strategy.entry/close/close_all/exit dengan stop/limit absolut. Entry tanpa pyramiding; satu arah strategi. `qty` dimaknai lot. UI backtest menjadi sumber pengaturan modal dan biaya. Strategi menggunakan mesin akun yang sama dengan manual.

Belum didukung: loop, array, import, user function, request.security, multi-timeframe Pine, drawing Pine, OCA, pyramiding, trailing stop, exit parsial, dan sebagian besar namespace Pine. Error menunjukkan baris. Input panjang indikator 1–500. Maksimal 24 KB kode, 2.000 node parser, 64 variabel, 16 plot, 100.000 cache entry, 5.000 candle, 5 juta operasi. Worker diterminasi setelah 3 detik. Pembatasan struktur mengurangi penggunaan memori; **browser tidak menyediakan hard heap memory limit**. Isolasi proses dengan batas RAM keras memerlukan layanan eksekusi backend tersendiri.

## Riset mesin pihak ketiga, 13 Oktober 2026

PineTS 0.11.0 ditinjau: Pine v5/v6 native masih eksperimental, dukungan strategi ada tetapi oracle coverage mengakui perbedaan, transpiler menggunakan new Function dan bukan sandbox keamanan. Lisensi kini AGPL-3.0-only atau komersial. Untuk menjaga cakupan biaya/lisensi dan model eksekusi tunggal, paket ini **tidak digunakan** pada implementasi sekarang. Tidak ada klaim kompatibilitas Pine penuh.

Sumber primer:

- https://github.com/LuxAlgo/PineTS/releases/tag/v0.11.0
- https://raw.githubusercontent.com/LuxAlgo/PineTS/main/LICENSE-COMMERCIAL.md
- https://docs.luxalgo.com/developers/pinets/api-coverage/strategy
- https://raw.githubusercontent.com/LuxAlgo/PineTS/main/src/transpiler/index.ts
- https://github.com/be-thomas/OpenPineScript (GPL-3.0; dukungan Pine lama)
- https://github.com/PyneSys/pynecore (runtime Python; compiler Pine membutuhkan layanan tambahan)
- https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions/ (chart library bukan engine Pine)
- https://github.com/tradingview/lightweight-charts/releases/tag/v5.2.1

## Menjalankan lokal

Node >=22.13.0 dan pnpm 11.25.0. Versi paket langsung dipatok; gunakan lockfile setelah pemasangan berhasil.

```text
pnpm install
pnpm test
pnpm typecheck
pnpm db:generate
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_<nama_migrasi>.sql
pnpm dev
```

Dev preview memakai mock sign-in pada loopback: `/signin-with-chatgpt?return_to=/admin` menjadi admin lokal `seedy@sites.test`. Mock hanya aktif dalam development, tidak dalam build produksi. Jangan mempublikasikan dev server. Database lokal dan produksi terpisah.

## Publikasi HTTPS & konfigurasi pemilik

Manifest `.openai/hosting.json` menetapkan Site ID dan binding DB/BUCKET. Sites menyediakan resource dan menerapkan migrasi saat publikasi. Source harus dipush, artifact dari commit yang sama disimpan sebagai versi, kemudian versi tersebut dideploy. Status `succeeded` dan URL dari native tool adalah bukti deployment; URL yang diharapkan saat registrasi bukan bukti situs telah terbit.

Pemilik harus mengisi email admin akun ChatGPT ke `ADMIN_EMAIL` (atau Site-scoped identity ke `ADMIN_USER_ID`) melalui pengaturan environment Sites. Jangan menaruh rahasia dalam source. Situs dimaksudkan publik; admin menuntut login dan allowlist server. HTTPS disediakan host. Custom domain tidak diperlukan.

## Status pengerjaan

Build produksi dan pemeriksaan TypeScript berhasil. 47 tes inti lulus. Pratinjau browser belum diverifikasi: Workerd berhenti ketika dijalankan dalam lingkungan Windows ini. Migrasi D1 dihasilkan oleh Drizzle, tetapi gagal diterapkan pada runtime lokal karena kegagalan yang sama. Hosting telah diregistrasikan dengan audience publik dan ADMIN_EMAIL akun pemilik sudah diatur. Source belum dipush, versi belum disimpan, dan deployment **belum dilakukan** karena input terminal/sinkronisasi diblokir kebijakan lingkungan dan jalur Node REPL ditolak review otomatis.

Dukungan Pine memakai timeframe dasar dataset; plot diselaraskan ketika chart menampilkan timeframe lebih besar. Tidak ada hard heap memory cap; struktur data, ukuran input, serta operasi string yang dapat berkembang dibatasi.

## Bukti pengujian

47 tes inti lulus pada Node 24.19.0: parsing MT5/tab/semicolon/decimal-comma/zona waktu/DST/duplikat/gap, konversi spread per instrumen, P/L, kurs, margin/leverage, Bid/Ask, spread pecahan, komisi/slippage, invalid lot/margin, pending limit/stop/gap, SL/TP ambigu, rewind akun/riwayat/setoran/pending, branching, aggregation anti-lookahead, dua contoh Pine, panel tambahan, input, error baris, referensi masa depan, isolasi sintaks, paritas engine strategi/manual, rentang, batas resource. Tes browser/build/hosting memiliki status terpisah dalam laporan pengerjaan; tes inti tidak membuktikan deployment atau keseluruhan UI.

## Keterbatasan yang tersisa

Pine subset, Vinext beta, hard memory sandbox belum tersedia, kurs konstan, margin linear, 5.000 candle Pine vs 50.000 dataset, sesi lokal tidak bisa dipulihkan di perangkat lain tanpa dataset diterbitkan, anon kehilangan akses bila cookie dihapus, dan timezone grouping UTC. Data MT5 asli pengguna belum tersedia untuk uji data riil. Jalankan validasi dengan dataset asli dan cek spesifikasi instrumen sebelum mengandalkan simulasi.
