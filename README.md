# 🎉 Vacation Trivia Night

Aplikasi web realtime untuk trivia game bersama teman-teman — terinspirasi Kahoot,
tapi jauh lebih sederhana karena hanya dipakai satu kali.

**Arsitektur:**
- Laptop Anda (atau server online gratis — lihat bagian 8) = **Host** sekaligus **Server**.
- HP peserta dipakai untuk **submit jawaban** dan sekarang juga **melihat teks soal**
  (kalau paket soalnya diisi teksnya) serta ikut memutar lagu di ronde Tebak Lagu.
- Skor & leaderboard dihitung otomatis dan realtime.
- Kalau HP peserta disconnect (layar mati, pindah app, Wi-Fi putus), mereka bisa
  **otomatis nyambung ulang** tanpa kehilangan skor — lihat bagian 6.

---

## 1. Yang Dibutuhkan

- Laptop dengan **Node.js** terinstall (v18 ke atas). Download di https://nodejs.org
- Semua HP peserta + laptop host terhubung ke **Wi-Fi yang sama** (kalau main secara lokal).
- File soal PowerPoint (opsional sekarang — soal juga muncul di HP peserta, lihat bagian 4).

## 2. Cara Menjalankan (sekali saja, sebelum acara)

1. Extract folder `trivia-night-app` ini.
2. Buka Command Prompt / Terminal di folder tersebut.
3. Jalankan:
   ```
   npm install
   ```
4. Siapkan paket soal Anda di folder `packs/` (lihat bagian 4 di bawah).

## 3. Cara Menjalankan Saat Acara

1. Pastikan laptop & HP peserta semua di Wi-Fi yang sama (atau pakai hosting online, bagian 8).
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
5. **Pilih paket soal** yang mau dipakai (lihat daftar kartu paket di layar awal).
6. Klik **"Buat Room Baru"** → akan muncul Room Code + QR Code.
7. Tampilkan QR Code tersebut ke peserta (share screen ke TV, atau tunjukkan layar laptop).
8. Peserta scan QR (atau ketik manual alamat + room code di HP masing-masing), lalu masukkan nama.
9. Setelah semua peserta join, klik **Start Game** di dashboard host.
10. Untuk tiap soal:
    - Soal sekarang **otomatis muncul juga di HP peserta** (kalau diisi `text` di paket soal).
    - Peserta menjawab lewat HP.
    - Klik **"Waktu Habis"** kalau ingin menutup waktu jawab.
    - Untuk Multiple Choice / True-False: kalau paketnya sudah ada kunci jawaban, tinggal
      klik **Reveal** langsung (tidak perlu pilih manual). Kalau belum ada kunci, host tetap
      bisa memilih jawaban benar secara manual seperti biasa.
    - Untuk Short Answer: kunci jawaban dinilai otomatis, tinggal klik **Reveal**.
    - Untuk Survey: langsung klik **Reveal** (tidak ada jawaban benar, hanya voting).
    - Klik **Next Question** untuk lanjut ke soal berikutnya.
11. Kalau soal terakhir bertipe **Wager** (Ronde Taruhan Akhir), ikuti alur khusus di bagian 5.
12. Setelah semua soal selesai, klik **End Game** untuk menampilkan Champion & leaderboard akhir.

## 4. Paket Soal (folder `packs/`)

Soal sekarang disimpan sebagai **paket** — file JSON di dalam folder `packs/`. Setiap file
adalah satu paket yang bisa dipilih host sebelum membuat room. Anda bisa membuat sebanyak
apapun paket, tinggal tambahkan file JSON baru di folder itu.

Struktur satu file paket:

```json
{
  "name": "Paket Umum - Liburan Bareng Teman",
  "description": "8 soal campuran",
  "questions": [ ... ]
}
```

`name` dan `description` yang akan tampil di kartu pilihan paket pada dashboard host.
`questions` isinya array soal, sama seperti sebelumnya, dengan tambahan:

- **`text`** (opsional, semua tipe soal) — teks pertanyaan yang sekarang **ikut muncul di HP
  peserta**, bukan cuma di PowerPoint. Kalau field ini dikosongkan/dihapus, HP peserta cuma
  akan menampilkan "Pilih jawabanmu" seperti versi sebelumnya (soal tetap murni dari PPT).
- **`correctAnswer`** (untuk `multiple_choice` dan `true_false`) — kalau diisi, **host tidak
  perlu lagi memilih jawaban benar secara manual** saat reveal, tinggal klik Reveal langsung.
  Kalau dikosongkan, host tetap bisa memilih manual seperti sebelumnya (jadi kompatibel
  dengan cara lama).

Contoh satu soal lengkap:

```json
{
  "id": 1,
  "label": "Question 1",
  "type": "multiple_choice",
  "text": "Planet apa yang paling terkenal punya cincin di tata surya kita?",
  "points": 10,
  "options": ["Mars", "Saturnus", "Neptunus", "Venus"],
  "correctAnswer": "Saturnus"
}
```

Jenis (`type`) yang didukung:
- `multiple_choice` — HP menampilkan tombol sesuai `options`.
- `true_false` — HP menampilkan tombol `True` / `False`.
- `short_answer` — HP menampilkan kolom isian teks. Dinilai otomatis lewat `correctAnswer`
  (huruf besar/kecil & tanda baca diabaikan saat mencocokkan).
- `survey` — opsi vote **otomatis diambil dari nama peserta yang sedang join** (kolom
  `options` di JSON diabaikan, boleh dikosongkan `[]`). Setiap peserta yang vote-nya sama
  dengan peserta lain dapat poin sebesar `points` **per kecocokan**.
- `tebak_gaya` — Ronde Tebak Gaya (Charades). Sistem secara adil menggilirkan setiap pemain
  menjadi **peraga gaya** (semua mendapat giliran 1x dulu sebelum diacak ulang). Peraga melihat
  kata gaya di HP-nya dan tidak bisa input tebakan, tapi mendapat **+20 poin per orang yang
  menjawab benar**. Penebak yang benar mendapat poin soal seperti biasa.
- `song_guess` — Ronde Tebak Lagu. Lihat bagian 7 di bawah.
- `wager` — Ronde Taruhan Akhir. Lihat bagian 6 di bawah. **Wajib diletakkan sebagai soal
  terakhir** di paket.

Sudah disediakan 2 contoh paket: `packs/paket-umum.json` (8 soal) dan
`packs/paket-santai.json` (5 soal, lebih singkat). Boleh diedit langsung, dihapus, atau
ditambah paket baru — tinggal duplikat salah satu file, ganti isinya, dan beri nama file
baru (nama file = ID paket, tidak terlihat pemain, boleh apa saja asal berakhiran `.json`).

## 5. Ronde Taruhan Akhir (Final Wager)

Kalau ada soal bertipe `"wager"` di paket (sebaiknya di posisi paling akhir), alurnya beda
dari soal biasa:

1. Setelah klik **Next Question** dari soal sebelumnya, layar host otomatis pindah ke
   **"Ronde Taruhan Akhir"**. Setiap peserta di HP-nya melihat skor mereka saat ini dan
   diminta memasukkan **jumlah poin yang mau dipertaruhkan** (0 sampai skor mereka sendiri).
2. Peserta yang belum sempat pasang taruhan otomatis dianggap bertaruh **0 poin** begitu
   host klik **Lanjut ke Pertanyaan**.
3. Soal ditampilkan (lewat teks di HP kalau diisi, dan/atau PowerPoint). Peserta menjawab
   lewat kolom isian bebas di HP.
4. Dashboard host menampilkan semua peserta beserta **jumlah taruhan** dan **jawaban**
   mereka secara realtime. Host mencentang **"Menang"** untuk siapa saja yang jawabannya
   benar — boleh dicentang lebih dari satu orang, atau tidak ada sama sekali.
5. Klik **Selesaikan & Reveal**:
   - Yang dicentang **menang** → skor **bertambah 2× lipat** dari taruhannya.
   - Yang **tidak** dicentang → skor **berkurang** sebesar taruhannya.
   - Yang bertaruh 0 poin tidak berubah skornya, menang ataupun kalah.

Contoh: skor awal 140, bertaruh 70 poin, dicentang menang → skor jadi 140 + (2×70) = 280.
Kalau kalah → skor jadi 140 - 70 = 70.

## 6. Reconnect Otomatis (Anti Disconnect)

Kalau HP peserta layar mati, pindah ke WhatsApp, atau Wi-Fi sempat putus, mereka **tidak
akan kehilangan skor/posisi**:

- Aplikasi menyimpan sesi peserta otomatis di HP masing-masing (localStorage).
- Begitu mereka buka lagi tab/halamannya, otomatis "nyambung ulang" ke room yang sama dan
  langsung diarahkan ke soal yang sedang berjalan saat itu — skor tetap seperti terakhir.
- Kursi mereka ditahan **10 menit** sejak terputus sebelum dianggap keluar permanen.
- Host akan melihat badge **"🔌 terputus"** di daftar peserta selama mereka belum kembali.

Catatan: ini melindungi sisi **peserta**. Kalau laptop/device **host** sendiri yang
disconnect, belum ada mekanisme resume (dashboard host statusnya di memori browser) — pastikan
device host tetap menyala dan stabil sepanjang acara.

## 7. Ronde Tebak Lagu

Kalau ada soal bertipe `"song_guess"` di paket, lagunya **diputar dari laptop host** (lewat
speaker/TV) **dan juga otomatis diputar di HP masing-masing peserta** (kalau browser HP
mereka mengizinkan autoplay — lihat catatan di bawah), dengan durasi klip yang sama persis
dengan tier yang sedang aktif di host.

**Persiapan sebelum acara:**
1. Siapkan file MP3, sebaiknya sudah di-*trim* jadi klip 10–15 detik (bagian paling catchy).
2. Taruh file MP3 tersebut di folder `public/audio/` (lihat `public/audio/README.md`).
3. Di paket soal, isi `audioFile` dengan nama file itu persis, misalnya `"song1.mp3"`.
4. (Opsional) atur `tierPoints` — poin kalau menjawab benar di detik ke-1 s/d 5. Default
   `[50, 40, 30, 20, 10]`.

**Alur saat main:**
1. Setelah **Next Question** sampai di soal `song_guess`, layar host pindah ke
   **"🎵 Tebak Lagu"**, peserta melihat "Menunggu host memutar lagu...".
2. Host klik tombol tier, misalnya **"▶ 1 detik (50 poin)"** — lagu diputar lewat speaker
   host **dan** otomatis diputar juga di HP peserta yang belum menjawab, keduanya berhenti
   otomatis tepat di detik yang sama.
3. Peserta yang submit jawaban langsung terlihat host secara realtime.
4. Kalau belum semua menjawab, klik tombol tier berikutnya (2, 3, 4, 5 detik) — lagu diputar
   ulang dari awal sampai durasi baru itu. **Tidak wajib** sampai tier 5 kalau semua peserta
   sudah menjawab lebih awal.
5. Host mencentang **"Benar"** untuk jawaban yang tepat, lalu klik **"Reveal & Hitung Skor"**.
   Poin dihitung berdasarkan **tier saat peserta menjawab** (bukan tier terakhir yang diputar)
   — makin cepat jawab benar, makin besar poinnya.

**Catatan soal autoplay di HP peserta:** kebijakan autoplay tiap browser HP beda-beda dan
tidak selalu 100% bisa diandalkan (terutama Safari di iPhone kadang lebih ketat). Aplikasi
sudah mencoba "membuka izin" autoplay begitu peserta menekan tombol Join, tapi kalau di HP
tertentu tetap tidak bunyi otomatis, itu bukan error — suara utama tetap dari speaker host
untuk didengar bersama-sama, audio di HP hanyalah nilai tambah personal.

## 8. Catatan Penting

- Data (nama peserta, skor, jawaban) hanya disimpan di **memori (RAM)** server selama
  server menyala — tidak perlu database, karena aplikasi sekali pakai. Jika server
  dimatikan/di-restart, semua data hilang.
- Mendukung 5–15 pemain sekaligus (bisa lebih, tapi itu target awal).
- Tidak ada login, database permanen, riwayat permainan, atau fitur admin — supaya cepat
  & stabil untuk kebutuhan sekali pakai.

Selamat berlibur & semoga serunya berasa seperti Kahoot pribadi kalian sendiri! 🏆

---

## 9. Hosting Online Gratis (Sementara, ~2 Minggu)

Kalau membuka app lewat Wi-Fi lokal terasa lambat, kalian bisa host aplikasi ini
**online gratis** untuk sementara, supaya peserta tinggal buka link biasa (tidak perlu 1
Wi-Fi yang sama dengan host).

### Opsi A — Render.com

- Katanya tidak perlu kartu kredit, tapi beberapa akun tetap diminta verifikasi kartu, dan
  sebagian kartu (terutama kartu Indonesia/prepaid) ditolak. Kalau ini terjadi, ke Opsi B.
- Server "tidur" otomatis kalau 15 menit tidak ada yang mengakses, butuh ±30–60 detik untuk
  "bangun" lagi saat diakses pertama kali.
- Gratis untuk pemakaian ringan seperti ini (750 jam/bulan).

### Opsi B — Railway.app (kalau Render minta/menolak kartu)

Masa **Trial** Railway (30 hari, $5 kredit gratis) **tidak minta kartu sama sekali** saat
daftar. $5 kredit jauh lebih dari cukup untuk 2 minggu pemakaian ringan, dan tidak ada delay
"bangun tidur" seperti Render.

### Langkah 1 — Upload project ke GitHub (tanpa command line, berlaku untuk kedua opsi)

1. Buat akun gratis di https://github.com.
2. Klik ikon **"+"** → **New repository**. Isi nama, pilih **Public**, klik **Create repository**.
3. Di halaman repo kosong, klik link **"uploading an existing file"**.
4. Drag **semua isi folder project** (`server.js`, `package.json`, `packs/`, `public/`, dst
   — **kecuali folder `node_modules`** kalau ada) ke area upload GitHub. Pastikan browser
   Chrome/Edge supaya folder ikut ter-upload utuh.
5. Scroll bawah, klik **Commit changes**.
6. Cek lagi: pastikan folder `public/` DAN folder `packs/` ada di repo GitHub-nya — kalau
   tidak ada, upload ulang (penyebab paling umum error "Cannot GET /host.html" atau
   "Tidak ada paket soal" adalah folder ini tidak ikut ter-upload).

### Langkah 2A — Deploy ke Render.com

1. https://render.com → **Sign up with GitHub**.
2. **New +** → **Web Service** → pilih repo Anda → **Connect**.
3. Isi: Region terdekat, Branch `main`, Runtime **Node**, Build Command `npm install`,
   Start Command `npm start`, Instance Type **Free**.
4. **Create Web Service**, tunggu sampai status **Live**. Dapat URL seperti
   `https://vacation-trivia-night.onrender.com`

### Langkah 2B — Deploy ke Railway.app

1. https://railway.app → **Login with GitHub**.
2. **New Project** → **Deploy from GitHub repo** → pilih repo Anda.
3. Tunggu status **Active**.
4. Klik service → **Settings** → **Networking** → **Generate Domain** untuk dapat URL publik.

### Langkah 3 — Main dengan URL online

Buka `<url-kalian>/host.html`, pilih paket soal, **Buat Room Baru** seperti biasa. QR/link
otomatis pakai URL online ini.

### Langkah 4 — Update paket soal kalau sudah online

Edit file di folder `packs/` langsung di GitHub (klik file → ikon pensil → edit → Commit
changes). Render/Railway otomatis build ulang dalam 1–2 menit setiap ada commit baru.

### Langkah 5 — Supaya server Render tidak "tidur"

Beberapa menit sebelum main, buka dulu `<url-kalian>.onrender.com/healthz` (muncul "ok")
untuk membangunkan server. Atau daftar gratis di uptimerobot.com / cron-job.org untuk
auto-ping `/healthz` setiap 5–10 menit selama masa acara.

### Langkah 6 — Mematikan sementara (tanpa menghapus) di Railway

Buka service → tab **Deployments** → klik titik tiga (⋮) pada deployment aktif → **Remove**.
Untuk menyalakan lagi: cari deployment yang di-remove tadi → titik tiga (⋮) → **Redeploy**.

### Langkah 7 — Setelah acara selesai

Aman ditinggal begitu saja, atau kalau mau beres-beres: dashboard platform → service → Settings
→ Delete Service.
