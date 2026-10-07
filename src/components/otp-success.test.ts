import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
const src = readFileSync(new URL("./otp-success.tsx", import.meta.url), "utf8");
describe("sekuens sukses OTP", () => {
  test("gsap timeline + reduced-motion + ceklis pathLength + aria-live, tanpa setInterval/confetti", () => {
    expect(src).toContain('from "gsap"');
    expect(src).toContain("gsap.timeline");
    expect(src).not.toContain("canvas-confetti");
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
    expect(src).toContain("email-otp-flow");
    expect(src).toMatch(/reduceMotion \? \{[^}]*opacity[^}]*\} : \{[^}]*pathLength/);
  });

  test("ring digambar berlawanan arah jarum jam dari jam 12", () => {
    expect(src).toContain("scale(-1 1)");
    expect(src).toContain("BERLAWANAN");
  });

  test("orbit digit + badge Terverifikasi + bubbles deterministik", () => {    expect(src).toContain("orbit");
    expect(src).toContain("digits");
    expect(src).toContain("Terverifikasi");
    expect(src).toContain("getOrbitPosition");
    expect(src).toContain("getBubbleVector");
    expect(src).not.toMatch(/Math\.random\(/);
  });

  test("fase count 3 detik: angka + gradasi dari satu nilai + ceklis 3 detik", () => {
    expect(src).toContain("countProgress");
    expect(src).toContain("countNumber");
    expect(src).toContain("countWidth");
    expect(src).toContain("from-blue-700");
    expect(src).toContain("to-sky-400");
    expect(src).toContain("duration: 3");
    expect(src).toContain("useState(13)");
  });
});
