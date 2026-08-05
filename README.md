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
   - Untuk Short Answer: tandai tiap jawaban peserta **Benar/Salah**, lalu klik **Reveal**.
   - Untuk Survey: langsung klik **Reveal** (tidak ada jawaban benar, hanya voting).
   - Klik **Next Question** untuk lanjut ke soal berikutnya.
10. Setelah soal terakhir, klik **End Game** untuk menampilkan Champion & leaderboard akhir.

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
- `survey` → HP menampilkan `options` (mis. nama-nama peserta untuk "siapa paling mungkin...").
  Tidak ada jawaban benar/salah. Sebaliknya, **setiap peserta yang vote-nya sama dengan peserta
  lain** mendapat poin sebesar `points` untuk **setiap** peserta lain yang memilih target yang
  sama. Contoh: A, B, D semua vote "Player A", sedangkan C vote "Player D". Karena A, B, D
  saling cocok (masing-masing punya 2 orang lain yang sama), mereka masing-masing dapat
  2 × `points` (mis. 2 × 20 = 40 poin), sedangkan C tidak dapat poin sama sekali karena tidak
  ada peserta lain yang vote sama dengannya.

Field tambahan per tipe soal:
- `short_answer` wajib punya `correctAnswer` (string kunci jawaban).
- `survey` menggunakan `points` sebagai **poin per kecocokan**, bukan poin soal secara umum.

Tambahkan/hapus/edit soal langsung di file ini sebelum acara dimulai.
Urutan soal di file ini = urutan soal yang harus Anda tampilkan di PowerPoint.

## 5. Catatan Penting

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

## 6. Hosting Online Gratis (Sementara, ~2 Minggu)

Kalau membuka app lewat Wi-Fi lokal terasa lambat, kalian bisa host aplikasi ini
**online gratis** di **Render.com** untuk sementara. Dengan begini, peserta tinggal
buka link biasa (tidak perlu 1 Wi-Fi yang sama dengan host), dan biasanya jauh lebih cepat.

Catatan jujur soal paket gratis Render (per Agustus 2026):
- Tidak perlu kartu kredit.
- Server akan "tidur" otomatis kalau 15 menit tidak ada yang mengakses, dan butuh
  ±30–60 detik untuk "bangun" lagi saat diakses pertama kali. Solusinya ada di langkah 5 di bawah.
- Gratis untuk pemakaian ringan seperti ini (750 jam/bulan) — lebih dari cukup untuk 2 minggu acara.
- Kebijakan hosting gratis bisa berubah sewaktu-waktu; kalau saat kalian coba ternyata
  sudah berbeda, opsi sejenis lainnya: Railway.app atau Glitch.com (langkahnya mirip: hubungkan
  repo GitHub, atur Start Command `npm start`).

### Langkah 1 — Upload project ke GitHub (tanpa perlu command line)

1. Buat akun gratis di https://github.com (kalau belum punya).
2. Klik ikon **"+"** di kanan atas → **New repository**.
3. Isi nama repo, misalnya `vacation-trivia-night`. Pilih **Public**. Klik **Create repository**.
4. Di halaman repo yang masih kosong, klik link **"uploading an existing file"**.
5. Buka folder project ini di komputer kalian, lalu **drag semua isi folder**
   (`server.js`, `package.json`, `questions.json`, folder `public/`, dst — **kecuali folder
   `node_modules` kalau ada**, karena tidak perlu diupload) ke area upload GitHub.
6. Scroll ke bawah, klik **Commit changes**.

### Langkah 2 — Deploy ke Render.com

1. Buka https://render.com → klik **Get Started** → pilih **Sign up with GitHub**
   (paling gampang, langsung terhubung ke akun GitHub kalian).
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
   berubah jadi **Live**.
6. Setelah live, Render akan kasih URL publik seperti:
   `https://vacation-trivia-night.onrender.com`

### Langkah 3 — Main dengan URL online

1. Buka `https://vacation-trivia-night.onrender.com/host.html` (ganti sesuai URL kalian)
   di laptop host → klik **Buat Room Baru**.
2. QR Code & link yang muncul sekarang otomatis pakai URL online ini — jadi peserta
   tinggal scan/klik dari HP masing-masing, **tidak perlu** 1 Wi-Fi yang sama dengan host lagi
   (asal HP masing-masing tetap punya koneksi internet, Wi-Fi atau data seluler).

### Langkah 4 — Update soal (`questions.json`) kalau sudah online

Kalau mau ubah soal setelah deploy, edit file `questions.json` langsung di GitHub
(klik file → ikon pensil → edit → Commit changes). Render akan otomatis build ulang
dan deploy ulang dalam 1–2 menit setiap kali ada perubahan yang di-commit.

### Langkah 5 — Supaya server tidak "tidur" pas acara berlangsung

Beberapa menit sebelum mulai main, buka dulu `https://<url-kalian>.onrender.com/healthz`
di browser (akan muncul tulisan "ok") untuk "membangunkan" server, baru buka `host.html`.
Kalau mau lebih praktis, bisa daftar gratis di https://uptimerobot.com atau
https://cron-job.org dan atur agar mereka ping alamat `/healthz` tadi setiap 5–10 menit
selama masa acara (2 minggu) — dengan begitu server tidak akan sempat tidur sama sekali.

### Langkah 6 — Setelah acara selesai

Server gratis ini aman ditinggal begitu saja (tidak akan menagih biaya), tapi kalau mau
beres-beres: buka dashboard Render → pilih service-nya → **Settings** → scroll ke bawah →
**Delete Web Service**.

