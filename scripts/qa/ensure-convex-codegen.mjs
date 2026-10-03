#!/usr/bin/env node
/**
 * Penjaga codegen Convex. Dijalankan sebagai `pretest`.
 *
 * MASALAH YANG DISOLUSIKAN
 *
 * `src/convex/_generated/` adalah hasil codegen, bukan kode sumber, tapi sejak
 * 2026-10-03 folder itu IKUT TER-COMMIT. Alasannya terukur: build Vercel
 * berjalan di mesin tanpa kredensial Convex, sehingga `convex codegen` di sana
 * gagal dengan `401 MissingAccessToken` sebelum `vite build` sempat jalan.
 * Folder yang hilang atau terisi separuh berarti dua hal: build produksi
 * mati, dan setiap berkas test yang menyentuh API Convex gagal saat import
 * dengan pesan:
 *
 *     Error: Cannot find module './_generated/api'
 *
 * Angka pindah dari 1027 test ke 517 test, dan 37 dari 74 berkas "gagal".
 * Itu bukan kegagalan apa pun - itu SETENGAH SUITE yang tidak pernah jalan,
 * termasuk audit permukaan publik, enkripsi nomor, handoff kontak, dan pemicu
 * deteksi. Laporan keamanan bisa terlihat hijau sementara test yang paling
 * penting tidak pernah dieksekusi.
 *
 * Yang paling buruk: penyebabnya tidak terlihat di pesan error. Tidak ada
 * satu pun dari 37 pesan itu yang menyebut codegen.
 *
 * PENJAGA INI BUKAN PEMERIKSAAN ISI. Folder hasil codegen sengaja ikut
 * ter-commit supaya CI tidak butuh kredensial. Yang diperiksa di sini hanya
 * KEHADIRAN folder. Kalau folder ini terhapus saat commit atau `.gitignore`
 * dikembalikan, jalankan `npx convex codegen` lalu commit hasilnya lagi.
 *
 * KENAPA INI DIJALANKAN SEBAGAI `pretest`, BUKAN PERBAIKAN DI DALAM TEST
 *
 * Menambal test satu per satu hanya menyembuhkan gejala. Yang benar adalah
 * berhenti SEBELUM suite jalan, dengan satu pesan yang menyebut penyebabnya.
 * Kegagalan yang jujur lebih murah daripadasuite hijau yang berbohong.
 *
 * PEMULIHAN OTOMATIS
 *
 * Jalankan `CONVEX_CODEGEN_AUTOFIX=1` untuk membangkitkan otomatis. Defaultnya
 * dimatikan karena codegen butuh deployment Convex yang aktif, dan memanggil
 * jaringan di dalam `bun test` adalah kejutan yang tidak enak di CI.
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedDir = join(repoRoot, "src", "convex", "_generated");

// `api.d.ts` adalah satu-satunya berkas yang tidak pernah ditulis tangan dan
// selalu ada kalau codegen sempat selesai._memakai satu berkas ini cukup -
// mengecek seluruh folder akan salah positives saat build parsial.
const marker = join(generatedDir, "api.d.ts");

const AUTOFIX = process.env.CONVEX_CODEGEN_AUTOFIX === "1";

const BANGUN_PESAN = `
${"=".repeat(72)}
 TEST SUITE TIDAK BISA DIJALANKAN - FOLDER CONVEX CODEGEN HILANG
${"=".repeat(72)}

 src/convex/_generated/api.d.ts tidak ada. Folder itu seharusnya ikut
 ter-commit; kalau hilang, build produksi dan separuh test mati tanpa
 pesan yang menyebut sebabnya.

 Penyebabnya hampir selalu salah satu dari dua ini:

   1. Folder ikut terhapus saat commit, atau .gitignore mengembalikannya:

        npx convex codegen
        git add src/convex/_generated

   2. auth.config.ts memakai variabel yang Convex anggap kosong.
      src/convex/auth.config.ts menulis
      process.env.VLY_CONVEX_AUTH_ISSUER ?? "https://freebuff.com", tapi
      Convex mensyaratkan variabel auth-config benar-benar ADA di backend -
      operator '??' tetap dianggap kosong oleh analyzer. Symptoms-nya:

        x Environment variable VLY_CONVEX_AUTH_ISSUER is used in auth config
          file but its value was not set.

      Perbaikannya bukan mengubah kode auth.config.ts, tapi mengisinya:

        npx convex env set VLY_CONVEX_AUTH_ISSUER https://freebuff.com
        npx convex dev --once

      Nilai itu bukan rahasia dan sudah jadi default di src/.env.example.

${"-".repeat(72)}
 Jalankan ulang test setelah codegen selesai. Jangan diabaikan: suite yang
 hanya jalan separuh akan melaporkan angka yang terlihat hijau padahal tidak.
${"-".repeat(72)}
`.trim();

if (existsSync(marker)) {
  // Jalur sehat. Tidak ada yang perlu dicetak - `pretest` yang senyap adalah
  // perilaku yang benar untuk pemeriksaan yang hanya perlu gagal saat rusak.
  process.exit(0);
}

if (AUTOFIX) {
  process.stderr.write("codegen belum ada - membangkitkan otomatis...\n");
  const result = spawnSync("npx", ["convex", "dev", "--once"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0 || !existsSync(marker)) {
    process.stderr.write(
      "\nCodegen otomatis gagal. Periksa pesan di atas - penyebab yang paling\n" +
        "umum adalah VLY_CONVEX_AUTH_ISSUER belum diisi di deployment.\n",
    );
    process.exit(1);
  }

  process.stderr.write("codegen selesai - melanjutkan test.\n");
  process.exit(0);
}

process.stderr.write(BANGUN_PESAN + "\n");
process.exit(1);
