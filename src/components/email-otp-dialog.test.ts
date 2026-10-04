import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
const src = readFileSync(new URL("./email-otp-dialog.tsx", import.meta.url), "utf8");
describe("dialog OTP", () => {
  test("memakai Dialog + InputOTP 6 slot + focusRing kanonis", () => {
    expect(src).toContain("<Dialog");
    expect(src).toContain("maxLength={6}");
    expect(src).toContain('from "@/lib/focus-ring"');
    expect(src).not.toMatch(/setInterval/);
    expect(src).toContain('role="alert"');
  });
  test("slot punya layoutId untuk sekuens merge Task 5", () => {
    expect(src).toContain("otp-slot-");
    expect(src).toContain("layoutId");
  });
  test("tak ada kunci/secret di sumber", () => {
    expect(src).not.toMatch(/re_[A-Za-z0-9]/);
    expect(src).not.toContain("RESEND_API_KEY");
  });
  test("tahap sukses dirender di dalam Dialog yang sama (Fase 9.5)", () => {
    // Kontrak Task 6: setelah kode benar, konten tahap kode DIGANTI konten
    // sukses di DialogContent yang sama - bukan Dialog baru bersarang.
    // `onVerified` tetap dipanggil tepat sekali, dari ujung sekuens sukses.
    expect(src).toContain("OtpSuccess");
    expect(src).toContain('"success"');
    expect(src).toContain("onVerified");
    // Dialog-nya tetap satu: tidak ada Dialog kedua di berkas ini.
    expect((src.match(/<Dialog[\s>]/g) ?? []).length).toBe(1);
  });
});
