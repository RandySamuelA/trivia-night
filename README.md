# 🎉 Vacation Trivia Night

Aplikasi web realtime untuk trivia game bersama teman-teman — terinspirasi Kahoot,
tapi jauh lebih sederhana karena hanya dipakai satu kali.

**Arsitektur (sesuai SRD):**
- Laptop Anda = **Host** sekaligus **Server** (tidak perlu internet/hosting, cukup Wi-Fi lokal).
- Soal ditampilkan lewat **PowerPoint** di TV/laptop.
- HP peserta hanya dipakai untuk **submit jawaban** (A/B/C/D, True/False, isian singkat, atau survey).
- Skor & leaderboard dihitung otomatis dan realtime.

---

## 1. Yang Dibutuhkan

- Laptop dengan **Node.js** terinstall (v18 ke atas). Download di https://nodejs.org
- Semua HP peserta + laptop host terhubung ke **Wi-Fi yang sama**
  (bisa Wi-Fi villa/hotel, atau hotspot dari laptop/HP host).
- File soal PowerPoint (dibuat terpisah oleh Anda, seperti biasa).

## 2. Cara Menjalankan (sekali saja, sebelum acara)

1. Extract folder `trivia-night-app` ini.
2. Buka Command Prompt / Terminal di folder tersebut.
3. Jalankan:
   ```
   npm install
   ```
   (hanya perlu sekali, saat masih ada internet — sebelum berangkat liburan)
4. Edit file `questions.json` sesuai jumlah & jenis soal Anda (lihat bagian 4 di bawah).

## 3. Cara Menjalankan Saat Acara

1. Pastikan laptop & HP peserta semua di Wi-Fi yang sama.
2. Jalankan:
   ```
   npm start
   ```
3. Terminal akan menampilkan sesuatu seperti:
   ```
   Host Dashboard : http://localhost:3000/host.html
   Player join    : http://192.168.1.5:3000/player.html
   ```
4. Di laptop host, buka browser ke **http://localhost:3000/host.html**
5. Klik **"Buat Room Baru"** → akan muncul Room Code + QR Code.
6. Tampilkan QR Code tersebut ke peserta (share screen ke TV, atau tunjukkan layar laptop).
7. Peserta scan QR (atau ketik manual alamat + room code di HP masing-masing), lalu masukkan nama.
8. Setelah semua peserta join, klik **Start Game** di dashboard host.
9. Untuk tiap soal:
   - Tampilkan soal di PowerPoint seperti biasa.
   - Peserta menjawab lewat HP.
   - Klik **"Waktu Habis"** kalau ingin menutup waktu jawab.
   - Untuk Multiple Choice / True-False: klik jawaban yang benar, lalu klik **Reveal**.
   - Untuk Short Answer: kunci jawaban dinilai otomatis, tinggal klik **Reveal**.
   - Untuk Survey: langsung klik **Reveal** (tidak ada jawaban benar, hanya voting).
   - Klik **Next Question** untuk lanjut ke soal berikutnya.
10. Kalau soal terakhir bertipe **Wager** (Ronde Taruhan Akhir), ikuti alur khusus di bagian 5.
11. Setelah semua soal selesai, klik **End Game** untuk menampilkan Champion & leaderboard akhir.

## 4. Mengatur Soal (`questions.json`)

Setiap soal punya struktur seperti ini:

```json
{
  "id": 1,
  "label": "Question 1",
  "type": "multiple_choice",
  "points": 10,
  "options": ["A", "B", "C", "D"]
}
```

Jenis (`type`) yang didukung:
- `multiple_choice` → HP menampilkan tombol sesuai `options` (biasanya A/B/C/D). Host memilih
  jawaban benar saat Reveal.
- `true_false` → HP menampilkan tombol `True` / `False`. Host memilih jawaban benar saat Reveal.
- `short_answer` → HP menampilkan kolom isian teks. **Dinilai otomatis** dengan mencocokkan ke
  field `correctAnswer` pada soal tersebut. Sebelum dibandingkan, jawaban peserta maupun kunci
  jawaban sama-sama diubah ke huruf kecil dan tanda baca dihapus, jadi hanya kata-katanya saja
  yang dibandingkan (contoh: `"Neil, Armstrong!!"`, `"neil armstrong"`, dan `"NEIL   ARMSTRONG"`
  semuanya dianggap sama).
- `survey` → HP menampilkan opsi vote (mis. "siapa paling mungkin..."). Tidak ada jawaban
  benar/salah. Sebaliknya, **setiap peserta yang vote-nya sama dengan peserta lain** mendapat
  poin sebesar `points` untuk **setiap** peserta lain yang memilih target yang sama. Contoh:
  A, B, D semua vote "Player A", sedangkan C vote "Player D". Karena A, B, D saling cocok
  (masing-masing punya 2 orang lain yang sama), mereka masing-masing dapat 2 × `points`
  (mis. 2 × 20 = 40 poin), sedangkan C tidak dapat poin sama sekali.
- `wager` → Ronde Taruhan Akhir. Lihat bagian 6 di bawah untuk penjelasan lengkap.
- `song_guess` → Ronde Tebak Lagu. Lihat bagian 5 di bawah untuk penjelasan lengkap.

Field tambahan per tipe soal:
- `short_answer` wajib punya `correctAnswer` (string kunci jawaban).
- `survey` menggunakan `points` sebagai **poin per kecocokan**, bukan poin soal secara umum.
  Kolom `options` untuk `survey` **tidak dipakai lagi** — daftar opsi otomatis diambil dari
  nama-nama peserta yang benar-benar sedang join di room saat itu (bisa dikosongkan `[]`).
- `wager` tidak butuh `correctAnswer` atau `options` sama sekali. **Wajib diletakkan sebagai
  soal terakhir** di file ini.
- `song_guess` butuh `audioFile` (nama file MP3 di folder `public/audio/`) dan `tierPoints`
  (array 5 angka, poin untuk tier 1–5 detik; default `[50, 40, 30, 20, 10]` kalau tidak diisi).

Tambahkan/hapus/edit soal langsung di file ini sebelum acara dimulai.
Urutan soal di file ini = urutan soal yang harus Anda tampilkan di PowerPoint (kecuali
`song_guess`, yang lagunya diputar langsung dari dashboard host, bukan dari PowerPoint).

## 5. Ronde Tebak Lagu

Kalau ada soal bertipe `"song_guess"` di `questions.json`, alurnya beda total dari soal
lain — lagunya **diputar langsung dari laptop host** (bukan lewat PowerPoint), dan HP
peserta hanya untuk mengetik tebakan.

**Persiapan sebelum acara:**
1. Siapkan file MP3 lagu-lagunya, sebaiknya sudah di-*trim* jadi klip 10–15 detik
   (bagian paling catchy/reff-nya) — bisa pakai Audacity (gratis) atau aplikasi edit audio lain.
2. Taruh file MP3 tersebut di folder `public/audio/` (lihat `public/audio/README.md`
   untuk detail).
3. Di `questions.json`, isi `audioFile` dengan nama file itu persis, misalnya `"song1.mp3"`.
4. (Opsional) atur `tierPoints` — poin yang didapat kalau menjawab benar di detik ke-1, 2, 3,
   4, atau 5. Defaultnya `[50, 40, 30, 20, 10]` — makin cepat menjawab benar, makin besar
   poinnya.

**Alur saat main:**
1. Setelah **Next Question** sampai di soal `song_guess`, layar host pindah ke
   **"🎵 Tebak Lagu"**. Peserta di HP masing-masing melihat "Menunggu host memutar lagu...".
2. Host klik tombol **"▶ 1 detik (50 poin)"** — lagu akan diputar lewat speaker
   laptop/TV host untuk 1 detik saja, dan HP semua peserta yang **belum menjawab** langsung
   berubah jadi kolom isian jawaban, dengan keterangan "jawab sekarang untuk dapat 50 poin!".
3. Begitu peserta submit jawaban, HP mereka langsung pindah ke layar "menunggu", dan
   **host langsung melihat jawabannya secara realtime** di dashboard (tidak perlu tunggu
   semua orang selesai).
4. Kalau belum semua menjawab, host klik tombol tier berikutnya, misalnya
   **"▶ 2 detik (40 poin)"** — lagu diputar ulang dari awal tapi sampai detik ke-2, dan HANYA
   peserta yang **belum menjawab** yang kolom jawabannya terbuka lagi (yang sudah menjawab di
   tier sebelumnya tetap terkunci dengan jawaban & poin mereka).
5. Ulangi sampai tier 5 detik, **atau berhenti lebih awal** kapan saja semua peserta sudah
   menjawab (tidak wajib sampai tier 5 kalau semua sudah submit di tier 3, misalnya).
6. Di dashboard host akan terlihat daftar semua peserta beserta jawaban mereka (realtime).
   Host mencentang **"Benar"** untuk siapa saja yang jawabannya tepat (boleh typo dikit,
   host yang menilai secara manual — cocok untuk judul lagu yang sering beda-beda ejaannya).
7. Klik **"Reveal & Hitung Skor"**. Peserta yang dicentang benar dapat poin sesuai **tier saat
   mereka menjawab** (bukan tier terakhir yang diputar) — jadi yang menjawab benar di detik
   ke-1 dapat lebih banyak poin daripada yang baru menjawab benar di detik ke-5. Peserta yang
   salah atau tidak sempat menjawab dapat 0 poin (tidak ada pengurangan).

## 6. Ronde Taruhan Akhir (Final Wager)

Kalau ada soal bertipe `"wager"` di `questions.json` (sebaiknya di posisi paling akhir),
alurnya beda dari soal biasa:

1. Setelah klik **Next Question** dari soal sebelumnya, layar host otomatis pindah ke
   **"Ronde Taruhan Akhir"**. Setiap peserta di HP-nya akan melihat skor mereka saat ini dan
   diminta memasukkan **jumlah poin yang mau dipertaruhkan** (dari 0 sampai skor mereka
   sendiri — tidak bisa lebih).
2. Peserta yang belum sempat pasang taruhan akan otomatis dianggap bertaruh **0 poin**
   begitu host klik **Lanjut ke Pertanyaan** (supaya tidak bisa untung/rugi apa-apa).
3. Soal ditampilkan seperti biasa lewat PowerPoint. Peserta menjawab lewat HP (kolom isian
   bebas, karena biasanya soal terakhir sifatnya lebih terbuka/susah).
4. Di dashboard host akan muncul daftar semua peserta beserta **jumlah taruhan** dan
   **jawaban** mereka. Host menilai secara manual dengan mencentang **"Menang"** untuk siapa
   saja yang jawabannya benar — **boleh dicentang lebih dari satu orang, atau tidak ada
   sama sekali**.
5. Klik **Selesaikan & Reveal**. Sistem akan menghitung:
   - Peserta yang dicentang **menang** → skor **bertambah 2× lipat** dari taruhannya.
   - Peserta yang **tidak** dicentang → skor **berkurang** sebesar taruhannya.
   - Peserta yang bertaruh 0 poin tidak berubah skornya sama sekali, menang ataupun kalah.
6. Leaderboard & Champion akhir otomatis memperhitungkan hasil ronde ini.

Contoh: skor awal 140, bertaruh 70 poin, host mencentang dia sebagai pemenang →
skor jadi 140 + (2×70) = 280. Kalau tidak dicentang (kalah) → skor jadi 140 - 70 = 70.

## 7. Catatan Penting

- Data (nama peserta, skor, jawaban) hanya disimpan di **memori (RAM)** laptop host selama
  server menyala — sesuai kebutuhan (tidak perlu database, karena aplikasi sekali pakai).
  Jika server dimatikan/di-restart, semua data akan hilang — jadi jangan menutup terminal
  selama permainan berlangsung.
- Mendukung 5–15 pemain sekaligus (bisa lebih, tapi itu target awal sesuai SRD).
- Jika laptop host restart Wi-Fi/IP berubah saat acara, jalankan ulang `npm start` dan buat room baru.
- Tidak ada login, database permanen, riwayat permainan, atau fitur admin — sesuai SRD
  (bagian "Hal yang Sengaja Tidak Dibuat"), supaya cepat & stabil untuk kebutuhan sekali pakai.

Selamat berlibur & semoga serunya berasa seperti Kahoot pribadi kalian sendiri! 🏆

---

## 8. Hosting Online Gratis (Sementara, ~2 Minggu)

Kalau membuka app lewat Wi-Fi lokal terasa lambat, kalian bisa host aplikasi ini
**online gratis** untuk sementara. Dengan begini, peserta tinggal buka link biasa
(tidak perlu 1 Wi-Fi yang sama dengan host), dan biasanya jauh lebih cepat.

### Opsi A — Render.com

Catatan jujur soal paket gratis Render (per Agustus 2026):
- Katanya tidak perlu kartu kredit, tapi beberapa akun tetap diminta verifikasi kartu
  (sistem anti-fraud mereka), dan sebagian kartu (terutama kartu Indonesia/prepaid) ditolak.
  Kalau ini terjadi, langsung ke Opsi B di bawah.
- Server akan "tidur" otomatis kalau 15 menit tidak ada yang mengakses, dan butuh
  ±30–60 detik untuk "bangun" lagi saat diakses pertama kali.
- Gratis untuk pemakaian ringan seperti ini (750 jam/bulan) — lebih dari cukup untuk 2 minggu acara.

### Opsi B — Railway.app (kalau Render minta/menolak kartu)

Masa **Trial** Railway (30 hari, $5 kredit gratis) **tidak minta kartu sama sekali** saat
daftar. Untuk aplikasi ringan yang cuma aktif beberapa jam selama acara, $5 kredit jauh
lebih dari cukup untuk 2 minggu, dan tidak ada delay "bangun tidur" seperti Render.

### Langkah 1 — Upload project ke GitHub (tanpa perlu command line, berlaku untuk kedua opsi)

1. Buat akun gratis di https://github.com (kalau belum punya).
2. Klik ikon **"+"** di kanan atas → **New repository**.
3. Isi nama repo, misalnya `vacation-trivia-night`. Pilih **Public**. Klik **Create repository**.
4. Di halaman repo yang masih kosong, klik link **"uploading an existing file"**.
5. Buka folder project ini di komputer kalian. **Drag folder `public` itu sendiri** (bukan
   isi filenya satu-satu) beserta `server.js`, `package.json`, `questions.json` — **kecuali
   folder `node_modules` kalau ada** — ke area upload GitHub. Pastikan browser Chrome/Edge
   supaya folder ikut ter-upload utuh.
6. Scroll ke bawah, klik **Commit changes**.
7. Cek lagi di halaman repo GitHub: pastikan ada folder **`public`** berisi `host.html`,
   `player.html`, dst — kalau tidak ada, upload ulang seperti langkah 5 (penyebab paling
   umum error "Cannot GET /host.html" adalah folder `public` tidak ikut ter-upload).

### Langkah 2A — Deploy ke Render.com

1. Buka https://render.com → klik **Get Started** → pilih **Sign up with GitHub**.
2. Setelah masuk dashboard, klik **New +** → **Web Service**.
3. Pilih repo `vacation-trivia-night` yang tadi dibuat, klik **Connect**.
4. Isi pengaturan:
   - **Name**: bebas, misalnya `vacation-trivia-night`
   - **Region**: pilih yang paling dekat (Singapore kalau tersedia)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
5. Klik **Create Web Service**. Tunggu proses build (biasanya 1–3 menit) sampai status
   berubah jadi **Live**. Anda akan dapat URL publik seperti `https://vacation-trivia-night.onrender.com`

### Langkah 2B — Deploy ke Railway.app

1. Buka https://railway.app → **Login** → **Login with GitHub**.
2. Klik **New Project** → **Deploy from GitHub repo** → pilih `vacation-trivia-night`.
3. Railway otomatis menjalankan `npm install` + `npm start`. Tunggu status jadi **Active**.
4. Klik service-nya → tab **Settings** → bagian **Networking** → klik **Generate Domain**
   untuk dapat URL publik seperti `https://vacation-trivia-night-production.up.railway.app`.

### Langkah 3 — Main dengan URL online

1. Buka `<url-kalian>/host.html` di laptop host → klik **Buat Room Baru**.
2. QR Code & link yang muncul sekarang otomatis pakai URL online ini — jadi peserta
   tinggal scan/klik dari HP masing-masing, **tidak perlu** 1 Wi-Fi yang sama dengan host lagi
   (asal HP masing-masing tetap punya koneksi internet, Wi-Fi atau data seluler).

### Langkah 4 — Update soal (`questions.json`) kalau sudah online

Edit file `questions.json` langsung di GitHub (klik file → ikon pensil → edit → Commit
changes). Render/Railway akan otomatis build ulang dan deploy ulang dalam 1–2 menit setiap
kali ada perubahan yang di-commit.

### Langkah 5 — Supaya server Render tidak "tidur" pas acara berlangsung

(Khusus kalau pakai Render — Railway tidak butuh ini.) Beberapa menit sebelum mulai main,
buka dulu `<url-kalian>.onrender.com/healthz` di browser (akan muncul tulisan "ok") untuk
"membangunkan" server, baru buka `host.html`. Kalau mau lebih praktis, bisa daftar gratis di
https://uptimerobot.com atau https://cron-job.org dan atur agar mereka ping alamat `/healthz`
tadi setiap 5–10 menit selama masa acara (2 minggu).

### Langkah 6 — Mematikan sementara (tanpa menghapus) di Railway

Railway tidak punya tombol "pause", tapi caranya sama efeknya:
1. Buka service Anda → tab **Deployments**.
2. Pada deployment yang aktif, klik ikon **titik tiga (⋮)** → pilih **Remove**. Service
   berhenti (tidak makan kredit lagi) tapi semua pengaturan tetap tersimpan.
3. Untuk menyalakan lagi: di tab **Deployments**, cari deployment yang tadi di-remove →
   klik titik tiga (⋮) lagi → **Redeploy**. Domain publik yang sudah di-generate tetap sama.

### Langkah 7 — Setelah acara selesai

Kedua platform aman ditinggal begitu saja (tidak menagih biaya di luar kredit gratis), tapi
kalau mau beres-beres: buka dashboard platform terkait → pilih service-nya → Settings →
Delete Service.
