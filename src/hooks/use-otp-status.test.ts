/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { OTP_STATUS_TIMEOUT_MS, resolveOtpGate } from "./use-otp-status";

/**
 * Pintu OTP provisional: tombol "Masuk dengan Email" tidak boleh menunggu
 * query `otpEmail.status` tanpa batas. Aturan seragam — izinkan coba kecuali
 * server SUDAH menjawab "mati"; timeout 500ms membuka pintu provisional dan
 * validasi sungguhan terjadi saat kirim (email-otp-flow menampilkan gagal jujur).
 */

describe("resolveOtpGate", () => {
  test("batas pasti 500ms", () => {
    expect(OTP_STATUS_TIMEOUT_MS).toBe(500);
  });
  test("jawaban server selalu menang", () => {
    expect(resolveOtpGate({ enabled: true }, false)).toEqual({ enabled: true, known: true });
    expect(resolveOtpGate({ enabled: false }, false)).toEqual({ enabled: false, known: true });
    expect(resolveOtpGate({ enabled: false }, true)).toEqual({ enabled: false, known: true });
  });
  test("belum jawab + segar = tutup; belum jawab + lewat batas = provisional buka", () => {
    expect(resolveOtpGate(undefined, false)).toEqual({ enabled: false, known: false });
    expect(resolveOtpGate(undefined, true)).toEqual({ enabled: true, known: false });
  });
});

const hookSource = readFileSync(new URL("./use-otp-status.ts", import.meta.url), "utf8");

describe("hook memakai timer bare + tanpa render-phase setState (pola repo)", () => {
  test("timeout bare lewat konstanta, cleanup penuh", () => {
    expect(hookSource).toContain("useEffect");
    expect(hookSource).toContain("setTimeout(");
    expect(hookSource).toContain("OTP_STATUS_TIMEOUT_MS)");
    expect(hookSource).toContain("clearTimeout");
    expect(hookSource).not.toContain("window.setTimeout");
    expect(hookSource).not.toContain("window.clearTimeout");
  });

  test("render-phase setQueryFailed dihapus bersih", () => {
    expect(hookSource).not.toContain("setQueryFailed");
  });

  test("komentar provisional menjelaskan send-path yang memvalidasi", () => {
    expect(hookSource).toContain("provisional");
    expect(hookSource).toContain("kirim");
  });
});
