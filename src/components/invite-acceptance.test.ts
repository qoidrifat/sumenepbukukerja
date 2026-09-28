import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

/**
 * Kontrak tampilan halaman penerima undangan.
 *
 * Halaman yang valid tidak bisa dirender di Browser QA: membuat undangan
 * sungguhan butuh sesi pengelola, dan itu tidak bisa dibangun di harness.
 * Jadi kontrak tampilan dikunci di sini lewat render statis, sementara
 * perilakunya dikunci di `src/convex/invites.test.ts`.
 *
 * Yang paling penting di sini adalah jumlah tombol: penerima
 * dijanjikan satu aksi. Tampilnya tombol kedua — "Masuk", "Daftar", atau
 * "Coba lagi" yang mengarahkan ke tempat lain — mengubah janji itu jadi
 * proses.
 */

const state = vi.hoisted(() => ({ details: null as unknown }));

vi.mock("convex/react", () => ({
  useQuery: () => state.details,
  useMutation: () => async () => ({ ok: false, reason: "EXPIRED_OR_INVALID" }),
  useConvex: () => ({ url: "https://uji.convex.cloud" }),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: Record<string, unknown>) =>
          createElement("div", rest, children as never),
    },
  ),
  AnimatePresence: ({ children }: { children?: unknown }) => children,
}));

const { InviteAcceptance } = await import("@/pages/InviteAcceptance");

const VALID = {
  valid: true as const,
  email: "penerima@sumenep.co.id",
  role: "staff",
  invitedByName: "Administrator Sistem",
  inviterPresent: true,
  expiresAt: Date.UTC(2026, 8, 30, 9, 0, 0),
};

const render = () => renderToStaticMarkup(createElement(InviteAcceptance));

test("kartu undangan valid meremail badge, akun, peran, dan masa berlaku", () => {
  state.details = VALID;
  const markup = render();
  expect(markup).toContain("Undangan Bergabung ke Sistem");
  expect(markup).toContain("Undangan Resmi Pengelola");
  expect(markup).toContain("penerima@sumenep.co.id");
  // Peran diterjemahkan ke bahasa manusia, bukan dibiarkan sebagai "staff".
  expect(markup).toContain("Pengelola Operasional");
  expect(markup).toContain("Administrator Sistem");
});

test("hanya ada satu tombol aksi utama: Terima Undangan", () => {
  state.details = VALID;
  const markup = render();
  expect(markup).toContain("Terima Undangan");
  const buttons = markup.match(/<button/g) ?? [];
  expect(buttons.length).toBe(1);
  // Tidak ada pintu masuk lain di halaman ini.
  expect(markup).not.toContain("Daftar");
  expect(markup).not.toContain("Masuk ke Akun");
});

test("undangan tidak berlaku merender kartu sopan dengan satu tombol kembali", () => {
  state.details = { valid: false as const, reason: "EXPIRED_OR_INVALID" as const };
  const markup = render();
  expect(markup).toContain("Tautan Undangan Tidak Berlaku");
  expect(markup).toContain("Kembali ke Halaman Masuk");
  expect(markup).toContain("Silakan hubungi Administrator");
  // Penolakan tidak boleh membuka celah: tidak ada aksi lain di kartu ini.
  expect((markup.match(/<button/g) ?? []).length).toBe(1);
  expect(markup).not.toContain("Terima Undangan");
});

test("detail tambahan tidak pernah ikut keluar ke markup", () => {
  state.details = { ...VALID, email: "rahasia@sumenep.co.id" };
  const markup = render();
  // Email memang ditampilkan (itu isi undangan), tapi tidak ada jejak
  // token atau hash yang bocor ke DOM.
  expect(markup).not.toMatch(/tokenHash|inviteId/);
});
