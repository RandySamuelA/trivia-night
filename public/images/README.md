# Folder Gambar Soal (public/images)

Folder ini digunakan untuk menyimpan gambar yang akan ditampilkan pada soal bertipe **Tebak Gambar** atau **Tebak Logo** (atau soal apa pun yang memiliki properti `"image"` di file JSON paket soal).

---

## 🖼️ Cara Menggunakan Gambar di Soal

1. Simpan file gambar kamu (format `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`) di dalam folder ini (`public/images/`).
2. Di dalam file paket soal (misalnya `packs/General.json`), tambahkan properti `"image"` pada soal yang diinginkan:

```json
{
  "id": 6,
  "label": "Tebak Gambar 1",
  "type": "multiple_choice",
  "text": "Tebak bendera negara pada gambar ini!",
  "image": "tebak-gambar-1.png",
  "points": 20,
  "options": [
    "A. Inggris",
    "B. Swiss",
    "C. Greenland",
    "D. Georgia"
  ],
  "correctAnswer": "B. Swiss"
}
```

3. Gambar akan otomatis muncul di **layar Host (laptop)** dan juga di **layar HP seluruh peserta** saat soal tersebut aktif!

---

## 📁 Daftar Gambar Bawaan:
- `tebak-gambar-1.png` (Bendera Swiss)
- `tebak-gambar-2.png` (Bendera Nepal)
- `tebak-logo-1.png` (Logo Garuda Indonesia)
- `tebak-logo-2.png` (Logo Chevrolet)
- `tebak-logo-3.png` (Logo Lawson)

Kamu bisa menimpa / mengganti file-file gambar tersebut kapan saja dengan gambar pilihanmu.
