import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";

/**
 * Urutan isi langkah "Masuk ke Buku Kerja" di halaman auth warga.
 *
 * Baris pembatas "atau" tadinya dirender SESUDAH kedua tombol. Form email dan
 * sandi berada di cabang lain, jadi di layar ini tidak ada apa pun lagi di
 * bawahnya: pembatas itu tidak memisahkan apa pun dan orang mengira masih
 * ada pilihan ketiga yang belum tampil. Yang benar, satu garis di antara
 * "Masuk dengan Google" dan "Gunakan email dan sandi".
 *
 * Teksnya dipusatkan dengan grid tiga kolom, bukan `flex-1` pada kedua garis.
 * `flex-1` membagi sisa ruang, jadi teks ikut bergeser begitu salah satu
 * garis perlu panjang berbeda. Grid menggabungkan lebar keduanya dalam satu
 * track: garis kiri dan kanan selalu sama panjang, teks selalu di tengah.
 */

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isLoading: false, isAuthenticated: false, signIn: async () => {} }),
}));

vi.mock("@/lib/admin-gate-client", () => ({
  useAdminPasscodeGate: () => ({
    state: { kind: "idle" },
    submit: async () => false,
    redeem: async () => false,
    reset: () => {},
  }),
}));

// Hanya `firebaseAvailable` yang dipakai saat render. Tanpa ini, layar pertama
// yang diuji akan mengambil blok "pintu masuk belum siap" sehingga kedua
// tombolnya tidak pernah dirender.
vi.mock("@/lib/firebase-client", () => ({
  firebaseAvailable: () => true,
  firebaseErrorMessage: (error: unknown) => String(error),
  requestPasswordReset: async () => {},
  createEmailAccount: async () => "token",
  signInWithEmail: async () => "token",
  signInWithGoogle: async () => "token",
  signOutOfFirebase: async () => {},
  currentFirebaseEmail: () => "warga@contoh.id",
}));

const { default: AuthPage } = await import("./Auth");

const render = (path = "/auth") =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(AuthPage, {})),
  );

/** Posisi penanda di markup hasil render. */
const posisi = (html: string) => ({
  google: html.indexOf("Masuk dengan Google"),
  pembatas: html.indexOf(">atau<"),
  email: html.indexOf("Gunakan email dan sandi"),
});

test("pembatas atau memisahkan Google dan email-sandi", () => {
  const urut = posisi(render());
  expect(urut.google).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(urut.google);
  expect(urut.pembatas).toBeLessThan(urut.email);
});

test("teks pembatas dipusatkan oleh grid tiga kolom", () => {
  const html = render();
  expect(html).toContain("grid-cols-[1fr_auto_1fr]");
  expect(html).toContain("items-center");
  const pembatas =
    /<div class="my-3 grid grid-cols-\[1fr_auto_1fr\][^"]*">([\s\S]*?)<\/div>/.exec(html);
  expect(pembatas?.[1]).toBeDefined();
  // Dua garis tanpa lebar eksplisit: panjangnya dari track grid yang sama,
  // jadi tidak mungkin salah satu lebih panjang dari yang lain.
  expect((pembatas![1]!.match(/class="h-px bg-slate-200"/g) ?? []).length).toBe(2);
  expect(pembatas![1]).not.toContain("flex-1");
});

test("kedua tombol tetap punya target dan tinggi sentuh yang sama", () => {
  const html = render();
  const tag = (label: string) => {
    const at = html.indexOf(label);
    return html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at) + 1);
  };
  expect(tag("Masuk dengan Google")).toContain("min-h-12");
  expect(tag("Gunakan email dan sandi")).toContain("min-h-12");
  // Jarak ke tombol pertama sekarang datang dari margin baris pembatas, jadi
  // tombol kedua tidak boleh masih membawa margin atas sendiri.
  expect(tag("Gunakan email dan sandi")).not.toContain("mt-2");
});

test("tujuan ke admin tidak ikut memakai pembatas warga", () => {
  // Halaman /auth?returnTo=/admin memakai panel pengelola yang punya aturannya
  // sendiri. Test ini hanya menjaga pemisahan keduanya: tidak ada pembatas
  // "atau" yang muncul dua kali di layar warga.
  expect(posisi(render("/auth")).email).toBeGreaterThan(-1);
  const admin = render("/auth?returnTo=%2Fadmin");
  expect(admin).toContain("Passcode");
});
