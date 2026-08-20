# Folder Audio Tebak Lagu

Taruh file MP3 lagu-lagu untuk ronde "Tebak Lagu" di sini.

Setiap lagu sebaiknya di-cut/trim jadi klip 10–15 detik saja (bagian paling catchy,
misalnya reff/chorus-nya) menggunakan aplikasi edit audio apa saja (mis. Audacity - gratis),
lalu export sebagai MP3.

Nama file harus sesuai dengan field `audioFile` di soal (`type: "song_guess"`) pada file
paket soal di folder `packs/`, contoh:

```json
{
  "type": "song_guess",
  "audioFile": "song1.mp3",
  "tierPoints": [50, 40, 30, 20, 10]
}
```

Berarti file `song1.mp3` harus ada di folder ini (`public/audio/song1.mp3`).

⚠️ **Penting soal huruf besar/kecil (case-sensitive):** Kalau aplikasi ini di-hosting
online (Render/Railway, dsb), nama file **harus PERSIS SAMA** huruf besar-kecilnya dengan yang
ditulis di `audioFile`. Di laptop Windows/Mac biasanya tidak masalah kalau beda huruf besar-kecil
(`Song1.mp3` vs `song1.mp3` dianggap sama), tapi begitu online (server Linux) itu dianggap **file
yang berbeda** dan akan gagal diputar. Supaya aman, samakan semuanya pakai huruf kecil semua,
misalnya `song1.mp3`, `song2.mp3`, dst.

Lagu yang sama bisa dipakai di beberapa paket soal berbeda (`packs/*.json`) asal nama filenya
tetap dirujuk dengan benar.
