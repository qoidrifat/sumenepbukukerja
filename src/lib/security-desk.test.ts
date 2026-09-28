import { describe, expect, test } from "vitest";

import {
  describeIpSource,
  deriveSecuritySignals,
  normalizeIp,
  normalizeIpDetailed,
  resolveClientIp,
} from "./security-context";
import { assessPasscode, PASSCODE_MIN_LENGTH } from "./admin-passcode";
import { convexSiteUrl } from "./admin-gate-client";

/**
 * Uji keamanan untuk resolver IP, sinyal, dan kebijakan passcode.
 *
 * Fokusnya bukan "bisa mengembalikan nilai", tapi "nilai palsu tidak bisa menang".
 * Semua kasus di sini punya skenario yang pernah dipakai untuk menipu sistem.
 */

const headers = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
});

describe("normalisasi IP", () => {
  test("IPv4, IPv6, dan bentuk dengan port", () => {
    expect(normalizeIp("103.21.44.9")).toBe("103.21.44.9");
    expect(normalizeIp("103.21.44.9:51234")).toBe("103.21.44.9");
    expect(normalizeIp("2001:4860:4860::8888")).toBe("2001:4860:4860::8888");
    expect(normalizeIp("[2001:4860:4860::8888]:443")).toBe("2001:4860:4860::8888");
  });

  test("IPv4-mapped dinormalkan ke IPv4 supaya tidak terhitung dua kali", () => {
    expect(normalizeIpDetailed("::ffff:192.0.2.1")).toEqual({
      ip: "192.0.2.1",
      family: "IPv4",
      mappedFromIpv6: true,
    });
  });

  test("menolak bentuk yang salah, bukan hanya yang bukan IP sama sekali", () => {
    // Regex longar dulu menerima beberapa dari nilai-nilai ini.
    for (const bad of [
      "999.1.1.1",
      "1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7:",
      "gg::1",
      "2001:db8::1::2",
      "12345::1",
      "'.1.2.3'",
    ]) {
      expect(normalizeIp(bad), bad).toBeNull();
    }
  });

  test("zone id dibuang, bukan ditolak", () => {
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeIp("2001:4860:4860::8888%eth0")).toBe("2001:4860:4860::8888");
  });

  test("nilai yang sangat panjang ditolak tanpa diproses", () => {
    expect(normalizeIp(`1.2.3.${"9".repeat(60)}`)).toBeNull();
    expect(normalizeIp("a".repeat(200))).toBeNull();
  });
});

describe("resolver IP dan trust boundary", () => {
  test("header edge menang atas XFF yang dikirim klien", () => {
    const result = resolveClientIp(
      headers({
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2",
        "true-client-ip": "9.9.9.9",
        "x-real-ip": "8.8.8.8",
      }),
    );
    expect(result).toMatchObject({
      ip: "203.0.113.7",
      source: "CF-Connecting-IP",
      trust: "edge",
      chainLength: 3,
    });
  });

  test("tanpa header edge, entri paling kanan XFF yang dipakai", () => {
    // Klien menambah entri di sebelah kiri. Mengambil sisi kiri artinya
    // mengambil nilai yang paling mudah dikendalikan penyerang.
    expect(
      resolveClientIp(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" })),
    ).toMatchObject({ ip: "10.0.0.2", trust: "chain" });
  });

  test("XFF berisi sampah tidak membuat resolver menebak", () => {
    const result = resolveClientIp(headers({ "x-forwarded-for": "unknown, , junk" }));
    expect(result.ip).toBeNull();
    expect(result.source).toBe("Unknown");
    expect(result.trust).toBe("unknown");
  });

  test("tidak ada sumber tepercaya menghasilkan Unknown, bukan angka tebakan", () => {
    const result = resolveClientIp(headers({ "user-agent": "curl/8", "accept": "*/*" }));
    expect(result).toMatchObject({ ip: null, family: "unknown", proxyDetected: false });
  });

  test("describeIpSource tidak pernah membocorkan nilai mentah", () => {
    expect(describeIpSource("CF-Connecting-IP")).toBe("Header edge (Cloudflare)");
    expect(describeIpSource("X-Forwarded-For")).toBe("Rantai proxy (X-Forwarded-For)");
    expect(describeIpSource("Unknown")).toBe("Tidak terdeteksi");
    expect(describeIpSource(null)).toBe("Tidak terdeteksi");
  });
});

describe("sinyal keamanan", () => {
  const base = { maxAttempts: 3 };

  test("IP pertama kali dilihat ditandai baru", () => {
    const signals = deriveSecuritySignals({
      ...base,
      ipHash: "abc",
      seenIps: new Set<string>(),
      browser: "Chrome",
      os: "Windows",
      deviceType: "Desktop",
    });
    expect(signals).toContain("NEW_IP");
    expect(signals).toContain("NEW_DEVICE");
  });

  test("IP yang sudah dikenal tidak ditandai baru", () => {
    const signals = deriveSecuritySignals({
      ...base,
      ipHash: "abc",
      seenIps: new Set(["abc"]),
      browser: "Chrome",
      os: "Windows",
      deviceType: "Desktop",
      previousSameSession: { ipHash: "abc", browser: "Chrome", os: "Windows" },
    });
    expect(signals).not.toContain("NEW_IP");
    expect(signals).not.toContain("NEW_DEVICE");
  });

  test("perubahan pada sesi sebelumnya menghasilkan sinyal yang tepat", () => {
    const signals = deriveSecuritySignals({
      ...base,
      ipHash: "new",
      seenIps: new Set(["new"]),
      browser: "Firefox",
      os: "macOS",
      timezone: "Asia/Makassar",
      country: "ID",
      previousSameSession: {
        ipHash: "old",
        browser: "Chrome",
        os: "Windows",
        timezone: "Asia/Jakarta",
        country: "SG",
      },
    });
    expect(signals).toEqual(
      expect.arrayContaining(["IP_CHANGED", "NEW_BROWSER", "NEW_OS", "NEW_TIMEZONE", "NEW_GEO"]),
    );
  });

  test("serangan gagal beruntun dan percobaan cepat dikenali", () => {
    const signals = deriveSecuritySignals({
      ...base,
      ipHash: "abc",
      seenIps: new Set(["abc"]),
      failedInWindow: 2,
      rapidAttempts: 4,
      proxyDetected: true,
    });
    expect(signals).toContain("MULTIPLE_FAILED");
    expect(signals).toContain("RAPID_RETRY");
    expect(signals).toContain("PROXY_SEEN");
  });

  test("sinyal tidak pernah memakai kata vonis", () => {
    const signals = deriveSecuritySignals({
      ...base,
      ipHash: "abc",
      seenIps: new Set<string>(),
      failedInWindow: 9,
      rapidAttempts: 99,
    });
    const words = signals.join(" ").toLowerCase();
    for (const banned of ["attacker", "hacker", "intruder", "penyerang", "penyusup"]) {
      expect(words).not.toContain(banned);
    }
  });
});

describe("kebijakan passcode", () => {
  test("passcode lemah ditolak dengan alasan yang bisa ditindaklanjuti", () => {
    expect(assessPasscode("abc").ok).toBe(false);
    expect(assessPasscode("password").ok).toBe(false);
    expect(assessPasscode("12345678").ok).toBe(false);
    const short = assessPasscode("ab1!");
    expect(short.issues[0]).toContain(String(PASSCODE_MIN_LENGTH));
  });

  test("passcode yang sudah dipakai tidak boleh dipakai ulang", () => {
    const result = assessPasscode("Sumenep#2026", "Sumenep#2026");
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("harus berbeda");
  });

  test("passcode baik diterima dan diberi tingkat kekuatan", () => {
    const fair = assessPasscode("Sumenep2026!");
    expect(fair.ok).toBe(true);
    const strong = assessPasscode("GaramSumpenep#2026!");
    expect(strong.ok).toBe(true);
    expect(strong.level).toBe("strong");
  });

  test("normalisasi dipakai sebelum penilaian, spasi ekstra tidak berpengaruh", () => {
    expect(assessPasscode("  Sumenep#2026  ", "  Sumenep#2026  ").ok).toBe(false);
  });
});

describe("origin beacon", () => {
  test("custom HTTP route hanya hidup di domain .convex.site", () => {
    // Bug nyata: memakai .convex.cloud membuat fetch membalas 404, jadi IP
    // server tidak pernah tercatat sama sekali.
    expect(convexSiteUrl("https://rare-scorpion-625.convex.cloud")).toBe(
      "https://rare-scorpion-625.convex.site",
    );
    expect(convexSiteUrl("https://abc-123.convex.cloud")).toBe("https://abc-123.convex.site");
  });

  test("URL yang sudah site atau tidak cocok tidak dirusak", () => {
    expect(convexSiteUrl("https://rare-scorpion-625.convex.site")).toBe(
      "https://rare-scorpion-625.convex.site",
    );
    expect(convexSiteUrl("https://localhost:3210")).toBe("https://localhost:3210");
  });
});
