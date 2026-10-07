import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * Alur OTP email (dipakai halaman `/auth/email`).
 *
 * Diekstrak dari `EmailOtpDialog` yang dihapus: kontrak perilaku yang sama
 * (6 slot, layoutId untuk sekuens merge, cincin fokus kanonis, tanpa
 * `setInterval`, tanpa secret), minus pembungkus Dialog — plus adaptasi
 * sumber 1 (glow+pop kotak terisi, kepala/kirim-ulang memudar saat
 * verifikasi, goyang saat kode salah).
 */
const src = readFileSync(new URL("./email-otp-flow.tsx", import.meta.url), "utf8");

describe("kontrak alur OTP", () => {
  test("6 slot + layoutId merge + fokus kanonis, tanpa setInterval/secret", () => {
    expect(src).toContain("maxLength={6}");
    expect(src).toContain("otp-slot-");
    expect(src).toContain("layoutId");
    expect(src).toContain('from "@/lib/focus-ring"');
    expect(src).not.toMatch(/setInterval/);
    expect(src).toContain('role="alert"');
  });

  test("tak ada Dialog dan tak ada kunci di sumber", () => {
    expect(src).not.toContain("<Dialog");
    expect(src).not.toContain("onOpenChange");
    expect(src).not.toMatch(/re_[A-Za-z0-9]/);
    expect(src).not.toContain("RESEND_API_KEY");
  });

  test("sukses memanggil onVerified tepat sekali via OtpSuccess", () => {
    expect(src).toContain("OtpSuccess");
    expect(src).toContain("onVerified");
    expect(src).toContain("digits={code}");
  });

  test("kotak terisi menyala + memudar saat verifikasi + goyang saat salah", () => {
    expect(src).toContain("0_0_22px_rgba(37,99,235,0.5)");
    expect(src).toContain("useAnimation");
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("x: [0, -12, 12, -8, 8, 0]");
  });
});
