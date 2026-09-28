// Cron Convex untuk Sumenep Buku Kerja.
//
// File ini adalah satu-satunya tempat jadwal server ditulis. Kalau ditambah
// aturan, tambahkan di sini — bukan di `convex.json` (yang memang tidak
// mengenal kunci `crons`) dan bukan lewat pemanggilan manual dari klien.
//
// Prinsip: yang dijadwalkan selalu `internal.*`, bukan `api.*`. Cron dipilih
// oleh server, bukan oleh pengguna, jadi tidak perlu membuka permukaan publik
// hanya supaya sesuatu bisa berjalan terjadwal.

import { internal } from "./_generated/api";
import { cronJobs } from "convex/server";

const crons = cronJobs();

/**
 * Retensi data keamanan.
 *
 * Tanpa cron ini, `adminPasscodeAttempts` dan `adminSecurityContexts` tumbuh
 * tanpa batas dan data IP tersimpan selamanya — persis hal yang tidak boleh
 * terjadi. Dipasang harian agar batas jumlah baris (500) dan batas usia
 * (default 30 hari, `ADMIN_SECURITY_RETENTION_DAYS`) sama-sama ditegakkan.
 *
 * `minuteUTC` sengaja tidak ditulis. Convex memilih menitnya sendiri sehingga
 * banyak cron di jam yang sama tidak berebut resource di menit 0.
 *
 * Argumennya `{}` — bukan angka batas. Argumen kosong berarti
 * `pruneAdminSecurityEvents` memakai defaultnya sendiri: 500 baris dan
 * 30 hari, atau nilai `ADMIN_SECURITY_RETENTION_DAYS` bila diisi di Keys.
 * Tidak ada jalan untuk mengaturnya dari luar.
 */
crons.daily(
  "retensi data keamanan",
  { hourUTC: 3 },
  internal.adminGate.pruneAdminSecurityEvents,
  {},
);

/**
 * Retensi akun anonim.
 *
 * Sisa akun anonim adalah ~98% isi database saat ini (`authAccounts`,
 * `authSessions`, `authRefreshTokens`, dan baris `users` tanpa email).
 * Sumbernya penyedia `Anonymous` yang terdaftar di `src/convex/auth.ts` — file
 * yang beku dan tidak dipanggil satu pun halaman produk — jadi yang bisa kita
 * lakukan adalah membersihkannya berkala, bukan mencegahnya.
 *
 * Kenapa tiap 6 jam, bukan harian: laju pembuatannya terukur ~99 akun/hari,
 * dan tiap akun menyisakan ~4 dokumen. Satu kali jalan tidak cukup menyapu
 * semuanya, dan menumpuk seharian berarti tabelnya sempat menggembung.
 *
 * `batchSize` menghitung DOKUMEN yang dihapus, bukan akun yang diperiksa: 600
 * berarti sekitar 150 akun per jalan. Empat kali sehari = ~600 akun/hari, enam
 * kali di atas laju masuknya, tapi tetap dibatasi supaya satu kali jalan tidak
 * pernah jadi operasi besar.
 */
crons.interval(
  "retensi akun anonim",
  { hours: 6 },
  internal.dataRetention.pruneAnonymousAccounts,
  { batchSize: 600 },
);

/**
 * Retensi riwayat aplikasi: `auditLogs`, `errorReports`, `analyticsEvents`,
 * `whatsappDeliveries`.
 *
 * Keempatnya tumbuh tanpa batas karena tidak ada satu pun cron yang
 * menyentuhnya. Harian sudah cukup: batas jumlahnya (2.000 audit, 500 laporan,
 * 20.000 peristiwa) yang menjaga ukuran tabel, sedangkan batas usianya menjaga
 * data lama agar tidak tersimpan selamanya.
 *
 * `analyticsEvents` aman dipangkas justru karena angkanya sudah diringkas ke
 * `analyticsCounters` saat ditulis — dashboard tetap tahu total sepanjang masa
 * walaupun baris mentahnya sudah hilang. `whatsappDeliveries` lebih hati-hati:
 * hanya baris yang sudah berakhir (`delivered`/`failed`) yang dibuang, karena
 * baris `queued`/`sent` adalah bukti kiriman yang menggantung.
 */
crons.daily(
  "retensi riwayat aplikasi",
  { hourUTC: 4 },
  internal.dataRetention.pruneApplicationHistory,
  {},
);

export default crons;
