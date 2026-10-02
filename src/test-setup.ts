// Setup global untuk seluruh suite Vitest.
//
// SATU-SATUNYA alasan berkas ini ada: sejak FASE 16, kode yang menyentuh nomor
// warga memanggil `phoneKeyMaterial()`, yang melempar kalau kunci belum diisi.
// Tanpa kunci di lingkungan test, setiap test yang menyentuh preferensi notifikasi,
// klaim listing, atau pesan masuk akan gagal dengan pesan "PHONE_DATA_KEY belum
// diisi" - yang tidak gagal karena logikanya salah maupun karena kode
// rusak. Itu hanya bising.
//
// NILAI DI SINI ADALAH KUNCI UJI, BUKAN KUNCI PRODUKSI.
//
// 32 byte yang bisa ditebak orang, hanya hidup selama proses test. Nilainya
// tidak pernah menyentuh deployment, tidak pernah masuk repo pada bentuk yang
// dibaca aplikasi, dan sengaja dibuat MENETAP supaya test bisa断言 hal yang
// sama berulang kali - ciphertext yang berubah tiap test akan membuat
// perbandingan menjadi sia-sia.
//
// Kalau berkas ini dihapus, test akan gagal dengan pesan yang BENAR (kunci
// belum diisi). Itu perilaku yang diinginkan: konfigurasi salah harus terlihat,
// bukan diabaikan diam-diam.

// 32 byte yang tetap, ditulis dalam bentuk base64. Nilainya terlihat jelas
// (base64 dari "blankfortestonly...") supaya tidak pernah disalahartikan
// sebagai kunci produksi. Panjangnya harus tepat 32 byte - `phoneKeyMaterial`
// menolak yang lain, dan itu memang benar.
const TEST_ONLY_PHONE_DATA_KEY = Buffer.from(
  "blankfortestonlyBukuKerjaTestKey",
  "utf8",
).toString("base64");

if (!process.env.PHONE_DATA_KEY) {
  process.env.PHONE_DATA_KEY = TEST_ONLY_PHONE_DATA_KEY;
}