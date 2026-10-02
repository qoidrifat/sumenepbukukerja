/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Dedup unggahan, pembersihan blob yatim, dan cadangan mingguan.
 *
 * Tiga hal di sini bisa merusak data dan tidak terlihat dari UI:
 *  - peta blob yang salah isi membuat dua akun berbagi berkas yang bukan miliknya,
 *    atau membuat unggahan_identik dianggap sudah ada padahal bukan;
 *  - pembersihan yang salah rujukan menghapus foto yang masih terpakai — dan
 *    foto yang dihapus tidak bisa dikembalikan;
 *  - cadangan yang menimpa dokumen sebelumnya menghilangkan satu-satunya salinan.
 *
 * Karena itu setiap tes di sini memeriksa bukan hanya "berhasil", tapi juga
 * "tidak menyentuh yang seharusnya tidak boleh disentuh".
 */

const IMAGE_TYPE = "image/jpeg";

async function seedUser(t: ReturnType<typeof convexTest>, name = "Warga") {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", { name, email: `${name.toLowerCase()}@sumenep.co.id` });
  });
  return { userId, asUser: t.withIdentity({ subject: userId }) };
}

/** Simpan blob gambar sungguhan (dengan metadata contentType di `_storage`). */
async function storeImage(t: ReturnType<typeof convexTest>, bytes: number) {
  return await storeBlobWithType(t, bytes, IMAGE_TYPE);
}

/** Simpan blob dengan jenis MIME yang dipilih pemanggil (untuk kasus tolak). */
async function storeBlobWithType(t: ReturnType<typeof convexTest>, bytes: number, contentType: string) {
  return await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([new Uint8Array(bytes)]));
    const system = ctx.db as unknown as {
      patch: (id: never, value: { contentType: string }) => Promise<void>;
    };
    await system.patch(id as never, { contentType });
    return id as never;
  });
}

const sha = (hex: string) => hex.padEnd(64, "0");

describe("peta blob unggahan (dedup)", () => {
  test("sha yang belum dikenal berarti belum pernah diunggah", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    expect(await asUser.query(api.storage.lookupBlobBySha, { sha256: sha("a") })).toBeNull();
  });

  test("catat lalu temukan menghasilkan storageId yang sama", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    const storageId = await storeImage(t, 256);
    const digest = sha("b");

    await asUser.mutation(api.storage.recordUploadedBlob, { sha256: digest, storageId, size: 256 });
    const found = await asUser.query(api.storage.lookupBlobBySha, { sha256: digest });
    expect(found?.storageId).toBe(storageId);
  });

  test("sha sama dua kali tidak membuat dua baris peta (balapan)", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    const first = await storeImage(t, 128);
    const second = await storeImage(t, 128);
    const digest = sha("c");

    await asUser.mutation(api.storage.recordUploadedBlob, { sha256: digest, storageId: first, size: 128 });
    await asUser.mutation(api.storage.recordUploadedBlob, { sha256: digest, storageId: second, size: 128 });

    const rows = await t.run(
      async (ctx) => await ctx.db.query("uploadedBlobs").collect(),
    );
    expect(rows).toHaveLength(1);
  });

  test("peta yang menunjuk blob hilang diperlakukan sebagai belum ada", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    const storageId = await storeImage(t, 64);
    const digest = sha("d");
    await asUser.mutation(api.storage.recordUploadedBlob, { sha256: digest, storageId, size: 64 });
    await t.run(async (ctx) => {
      await ctx.storage.delete(storageId);
    });
    expect(await asUser.query(api.storage.lookupBlobBySha, { sha256: digest })).toBeNull();
  });

  test("berkas non-gambar dan sha ngawur ditolak", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    const pdf = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(16)]));
      const system = ctx.db as unknown as {
        patch: (id: never, value: { contentType: string }) => Promise<void>;
      };
      await system.patch(id as never, { contentType: "application/pdf" });
      return id as never;
    });
    await expect(
      asUser.mutation(api.storage.recordUploadedBlob, { sha256: sha("e"), storageId: pdf, size: 16 }),
    ).rejects.toThrow();
    const png = await storeImage(t, 16);
    await expect(
      asUser.mutation(api.storage.recordUploadedBlob, { sha256: "bukan-sha", storageId: png, size: 16 }),
    ).rejects.toThrow();
  });

  test("peta menolak foto yang melebihi batas ukuran, bukan hanya jenisnya", async () => {
    // TEMUAN FASE 11: peta hanya memanggil `isStoredImage`, jadi foto
    // sebesar 200 MB tetap masuk peta. Karena `pruneOrphanStorage`
    // memperlakukan baris peta sebagai "pernah dipakai jalur kita", baris itu
    // membuat blob yatim tidak pernah dipangkas - jadi ini bukan hanya
    // soal kuota storage, tapi juga umur dari sampah.
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    const huge = await storeImage(t, 1_000_001);
    await expect(
      asUser.mutation(api.storage.recordUploadedBlob, { sha256: sha("1"), storageId: huge, size: 1_000_001 }),
    ).rejects.toThrow();
    // Tepat di batas tetap diterima, jadi ini batas ukuran bukan sekadar tolak.
    const atLimit = await storeImage(t, 1_000_000);
    await expect(
      asUser.mutation(api.storage.recordUploadedBlob, { sha256: sha("2"), storageId: atLimit, size: 1_000_000 }),
    ).resolves.toBeNull();
  });

  test("peta menolak SVG meski awalan MIME-nya image/", async () => {
    // SVG adalah dokumen, bukan gambar: ia boleh memuat <script> dan
    // onload. Convex menyajikan berkas storage sebagai dokumen utuh, jadi
    // SVG yang lolos bisa dieksekusi di origin storage. Aturannya sekarang
    // allowlist, bukan `startsWith("image/")`.
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    const svg = await storeBlobWithType(t, 64, "image/svg+xml");
    await expect(
      asUser.mutation(api.storage.recordUploadedBlob, { sha256: sha("3"), storageId: svg, size: 64 }),
    ).rejects.toThrow();
    const mapped = await t.run(async (ctx) => ctx.db.query("uploadedBlobs").collect());
    expect(mapped).toHaveLength(0);
  });

  test("peta menolak identitas tanpa akun, meski anonim Convex Auth lolos dari requireUser", async () => {
    // Temuan nyata saat menulis tes ini: `requireUser` TIDAK menolak identitas
    // anonim, karena penyedia Anonymous terdaftar di `auth.ts`. Kalau peta blob
    // hanya dijaga `requireUser`, pengunjung tanpa akun bisa mengisinya dengan
    // sampah. Karena itu `recordUploadedBlob` menuntut baris `users` sungguhan.
    const t = convexTest(schema, modules);
    const storageId = await storeImage(t, 32);
    const anonymous = t.withIdentity({ name: "Pengunjung" });
    await expect(
      anonymous.mutation(api.storage.recordUploadedBlob, { sha256: sha("f"), storageId, size: 32 }),
    ).rejects.toThrow();
  });
});

describe("pembersihan blob yatim", () => {
  /**
   * Memajukan waktu alih-alih mempatch `_creationTime`.
   *
   * `_creationTime` tidak boleh diubah pada dokumen sistem, jadi "blob yang
   * sudah tua" harus dibentuk dengan menjalankan prune beberapa hari setelah
   * blob dibuat. Jam PALSU hanya untuk `Date` — timer asli dibiarkan supaya
   * promise di dalam `convex-test` tidak menggantung.
   */
  async function withElapsedDays(days: number, run: () => Promise<void>) {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.advanceTimersByTime(days * 24 * 60 * 60 * 1000);
      await run();
    } finally {
      vi.useRealTimers();
    }
  }

  test("blob lama tanpa rujukan dihapus", async () => {
    const t = convexTest(schema, modules);
    const orphan = await storeImage(t, 40);
    await withElapsedDays(3, async () => {
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.deleted).toBe(1);
      expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", orphan as never))).toBeNull();
    });
  });

  test("blob baru tetap aman walau belum direferensikan", async () => {
    const t = convexTest(schema, modules);
    const fresh = await storeImage(t, 40);
    const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
    expect(result.deleted).toBe(0);
    expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", fresh as never))).not.toBeNull();
  });

  test("blob foto profil tidak dihapus meski sudah tua", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t);
    const photo = await storeImage(t, 80);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId as never, { profileImageStorageId: photo as never });
    });
    await withElapsedDays(5, async () => {
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", photo as never))).not.toBeNull();
    });
  });

  test("blob foto listing tidak dihapus meski sudah tua", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t);
    const vendorId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("vendors", {
        name: "Karya Jaya",
        slug: "karya-jaya",
        category: "Servis Teknik",
        landmark: "all",
        status: "active",
        ownerId: userId as never,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const photo = await storeImage(t, 90);
    await t.run(async (ctx) => {
      await ctx.db.insert("vendorPhotos", {
        vendorId: vendorId as never,
        storageId: photo as never,
        moderationStatus: "approved",
        active: true,
        createdAt: Date.now(),
      });
    });
    await withElapsedDays(5, async () => {
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.deleted).toBe(0);
      expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", photo as never))).not.toBeNull();
    });
  });

  test("blob terpetakan dedup tidak dihapus, walau tidak dipakai listing mana pun", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t);
    const blob = await storeImage(t, 50);
    const digest = sha("9");
    await asUser.mutation(api.storage.recordUploadedBlob, { sha256: digest, storageId: blob, size: 50 });
    await withElapsedDays(9, async () => {
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.deleted).toBe(0);
      expect(await asUser.query(api.storage.lookupBlobBySha, { sha256: digest })).not.toBeNull();
    });
  });

  test("jalan dua kali: hasil kedua tidak merusak dan tidak mengulang", async () => {
    const t = convexTest(schema, modules);
    await storeImage(t, 30);
    await withElapsedDays(2, async () => {
      const first = await t.mutation(internal.storage.pruneOrphanStorage, {});
      const second = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(first.deleted).toBe(1);
      expect(second.deleted).toBe(0);
    });
  });
});

describe("cadangan data mingguan", () => {
  test("satu minggu = satu dokumen, jalan kedua idempoten", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    const first = await t.action(internal.storage.writeWeeklyBackup, {});
    expect(first.skipped).toBe(false);
    const second = await t.action(internal.storage.writeWeeklyBackup, {});
    expect(second.skipped).toBe(true);

    const rows = await t.run(async (ctx) => await ctx.db.query("backupRuns").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("ok");
  });

  test("isi dokumen benar-benar ada dan bisa dibaca kembali", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Pemilik");
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      await db.insert("vendors", {
        name: "Toko Merah",
        slug: "toko",
        category: "Kuliner",
        landmark: "Banda",
        status: "active",
        ownerId: userId as never,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("auditLogs", { action: "listing.created", createdAt: Date.now() });
    });

    const run = await t.action(internal.storage.writeWeeklyBackup, {});
    expect(run.skipped).toBe(false);
    const rows = await t.run(async (ctx) => await ctx.db.query("backupRuns").collect());
    const parsed = await t.run(
      async (ctx) => {
        const blob = await ctx.storage.get(rows[0]!.storageId as never);
        return blob ? JSON.parse(await blob.text()) : null;
      },
    ) as { vendors: unknown[]; auditLogs: unknown[] } | null;
    expect(parsed?.vendors).toHaveLength(1);
    expect(parsed?.auditLogs).toHaveLength(1);
  });

  test("nama tabel dari luar daftar putih tidak pernah dibaca", async () => {
    const t = convexTest(schema, modules);
    expect(await t.run(async (ctx) => await ctx.runQuery(internal.storage.gatherBackupTable, { table: "authSessions" }))).toEqual([]);
    expect(await t.run(async (ctx) => await ctx.runQuery(internal.storage.gatherBackupTable, { table: "backupRuns" }))).toEqual([]);
  });
});

describe("agregasi laporan error per fingerprint (ITEM 16)", () => {
  // Requirement: 20 laporan dengan fingerprint sama harus tampil sebagai SATU
  // masalah dengan hitungan 20, bukan 20 baris. Mekanismenya sudah ada sejak
  // awal (`latestByFingerprint` + `occurrences`); tes ini mengunciNYA supaya
  // tidak ada refactor yang melanggarnya tanpa disadari.
  test("laporan berulang dengan fingerprint sama digabung dan dihitung", async () => {
    const t = convexTest(schema, modules);
    const resident = t.withIdentity({ name: "Warga" });
    for (let index = 0; index < 20; index += 1) {
      await resident.mutation(api.errorReports.reportError, {
        kind: "operation",
        code: "PHOTO_UPLOAD_FAILED",
        message: "Foto gagal diunggah",
        feature: "Galeri",
        operation: "gallery.upload",
      });
    }

    const rows = await t.run(
      async (ctx) => await ctx.db.query("errorReports").collect(),
    );
    // Satu baris, dengan hitungan yang terus naik.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.occurrences).toBe(20);
  });

  test("fingerprint berbeda tetap baris terpisah", async () => {
    const t = convexTest(schema, modules);
    const resident = t.withIdentity({ name: "Warga" });
    await resident.mutation(api.errorReports.reportError, {
      kind: "operation",
      code: "PHOTO_UPLOAD_FAILED",
      message: "Foto gagal diunggah",
      feature: "Galeri",
      operation: "gallery.upload",
    });
    await resident.mutation(api.errorReports.reportError, {
      kind: "operation",
      code: "WHATSAPP_SEND_FAILED",
      message: "Kirim WhatsApp gagal",
      feature: "WhatsApp",
      operation: "whatsapp.send",
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.fingerprint)).size).toBe(2);
  });

  test("tanpa fingerprint, laporan tetap punya sidik jari yang bisa dikelompokkan", async () => {
    const t = convexTest(schema, modules);
    const resident = t.withIdentity({ name: "Warga" });
    await resident.mutation(api.errorReports.reportError, {
      kind: "operation",
      code: "TANPA_KODE",
      message: "Gagal tanpa detail",
      feature: "Umum",
      operation: "unknown",
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows[0]?.fingerprint).toBeTruthy();
  });
});

describe("pembatasan laju peristiwa per perangkat", () => {
  test("peristiwa dari satu perangkat dihentikan setelah batas per jam", async () => {
    const t = convexTest(schema, modules);
    const anonymous = t.withIdentity({ name: "Pengunjung" });
    const anonymousId = "anon-rate-test";

    const { TRACK_ANONYMOUS_HOURLY_LIMIT } = await import("./analytics");
    let accepted = 0;
    for (let index = 0; index < TRACK_ANONYMOUS_HOURLY_LIMIT + 5; index += 1) {
      const id = await anonymous.mutation(api.analytics.track, {
        event: "search_impression",
        anonymousId,
      });
      if (id) accepted += 1;
    }
    expect(accepted).toBe(TRACK_ANONYMOUS_HOURLY_LIMIT);

    const stored = await t.run(
      async (ctx) => await ctx.db.query("analyticsEvents").collect(),
    );
    expect(stored).toHaveLength(TRACK_ANONYMOUS_HOURLY_LIMIT);
  });

  test("peristiwa dari perangkat lain tidak ikut terpengaruh", async () => {
    const t = convexTest(schema, modules);
    const anonymous = t.withIdentity({ name: "Pengunjung" });
    const { TRACK_ANONYMOUS_HOURLY_LIMIT } = await import("./analytics");
    for (let index = 0; index < TRACK_ANONYMOUS_HOURLY_LIMIT; index += 1) {
      await anonymous.mutation(api.analytics.track, { event: "search_impression", anonymousId: "lapis-1" });
    }
    const other = await anonymous.mutation(api.analytics.track, {
      event: "search_impression",
      anonymousId: "lapis-2",
    });
    expect(other).not.toBeNull();
  });

  test("peristiwa tanpa id perangkat tidak pernah dibatasi", async () => {
    // Panggilan dari server sendiri (misalnya saat Deutsuq tidak memakai
    // `anonymousId`) tidak boleh ikut terpotong oleh batas peramban.
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t);
    const user = t.withIdentity({ subject: userId });
    const { TRACK_ANONYMOUS_HOURLY_LIMIT } = await import("./analytics");
    for (let index = 0; index < TRACK_ANONYMOUS_HOURLY_LIMIT + 3; index += 1) {
      const id = await user.mutation(api.analytics.track, { event: "search_impression" });
      expect(id).not.toBeNull();
    }
  });
});

/**
 * Batas tepi.
 * *Tes di atas membuktikan "berhenti setelah melewati batas". Yang belum
 * terkunci adalah dua tempat di mana angka ini paling sering salah: satu
 * peristiwa terlalu banyak (galat satu langkah) dan jendela satu jam yang tidak
 * pernah bergeser (perangkat yang terkunci selamanya). Keduanya lolos di test
 * yang hanya menghitung jumlah, tapi justru merusak di produksi.
 */
describe("batas tepi pembatasan laju", () => {
  async function trackMany(
    send: (args: { event: "search_impression"; anonymousId?: string }) => Promise<string | null>,
    count: number,
    anonymousId?: string,
  ) {
    let accepted = 0;
    for (let index = 0; index < count; index += 1) {
      const id = await send({
        event: "search_impression",
        ...(anonymousId === undefined ? {} : { anonymousId }),
      });
      if (id) accepted += 1;
    }
    return accepted;
  }

  const visit = (t: ReturnType<typeof convexTest>) => {
    const identity = t.withIdentity({ name: "Pengunjung" });
    return (args: { event: "search_impression"; anonymousId?: string }) =>
      identity.mutation(api.analytics.track, args);
  };

  test("tepat di batas masih diterima, satu berikutnya ditolak", async () => {
    const t = convexTest(schema, modules);
    const visitor = t.withIdentity({ name: "Pengunjung Tepi" });
    const { TRACK_ANONYMOUS_HOURLY_LIMIT: limit } = await import("./analytics");

    // Isi sampai PERSIS batas.
    expect(await trackMany(visit(t), limit, "tepi")).toBe(limit);
    // Peristiwa ke-(limit+1) harus ditolak, bukan diterima diam-diam.
    const next = await visitor.mutation(api.analytics.track, {
      event: "search_impression",
      anonymousId: "tepi",
    });
    expect(next).toBeNull();
    const stored = await t.run(async (ctx) => await ctx.db.query("analyticsEvents").collect());
    expect(stored).toHaveLength(limit);
  });

  test("peristiwa yang ditolak tidak menambah penghitung dashboard", async () => {
    // Kalau penolakan tetap menambah penghitung, angka dashboard dan baris
    // mentah akan berbeda — dan tidak ada yang bisa menjelaskannya.
    const t = convexTest(schema, modules);
    const { TRACK_ANONYMOUS_HOURLY_LIMIT: limit } = await import("./analytics");
    await trackMany(visit(t), limit + 4, "hitung");

    const counters = await t.run(async (ctx) => await ctx.db.query("analyticsCounters").collect());
    const impressions = counters.find((row) => row.key === "search_impression");
    expect(impressions?.count).toBe(limit);
  });

  test("jendela satu jam bergeser: peristiwa lama tidak ikut dihitung", async () => {
    // Seeded 400 baris untuk perangkat yang sama, semuanya DUA JAM lalu. Kalau
    // jendela tidak ikut bergeser, perangkat ini masih terkunci selamanya
    // padahal ia tidak mengirim apa pun dalam satu jam terakhir.
    const t = convexTest(schema, modules);
    const visitor = t.withIdentity({ name: "Pengunjung Jendela" });
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      for (let index = 0; index < 400; index += 1) {
        await db.insert("analyticsEvents", {
          event: "search_impression",
          anonymousId: "lama",
          createdAt: twoHoursAgo + index,
        });
      }
    });

    const fresh = await visitor.mutation(api.analytics.track, {
      event: "search_impression",
      anonymousId: "lama",
    });
    expect(fresh).not.toBeNull();
  });

  test("peristiwa di batas jendela lama ikut kedaluwarsa", async () => {
    // 61 menit lalu sudah di luar jendela; 59 menit lalu masih di dalam.
    const t = convexTest(schema, modules);
    const visitor = t.withIdentity({ name: "Pengunjung Tepi Jendela" });
    const now = Date.now();
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      await db.insert("analyticsEvents", {
        event: "search_impression",
        anonymousId: "tepi-jendela",
        createdAt: now - 61 * 60 * 1000,
      });
    });
    const fresh = await visitor.mutation(api.analytics.track, {
      event: "search_impression",
      anonymousId: "tepi-jendela",
    });
    expect(fresh).not.toBeNull();
  });

  test("pengguna yang sudah masuk tetap dihitung per perangkat, bukan dibebaskan", async () => {
    // Halaman sendingirim `anonymousId` perangkat UNTUK semua orang, termasuk
    // yang sudah masuk. Jika yang masuk dibebaskan sepenuhnya, satu akun bisa
    // menulis event tanpa batas hanya dengan cara masuk — celah yang lebih
    // murah daripada menebak perangkat. Batas 300/jam jauh di atas pemakaian
    // nyata, jadi tidak ada risiko terpotong.
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "Warga Mantap");
    const { TRACK_ANONYMOUS_HOURLY_LIMIT: limit } = await import("./analytics");
    const send = (args: { event: "search_impression"; anonymousId?: string }) =>
      asUser.mutation(api.analytics.track, args);
    expect(await trackMany(send, limit, "perangkat-warga")).toBe(limit);
    const blocked = await send({ event: "search_impression", anonymousId: "perangkat-warga" });
    expect(blocked).toBeNull();
  });

  test("id perangkat kosong tidak dihitung sebagai perangkat", async () => {
    // String kosong berarti "tidak ada id", jadi harus lewat jalur tanpa batas,
    // sama seperti `undefined`. Kalau tidak, satu pemanggil yang mengirim
    // `anonymousId: ""` akan menarik seluruhKuota ke dirinya sendiri.
    const t = convexTest(schema, modules);
    const { TRACK_ANONYMOUS_HOURLY_LIMIT: limit } = await import("./analytics");
    expect(await trackMany(visit(t), limit + 2, "")).toBe(limit + 2);
  });

  test("id perangkat terpotong 120 karakter, jadi tidak bisa meledakkan indeks", async () => {
    // Batas panjang mencegah satu permintaan memakai kunci indeks raksasa.
    const t = convexTest(schema, modules);
    const visitor = t.withIdentity({ name: "Pengpanjang" });
    const panjang = "a".repeat(400);
    await visitor.mutation(api.analytics.track, { event: "search_impression", anonymousId: panjang });
    const stored = await t.run(async (ctx) => await ctx.db.query("analyticsEvents").first());
    expect(stored?.anonymousId).toHaveLength(120);
  });

  test("tanpa identitas sama sekali, peristiwa tetap bisa tercatat", async () => {
    // Server dan cron memanggil `track` tanpa identitas; di luar jalur peramban
    // tidak ada yang perlu dibatasi.
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.analytics.track, { event: "search_impression" });
    expect(id).not.toBeNull();
  });
});
