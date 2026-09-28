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

test("tanpa bootstrap terbuka, layar kembali ke penjelasan lama", () => {
  const markup = render({ signedIn: true, bootstrapAvailable: false, bootstrapEligible: false });
  expect(markup).not.toContain(RECOVERY_HEADING);
  expect(markup).not.toContain(ACTIVATE_LABEL);
  expect(markup).toContain("tidak bisa dibuka dari halaman ini");
  // Tiga peran tetap dijelaskan supaya pengunjung tahu apa yang hilang.
  expect(markup).toContain("Tiga peran pengelola");
});
