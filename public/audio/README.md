# Folder Audio Tebak Lagu

Taruh file MP3 lagu-lagu untuk ronde "Tebak Lagu" di sini.

Setiap lagu sebaiknya di-cut/trim jadi klip 10–15 detik saja (bagian paling catchy,
misalnya reff/chorus-nya) menggunakan aplikasi edit audio apa saja (mis. Audacity - gratis),
lalu export sebagai MP3.

Nama file harus sesuai dengan field `audioFile` di `questions.json`, contoh:

```json
{
  "type": "song_guess",
  "audioFile": "song1.mp3",
  "tierPoints": [50, 40, 30, 20, 10]
}
```

Berarti file `song1.mp3` harus ada di folder ini (`public/audio/song1.mp3`).
