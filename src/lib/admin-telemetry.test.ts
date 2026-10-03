import { describe, expect, test } from "vitest";
import { RELAY_SECRET_ENV } from "./admin-context-relay";
import {
  buildTelemetryLog,
  deriveTelemetryStatus,
  describeIpHashMethod,
  describeRelay,
  describeTelemetryStatus,
  ipHashMethodFor,
} from "./admin-telemetry";
import {
  IP_HASH_FALLBACK_SECRET_ENV,
  IP_HASH_SECRET_ENV,
  resolveIpHashSecret,
} from "./admin-ip-hash";

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
  test("kunci khusus menang, dan hanya itu, di produksi maupun di luar", () => {
    for (const production of [true, false]) {
      const hasil = resolveIpHashSecret(
        {
          [IP_HASH_SECRET_ENV]: "khusus",
          [IP_HASH_FALLBACK_SECRET_ENV]: "cadangan",
        },
        { production },
      );
      expect(hasil.secret).toBe("khusus");
      expect(hasil.source).toBe("dedicated");
      expect(hasil.reason).toBe("ok");
    }
  });

  test("produksi tanpa kunci khusus GAGAL TERTUTUP, bukan memakai secret relay", () => {
    // Ini aturan yang diminta Fase 9.3. Secret relay tugasnya membuktikan
    // identitas pengirim; memakainya juga sebagai kunci hash IP berarti satu
    // kebocoran membuka dua hal sekaligus. Di produksi jalan itu ditutup:
    // lebih baik `ipHash` kosong dan tercatat secara jujur daripada hash yang
    // rahasianya bocor ke tempat lain.
    const hasil = resolveIpHashSecret(
      { [IP_HASH_FALLBACK_SECRET_ENV]: "rahasia-relay" },
      { production: true },
    );
    expect(hasil.secret).toBeNull();
    expect(hasil.source).toBe("none");
    expect(hasil.reason).toBe("missing_dedicated");
    // Dan cara yang tercatat harus menyebut kesalahan konfigurasi, bukan
    // menyalahkan relay yang sebenarnya hidup.
    expect(ipHashMethodFor(hasil, false)).toBe("missing-in-production");
  });

  test("di luar produksi secret relay boleh dipakai sebagai cadangan", () => {
    const hasil = resolveIpHashSecret({ [IP_HASH_FALLBACK_SECRET_ENV]: "cadangan" });
    expect(hasil.secret).toBe("cadangan");
    expect(hasil.source).toBe("relay-fallback");
    expect(ipHashMethodFor(hasil, true)).toBe("hmac-sha256-fallback");
  });

  test("tanpa kunci sama sekali hasilnya null, bukan hash polos diam-diam", () => {
    expect(resolveIpHashSecret({}).secret).toBeNull();
    expect(resolveIpHashSecret({}).reason).toBe("missing_all");
    expect(resolveIpHashSecret({ [IP_HASH_SECRET_ENV]: "   " }).secret).toBeNull();
    expect(resolveIpHashSecret({ [IP_HASH_FALLBACK_SECRET_ENV]: "" }).secret).toBeNull();
    // Di produksi jalur cadangan tidak dijalankan sama sekali, jadi jawabannya
    // tetap `missing_dedicated` walau secret relay juga kosong. Itu memang
    // benar: tindakan operator sama-sama sama, yaitu mengisi
    // `SERVER_IP_HASH_SECRET`. `missing_all` hanya muncul di luar produksi.
    const produksi = resolveIpHashSecret({}, { production: true });
    expect(produksi.secret).toBeNull();
    expect(ipHashMethodFor(produksi, false)).toBe("missing-in-production");
  });

  test("huruf nama environment dikunci, bukan hanya simbolnya", () => {
    // Uji lain memakai kedua konstanta secara simbolis, jadi nama yang salah
    // ketik di dalam konstanta tidak akan pernah menggagalkan mereka. Tanpa
    // penguncian di sini, `ADMIN_CONTEyangT_RELAY_SECRET` lolos ke produksi,
    // cadangan hash IP tidak pernah aktif, dan `ipHash` hilang hanya karena
    // satu environment belum diisi.
    expect(IP_HASH_SECRET_ENV).toBe("SERVER_IP_HASH_SECRET");
    // Cadangan sengaja menunjuk nama yang sama dengan secret relay, jadi
    // satu sumber kebenaran dan tidak bisa berbeda diam-diam.
    expect(IP_HASH_FALLBACK_SECRET_ENV).toBe(RELAY_SECRET_ENV);
    expect(RELAY_SECRET_ENV).toBe("ADMIN_CONTEXT_RELAY_SECRET");
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

  test("cara hash IP dibedakan, termasuk kunci cadangan dan produksi salah konfigurasi", () => {
    expect(describeIpHashMethod("hmac-sha256")).toContain("kunci khusus");
    // Kunci cadangan harus terbaca sebagai penyimpangan, bukan konfigurasi wajar.
    expect(describeIpHashMethod("hmac-sha256-fallback")).toContain("cadangan");
    expect(describeIpHashMethod("hmac-sha256-fallback")).toContain("bukan untuk produksi");
    // Dan produksi tanpa kunci khusus harus menyebut nama environment yang
    // belum diisi, supaya operator tahu apa yang harus dikerjakan.
    expect(describeIpHashMethod("missing-in-production")).toContain("SERVER_IP_HASH_SECRET");
    expect(describeIpHashMethod("unavailable")).toContain("tidak ada kunci");
    expect(describeIpHashMethod(null)).toBe("Tidak tercatat");
  });
});