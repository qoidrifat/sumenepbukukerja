import { describe, expect, test } from "vitest";
import {
  deriveAttemptKey,
  derivePasscodeHash,
  encodePasscodeHash,
  maskEmail,
  maskIp,
  normalizePasscode,
  parsePasscodeHash,
  timingSafeEqual,
  trimUserAgent,
  GLOBAL_ATTEMPT_CEILING,
  MAX_ATTEMPTS,
} from "./admin-passcode";

// Passcode asli admin TIDAK BOLEH ada di repo. Yang diuji hanya nilai karangan,
// supaya berkas ini tidak pernah menjadi jalan bypass untuk hash di environment.
const PASSCODE = "contoh-passcode-uji-123456";

describe("hash passcode", () => {
  test("passcode yang benar menghasilkan hash yang sama untuk salt sama", async () => {
    const salt = new Uint8Array(16).fill(7);
    const first = await derivePasscodeHash(PASSCODE, salt, 1000);
    const second = await derivePasscodeHash(PASSCODE, salt, 1000);
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  test("satu karakter berbeda menghasilkan hash berbeda", async () => {
    const salt = new Uint8Array(16).fill(7);
    const correct = await derivePasscodeHash(PASSCODE, salt, 1000);
    const wrong = await derivePasscodeHash(PASSCODE.replace("123456", "123457"), salt, 1000);
    expect(timingSafeEqual(correct, wrong)).toBe(false);
  });

  test("salt berbeda menghasilkan hash berbeda", async () => {
    const left = await derivePasscodeHash(PASSCODE, new Uint8Array(16).fill(1), 1000);
    const right = await derivePasscodeHash(PASSCODE, new Uint8Array(16).fill(2), 1000);
    expect(timingSafeEqual(left, right)).toBe(false);
  });

  test("salt acak dipakai setiap kali hash dibuat", async () => {
    const first = parsePasscodeHash(await encodePasscodeHash(PASSCODE));
    const second = parsePasscodeHash(await encodePasscodeHash(PASSCODE));
    expect(Array.from(first!.salt)).not.toEqual(Array.from(second!.salt));
  });

  test("format env menyimpan algoritma, iterasi, salt, dan hash", async () => {
    const encoded = await encodePasscodeHash(PASSCODE);
    expect(encoded.split("$")[0]).toBe("pbkdf2-sha256");
    const parsed = parsePasscodeHash(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.iterations).toBeGreaterThan(100_000);
    expect(parsed!.hash).toHaveLength(32);
  });

  test("passcode asli tidak pernah muncul di hash yang disimpan", async () => {
    const encoded = await encodePasscodeHash(PASSCODE);
    expect(encoded).not.toContain(PASSCODE);
    expect(encoded).not.toContain("contoh-passcode-uji");
  });

  test("format rusak ditolak, bukan diteruskan ke server", () => {
    expect(parsePasscodeHash("")).toBeNull();
    expect(parsePasscodeHash("md5$1$abc$def")).toBeNull();
    expect(parsePasscodeHash("pbkdf2-sha256$0$abc$def")).toBeNull();
    expect(parsePasscodeHash("pbkdf2-sha256$abc$abc$def")).toBeNull();
  });
});

describe("perbandingan waktu-tetap", () => {
  test("hash identik dianggap cocok", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(timingSafeEqual(bytes, new Uint8Array([1, 2, 3, 4]))).toBe(true);
  });

  test("satu bit berbeda dianggap tidak cocok", () => {
    expect(
      timingSafeEqual(new Uint8Array([1, 2, 3, 4]), new Uint8Array([1, 2, 3, 5])),
    ).toBe(false);
  });

  test("panjang berbeda langsung ditolak", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("normalisasi passcode", () => {
  test("spasi tepi dibuang", () => {
    expect(normalizePasscode(`  ${PASSCODE}  `)).toBe(PASSCODE);
  });

  test("bentuk Unicode diseragamkan", () => {
    expect(normalizePasscode("ｓalsa".normalize("NFKC"))).toBe("salsa");
  });
});

describe("kunci rate limit", () => {
  test("kunci stabil untuk input yang sama dan email berbeda huruf besar", async () => {
    const input = { deviceId: "device-abc", email: "Admin@Example.Test" };
    const left = await deriveAttemptKey(input);
    const right = await deriveAttemptKey({ ...input, email: "admin@example.test" });
    expect(left).toBe(right);
  });

  test("berganti perangkat menghasilkan kunci berbeda", async () => {
    const left = await deriveAttemptKey({ deviceId: "device-abc" });
    const right = await deriveAttemptKey({ deviceId: "device-xyz" });
    expect(left).not.toBe(right);
  });

  test("kunci tidak memuat data mentah sehingga tidak bisa dibaca balik", async () => {
    const key = await deriveAttemptKey({ deviceId: "device-abc", email: "rahasia@example.test" });
    expect(key).toHaveLength(64);
    expect(key).not.toContain("rahasia");
    expect(key).not.toContain("device-abc");
  });
});

describe("penyamaran data", () => {
  test("okt terakhir IP IPv4 disembunyikan", () => {
    expect(maskIp("192.168.1.24")).toBe("192.168.1.xxx");
  });

  test("IPv6 dipangkas di batas grup kedua", () => {
    expect(maskIp("2001:db8:0:0:0:0:0:1")).toBe("2001:db8::…");
  });

  test("IP kosong menjadi null, bukan string kosong", () => {
    expect(maskIp("")).toBeNull();
    expect(maskIp(undefined)).toBeNull();
  });

  test("email disamarkan tapi domain tetap terbaca", () => {
    expect(maskEmail("adminbuku@example.test")).toBe("ad•••••••@example.test");
  });

  test("email tanpa @ tidak dipaksakan jadi bentuk apa pun", () => {
    expect(maskEmail("bukan-email")).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
  });

  test("user agent dipangkas supaya log tidak membengkak", () => {
    expect(trimUserAgent("x".repeat(500))).toHaveLength(180);
    expect(trimUserAgent("  ")).toBeNull();
  });
});

describe("batas gerbang", () => {
  test("tiga percobaan sebelum dikunci", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });

  test("plafon global longgar agar admin tidak ikut terkunci", () => {
    expect(GLOBAL_ATTEMPT_CEILING).toBeGreaterThan(MAX_ATTEMPTS * 5);
  });
});
