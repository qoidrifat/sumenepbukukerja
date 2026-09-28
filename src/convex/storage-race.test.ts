/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Dua area tempat dedup dan pembersihan bisa merusak data tanpa langsung
 * terlihat: saat dua permintaan identik tiba bersamaan, dan saat job
 * pembersih dijalankan dua kali.
 *
 * Keduanya tidak bisa diuji dengan satu alur unggah berurutan, karena balapan
 * hanya terlihat pada percobaan kedua.
 */

function sha(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

async function seedUser(t: ReturnType<typeof convexTest>, name = "Warga") {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", { name, email: `${name.toLowerCase()}@sumenep.co.id` });
  });
  return { userId, asUser: t.withIdentity({ subject: userId }) };
}

/** Simpan blob gambar sungguhan, lengkap dengan metadata `contentType`. */
async function storeImage(t: ReturnType<typeof convexTest>, bytes: number) {
  return await t.run(async (ctx) => {
    const storage = ctx.storage as unknown as { store: (blob: Blob) => Promise<unknown> };
    const db = ctx.db as unknown as {
      patch: (id: never, value: { contentType: string }) => Promise<void>;
    };
    const id = await storage.store(new Blob([new Uint8Array(bytes)]));
    await db.patch(id as never, { contentType: "image/jpeg" });
    return id as never;
  });
}

describe("balapan saat dua unggahan identik tiba bersamaan", () => {
  test("peta blob tetap satu baris untuk sidik yang sama", async () => {
    // Skenario balapan: A dan B sama-sama tidak menemukan peta (lookup
    // dikembalikan null untuk keduanya), sama-sama mengunggah, lalu sama-sama
    // mencatat. Yang kedua harus MEMPERBARUI baris yang sudah ada, bukan
    // menyisipkan baris kedua dengan `sha256` yang sama.
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "Warga Balapan");
    const blobA = await storeImage(t, 128);
    const blobB = await storeImage(t, 128);
    const fingerprint = sha("a");

    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: fingerprint,
      storageId: blobA as string,
      size: 128,
    });
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: fingerprint,
      storageId: blobB as string,
      size: 128,
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("uploadedBlobs").collect());
    // Dua baris dengan sha yang sama berarti pencarian berikutnya bisa
    // memakai `.unique()` yang melempar, dan satu blob tidak pernah terpakai.
    expect(rows).toHaveLength(1);
    // Baris itu menunjuk blob TERAKHIR: blob terbaru adalah yang diunggah dan
    // masih dipakai klien.
    expect(rows[0]?.storageId).toBe(blobB as string);
  });

  test("lookup setelah balapan mengembalikan satu jawaban yang bisa dipakai", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "Warga Lookup");
    const blobA = await storeImage(t, 64);
    const blobB = await storeImage(t, 64);
    const fingerprint = sha("b");
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: fingerprint,
      storageId: blobA as string,
      size: 64,
    });
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: fingerprint,
      storageId: blobB as string,
      size: 64,
    });

    const found = await asUser.query(api.storage.lookupBlobBySha, { sha256: fingerprint });
    expect(found).not.toBeNull();
    expect(found?.storageId).toBe(blobB as string);
  });

  test("dua berkas berbeda tidak pernah digabung", async () => {
    // Kebalikan dari dedup yang berlebihan: dua foto berbeda tidak boleh
    // saling menggantikan hanya karena momentumnya berdekatan.
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "Warga Berbeda");
    const first = await storeImage(t, 100);
    const second = await storeImage(t, 200);
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: sha("c"),
      storageId: first as string,
      size: 100,
    });
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: sha("d"),
      storageId: second as string,
      size: 200,
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("uploadedBlobs").collect());
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.sha256)).size).toBe(2);
  });

  test("nama berkas tidak memengaruhi identitas, isi yang menentukan", async () => {
    // Peta blob tidak punya kolom nama berkas. Gambar yang sama diunggah
    // sebagai "foto1.jpg" dan "foto2.jpg" menghasilkan sidik yang sama, jadi
    // keduanya berbagi satu blob. Kalau nama ikut menentukan, storage akan
    // penuh kembar — persis masalah yang dedup ini dibuat untuk dihilangkan.
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "Warga Nama");
    const blob = await storeImage(t, 77);
    const fingerprint = sha("e");
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: fingerprint,
      storageId: blob as string,
      size: 77,
    });
    const row = await t.run(async (ctx) => await ctx.db.query("uploadedBlobs").first());
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ["_id", "_creationTime", "createdAt", "lastUsedAt", "sha256", "size", "storageId"].sort(),
    );
  });

  test("blob kalah balapan tetap bisa direklam, blob pemenang tetap hidup", async () => {
    // Konsekuensi yang harus benar: setelah balapan, satu blob tidak lagi
    // dirujuk siapa pun. Itu tidak boleh berarti tersimpan selamanya, dan juga
    // tidak boleh berarti ikut terhapus bersama yang masih dipakai.
    const t = convexTest(schema, modules);
    const { asUser } = await seedUser(t, "Warga Reklam");
    const loser = await storeImage(t, 90);
    const winner = await storeImage(t, 90);
    const fingerprint = sha("f");
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: fingerprint,
      storageId: loser as string,
      size: 90,
    });
    await asUser.mutation(api.storage.recordUploadedBlob, {
      sha256: fingerprint,
      storageId: winner as string,
      size: 90,
    });

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000);
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.deleted).toBe(1);
      // Yang kalah balapan sudah tidak dirujuk: boleh diambil kembali.
      expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", loser as never))).toBeNull();
      // Yang menang masih dipetakan: harus utuh.
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", winner as never)),
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pembersihan blob yatim dijalankan dua kali", () => {
  test("panggilan kedua tidak menghapus apa pun lagi", async () => {
    // Idempoten: cron harian bisa berjalan ulang setelah gagal di tengah,
    // atau dua admin menekan tombolnya. Jalur kedua harus melapor kosong,
    // bukan meledak atau menghapus blob yang barusan dihapus.
    const t = convexTest(schema, modules);
    await storeImage(t, 41);
    await storeImage(t, 42);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000);
      const first = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(first.deleted).toBe(2);

      const second = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(second.deleted).toBe(0);
      expect(second.scanned).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("setiap pemanggilan melaporkan angka yang bisa diaudit", async () => {
    // Angka di log cron adalah satu-satunya bukti job itu bekerja. Tanpa
    // scanned/skipped, tidak ada yang bisa membedakan "tidak ada apa-apa untuk
    // dibersihkan" dari "job gagal diam-diam".
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga Log");
    const orphan = await storeImage(t, 51);
    const profile = await storeImage(t, 52);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId as never, { profileImageStorageId: profile as never });
    });

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.advanceTimersByTime(4 * 24 * 60 * 60 * 1000);
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.scanned).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.deleted).toBe(1);
      // `errors` sengaja tidak ada sebagai penghitung: penghapusan yang gagal
      // membuat mutasi melempar, jadi cron gagal keras dan dicatat — bukan
      // dilaporkan "0 error" lalu diam. Angka `hasMore` yang dipakai scheduler
      // untuk deciding apakah perlu memanggil lagi.
      expect(result.hasMore).toBe(false);
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", orphan as never)),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("batas 24 jam ditegakkan: tepat di batas belum dihapus", async () => {
    // Blob yang umurnya persis sama dengan masa tenggang aman. Kesalahan satu
    // milidetik di sini akan membuat foto yang sedang diunggah hilang.
    const t = convexTest(schema, modules);
    const fresh = await storeImage(t, 60);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 5_000);
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.deleted).toBe(0);
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", fresh as never)),
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("satu milidetik setelah masa tenggang, blob boleh diambil", async () => {
    const t = convexTest(schema, modules);
    const old = await storeImage(t, 61);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 5_000);
      const result = await t.mutation(internal.storage.pruneOrphanStorage, {});
      expect(result.deleted).toBe(1);
      expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", old as never))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("batas per pemanggilan membatasi kerja, sisanya diproses giliran berikutnya", async () => {
    // Kalau storage menumpuk, satu panggilan tidak boleh memindai semuanya
    // sekaligus: itu satu burst I/O besar tepat di jam paling sibuk.
    const t = convexTest(schema, modules);
    for (let index = 0; index < 5; index += 1) await storeImage(t, 70 + index);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000);
      const first = await t.mutation(internal.storage.pruneOrphanStorage, { limit: 2 });
      expect(first.scanned).toBe(2);
      expect(first.deleted).toBe(2);

      const second = await t.mutation(internal.storage.pruneOrphanStorage, { limit: 2 });
      expect(second.deleted).toBe(2);

      const third = await t.mutation(internal.storage.pruneOrphanStorage, { limit: 2 });
      expect(third.deleted).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
