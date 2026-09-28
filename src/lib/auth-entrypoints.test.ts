import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Regression test untuk jalur masuk.
 *
 * "Masuk sebagai tamu" pernah ada di halaman /auth dan sudah dihapus. Akun
 * anonim tidak punya email, jadi begitu peran pengelola diberikan padanya,
 * akun itu tidak pernah bisa dibuka lagi — persis akun yang membuat seluruh
 * deployment terkunci tanpa ada jalan keluar. Test ini mengunci penghapusan
 * itu di level sumber, supaya tidak muncul lagi lewat niat baik
 * ("coba dulu tanpa daftar") yang akhirnya menjadi pintu masuk yang tidak
 * bisa dipulihkan.
 *
 * File ini berada di src/ supaya ikut typecheck/lint; tidak ada yang
 * mengimpornya di runtime.
 */

const read = (path: string) => readFileSync(path, "utf8");

/** Komentar bukan UI. Test ini memeriksa apa yang benar-benar bisa diklik
 *  pengguna, jadi komentar yang menjelaskan kenapa tombol dihapus tidak ikut
 *  dihitung sebagai tombol yang masih ada. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const AUTH_PAGE = stripComments(read("src/pages/Auth.tsx"));

/** Semua tempat yang memanggil signIn, di mana pun di aplikasi. */
const SIGN_IN_CALLERS = stripComments(read("src/hooks/use-auth.ts"));

test("halaman /auth tidak pernah menawarkan masuk sebagai tamu", () => {
  expect(AUTH_PAGE).not.toContain('signIn("anonymous")');
  expect(AUTH_PAGE).not.toContain("Masuk sebagai tamu");
  // Pemisah "atau" hanya tersisa kalau memang ada pilihan kedua di bawahnya.
  const orDividers = AUTH_PAGE.match(/uppercase tracking-\[0.12em\] text-slate-400/g) ?? [];
  expect(orDividers).toHaveLength(0);
});

test("tidak ada halaman lain yang reinstate mode tamu", () => {
  expect(SIGN_IN_CALLERS).not.toContain('signIn("anonymous")');
});
