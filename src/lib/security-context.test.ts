import { describe, expect, it } from "vitest";
import {
  describeFailure,
  deriveSessionFingerprint,
  maskFingerprint,
  maskIpForDisplay,
  maskRequestId,
  normalizeIp,
  parseUserAgent,
  resolveClientIp,
  sanitizeReferrer,
  securityStatus,
} from "./security-context";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("parseUserAgent", () => {
  it("membaca Chrome di Windows", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    );
    expect(parsed.browser).toBe("Chrome");
    expect(parsed.browserVersion).toBe("154");
    expect(parsed.os).toBe("Windows");
    expect(parsed.osVersion).toBe("10/11");
    expect(parsed.deviceType).toBe("Desktop");
  });

  it("membaca Safari di iPhone sebagai Mobile", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    );
    expect(parsed.browser).toBe("Safari");
    expect(parsed.os).toBe("iOS");
    expect(parsed.osVersion).toBe("18.2");
    expect(parsed.deviceType).toBe("Mobile");
  });

  it("mengenali Edge sebelum Chrome", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0",
    );
    expect(parsed.browser).toBe("Microsoft Edge");
    expect(parsed.browserVersion).toBe("154");
  });

  it("mengenali tablet Android tanpa_suffix Mobile", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    );
    expect(parsed.os).toBe("Android");
    expect(parsed.osVersion).toBe("14");
    expect(parsed.deviceType).toBe("Tablet");
  });

  it("mengenali Firefox di Linux", () => {
    const parsed = parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0");
    expect(parsed.browser).toBe("Firefox");
    expect(parsed.os).toBe("Linux");
    expect(parsed.deviceType).toBe("Desktop");
  });

  it("mengembalikan null, bukan tebakan, untuk user agent asing", () => {
    const parsed = parseUserAgent("curl/8.5.0");
    expect(parsed.browser).toBeNull();
    expect(parsed.deviceType).toBe("Unknown");
  });

  it("tidak meledak untuk input kosong", () => {
    expect(parseUserAgent("").deviceType).toBe("Unknown");
    expect(parseUserAgent(undefined).os).toBeNull();
  });
});

describe("normalizeIp", () => {
  it("menerima IPv4 dan membuang port", () => {
    expect(normalizeIp("103.21.44.9")).toBe("103.21.44.9");
    expect(normalizeIp("103.21.44.9:51234")).toBe("103.21.44.9");
  });

  it("menerima IPv6", () => {
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
  });

  it("menolak nilai yang bukan IP", () => {
    expect(normalizeIp("bukan-ip")).toBeNull();
    expect(normalizeIp("999.1.1.1")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });
});

describe("resolveClientIp", () => {
  it("mendahulukan CF-Connecting-IP", () => {
    const result = resolveClientIp(
      headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }),
    );
    expect(result).toEqual({ ip: "203.0.113.7", source: "CF-Connecting-IP" });
  });

  it("memakai entri paling kiri X-Forwarded-For", () => {
    const result = resolveClientIp(
      headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1, 10.0.0.2" }),
    );
    expect(result).toEqual({ ip: "198.51.100.1", source: "X-Forwarded-For" });
  });

  it("mengembalikan Unknown saat tidak ada header IP", () => {
    expect(resolveClientIp(headers({ "user-agent": "curl/8" }))).toEqual({
      ip: null,
      source: "Unknown",
    });
  });

  it("melewati header yang isinya tidak valid lalu mencoba yang lain", () => {
    const result = resolveClientIp(
      headers({ "x-real-ip": "not-an-ip", "x-forwarded-for": "198.51.100.9" }),
    );
    expect(result).toEqual({ ip: "198.51.100.9", source: "X-Forwarded-For" });
  });
});

describe("sanitizeReferrer", () => {
  it("membuang query string dan fragment", () => {
    expect(sanitizeReferrer("https://contoh.id/auth?token=rahasia#lingkungan")).toBe(
      "https://contoh.id/auth",
    );
  });

  it("menolak URL rusak atau terlalu panjang", () => {
    expect(sanitizeReferrer("bukan-url")).toBeNull();
    expect(sanitizeReferrer(`https://contoh.id/${"a".repeat(400)}`)).toBeNull();
    expect(sanitizeReferrer("")).toBeNull();
  });
});

describe("masking", () => {
  it("menyembunyikan oktet terakhir IPv4", () => {
    expect(maskIpForDisplay("103.21.44.9")).toBe("103.21.44.xxx");
  });

  it("menyembunyikan ekor IPv6", () => {
    expect(maskIpForDisplay("2001:db8:abcd:1234::9")).toBe("2001:db8::…");
  });

  it("hanya menyisakan 4 karakter terakhir sidik jari", () => {
    expect(maskFingerprint("sfp_0123456789abcdef")).toBe("••••cdef");
  });

  it("menyisakan awal dan akhir request id", () => {
    expect(maskRequestId("req_7f4c9ab2e1d84f0a92a1")).toBe("req_7f4••••92a1");
  });
});

describe("securityStatus", () => {
  it("Blocked ketika terkunci", () => {
    expect(securityStatus({ outcome: "locked", failedInWindow: 3, locked: true, maxAttempts: 3 })).toBe(
      "Blocked",
    );
  });

  it("Rate limited mendekati batas", () => {
    expect(securityStatus({ outcome: "failed", failedInWindow: 2, locked: false, maxAttempts: 3 })).toBe(
      "Rate limited",
    );
  });

  it("Normal untuk percobaan pertama yang gagal", () => {
    expect(securityStatus({ outcome: "failed", failedInWindow: 1, locked: false, maxAttempts: 3 })).toBe(
      "Normal",
    );
  });

  it("Normal untuk percobaan berhasil", () => {
    expect(securityStatus({ outcome: "success", failedInWindow: 0, locked: false, maxAttempts: 3 })).toBe(
      "Normal",
    );
  });
});

describe("describeFailure", () => {
  it("memetakan alasan server ke label yang aman", () => {
    expect(describeFailure("wrong_passcode")).toBe("Passcode salah");
    expect(describeFailure("rate_limited")).toBe("Rate limit tercapai");
  });

  it("tidak pernah membocorkan keberadaan akun", () => {
    expect(describeFailure("user_not_found")).toBe("Tidak diketahui");
    expect(describeFailure(undefined)).toBe("Tidak diketahui");
  });
});

describe("deriveSessionFingerprint", () => {
  it("stabil untuk input yang sama dan berbeda untuk salt berbeda", async () => {
    const a = await deriveSessionFingerprint("device-abc", "salt-1");
    const b = await deriveSessionFingerprint("device-abc", "salt-1");
    const c = await deriveSessionFingerprint("device-abc", "salt-2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("sfp_")).toBe(true);
    expect(a).not.toContain("device-abc");
  });
});
