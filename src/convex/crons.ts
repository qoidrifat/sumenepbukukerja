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

/**
 * Pembersihan blob storage yatim.
 *
 * Unggahan foto listing yang dibatalkan (pengguna menutup dialog setelah foto
 * masuk storage), foto profil yang diganti, dan foto yang gagal disimpan karena
 * mutasinya ditolak: semuanya meninggalkan blob tanpa rujukan. Tidak ada cron
 * lain yang menyentuh `_storage`, jadi tanpa job ini blob-blob itu tinggal
 * selamanya.
 *
 * Harian sudah cukup, dan itu disengaja: job ini memakai masa tenggang 24 jam,
 * jadi unggahan yang sedang berjalan selalu aman. Jam 5 UTC dipilih setelah
 * retensi riwayat (jam 4) dan tidak berebut dengannya di menit yang sama.
 */
crons.daily(
  "pembersihan blob storage yatim",
  { hourUTC: 5 },
  internal.storage.pruneOrphanStorage,
  {},
);

/**
 * Cadangan data mingguan.
 *
 * Retensi KITA menghapus data secara rutin — itu keputusan yang benar, tapi
 * berarti "data lama sudah hilang" adalah keadaan normal, bukan kegagalan.
 * Satu dokumen JSON per minggu (vendors, reports, auditLogs, reviews,
 * serviceRequests, errorReports) disimpan di storage PRIVATE; recovery runbook
 * ada di README.
 *
 * Jadwalnya Kamis 01:00 UTC — hari kerja, jauh dari retensi harian,
 * supaya lonjakan resource tidak berbarengan dengan prune.
 */
crons.weekly(
  "cadangan data mingguan",
  { dayOfWeek: "thursday", hourUTC: 1 },
  internal.storage.writeWeeklyBackup,
  {},
);

/**
 * Ringkasan harian untuk admin.
 *
 * Dipasang pukul 07:00 WIB (00:00 UTC) — batas hari operasional, sebelum admin
 * membuka meja kerja. Idempoten lewat `deliveryKey` beruffix tanggal WIB, jadi
 * cron yang jalan dua kali pada hari yang sama hanya menyiapkan satu baris.
 *
 * PERUBAHAN SEMANTIK: cron ini tidak lagi mengirim pesan WhatsApp dari server.
 * Yang dipanggil hanya menghitung angka dan menyiapkan tautan `wa.me` untuk
 * dibuka pengelola di panel admin. `wa.me` tidak punya kemampuan pengiriman
 * otomatis — lihat `NOT REPLACED BY wa.me` di laporan Fase 8.
 */
crons.daily(
  "ringkasan harian admin",
  { hourUTC: 0 },
  internal.whatsapp.prepareAdminDailySummary,
  {},
);

export default crons;
