import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

/**
 * Uji render statis untuk halaman "Ruang ini tidak bisa diakses".
 *
 * Environment proyek memakai edge-runtime tanpa DOM, jadi yang diuji adalah
 * markup hasil render (static). Kontrak yang paling berisiko di layar ini
 * justru teks dan tombolnya: pemilik deployment yang terkunci harus tetap
 * punya jalan keluar, sedangkan yang tidak berhak tidak boleh diberi
 * tombol yang pasti gagal.
 */

vi.mock("convex/react", () => ({
  useMutation: () => async () => undefined,
}));

vi.mock("react-router", () => ({
  Link: ({ to, children }: { to: string; children?: unknown }) =>
    createElement("a", { href: to }, children as never),
  useNavigate: () => () => undefined,
}));

const { AdminAccessDenied } = await import("./admin-access-gate");

const render = (props: {
  signedIn: boolean;
  bootstrapAvailable: boolean;
  bootstrapEligible: boolean;
  accountName?: string;
  bootstrapBlocker?: "signedOut" | "noEmail" | "notAllowlisted" | null;
  deployment?: string | null;
}) => renderToStaticMarkup(createElement(AdminAccessDenied, props));

const RECOVERY_HEADING = "Jalur pemulihan";
const ACTIVATE_LABEL = "Aktifkan admin awal";

test("tamu tanpa akun tidak diberi jalan keluar admin", () => {
  const markup = render({ signedIn: false, bootstrapAvailable: true, bootstrapEligible: false });
  expect(markup).not.toContain(RECOVERY_HEADING);
  expect(markup).toContain("Masuk untuk cek akses");
});

test("warga yang tertinggal punya jalur pemulihan saat bootstrap masih terbuka", () => {
  const markup = render({
    signedIn: true,
    accountName: "PakRT",
    bootstrapAvailable: true,
    bootstrapEligible: true,
  });
  expect(markup).toContain(RECOVERY_HEADING);
  expect(markup).toContain("Email Anda terdaftar untuk akses awal");
  expect(markup).toContain(ACTIVATE_LABEL);
  // Tombol harus benar-benar bisa diklik, bukan hanya terlihat.
  expect(markup).not.toMatch(/<button[^>]*disabled/);
  // Copy lama yang mengunci ini sudah dihapus, karena tidak benar lagi.
  expect(markup).not.toContain("tidak bisa dibuka dari halaman ini");
});

test("email di luar allowlist melihat penjelasan, bukan tombol yang pasti gagal", () => {
  const markup = render({ signedIn: true, bootstrapAvailable: true, bootstrapEligible: false });
  expect(markup).toContain(RECOVERY_HEADING);
  expect(markup).toContain("Email Anda belum terdaftar untuk akses awal");
  expect(markup).toContain("STAFF_BOOTSTRAP_EMAILS");
  expect(markup).toMatch(/<button[^>]*disabled/);
});

test("akun tamu diberi tahu harus keluar lalu masuk ulang, bukan edit allowlist", () => {
  const markup = render({
    signedIn: true,
    bootstrapAvailable: true,
    bootstrapEligible: false,
    bootstrapBlocker: "noEmail",
  });
  expect(markup).toContain("Akun ini masuk sebagai tamu, jadi tidak punya email");
  expect(markup).toContain("Keluar dulu dari akun ini");
  // Petunjuk allowlist tidak boleh muncul di sini: itu akan sendingkan orang
  // mengedit variabel yang memang isn't penyebabnya.
  expect(markup).not.toContain("STAFF_BOOTSTRAP_EMAILS");
  expect(markup).toMatch(/<button[^>]*disabled/);
});

test("akun beremail di luar daftar tetap diberi petunjuk allowlist", () => {
  const markup = render({
    signedIn: true,
    bootstrapAvailable: true,
    bootstrapEligible: false,
    bootstrapBlocker: "notAllowlisted",
  });
  expect(markup).toContain("Email Anda belum terdaftar untuk akses awal");
  expect(markup).toContain("STAFF_BOOTSTRAP_EMAILS");
  expect(markup).not.toContain("Mode tamu");
});

test("backend yang dipakai ditampilkan supaya allowlist yang salah bisa terlihat", () => {
  const markup = render({
    signedIn: true,
    bootstrapAvailable: true,
    bootstrapEligible: false,
    bootstrapBlocker: "notAllowlisted",
    deployment: "https://rare-scorpion-625.convex.cloud",
  });
  expect(markup).toContain("Backend yang dipakai:");
  expect(markup).toContain("https://rare-scorpion-625.convex.cloud");
});

test("tanpa bootstrap terbuka, layar kembali ke penjelasan lama", () => {
  const markup = render({ signedIn: true, bootstrapAvailable: false, bootstrapEligible: false });
  expect(markup).not.toContain(RECOVERY_HEADING);
  expect(markup).not.toContain(ACTIVATE_LABEL);
  expect(markup).toContain("tidak bisa dibuka dari halaman ini");
  // Tiga peran tetap dijelaskan supaya pengunjung tahu apa yang hilang.
  expect(markup).toContain("Tiga peran pengelola");
});
