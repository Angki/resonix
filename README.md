# Black Library 🎧
> *Personal High-Performance Audio Streaming Server terinspirasi MusicBee untuk Windows & Tailscale*

Black Library adalah aplikasi music player web-based desktop-first yang dirancang khusus untuk koleksi musik lokal berskala besar (10.000–50.000+ file audio). Aplikasi ini berjalan di PC Windows Anda sebagai server dan dapat diakses dari browser mana pun di tailnet (laptop, ponsel, PC kantor) melalui Tailscale Serve dengan audio yang diputar langsung di browser perangkat pengakses.

---

## 📑 Daftar Isi
1. [Fitur Utama](#-fitur-utama)
2. [Arsitektur & Tech Stack](#-arsitektur--tech-stack)
3. [Struktur Folder & Library Roots](#-struktur-folder--library-roots)
4. [Instalasi Cepat di Windows](#-instalasi-cepat-di-windows)
5. [Menjalankan Aplikasi](#-menjalankan-aplikasi)
6. [Panduan Remote Streaming via Tailscale](#-panduan-remote-streaming-via-tailscale)
7. [Integrasi MusicBee](#-integrasi-musicbee)
8. [Integrasi Last.fm](#-integrasi-lastfm)
9. [Troubleshooting & FFmpeg Transcoding](#-troubleshooting--ffmpeg-transcoding)
10. [Backup & Restore Database](#-backup--restore-database)
11. [Otomasi Windows Startup (Task Scheduler)](#-otomasi-windows-startup-task-scheduler)

---

## ⚡ Fitur Utama

- **UI Terinspirasi MusicBee**:
  - Layout 5-zone desktop-first: Left Navigator, Top Toolbar, Center Library Table/Grid, Collapsible Right Panel (Now Playing, Queue, Track Properties), dan Bottom Persistent Player Bar.
  - Dark theme charcoal `#121215` dengan aksen muted crimson `#b91c1c` yang elegan dan informatif.
  - Virtualized Track Table (`@tanstack/react-virtual`) yang mampu me-render puluhan ribu track pada 60fps mulus tanpa lag memori.
  - Sortable & resizable columns, multi-selection (Ctrl/Shift+Click), right-click context menu, double-click to play.
  - Keyboard navigation: `Space` (Play/Pause), `Panah Kiri/Kanan` (Seek +/- 5s, Alt untuk Prev/Next), `Panah Atas/Bawah` (Volume), `M` (Mute), `Ctrl+F` (Fokus Search).
- **Streaming Audio Presisi (RFC 7233)**:
  - Dukungan penuh HTTP Range Requests (206 Partial Content, Content-Range, Accept-Ranges: bytes) untuk seek instan tanpa buffering seluruh file.
  - Direct native stream untuk MP3, FLAC, M4A/AAC, WAV, OGG, Opus.
  - On-the-fly FFmpeg transcoding fallback ke MP3 320k jika codec tidak didukung browser native atau saat diaktifkan manual.
  - Guard allowlist keamanan: memeriksa realpath filesystem dan menolak akses di luar 4 folder library musik resmi. Sumber musik 100% **read-only** (tidak pernah mengubah, memindahkan, atau menghapus file asli).
- **Scanner Asinkron & Bounded Concurrency**:
  - Scanning background non-blocking dengan optimasi incremental mtime/size (re-scan 20k track selesai dalam hitungan detik).
  - Artwork extraction otomatis dari embedded ID3/FLAC picture serta album folder images (`cover.jpg`, `folder.jpg`, `front.jpg`).
  - Thumbnail caching multi-ukuran (96px, 256px, 512px WebP) menggunakan engine native `sharp`.
- **Statistik & Idempotent Play Tracking**:
  - Play count dihitung hanya setelah benar-benar didengarkan minimal 50% durasi atau 4 menit. Pause dan seek tidak menambah waktu dengar.
  - Session ID & unique event UUID untuk mencegah double counting saat tab refresh atau reconnect.
  - Memisahkan hitungan lokal aplikasi (`localPlayCount`) dan hitungan impor MusicBee (`importedPlayCount`).
- **Integrasi MusicBee Read-Only**:
  - Deteksi otomatis file database dan playlist di `C:\Users\angki\Music` (seperti `DEATH`, `GORE`, `NOISE`, `Dungeon Synths`, `Raw Black Metal`).
  - Parser aman untuk playlist biner `.mbp` dan smart playlist XML `.xautopf`.
  - Preview dry-run dengan match confidence score dan re-import idempotent.
- **Last.fm Official Web Scrobbling**:
  - Alur otorisasi web resmi Last.fm (`auth.getToken` -> Browser auth -> `auth.getSession`).
  - Penyimpanan session key terenkripsi AES-256-GCM di sisi server.
  - Queue durable scrobble dengan backoff otomatis dan penanganan rate-limit.

---

## 🛠 Arsitektur & Tech Stack

| Lapisan | Teknologi |
|---|---|
| **Backend** | Node.js v20+ / v24 LTS, TypeScript, Fastify v5 |
| **Database** | SQLite dengan Prisma ORM & migration versioning |
| **Metadata** | `music-metadata` (ID3v1, ID3v2, Vorbis, FLAC, RIFF) |
| **Image Engine** | `sharp` (libvips native untuk WebP thumbnails) |
| **Transcoder** | FFmpeg binary pipeline dengan process kill on abort |
| **Frontend** | React 18, Vite 6, TypeScript, Tailwind CSS |
| **Data & State** | TanStack Query v5, TanStack Table v8, TanStack Virtual, Zustand |
| **Production Serving** | Single-origin static SPA disajikan langsung dari Fastify di port 3000 |

---

## 📂 Struktur Folder & Library Roots

Black Library mengindeks empat direktori musik di drive `D:` secara rekursif:

1. `D:\Music\RAW BLACK METAL`
2. `D:\Music\GORE`
3. `D:\Music\NOISE`
4. `D:\Music\DUNGEON SYNTHS`

Direktori metadata tambahan MusicBee (read-only):
`C:\Users\angki\Music`

Semua path dapat dilihat dan dikonfigurasi melalui panel **Settings**.

---

## 🚀 Instalasi Cepat di Windows

Buka PowerShell di folder project (`D:\Projects\music_stream`):

```powershell
# Jalankan skrip setup otomatis
.\scripts\setup.ps1
```

Skrip `setup.ps1` akan otomatis:
1. Memverifikasi ketersediaan Node.js, FFmpeg, dan Tailscale.
2. Menginstall semua dependensi NPM (root, backend, frontend).
3. Melakukan inisialisasi SQLite database dan migrasi Prisma.
4. Melakukan kompilasi bundle frontend React dan backend TypeScript.

---

## 🎮 Menjalankan Aplikasi

### Mode Produksi (Single-Origin Port 3000)
Gunakan ini untuk pemakaian normal dan remote streaming Tailscale:
```powershell
.\scripts\start.ps1
# Atau:
npm run start
```
Akses di browser PC server: [http://127.0.0.1:3000](http://127.0.0.1:3000)

### Mode Development (Hot Module Reloading)
Jika Anda ingin mengubah kode UI atau backend secara langsung:
```powershell
.\scripts\dev.ps1
```
Ini akan menjalankan Fastify di port 3000 dan Vite dev server di port 5173 dengan proxy API otomatis.

---

## 🌐 Panduan Remote Streaming via Tailscale

Server Black Library secara default hanya membuka listen di `127.0.0.1:3000` demi keamanan sistem Anda. Untuk mengaksesnya dari laptop, tablet, atau ponsel lain di jaringan privat Tailscale Anda:

### 1. Pastikan Tailscale Aktif di PC Server
Buka terminal PowerShell (bisa dijalankan sebagai user biasa):
```powershell
tailscale status
```

### 2. Aktifkan Tailscale Serve (HTTPS Reverse Proxy Privat)
Jalankan perintah berikut:
```powershell
tailscale serve --bg http://127.0.0.1:3000
```
> [!NOTE]
> Perintah ini menggunakan fitur bawaan Tailscale Serve untuk mengekspos port 3000 lokal ke nama node tailnet Anda melalui HTTPS otomatis yang valid dan terenkripsi. Anda **TIDAK PERLU** membuka port router atau menyalakan Tailscale Funnel publik.

### 3. Periksa Alamat Akses
```powershell
tailscale serve status
```
Anda akan melihat URL seperti:
`https://your-pc-name.your-tailnet.ts.net`

Buka URL tersebut di browser perangkat lain (yang sudah tergabung di tailnet yang sama). Seluruh audio akan di-stream dan diputar langsung melalui speaker atau headphone perangkat tersebut!

Untuk mematikan expose Tailscale Serve sewaktu-waktu:
```powershell
tailscale serve --reset
```

---

## 🐝 Integrasi MusicBee

1. Buka icon **Settings** (roda gigi di pojok kanan atas) -> tab **MusicBee Import**.
2. Black Library secara otomatis menemukan file library (`MusicBeeLibrary.mbl`), settings, dan playlist (`.mbp`, `.xautopf`) dari `C:\Users\angki\Music`.
3. Klik tombol **Import** pada playlist yang diinginkan (misal `ON.mbp` dari folder GORE).
4. Sistem akan mencocokkan path file audio biner ke track database lokal secara idempotent tanpa memicu duplikasi atau scrobble palsu ke Last.fm.

---

## 📻 Integrasi Last.fm

1. Buka **Settings** -> tab **Last.fm**.
2. Masukkan `API Key` dan `API Secret` dari akun developer Last.fm Anda ([https://www.last.fm/api/account/create](https://www.last.fm/api/account/create)) lalu klik **Save API Credentials**.
3. Klik tombol **Authorize Web**. Jendela otorisasi resmi Last.fm akan terbuka.
4. Klik *Allow access* di halaman Last.fm, lalu kembali ke Black Library dan klik **Finish Authorization**.
5. Server akan menyimpan session key terenkripsi dan otomatis mengaktifkan Now Playing serta scrobble queue di background!

---

## 🔧 Troubleshooting & FFmpeg Transcoding

- **Status FFmpeg**: Buka Settings -> tab **Tailscale & Streaming**. Jika FFmpeg terdeteksi, versinya akan muncul.
- **Direct Play vs Transcoding**:
  - File MP3, FLAC, WAV, M4A/AAC akan diputar direct stream secara bit-perfect oleh browser modern.
  - Untuk file WMA atau file dengan sample rate khusus yang tidak didukung browser tertentu, aktifkan tombol badge di player bar bawah: klik badge kualitas audio untuk beralih antara `DIRECT` dan `TRANSCODED`.
- **Jika FFmpeg tidak ditemukan**:
  Unduh build Windows FFmpeg dari [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) dan letakkan di `PATH` sistem Anda atau tentukan path lengkapnya di file `.env` pada variabel `FFMPEG_PATH`.

---

## 💾 Backup & Restore Database

Database Black Library adalah file tunggal SQLite:
- Lokasi database: `d:\Projects\music_stream\data\library.db`
- File cache thumbnail: `d:\Projects\music_stream\cache\artwork\`

### Backup:
Cukup salin file `data\library.db` dan `.env` ke tempat penyimpanan aman:
```powershell
Copy-Item data\library.db G:\Backup\BlackLibrary_backup.db
Copy-Item .env G:\Backup\BlackLibrary.env
```

### Restore:
Hentikan server, timpa kembali `data\library.db`, lalu jalankan server kembali.

---

## ⏰ Otomasi Windows Startup (Task Scheduler)

Jika Anda ingin Black Library otomatis berjalan di latar belakang setiap kali Anda login ke Windows tanpa perlu membuka terminal:

```powershell
# Daftarkan startup task otomatis (memerlukan hak administrator):
.\scripts\install-service.ps1

# Untuk menghapus startup task:
.\scripts\install-service.ps1 -Uninstall
```
*(Catatan: Pasang task ini hanya jika Anda menyetujui startup otomatis di sistem Anda).*

---
*Black Library — Crafted for raw, heavy, and extreme music archives.*
