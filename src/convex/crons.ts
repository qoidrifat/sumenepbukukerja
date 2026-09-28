// Cron Convex untuk Sumenep Buku Kerja.
//
// File ini adalah satu-satunya tempat jadwal server ditulis. Kalau ditambah
// aturan, tambahkan di sini — bukan di `convex.json` (yang memang tidak
// mengenal kunci `crons`) dan bukan lewat pemanggilan manual dari klien.
//
// Prinsip: yang dijadwalkan selalu `internal.*`, bukan `api.*`. Cron dipilih
// oleh server, bukan oleh pengguna, jadi tidak perlu membuka permukaan
// publik hanya supaya sesuatu bisa berjalan terjadwal.

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

export default crons;
