import { describe, expect, test } from "vitest";
import {
  MAX_SENDS_PER_HOUR,
  MAX_VERIFY_ATTEMPTS,
  OTP_FROM,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  normalizeEmail,
  sha256Hex,
} from "./otp-email";
import { renderOtpEmailHtml } from "../convex/emailTemplates";

describe("otp-email constants", () => {
  test("batas sesuai kontrak global", () => {
    expect(OTP_TTL_MS).toBe(600_000);
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
    expect(MAX_SENDS_PER_HOUR).toBe(5);
    expect(MAX_VERIFY_ATTEMPTS).toBe(5);
    expect(OTP_FROM).toBe("Sumenep Buku Kerja <noreply@sumenepbukukerja.com>");
  });
});

describe("normalizeEmail", () => {
  test("trim + lowercase", () => {
    expect(normalizeEmail("  Warga@Example.ID ")).toBe("warga@example.id");
  });
});

describe("sha256Hex", () => {
  test("64 hex lowercase dan stabil", async () => {
    const a = await sha256Hex("123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("123456")).toBe(a);
    expect(await sha256Hex("123457")).not.toBe(a);
  });
});

describe("renderOtpEmailHtml", () => {
  test("semua token terganti, tak ada sisa placeholder", () => {
    const html = renderOtpEmailHtml("482913", 2026);
    expect(html).toContain("482913");
    expect(html).toContain("2026");
    expect(html).not.toContain("OTP_CODE");
    expect(html).not.toContain("CURRENT_YEAR");
    expect(html).toContain("noreply@sumenepbukukerja.com".slice(0, 8));
  });
});
