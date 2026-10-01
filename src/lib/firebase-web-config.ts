// Konfigurasi web Firebase untuk Sumenep Buku Kerja.
//
// APA YANG TERDAK DI SINI
//
// Tiga nilai pengenal publik: API key, auth domain, dan project id. Ketiganya
// memang bukan rahasia. Dokumentasi Firebase menyatakan API key web adalah
// pengenal proyek, bukan kunci akses; yang melindungi data adalah Authorized
// domains dan pembatasan kunci API di sisi Google, bukan kerahasiaan string
// ini. Memegangnya di runtime juga tidak menambah risiko apa pun, karena
// nilainya sudah ikut ada di bundel setiap kali aplikasi dimuat.
//
// Kenapa tidak lewat environment variable saja
//
// Pipeline build platform mengenskripsi setiap nilai environment yang
// ditambahkan operator, lalu menyuntikkannya ke objek `import.meta.env`
// sebagai "encrypted:...". Nilai itu utuh, tapi tidak pernah menjadi teks
// biasa di bundel, dan tidak ada fungsi dekripsi yang ikut ke peramban.
//
// Buktinya ada di build produksi sendiri:
//
//   import.meta.env.VITE_FIREBASE_API_KEY  -> "encrypted:BEFxWDjrqj..."
//   import.meta.env.VITE_CONVEX_URL        -> "https://focused-lemur-389..."
//
// Yang kedua lolos sebagai teks biasa bukan karena cara bacanya berbeda,
// melainkan karena platform menghitungnya sendiri dari CONVEX_DEPLOYMENT.
// Semua kunci lain yang ditambahkan lewat tab Keys melewati jalur yang sama dan
// berakhir terenkripsi.
//
// Gejalanya ketika itu sangat menyesatkan: string terenkripsi BUKAN string
// kosong, jadi `firebaseAvailable()` tetap true dan tombol "Masuk dengan
// Google" tetap tampil. Yang gagal adalah pemanggilannya - Firebase menolak
// API key itu, dan karena token tidak pernah berhasil diterbitkan, tidak ada
// satu pun permintaan yang menyentuh server. Log kosong, tidak ada breadcrumbs.
//
// Karena itu konfigurasi ini dikomit, dan `firebase-client.ts` memakainya
// sebagai fallback ketika env tidak tersedia atau datang terenkripsi.
//
// APA YANG TIDAK BOLEH PERNAH MASUK KE BERKAS INI
//
//   - JSON service account
//   - private key
//   - kredensial admin atau refresh token
//   - kunci API dengan pembatasan yang hanya relevan untuk satu server
//
// Semua itu punya tempatnya sendiri di environment variable backend, tidak
// pernah di repo dan tidak pernah di bundel peramban.

export const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyBbf-W0DJ6b2mXjqhxArBHs2K3Nl4UK9No",
  authDomain: "sumenepbukukerja.firebaseapp.com",
  projectId: "sumenepbukukerja",
} as const;

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
};