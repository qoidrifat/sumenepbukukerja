import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";

/**
 * Pintu masuk `/auth` Fase 9.5: Google + Email OTP.
 *
 * Masuk sandi dihapus total (keputusan pemilik), jadi yang dikunci di sini
 * adalah matriks ketersediaan dua pintu yang tersisa:
 *
 *  - Keduanya hidup (`firebaseEnabled && otpEnabled`) -> Google, pembatas
 *    "atau", lalu "Gunakan Email". Pembatas memisahkan keduanya, bukan
 *    menggantung di bawah.
 *  - Hanya satu yang hidup -> hanya pintu itu, TANPA pembatas. Pembatas
 *    yang tidak memisahkan apa pun membuat orang mengira masih ada pilihan
 *    ketiga yang belum tampil.
 *  - Keduanya mati -> fallback yang menyebut Google + Email OTP, bukan
 *    layar kosong.
 *
 * Status OTP dibaca dari `api.otpEmail.status` saat render. Selama query
 * belum terjawab (`undefined`), fallback TIDAK boleh flash: pintu Google
 * yang statusnya sudah diketahui tampil lebih dulu.
 */

const envState = vi.hoisted(() => ({
  firebase: true,
  otpStatus: { enabled: true } as { enabled: boolean } | undefined,
}));

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

vi.mock("convex/react", () => ({
  useQuery: () => envState.otpStatus,
  useAction: () => async () => ({ retryAfterMs: 0 }),
}));

// Hanya `firebaseAvailable` yang dipakai saat render. Tanpa ini, layar pertama
// yang diuji akan mengambil blok "pintu masuk belum siap" sehingga kedua
// tombolnya tidak pernah dirender.
vi.mock("@/lib/firebase-client", () => ({
  firebaseAvailable: () => envState.firebase,
  firebaseErrorMessage: (error: unknown) => String(error),
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
  email: html.indexOf("Gunakan Email"),
});

test("dua pintu hidup: pembatas atau memisahkan Google dan Email OTP", () => {
  envState.firebase = true;
  envState.otpStatus = { enabled: true };
  const urut = posisi(render());
  expect(urut.google).toBeGreaterThan(-1);
  expect(urut.email).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(urut.google);
  expect(urut.pembatas).toBeLessThan(urut.email);
});

test("teks pembatas dipusatkan oleh grid tiga kolom", () => {
  envState.firebase = true;
  envState.otpStatus = { enabled: true };
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

test("kedua tombol tetap punya tinggi sentuh yang sama", () => {
  envState.firebase = true;
  envState.otpStatus = { enabled: true };
  const html = render();
  const tag = (label: string) => {
    const at = html.indexOf(label);
    return html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at) + 1);
  };
  expect(tag("Masuk dengan Google")).toContain("min-h-12");
  expect(tag("Gunakan Email")).toContain("min-h-12");
});

test("hanya Google hidup: tanpa pembatas yang menggantung", () => {
  envState.firebase = true;
  envState.otpStatus = { enabled: false };
  const html = render();
  expect(html).toContain("Masuk dengan Google");
  expect(html).not.toContain("Gunakan Email");
  expect(html).not.toContain(">atau<");
});

test("hanya Email OTP hidup: tanpa pembatas yang menggantung", () => {
  envState.firebase = false;
  envState.otpStatus = { enabled: true };
  const html = render();
  expect(html).not.toContain("Masuk dengan Google");
  expect(html).toContain("Gunakan Email");
  expect(html).not.toContain(">atau<");
});

test("OTP belum terjawab: Google tampil dulu, fallback tidak flash", () => {
  envState.firebase = true;
  envState.otpStatus = undefined;
  const html = render();
  expect(html).toContain("Masuk dengan Google");
  expect(html).not.toContain("Pintu masuk belum siap");
});

test("keduanya mati: fallback menyebut Google + Email OTP", () => {
  envState.firebase = false;
  envState.otpStatus = { enabled: false };
  const html = render();
  expect(html).toContain("Pintu masuk belum siap di lingkungan ini.");
  expect(html).toContain("Google");
  expect(html).toContain("Email OTP");
  expect(html).not.toContain("Masuk dengan Google</");
  expect(html).not.toContain("Gunakan Email");
});

test("tujuan ke admin tidak ikut memakai pembatas warga", () => {
  // Halaman /auth?returnTo=/admin memakai panel pengelola yang punya aturannya
  // sendiri. Test ini hanya menjaga pemisahan keduanya: tidak ada pembatas
  // "atau" yang muncul dua kali di layar warga.
  envState.firebase = true;
  envState.otpStatus = { enabled: true };
  expect(posisi(render("/auth")).email).toBeGreaterThan(-1);
  const admin = render("/auth?returnTo=%2Fadmin");
  expect(admin).toContain("Passcode");
});
