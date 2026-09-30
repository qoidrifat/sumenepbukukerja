/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { emailOtp } from "./auth/emailOtp";

/**
 * Fase 9 - regression test untuk kebocoran kredensial di jalur OTP.
 *
 * MASALAH YANG DIKUNCI DI SINI:
 *  1. `src/convex/auth/emailOtp.ts` pernah memuat kunci API penyedia sebagai
 *     literal, jadi kuncinya ikut masuk ke Git.
 *  2. `catch` yang sama melempar `new Error(JSON.stringify(error))`. Pada
 *     AxiosError, `JSON.stringify` menyalin `config.headers` - termasuk header
 *     `x-api-key` - ke pesan yang dikirim ke pemanggil `auth:signIn`, yaitu
 *     siapa pun yang tidak punya sesi.
 *
 * Bukti ukurannya ada di `tmp/qa-p9-axios-error-probe.mjs` dan di dokumen
 * `docs/security/PHASE-9-SECURITY-AUDIT.md`.
 */

const OTP_API_KEY_ENV = "VLY_EMAIL_OTP_API_KEY";
const SOURCE = new URL("./auth/emailOtp.ts", import.meta.url);

type ProviderWithSender = {
  sendVerificationRequest?: (input: { identifier: string; token: string }) => Promise<void>;
};

/** Bentuk error yang_AXIOS hasilkan: message, code, dan config bermuatan header. */
class FakeAxiosError extends Error {
  isAxiosError = true;
  config: { url: string; headers: Record<string, string> };
  code: string;
  response?: { status: number };

  constructor(status: number, headers: Record<string, string>) {
    super("Request failed with status code " + status);
    this.name = "AxiosError";
    this.code = "ERR_BAD_REQUEST";
    this.config = { url: "https://auth.freebuff.app/send_otp", headers };
    this.response = { status };
    // AxiosError menyimpan field ini sebagai properti sendiri yang bisa
    // dienumerasi, jadi `JSON.stringify` akan menyalinnya keluar. Test ini
    // sengaja meniru perilaku itu.
  }
}

const callSender = async (email = "warga@contoh.test") => {
  const provider = emailOtp as unknown as ProviderWithSender;
  if (!provider.sendVerificationRequest) throw new Error("provider tidak punya sendVerificationRequest");
  return await provider.sendVerificationRequest({ identifier: email, token: "123456" });
};

describe("Fase 9: kunci API OTP tidak ada di sumber dan tidak bocor lewat error", () => {
  const previous = process.env[OTP_API_KEY_ENV];

  beforeEach(() => {
    process.env[OTP_API_KEY_ENV] = "kunci-uji-fase9-yang-bukan-nyata";
  });

  afterEach(() => {
    if (previous === undefined) delete process.env[OTP_API_KEY_ENV];
    else process.env[OTP_API_KEY_ENV] = previous;
    vi.restoreAllMocks();
  });

  test("sumber tidak memuat kunci API sebagai literal", () => {
    const source = readFileSync(SOURCE, "utf8");
    expect(source, "kunci API tidak boleh ditulis langsung di kode").not.toMatch(/fb_email_[A-Za-z0-9]+/);
    expect(source, "kunci API harus dibaca dari environment").toContain(OTP_API_KEY_ENV);
    expect(source, "header otorisasi harus memakai nilai dari environment").toContain(OTP_API_KEY_ENV);
  });

  test("kegagalan pengiriman tidak pernah memuat kunci ke pesan error", async () => {
    const spy = vi.spyOn(axios, "post").mockImplementation(async () => {
      throw new FakeAxiosError(401, { "x-api-key": process.env[OTP_API_KEY_ENV] ?? "" });
    });

    let caught: Error | null = null;
    try {
      await callSender();
    } catch (error) {
      caught = error as Error;
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(caught, "kegagalan harus dilaporkan, bukan ditelan diam-diam").not.toBeNull();
    const message = caught?.message ?? "";
    expect(message).not.toContain("kunci-uji-fase9-yang-bukan-nyata");
    expect(message).not.toContain("x-api-key");
    expect(message).not.toContain("auth.freebuff.app");
    // Pesan untuk pengguna tetap berguna: dia tahu harus mencoba lagi.
    expect(message).toMatch(/gagal dikirim/i);
  });

  test("tanpa kunci di environment, pengiriman gagal dengan pesan yang jelas", async () => {
    delete process.env[OTP_API_KEY_ENV];
    const spy = vi.spyOn(axios, "post").mockImplementation(async () => {
      throw new Error("tidak boleh dipanggil tanpa kunci");
    });

    await expect(callSender()).rejects.toThrow(OTP_API_KEY_ENV);
    expect(spy, "tanpa kunci, tidak boleh ada permintaan ke penyedia sama sekali").not.toHaveBeenCalled();
  });
});
