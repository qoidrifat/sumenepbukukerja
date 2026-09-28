/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { isStoredImage } from "./users";
import { MAX_IMAGE_BYTES, imageRejection } from "../lib/image-upload";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Profil pengelola.
 *
 * Yang dikunci di sini bukan "bisa menyimpan nama" — itu remeh. Yang dikunci
 * adalah tiga hal yang bisa rusak dan tidak akan terlihat kalau tidak diuji:
 *  1. Validasi foto dibaca dari metadata STORAGE, bukan dari `File` klien.
 *  2. Email tidak bisa diubah lewat jalur ini.
 *  3. Foto lama dihapus SETELAH patch berhasil, bukan sebelumnya.
 */

async function seedAdmin(t: ReturnType<typeof convexTest>, email = "admin@sumenep.co.id") {
  const id = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    const userId = await db.insert("users", { name: "Nama Lama", email });
    await ctx.db.insert("staffMembers", {
      userId: userId as never,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
  return { userId: id, admin: t.withIdentity({ subject: id }) };
}

/**
 * Simpan berkas TANPA jenis berkas — persis seperti unggahan yang sengaja
 * tidak mengirim header `Content-Type`. Ini jalur yang harus selalu ditolak.
 */
const storeBlob = (t: ReturnType<typeof convexTest>, bytes: number) =>
  t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(bytes)])));

/**
 * Simpan blob yang benar-benar punya jenis berkas.
 *
 * `convex-test` tidak mencatat `contentType` saat menyimpan blob — metadata
 * hasilnya hanya berisi `sha256` dan `size`. Server membaca jenis berkas dari
 * metadata itu, jadi tanpa langkah ini SETIAP berkas di tes terlihat seperti
 * unggahan tanpa header, dan jalur "berterima" tidak akan pernah bisa dicoba.
 * Tabel sistem tidak bisa di-INSERT, tapi PATCH ke barisnya berhasil — jadi
 * metadata itu bisa diisi persis seperti yang ditulis endpoint unggah.
 *
 * Sebelum ini, komentar lama di berkas ini menyimpulkan bahwa jalur berterima
 * memang tidak bisa diuji di sini. Kesimpulan itu ternyata keliru: satu PATCH
 * cukup, dan sekarang unggahan foto yang sesungguhnya berhasil ikut diuji.
 */
const storeImage = (
  t: ReturnType<typeof convexTest>,
  bytes: number,
  contentType = "image/jpeg",
) =>
  t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([new Uint8Array(bytes)]));
    const system = ctx.db as unknown as {
      patch: (id: never, value: { contentType: string }) => Promise<void>;
    };
    await system.patch(id as never, { contentType });
    return id as never;
  });

describe("perbarui profil pengelola", () => {
  test("nama dipangkas, spasi dirapatkan, dan batasannya ditegakkan", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);

    const messy = await admin.mutation(api.users.updateMyProfile, {
      name: "   Rofi'atul    Qodriyah   ",
    });
    expect(messy.name).toBe("Rofi'atul Qodriyah");

    // Spasi berlebih tidak boleh membuat panel mana pun melebar.
    const long = await admin.mutation(api.users.updateMyProfile, { name: "a".repeat(500) });
    expect((long.name ?? "").length).toBe(80);

    // Nama yang tidak bisa diucapkan ditolak, bukan disimpan kosong.
    await expect(admin.mutation(api.users.updateMyProfile, { name: "  " })).rejects.toThrow();
    await expect(admin.mutation(api.users.updateMyProfile, { name: "a" })).rejects.toThrow();
  });

  test("email tidak bisa diubah lewat panel profil", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t, "pemilik@sumenep.co.id");
    const before = await admin.query(api.users.myProfile, {});
    expect(before?.email).toBe("pemilik@sumenep.co.id");

    // Argumen `email` sengaja tidak ada di validator, jadi klien yang
    // mencobanya ditolak server — bukan diam-diam diabaikan.
    await expect(
      admin.mutation(api.users.updateMyProfile, {
        name: "Nama Baru",
        email: "orang-lain@sumenep.co.id",
      } as never),
    ).rejects.toBeTruthy();

    const after = await admin.query(api.users.myProfile, {});
    expect(after?.email).toBe("pemilik@sumenep.co.id");
  });

  test("berkas tanpa tipe yang jelas ditolak dan profil tetap utuh", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const storageId = await storeBlob(t, 512);

    // Tanpa `contentType`, server tidak boleh menebak. Ini jalur yang dipakai
    // test untuk semua unggahan, jadi ia juga jalur yang harus menolak.
    await expect(
      admin.mutation(api.users.updateMyProfile, { name: "Dengan Foto", imageStorageId: storageId }),
    ).rejects.toThrow();

    const profile = await admin.query(api.users.myProfile, {});
    expect(profile?.name).toBe("Nama Lama");
    expect(profile?.hasImage).toBe(false);
  });

  test("penolakan server memakai kalimat yang sama persis dengan yang dipakai klien", async () => {
    // Server dan peramban memakai aturan yang sama dari `@/lib/image-upload`.
    // Yang diuji di sini adalah sambungannya: pesan yang keluar dari mutasi
    // harus pesan yang dihasilkan aturan itu untuk metadata yang sama — bukan
    // kalimat lain yang ditulis ulang di dalam mutasi.
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const storageId = await storeBlob(t, 512);
    const expected = imageRejection({ size: 512, contentType: undefined });
    expect(expected).not.toBeNull();

    await expect(
      admin.mutation(api.users.updateMyProfile, {
        name: "Dengan Foto",
        imageStorageId: storageId,
      }),
    ).rejects.toThrow(expected!);
  });

  test("unggahan foto yang sah benar-benar tersimpan dan bisa dibaca kembali", async () => {
    // Inilah jalur yang dipakai pengguna saat menekan "Simpan profil" setelah
    // memilih foto — dan inilah jalur yang dulu gagal. Sebelumnya tes ini tidak
    // ada karena dianggap mustahil; ternyata cukup satu PATCH metadata.
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const storageId = await storeImage(t, 512);

    const saved = await admin.mutation(api.users.updateMyProfile, {
      name: "  Nama  Dengan   Foto ",
      imageStorageId: storageId,
    });
    expect(saved.name).toBe("Nama Dengan Foto");

    const profile = await admin.query(api.users.myProfile, {});
    expect(profile?.hasImage).toBe(true);
    expect(profile?.name).toBe("Nama Dengan Foto");
  });

  test("foto kedua menggantikan yang pertama dan berkas lamanya dibersihkan", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const first = await storeImage(t, 256);
    const second = await storeImage(t, 512);

    await admin.mutation(api.users.updateMyProfile, { name: "Ganti Foto", imageStorageId: first });
    await admin.mutation(api.users.updateMyProfile, { name: "Ganti Foto", imageStorageId: second });

    const gone = await t.run(async (ctx) =>
      Boolean(await ctx.db.system.get("_storage", first as never)),
    );
    const kept = await t.run(async (ctx) =>
      Boolean(await ctx.db.system.get("_storage", second as never)),
    );
    expect(gone).toBe(false);
    expect(kept).toBe(true);
  });

  test("foto yang terlalu besar ditolak walau jenisnya benar, dan foto lama tetap terpasang", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const good = await storeImage(t, 256);
    await admin.mutation(api.users.updateMyProfile, { name: "Punya Foto", imageStorageId: good });

    const oversized = await storeImage(t, MAX_IMAGE_BYTES + 1);
    const expected = imageRejection({ size: MAX_IMAGE_BYTES + 1, contentType: "image/jpeg" });
    await expect(
      admin.mutation(api.users.updateMyProfile, {
        name: "Punya Foto",
        imageStorageId: oversized,
      }),
    ).rejects.toThrow(expected!);

    // Penolakan tidak boleh menyentuh apa pun: nama dan foto lama tetap utuh.
    const profile = await admin.query(api.users.myProfile, {});
    expect(profile?.name).toBe("Punya Foto");
    expect(profile?.hasImage).toBe(true);
  });

  test("berkas berjenis bukan gambar ditolak dengan pesan yang sesuai", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const pdf = await storeImage(t, 512, "application/pdf");

    await expect(
      admin.mutation(api.users.updateMyProfile, { name: "Dengan PDF", imageStorageId: pdf }),
    ).rejects.toThrow("harus berupa foto");

    const profile = await admin.query(api.users.myProfile, {});
    expect(profile?.hasImage).toBe(false);
  });

  test("berkas kosong ditolak walau jenisnya gambar", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const empty = await storeImage(t, 0);

    await expect(
      admin.mutation(api.users.updateMyProfile, { name: "Berkas Kosong", imageStorageId: empty }),
    ).rejects.toThrow("kosong");
  });

  test("id berkas diterima sebagai string, dan id yang tidak ada ditolak dengan jelas", async () => {
    // Kontrak yang sebenarnya diinginkan validator: STRING, apa pun isinya.
    // Id yang tidak menunjuk berkas apa pun bukan kesalahan pemanggil — itu
    // berkas yang sudah hilang — jadi pesannya harus berkata begitu, bukan
    // "value tidak cocok validator".
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);

    await expect(
      admin.mutation(api.users.updateMyProfile, {
        name: "Dengan Foto",
        imageStorageId: "000000000000000000000000_storage",
      }),
    ).rejects.toThrow("Foto profil tidak ditemukan");
  });

  test("objek dikirim di tempat id ditolak sebelum sempat menyentuh storage", async () => {
    // Bentuk inilah yang dulu dikirim panel profil: seluruh jawaban endpoint
    // unggah diteruskan apa adanya, sehingga yang sampai ke server adalah
    // `{ storageId: "..." }`. Dikunci di sini supaya tidak kembali diam-diam.
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);

    await expect(
      admin.mutation(api.users.updateMyProfile, {
        name: "Dengan Foto",
        imageStorageId: { storageId: "kg2br8d4dtkqs00aq0t91dxwxh8f8pv2" } as never,
      }),
    ).rejects.toBeTruthy();

    const profile = await admin.query(api.users.myProfile, {});
    expect(profile?.name).toBe("Nama Lama");
  });

  test("batas 1 MB ditegakkan dari metadata storage, satu byte lebih ditolak", () => {
    // `convex-test` tidak mencatat `contentType`, jadi cabang UKURAN tidak bisa
    // dijalankan lewat mutasi di sini — metadata hasil penyimpanan hanya berisi
    // `sha256` dan `size`. Karena aturannya tinggal di satu fungsi murni, batas
    // itu tetap bisa diuji apa adanya, dan mutasi menguji sambungannya di atas.
    expect(imageRejection({ size: MAX_IMAGE_BYTES, contentType: "image/jpeg" })).toBeNull();
    expect(
      imageRejection({ size: MAX_IMAGE_BYTES + 1, contentType: "image/jpeg" }),
    ).not.toBeNull();
  });

  test("aturan jenis berkas hanya menerima contentType gambar", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(isStoredImage(type), type).toBe(true);
    }
    for (const type of ["application/pdf", "text/html", "video/mp4", "", undefined, null]) {
      expect(isStoredImage(type as string | undefined), String(type)).toBe(false);
    }
  });

  test("berkas yang terlalu besar ditolak", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const huge = await storeBlob(t, 1_000_001);
    await expect(
      admin.mutation(api.users.updateMyProfile, { name: "Berkas Besar", imageStorageId: huge }),
    ).rejects.toThrow();

    const profile = await admin.query(api.users.myProfile, {});
    expect(profile?.name).toBe("Nama Lama");
    expect(profile?.hasImage).toBe(false);
  });

  test("berkas foto lama dihapus dari storage saat profil diubah", async () => {
    // Cabang ini sama untuk "ganti foto" dan "hapus foto": keduanya memanggil
    // `ctx.storage.delete` yang sama setelah patch berhasil. Yang diuji di
    // sini adalah cabangnya, lewat jalur yang bisa dibuktikan tanpa
    // `contentType` — lihat catatan pada `storeBlob`.
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const stored = await storeBlob(t, 256);
    const userId = await t.run(async (ctx) => {
      const rows = await ctx.db.query("users").collect();
      return rows[0]!._id;
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId as never, { profileImageStorageId: stored });
    });

    await admin.mutation(api.users.updateMyProfile, { name: "Tanpa Foto", removeImage: true });

    // Kalau berkas lama tidak dihapus, setiap kali seseorang mengganti foto
    // akan meninggalkan salinan yang tidak pernah dirujuk dan tidak pernah
    // dibersihkan.
    const stillThere = await t.run(async (ctx) =>
      Boolean(await ctx.db.system.get("_storage", stored as never)),
    );
    expect(stillThere).toBe(false);
  });

  test("hapus foto tidak menghapus nama", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    const storageId = await storeBlob(t, 256);
    const userId = await t.run(async (ctx) => {
      const rows = await ctx.db.query("users").collect();
      return rows[0]!._id;
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId as never, { profileImageStorageId: storageId });
    });

    await admin.mutation(api.users.updateMyProfile, { name: "Tetap Ada", removeImage: true });
    const profile = await admin.query(api.users.myProfile, {});
    expect(profile?.hasImage).toBe(false);
    expect(profile?.name).toBe("Tetap Ada");
  });

  test("perubahan profil tercatat di jejak audit dengan pelaku", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);
    await admin.mutation(api.users.updateMyProfile, { name: "Nama Baru" });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("byAction", (q) => q.eq("action", "admin.profile_updated"))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata?.nameChanged).toBe(true);
    expect(rows[0]?.actorEmail).toBe("admin@sumenep.co.id");
  });

  test("warga biasa tanpa sesi tidak bisa mengubah profil orang lain", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    const anonymous = t.withIdentity({ name: "Pengunjung" });
    await expect(
      anonymous.mutation(api.users.updateMyProfile, { name: "Dibajak" }),
    ).rejects.toThrow();

    const strangerId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("users", { name: "Asli", email: "asli@sumenep.co.id" });
    });
    const stranger = t.withIdentity({ subject: strangerId });
    // `userId` tidak ada di validator: server menolak, bukan meneruskan.
    await expect(
      stranger.mutation(api.users.updateMyProfile, {
        name: "Dibajak",
        userId: strangerId,
      } as never),
    ).rejects.toBeTruthy();
  });
});
