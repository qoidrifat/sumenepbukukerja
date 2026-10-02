/// <reference types="vite/client" />
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import {
  PHONE_DATA_KEY_ENV,
  decryptPhone,
  encryptPhone,
  isEncryptedPhone,
  maskPhoneForAdmin,
  normalizePhone,
  phoneKeyMaterial,
  phoneLookupKey,
} from "../lib/phone-crypto";

/**
 * FASE 16/17 - kontrak enkripsi nomor warga.
 *
 * Yang diuji di sini bukan hanya "enkripsi lalu dekripsi mengembalikan teks
 * yang sama" - itu pengujian paling mudah dan hampir tidak memblokir apa pun.
 * Yang diuji adalah sifat yang BENAR-BENAR menentukan apakah enkripsi ini
 * berguna:
 *
 *   - ciphertext benar-benar tidak memuat nomor;
 *   - ciphertext yang dimanipulasi DITOLAK, bukan mengembalikan sampah;
 *   - kunci yang salah DITOLAK;
 *   - kunci yang tidak ada membuat penulisan gagal, bukan diam-diam storing
 *     polos (ini kegagalan enkripsi yang paling umum dan paling berbahaya);
 *   - kunci pencarian HMAC tidak bisa dibalik menjadi nomor;
 *   - dua kunci turunan tidak bisa saling menggantikan;
 *   - baris lama yang belum dimigrasi tetap terbaca;
 *   - migrasi idempoten dan tidak pernah menghapus data.
 */

const modules = import.meta.glob("./**/*.ts");

/** Kunci uji yang selalu sama di setiap pemanggilan. Bukan kunci produksi. */
const TEST_KEY_B64 = btoa(
  String.fromCharCode(...new Uint8Array(Array.from({ length: 32 }, (_, i) => i + 1))),
);

const otherKeyB64 = btoa(
  String.fromCharCode(...new Uint8Array(Array.from({ length: 32 }, (_, i) => 200 - i))),
);

const master = () => phoneKeyMaterial({ [PHONE_DATA_KEY_ENV]: TEST_KEY_B64 });

const now = () => Date.now();

describe("phone-crypto: primitif", () => {
  test("normalisasi menyamakan beberapa bentuk nomor yang sama", async () => {
    expect(normalizePhone("081234567890")).toBe("6281234567890");
    expect(normalizePhone("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizePhone("6281234567890")).toBe("6281234567890");
    // Terlalu pendek atau bukan nomor sama sekali.
    expect(normalizePhone("123")).toBeUndefined();
    expect(normalizePhone("bukan nomor")).toBeUndefined();
  });

  test("ciphertext tidak memuat nomor dan bisa dibalik hanya dengan kunci", async () => {
    const plain = "6281234567890";
    const encrypted = await encryptPhone(plain, master());

    expect(isEncryptedPhone(encrypted)).toBe(true);
    // Kegagalan paling mendasar: kalau plaintext bocor ke storage, seluruh
    // mekanisme ini tidak berarti apa-apa.
    expect(encrypted).not.toContain(plain);
    expect(encrypted).not.toContain("6281234567890");
    // Dan tidak boleh kelihatan seperti nomor apa pun.
    expect(encrypted).not.toMatch(/\d{10,}/);

    expect(await decryptPhone(encrypted, master())).toBe(plain);
  });

  test("IV berbeda pada setiap pemanggilan", async () => {
    const plain = "6281234567890";
    const a = await encryptPhone(plain, master());
    const b = await encryptPhone(plain, master());
    // IV yang sama persis dengan kunci sama akan membatalkan jaminan GCM.
    // Ini regresi untuk kesalahan yang sangat mahal dan sangat mudah terjadi.
    expect(a).not.toBe(b);
    expect(await decryptPhone(a, master())).toBe(await decryptPhone(b, master()));
  });

  test("ciphertext yang dimanipulasi ditolak, bukan mengembalikan sampah", async () => {
    const encrypted = await encryptPhone("6281234567890", master());
    const parts = encrypted.split(".");
    // Putar satu karakter pada bagian ciphertext.
    const body = parts[2];
    const flipped = `${body.slice(0, -1)}${body.slice(-1) === "A" ? "B" : "A"}`;

    await expect(
      decryptPhone(`${parts[0]}.${parts[1]}.${flipped}`, master()),
    ).rejects.toBeTruthy();
  });

  test("kunci yang salah tidak bisa mendekripsi", async () => {
    const encrypted = await encryptPhone("6281234567890", master());
    const other = phoneKeyMaterial({ [PHONE_DATA_KEY_ENV]: otherKeyB64 });
    await expect(decryptPhone(encrypted, other)).rejects.toBeTruthy();
  });

  test("dua turunan kunci tidak bisa saling menggantikan", async () => {
    // Kalau kunci pencarian bisa dipakai sebagai kunci enkripsi (atau
    // sebaliknya), kebocoran satu langsung membuka yang lain.
    const plain = "6281234567890";
    const lookup = await phoneLookupKey(plain, master());
    await expect(decryptPhone(lookup, master())).rejects.toBeTruthy();
    expect(isEncryptedPhone(lookup)).toBe(false);

    const encrypted = await encryptPhone(plain, master());
    await expect(
      decryptPhone(encrypted, phoneKeyMaterial({ [PHONE_DATA_KEY_ENV]: otherKeyB64 })),
    ).rejects.toBeTruthy();
  });

  test("kunci pencarian stabil, singkat, dan tidak bisa dibalik", async () => {
    const a = await phoneLookupKey("6281234567890", master());
    const b = await phoneLookupKey("6281234567890", master());
    // Stabil: dua pemanggilan untuk nomor sama harus menghasilkan kunci sama,
    // kalau tidak pencarian lewat indeks tidak pernah cocok.
    expect(a).toBe(b);
    // Tidak memuat nomor.
    expect(a).not.toContain("6281234567890");
    // Bentuknya jelas dan ukurannya wajar untuk sebuah indeks.
    expect(a).toMatch(/^bkp1\.[A-Za-z0-9_-]+$/);
    expect(a.length).toBeLessThan(40);
  });

  test("bentuk tersamar menyimpan cukup untuk dicocokkan, tidak lebih", () => {
    expect(maskPhoneForAdmin("081234567890")).toBe("6281****890");
    // Nomor yang tidak lolos validasi TIDAK diberi bentuk tersamar: menampilkan
    // "62****" untuk input acak akan menyesatkan pembaca panel admin.
    expect(maskPhoneForAdmin("628123")).toBe("tidak valid");
    expect(maskPhoneForAdmin("bukan nomor")).toBe("tidak valid");
  });

  test("kunci yang tidak dikonfigurasi menggagalkan operasi, bukan meloloskan polos", () => {
    // Fail-closed adalah seluruh alasan modul ini ada. Kalau kunci kosong
    // berarti "simpan saja polos", data baru akan masuk tanpa enkripsi tanpa
    // ada yang repot.
    expect(() => phoneKeyMaterial({})).toThrow();
    expect(() => phoneKeyMaterial({ [PHONE_DATA_KEY_ENV]: "  " })).toThrow();
    expect(() =>
      phoneKeyMaterial({ [PHONE_DATA_KEY_ENV]: "bukan-base64-valid!!" }),
    ).toThrow();
    // Panjang salah harus ditolak, bukan dipotong diam-diam.
    expect(() => phoneKeyMaterial({ [PHONE_DATA_KEY_ENV]: btoa("pendek") })).toThrow();
  });
});

describe("phoneMigration: perilaku migrasi", () => {
  // Kunci dipasang per-describe, bukan di level modul, supaya test file lain
  // yang berjalan di worker yang sama tidak ikut melihatnya.
  let savedKey: string | undefined;
  beforeAll(() => {
    savedKey = process.env[PHONE_DATA_KEY_ENV];
    process.env[PHONE_DATA_KEY_ENV] = TEST_KEY_B64;
  });
  afterAll(() => {
    if (savedKey === undefined) delete process.env[PHONE_DATA_KEY_ENV];
    else process.env[PHONE_DATA_KEY_ENV] = savedKey;
  });

  async function seedLegacy(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      const userId = await db.insert("users", {
        email: "warga-legacy@sumenep.co.id",
        emailVerificationTime: now(),
        name: "Warga Lama",
        createdAt: now(),
        updatedAt: now(),
      });
      const vendorId = await db.insert("vendors", {
        slug: "usaha-legacy",
        name: "Usaha",
        category: "Kuliner",
        description: "Deskripsi.",
        address: "Jl. Uji",
        landmark: "anom",
        price: "Rp20.000",
        hours: "Setiap hari",
        phone: "6289999999999",
        rating: "4.5",
        accent: "from-blue-500 to-blue-700",
        mark: "UU",
        tags: [],
        status: "active",
        createdAt: now(),
        updatedAt: now(),
      });
      const preferenceId = await db.insert("notificationPreferences", {
        userId,
        whatsappUpdates: true,
        whatsappPhone: "6281234567890",
        whatsappOptInAt: now(),
        updatedAt: now(),
      });
      const claimId = await db.insert("listingClaims", {
        vendorId,
        requesterId: userId,
        whatsappPhone: "6281234567890",
        email: "warga-legacy@sumenep.co.id",
        businessAddress: "Alamat usaha",
        status: "pending",
        createdAt: now(),
        updatedAt: now(),
      });
      return { userId, vendorId, preferenceId, claimId };
    });
  }

  test("laporan menghitung baris polos dan sudah terenkripsi", async () => {
    const t = convexTest(schema, modules);
    await seedLegacy(t);

    const before = await t.query(internal.phoneMigration.report, {});
    expect(before.notificationPreferences.legacy).toBe(1);
    expect(before.listingClaims.legacy).toBe(1);
    expect(before.remainingLegacy).toBe(2);
  });

  test("migrasi preferensi dan klaim, kolom polos TIDAK dihapus", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedLegacy(t);

    const prefs = await t.mutation(internal.phoneMigration.migratePreferences, {});
    expect(prefs.migrated).toBe(1);

    const claims = await t.mutation(internal.phoneMigration.migrateClaims, {});
    expect(claims.migrated).toBe(1);

    const row = await t.run(async (ctx) => ctx.db.get(seeded.preferenceId as never)) as {
      whatsappPhone?: string;
      whatsappPhoneEnc?: string;
      whatsappPhoneKey?: string;
    };
    // Enkripsi ada, dan kunci pencarian ada.
    expect(isEncryptedPhone(row.whatsappPhoneEnc)).toBe(true);
    expect(row.whatsappPhoneKey).toMatch(/^bkp1\./);
    // Kolom polos MASIH ada. Mengosongkannya adalah langkah terpisah yang
    // harus didorong manusia setelah audit - bukan efek samping otomatis.
    expect(row.whatsappPhone).toBe("6281234567890");

    // Dan yang terenkripsi bisa dibaca kembali ke nomor yang benar.
    expect(await decryptPhone(row.whatsappPhoneEnc!, master())).toBe("6281234567890");

    const after = await t.query(internal.phoneMigration.report, {});
    expect(after.remainingLegacy).toBe(0);
  });

  test("migrasi bersifat idempoten", async () => {
    const t = convexTest(schema, modules);
    await seedLegacy(t);

    await t.mutation(internal.phoneMigration.migratePreferences, {});
    const second = await t.mutation(internal.phoneMigration.migratePreferences, {});
    // Baris sudah punya ciphertext, jadi tidak ada yang di-enkripsi ulang.
    // Mengenkripsi ulang akan membakar kuota tulis dan, kalau kuncinya
    // berganti, membuat baris lama tidak bisa terbaca.
    expect(second.migrated).toBe(0);
    expect(second.skipped).toBe(1);
  });

  test("pengosongan ditolak selama masih ada baris polos", async () => {
    const t = convexTest(schema, modules);
    await seedLegacy(t);

    // Melempar, dan TIDAK menghapus apa pun. Salah klik di sini tanpa penjaga
    // akan menghapus nomor warga yang belum punya ciphertext - dan PII yang
    // hilang tidak bisa dipulihkan.
    await expect(
      t.mutation(internal.phoneMigration.clearLegacyPlainPhones, {}),
    ).rejects.toBeTruthy();

    const row = await t.run(async (ctx) =>
      ctx.db.query("notificationPreferences").collect(),
    );
    expect(row[0]?.whatsappPhone).toBe("6281234567890");
  });

  test("pengosongan berjalan hanya setelah semua baris terenkripsi", async () => {
    const t = convexTest(schema, modules);
    await seedLegacy(t);
    await t.mutation(internal.phoneMigration.migratePreferences, {});
    await t.mutation(internal.phoneMigration.migrateClaims, {});

    const result = await t.mutation(internal.phoneMigration.clearLegacyPlainPhones, {});
    expect(result.cleared).toBe(2);
    expect(result.done).toBe(true);

    const prefs = await t.run(async (ctx) =>
      ctx.db.query("notificationPreferences").collect(),
    );
    // Polos hilang, terenkripsi tetap ada. Inilah kondisi akhir yang benar.
    expect(prefs[0]?.whatsappPhone).toBeUndefined();
    expect(isEncryptedPhone(prefs[0]?.whatsappPhoneEnc)).toBe(true);
  });

  test("tanpa kunci, migrasi gagal terbuka alih-alih melaporkan nol", async () => {
    const t = convexTest(schema, modules);
    await seedLegacy(t);
    const original = process.env[PHONE_DATA_KEY_ENV];
    delete process.env[PHONE_DATA_KEY_ENV];
    try {
      // Melempar, bukan "scanned 1, migrated 0" - yang latter akan membuat
      // pemilik yakin migrasi sudah berjalan padahal tidak ada yang terjadi.
      await expect(
        t.mutation(internal.phoneMigration.migratePreferences, {}),
      ).rejects.toBeTruthy();
    } finally {
      if (original !== undefined) process.env[PHONE_DATA_KEY_ENV] = original;
    }
  });
});