import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
const src = readFileSync(new URL("./otp-success.tsx", import.meta.url), "utf8");
describe("sekuens sukses OTP", () => {
  test("confetti + reduced-motion + ceklis pathLength + aria-live, tanpa setInterval", () => {
    expect(src).toContain("canvas-confetti");
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("pathLength");
    expect(src).toContain('aria-live');
    expect(src).not.toMatch(/setInterval/);
  });
  test("teks sukses persis + callback onDone", () => {
    expect(src).toContain("Verifikasi OTP Berhasil");
    expect(src).toContain("Halaman akan dialihkan secara otomatis dalam");
    expect(src).toContain("onDone");
  });
  test("onDone tepat sekali + SLOT_GAP terdokumentasi + draw reduced-motion", () => {
    expect(src).toContain("doneRef");
    expect(src).toContain("onDoneRef");
    expect(src).toContain("SLOT_GAP");
    expect(src).toContain("email-otp-dialog");
    expect(src).toMatch(/reduceMotion \? \{[^}]*opacity[^}]*\} : \{[^}]*pathLength/);
  });
});
