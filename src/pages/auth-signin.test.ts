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
 *    "atau", lalu "Masuk dengan Email". Pembatas memisahkan keduanya, bukan
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
  otpThrow: false,
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
  // Satu-satunya `useQuery` langsung di Auth adalah `api.otpEmail.status`
  // (`useAuth` dan admin-gate di-mock terpisah), jadi flag ini tepat
  // mensimulasikan query status yang melempar. Ref Convex adalah Proxy yang
  // tidak bisa diidentifikasi via JSON — karena itu tanpa pencocokan ref.
  useQuery: () => {
    if (envState.otpThrow) throw new Error("Server Error Called by client");
    return envState.otpStatus;
  },
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
  email: html.indexOf("Masuk dengan Email"),
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
  expect(tag("Masuk dengan Email")).toContain("min-h-12");
});

test("tombol Email OTP punya cincin fokus yang terlihat", () => {
  // Tombol warga memakai `Button` shadcn (bukan `focusRing` eksplisit):
  // cincinnya datang dari kelas dasar varian. Yang dikunci: kelas
  // `focus-visible:ring` ikut ter-render pada tombolnya, jadi navigasi
  // keyboard selalu terlihat.
  envState.firebase = true;
  envState.otpStatus = { enabled: true };
  const html = render();
  const at = html.indexOf("Masuk dengan Email");
  const tag = html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at) + 1);
  expect(tag).toContain("focus-visible:ring");
});

test("hanya Google hidup: tanpa pembatas yang menggantung", () => {
  envState.firebase = true;
  envState.otpStatus = { enabled: false };
  const html = render();
  expect(html).toContain("Masuk dengan Google");
  expect(html).not.toContain("Masuk dengan Email");
  expect(html).not.toContain(">atau<");
});

test("hanya Email OTP hidup: tanpa pembatas yang menggantung", () => {
  envState.firebase = false;
  envState.otpStatus = { enabled: true };
  const html = render();
  expect(html).not.toContain("Masuk dengan Google");
  expect(html).toContain("Masuk dengan Email");
  expect(html).not.toContain(">atau<");
});

test("OTP belum terjawab: Google tampil dulu, slot Email berupa skeleton, fallback tidak flash", () => {
  envState.firebase = true;
  envState.otpStatus = undefined;
  const html = render();
  expect(html).toContain("Masuk dengan Google");
  expect(html).not.toContain("Masuk dengan Email");
  expect(html).toContain('aria-label="Memuat opsi masuk"');
  expect(html).not.toContain("Pintu masuk belum siap");
});

test("keduanya belum diketahui: skeleton netral, bukan fallback, bukan tombol", () => {
  envState.firebase = false;
  envState.otpStatus = undefined;
  const html = render();
  expect(html).toContain('aria-label="Memuat opsi masuk"');
  expect(html).toContain("border-dashed");
  expect(html).not.toContain("Masuk dengan Google</");
  expect(html).not.toContain("Masuk dengan Email");
  expect(html).not.toContain("Pintu masuk belum siap");
});

test("tombol Email memakai ikon amplop premium + cincin fokus terlihat", () => {
  envState.firebase = true;
  envState.otpStatus = { enabled: true };
  const html = render();
  const at = html.indexOf("Masuk dengan Email");
  const tag = html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at) + 1);
  const svgAt = html.indexOf("<svg", html.lastIndexOf("<button", at));
  expect(svgAt).toBeGreaterThan(-1);
  expect(svgAt).toBeLessThan(at);
  expect(html).toContain('fill="#2563EB"');
  expect(tag).toContain("focus-visible:ring");
});

test("keduanya mati: fallback menyebut Google + Email OTP", () => {
  envState.firebase = false;
  envState.otpStatus = { enabled: false };
  const html = render();
  expect(html).toContain("Pintu masuk belum siap di lingkungan ini.");
  expect(html).toContain("Google");
  expect(html).toContain("Email OTP");
  expect(html).not.toContain("Masuk dengan Google</");
  expect(html).not.toContain("Masuk dengan Email");
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

test("query status gagal: halaman tidak mati, Google tetap tampil", () => {
  // Regresi ERR-20261005-0O72S0A: `api.otpEmail.status` melempar (backend
  // belum di-deploy / gagal sesaat). Tanpa guard, lemparan naik ke
  // RootErrorBoundary dan SELURUH /auth mati dengan dialog "mengalami
  // gangguan" — padahal pintu Google sehat. Yang dikunci: render tidak
  // melempar, Google tampil, Email hilang, fallback tidak tampil (Google
  // hidup, jadi tidak ada yang perlu dijelaskan).
  envState.firebase = true;
  envState.otpThrow = true;
  try {
    let html = "";
    expect(() => {
      html = render();
    }).not.toThrow();
    expect(html).toContain("Masuk dengan Google");
    expect(html).not.toContain("Masuk dengan Email");
    expect(html).not.toContain("Pintu masuk belum siap");
  } finally {
    envState.otpThrow = false;
  }
});
