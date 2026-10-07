import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

/**
 * Halaman `/auth/email` — chrome 100% meniru `/auth` layar warga (logo,
 * judul, deskripsi, tombol Kembali), isinya alur OTP dua tahap.
 */

const envState = vi.hoisted(() => ({
  otpStatus: undefined as { enabled: boolean } | undefined,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
    signIn: async () => {},
    signOut: async () => {},
  }),
}));

vi.mock("convex/react", () => ({
  useQuery: () => envState.otpStatus,
  useAction: () => async () => ({ ok: true, retryAfterMs: 60_000 }),
}));

const { default: EmailOtpPage } = await import("./EmailOtp");

const render = (path = "/auth/email") =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(EmailOtpPage, {})),
  );

describe("chrome halaman email", () => {
  test("logo + judul + deskripsi sama dengan /auth", () => {
    const html = render();
    expect(html).toContain("/brand/logo-mark.svg");
    expect(html).toContain("Masuk ke Buku Kerja");
    expect(html).toContain("Simpan listing favorit dan sinkronkan dari perangkat mana pun.");
    expect(html).toContain("Kembali");
    expect(html).toContain("Akun warga");
  });

  test("tahap email langsung tampil: label, input, dan Kirim OTP", () => {
    const html = render();
    expect(html).toContain("Email");
    expect(html).toContain("Kirim OTP");
  });

  test("bukan popup: tidak ada peran dialog di halaman", () => {
    const html = render();
    expect(html).not.toContain('role="dialog"');
  });
});
