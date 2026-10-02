import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak pemulihan chunk basi di RootErrorBoundary.
 *
 * Laporan produksi `ERR-20261001-0GTXIGT` berisi
 * "Failed to fetch dynamically imported module: .../assets/Admin-ZfOF0elJ.js":
 * tab lama memegang `index.html` lama, dan setelah deploy berkas ber-hash yang
 * disebutnya sudah tidak ada. Error itu dilempar saat render lalu naik ke
 * boundary sebagai "gangguan total", padahal satu muat ulang menyelesaikannya.
 *
 * Diuji lewat source karena jalur ini gampang sekali jadi INERT tanpa terlihat:
 * memanggil `recoverFromStaleChunk` tanpa opsi `reload` tetap menulis penjaga ke
 * `sessionStorage` dan tetap mengembalikan "reloaded", tetapi tidak ada apa pun
 * yang dimuat ulang — kompilasi, lint, dan type check semuanya tetap hijau.
 * Karena itu tiga hal yang menentukan dipatok di sini: callback-nya benar-benar
 * ada, penjaganya dipakai (bukan `window.location.reload()` langsung, yang akan
 * berputar tanpa henti kalau asetnya memang tidak ada), dan muat ulang otomatis
 * tidak ikut menulis laporan Critical yang pasti tidak akan sampai ke server.
 */

const SOURCE = readFileSync("src/main.tsx", "utf8");

test("pemulihan chunk basi benar-benar memuat ulang halaman", () => {
  const call = SOURCE.slice(SOURCE.indexOf("recoverFromStaleChunk("));
  expect(call).toMatch(/reload:\s*\(\)\s*=>\s*window\.location\.reload\(\)/);
});

test("muat ulang tetap lewat penjaga sessionStorage, bukan langsung", () => {
  expect(SOURCE).toContain("recoverFromStaleChunk(err.message, {");
  expect(SOURCE).toMatch(
    /const recovery = recoverFromStaleChunk\(err\.message, \{/,
  );
});

test("muat ulang otomatis tidak menulis laporan Critical yang tak terkirim", () => {
  const shortCircuit = SOURCE.indexOf('if (recovery === "reloaded") return;');
  const reporting = SOURCE.indexOf("reportErrorToServer(reporter, {");
  expect(shortCircuit).toBeGreaterThan(-1);
  expect(reporting).toBeGreaterThan(shortCircuit);
});

test("jalur yang tidak memulihkan diri tetap dilaporkan", () => {
  // "already-tried" berarti penjaga anti-putar kena: pengguna benar-benar
  // tersangkut, jadi laporannya justru yang paling perlu sampai ke admin.
  expect(SOURCE).toContain("staleChunkRecovery: recovery");
});
