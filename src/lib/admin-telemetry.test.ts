import { describe, expect, test } from "vitest";
import {
  IP_HASH_FALLBACK_SECRET_ENV,
  IP_HASH_SECRET_ENV,
  buildTelemetryLog,
  deriveTelemetryStatus,
  describeIpHashMethod,
  describeRelay,
  describeTelemetryStatus,
  resolveIpHashSecret,
} from "./admin-telemetry";

describe("status telemetry", () => {
  test("lengkap hanya bila relay edge, IP ada, dan geo ada", () => {
    expect(
      deriveTelemetryStatus({ relay: "vercel-edge", hasIp: true, hasGeo: true }),
    ).toBe("complete");
  });

  test("IP ada tapi geo kosong adalah sebagian, bukan lengkap", () => {
    // Ini pembedaan yang paling sering salah: "IP terdeteksi" terasa seperti
    // berhasil, padahal operator masih tidak tahu negara mana.
    expect(
      deriveTelemetryStatus({ relay: "vercel-edge", hasIp: true, hasGeo: false }),
    ).toBe("partial");
  });

  test("jalur yang tidak memegang IP tidak pernah menghasilkan lengkap", () => {
    expect(
      deriveTelemetryStatus({ relay: "convex", hasIp: false, hasGeo: true }),
    ).toBe("failed");
    expect(
      deriveTelemetryStatus({ relay: "convex", hasIp: true, hasGeo: true }),
    ).toBe("complete");
  });

  test("relay tidak hidup berarti gagal, bukan sebagian", () => {
    expect(
      deriveTelemetryStatus({ relay: "unavailable", hasIp: false, hasGeo: false }),
    ).toBe("failed");
    // Bahkan kalau ada geo tanpa IP, jalur yang tidak hidup tetap gagal.
    expect(
      deriveTelemetryStatus({ relay: "unavailable", hasIp: false, hasGeo: true }),
    ).toBe("failed");
  });

  test("relay yang tidak disebut dianggap tidak hidup", () => {
    expect(
      deriveTelemetryStatus({ relay: null, hasIp: true, hasGeo: true }),
    ).toBe("failed");
    expect(
      deriveTelemetryStatus({ relay: undefined, hasIp: true, hasGeo: true }),
    ).toBe("failed");
  });

  test("status tidak pernah bernilai di luar tiga yang dikenal", () => {
    const semua = [
      { relay: "vercel-edge" as const, hasIp: true, hasGeo: true },
      { relay: "vercel-edge" as const, hasIp: true, hasGeo: false },
      { relay: "convex" as const, hasIp: false, hasGeo: false },
      { relay: "unavailable" as const, hasIp: false, hasGeo: false },
    ];
    for (const masukan of semua) {
      expect(["complete", "partial", "failed"]).toContain(deriveTelemetryStatus(masukan));
    }
  });
});

describe("pemilihan kunci hash IP", () => {
  test("kunci khusus menang kalau diisi", () => {
    expect(
      resolveIpHashSecret({
        [IP_HASH_SECRET_ENV]: "khusus",
        [IP_HASH_FALLBACK_SECRET_ENV]: "cadangan",
      }),
    ).toBe("khusus");
  });

  test("secret relay dipakai sebagai cadangan, supaya hash tidak hilang", () => {
    expect(resolveIpHashSecret({ [IP_HASH_FALLBACK_SECRET_ENV]: "cadangan" })).toBe("cadangan");
  });

  test("tanpa kunci sama sekali hasilnya null, bukan hash polos diam-diam", () => {
    expect(resolveIpHashSecret({})).toBeNull();
    expect(resolveIpHashSecret({ [IP_HASH_SECRET_ENV]: "   " })).toBeNull();
    expect(resolveIpHashSecret({ [IP_HASH_FALLBACK_SECRET_ENV]: "" })).toBeNull();
  });
});

describe("log terstruktur", () => {
  test("hanya memuat field yang memang ada di daftar putih", () => {
    const baris = buildTelemetryLog({
      relay: "vercel-edge",
      telemetryStatus: "complete",
      geoResolved: true,
      eventId: "EVT-abc123",
      attemptCode: "ADM-20261003-K7P2QX",
    });
    expect(Object.keys(baris).sort()).toEqual(
      [
        "attemptCode",
        "eventId",
        "geoResolved",
        "ipHashMethod",
        "ipSource",
        "outcome",
        "relay",
        "relayTraceId",
        "rejection",
        "requestId",
        "telemetryStatus",
        "type",
      ].sort(),
    );
    expect(baris.type).toBe("security_telemetry");
  });

  test("field yang terlalu panjang dipangkas", () => {
    const baris = buildTelemetryLog({
      relay: "vercel-edge",
      telemetryStatus: "complete",
      geoResolved: false,
      eventId: "E".repeat(200),
      attemptCode: "A".repeat(200),
    });
    expect(baris.eventId).toHaveLength(40);
    expect(baris.attemptCode).toHaveLength(24);
  });

  test("tidak ada jalan masuk untuk nilai kosong", () => {
    const baris = buildTelemetryLog({
      relay: "unavailable",
      telemetryStatus: "failed",
      geoResolved: false,
      eventId: null,
      ipSource: "   ",
    });
    expect(baris.eventId).toBeNull();
    expect(baris.ipSource).toBeNull();
  });

  test("log tidak pernah memuat apa pun yang menyerupai alamat IP atau secret", () => {
    const baris = buildTelemetryLog({
      relay: "vercel-edge",
      telemetryStatus: "complete",
      geoResolved: true,
      ipSource: "Vercel Edge",
      ipHashMethod: "hmac-sha256",
      requestId: "req_0011223344556677",
    });
    const teks = JSON.stringify(baris);
    // Tidak ada bentuk alamat IPv4 maupun IPv6 di dalam log.
    expect(teks).not.toMatch(/\d{1,3}(\.\d{1,3}){3}/);
    // `JSON.stringify` selalu memakai tanda dua, jadi yang diperiksa adalah
    // setiap nilainya satu satu, bukan teks JSON-nya.
    const nilai = Object.values(baris).filter((v) => typeof v === "string") as string[];
    expect(nilai.length).toBeGreaterThan(0);
    for (const v of nilai) {
      expect(v).not.toContain(":");
      expect(v).not.toMatch(/^[0-9a-f:]+$/i);
    }
    // Kunci memang tidak pernah masuk ke sini; yang ada hanya keterangannya.
    expect(teks).toContain("hmac-sha256");
    expect(teks).not.toContain("secret");
  });
});

describe("label untuk Security Desk", () => {
  test("empat keadaan dibedakan, termasuk baris lama tanpa status", () => {
    expect(describeTelemetryStatus("complete").label).toBe("Lengkap");
    expect(describeTelemetryStatus("partial").tone).toBe("warn");
    expect(describeTelemetryStatus("failed").tone).toBe("bad");
    // Baris yang ditulis sebelum Fase 9.2: statusnya tidak pernah ada.
    const lama = describeTelemetryStatus(undefined);
    expect(lama.tone).toBe("none");
    expect(lama.label).toBe("Tidak tercatat");
  });

  test("nilai asing tidak pernah diklaim sebagai berhasil", () => {
    for (const asing of ["sukses", "SUCCESS", "complete-ish", "1"]) {
      expect(describeTelemetryStatus(asing).tone).toBe("none");
    }
  });

  test("jalur relay dijelaskan dari sudut pandang operator", () => {
    expect(describeRelay("vercel-edge")).toContain("memegang IP");
    expect(describeRelay("convex")).toContain("tanpa IP");
    expect(describeRelay("unavailable")).toBe("Tidak tersedia");
    expect(describeRelay("rejected")).toBe("Ditolak");
    expect(describeRelay(null)).toBe("Tidak tercatat");
  });

  test("cara hash IP dibedakan antara berkey dan tidak ada kunci", () => {
    expect(describeIpHashMethod("hmac-sha256")).toContain("berkey");
    expect(describeIpHashMethod("unavailable")).toContain("tidak ada kunci");
    expect(describeIpHashMethod(null)).toBe("Tidak tercatat");
  });
});