import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

/**
 * Kontrak tampilan tombol "Logout dari sesi ini" pada kartu Security Desk.
 *
 * Yang diuji di sini adalah keputusan yang salah paling mahal: menampilkan
 * tombol untuk sesi yang tidak bisa dicabut, atau menampilkan label yang
 * menipu untuk sesi milik orang yang sedang memakai aplikasinya. Keduanya
 * berakhir jadi administrator yang salah sasaran, jadi harus terkunci.
 *
 * Sesuai environment proyek (edge runtime tanpa DOM), yang diperiksa adalah
 * markup hasil render statis. Interaksi klik diuji di browser QA.
 */

vi.mock("convex/react", () => ({
  useMutation: () => async () => ({ ok: true, revokedAt: 1, alreadyRevoked: false }),
}));

const { SessionRevokeControl } = await import("./admin-session-revoke");

const REVOKED_AT = Date.UTC(2026, 8, 27, 9, 30, 0);

type ControlProps = Parameters<typeof SessionRevokeControl>[0];

const render = (props: Partial<ControlProps>) =>
  renderToStaticMarkup(
    createElement(SessionRevokeControl, {
      attemptId: "evt1",
      deviceLabel: "Android 10 · Chrome 153 · Ponsel",
      sessionState: undefined,
      loginAt: REVOKED_AT,
      ipMasked: "203.0.113.xxx",
      onSelfRevoked: () => {},
      ...props,
    }),
  );

test("sesi milik perangkat lain mendapat tombol mencabut dan dialog konfirmasi", () => {
  const markup = render({ sessionState: "active", sessionRevokedAt: null });
  expect(markup).toContain("Logout dari sesi ini");
  expect(markup).toContain("admin-btn-danger");
  // Tombol harus benar-benar berupa tombol, bukan elemen yang cuma terlihat
  // seperti tombol.
  expect(markup).toContain("<button");
  expect(markup).toContain("type=\"button\"");
});

test("sesi milik perangkat yang sedang dipakai mendapat tombol dengan risiko dinyatakan", () => {
  const markup = render({ sessionState: "current", sessionRevokedAt: null });
  // Spec §14: sesi sendiri harus bisa dicabut, asal dengan konsekuensi yang
  // dinyatakan jelas. Label pasif tanpa tombol justru meninggalkan operator
  // tanpa jalan keluar.
  expect(markup).toContain("Logout dari perangkat ini");
  expect(markup).toContain("admin-btn-danger");
  expect(markup).toContain("Sesi Anda saat ini");
});

test("sesi yang sudah berakhir tampil sebagai badge, tanpa aksi", () => {
  const markup = render({ sessionState: "expired", sessionRevokedAt: null });
  expect(markup).toContain("Sesi telah berakhir");
  expect(markup).not.toContain("<button");
  // Penting: "berakhir" tidak boleh disamakan dengan "aktif".
  expect(markup).not.toContain("Cabut");
});

test("sesi yang sudah dicabut menampilkan status mati beserta waktunya", () => {
  const markup = render({ sessionState: "revoked", sessionRevokedAt: REVOKED_AT });
  expect(markup).toContain("Sesi telah dicabut");
  expect(markup).not.toContain("Logout dari sesi ini");
  expect(markup).not.toContain("<button");
});

test("baris lama tanpa referensi sesi diberi label, bukan error", () => {
  const markup = render({ sessionState: "untracked", sessionRevokedAt: null });
  expect(markup).toContain("Sesi tidak terlacak");
  expect(markup).not.toContain("<button");
});

test("percobaan gagal atau tanpa sesi tidak menampilkan apa pun", () => {
  for (const sessionState of ["none", undefined] as const) {
    const markup = render({ sessionState, sessionRevokedAt: null });
    expect(markup).toBe("");
  }
});

test("state yang belum dikenal ikut diperlakukan sebagai tidak bisa dicabut", () => {
  // Default-nya harus "tidak tampil". Kalau state baru suatu hari muncul tanpa
  // ditangani, lebih baik tidak ada tombol daripada tombol yang tidak pernah
  // bekerja.
  const markup = render({ sessionState: "masa-depan" as ControlProps["sessionState"], sessionRevokedAt: null });
  expect(markup).toBe("");
});
