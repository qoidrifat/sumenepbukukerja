import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * Gate kelengkapan data diri warga di dashboard.
 *
 * Radix Dialog tidak merender kontennya di render statis (mount lewat efek),
 * jadi yang dikunci di sini adalah kontrak strukturnya; perilaku status
 * (lengkap/belum) dikunci di `src/convex/profile.test.ts` terhadap server
 * sungguhan.
 */
const src = readFileSync(new URL("./profile-completion-gate.tsx", import.meta.url), "utf8");

describe("gate persisten yang tak bisa ditutup", () => {
  test("tanpa jalan tutup: tanpa X, Esc dan klik-luar dibatalkan", () => {
    expect(src).not.toContain("Tutup pemberitahuan");
    expect(src).not.toContain("closeErrorDialog");
    expect(src).toContain("onEscapeKeyDown");
    expect(src).toContain("onInteractOutside");
    expect(src).toContain("event.preventDefault()");
    expect(src).toContain("onOpenChange={() => undefined}");
  });

  test("visibilitas murni dari server + staf dikecualikan", () => {
    expect(src).toContain("api.profile.myProfileStatus");
    expect(src).toContain("status.complete");
    expect(src).toContain("access?.isStaff === true");
    expect(src).toContain("Lengkapi data diri");
  });

  test("kolom nomor ketat angka: keypad numerik + tolak huruf dengan getar", () => {
    expect(src).toContain('inputMode="numeric"');
    expect(src).toContain('pattern="[0-9]*"');
    expect(src).toContain("/[a-zA-Z]/");
    expect(src).toContain("Nomor WhatsApp harus diisi dengan angka.");
    expect(src).toContain("useAnimation");
    expect(src).toContain("useReducedMotion");
    expect(src).toContain('role="alert"');
  });

  test("Simpan terkunci sampai Konfirmasi ditekan + form lengkap, dengan petunjuk", () => {
    expect(src).toContain("verifiedNow");
    expect(src).toContain("confirmed");
    expect(src).toContain("setConfirmed(true)");
    expect(src).toContain("(verifiedNow || confirmed)");
    expect(src).toContain("canSave");
    expect(src).toContain("disabled={!canSave}");
    expect(src).toContain("disabled:cursor-not-allowed disabled:opacity-50");
    expect(src).toContain("Verifikasi dulu nomor WhatsApp lewat tombol Verifikasi di atas.");
    expect(src).toContain("minimal 2 huruf");
    expect(src).toContain("minimal 5 karakter");
  });

  test("form lengkap: nama, nomor + verifikasi inbound, alamat, simpan", () => {
    for (const id of ["profil-nama", "profil-nomor", "profil-alamat"]) {
      expect(src).toContain(`id="${id}"`);
    }
    expect(src).not.toContain('id="profil-kode"');
    expect(src).toContain("Verifikasi");
    expect(src).toContain("Konfirmasi ke Admin");
    expect(src).not.toContain("Buka WhatsApp bisnis");
    expect(src).toContain("Simpan data diri");
    expect(src).toContain("api.profile.requestInboundCode");
    expect(src).toContain("api.profile.saveMyProfile");
    expect(src).toContain('role="alert"');
    expect(src).toContain('from "@/lib/focus-ring"');
  });

  test("klik paksa Verifikasi: tiap kolom kosong dapat pesannya sendiri", () => {
    expect(src).toContain("fieldErrors");
    expect(src).toContain("Isi nama lengkap terlebih dahulu.");
    expect(src).toContain("Isi nomor WhatsApp terlebih dahulu.");
    expect(src).toContain("Isi alamat domisili terlebih dahulu.");
  });

  test("konfirmasi: ceklis searah jarum jam + berhasil, lalu buka WhatsApp", () => {
    expect(src).toContain("handleConfirm");
    expect(src).toContain("confirming");
    expect(src).toContain("rotate(-90 40 40)");
    expect(src).toContain("pathLength");
    expect(src).toContain("Konfirmasi berhasil.");
    expect(src).toContain('window.open(chatUrl, "_blank", "noopener")');
    expect(src).toContain("Buka WhatsApp manual");
  });

  test("instruksi kirim hilang setelah Konfirmasi ditekan", () => {
    expect(src).toContain("!confirming");
    expect(src).toContain("Kirim kode ini dari nomor WhatsApp di atas");
  });
});
