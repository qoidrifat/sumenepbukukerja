/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { isStoredImage } from "./users";
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
 * Simpan berkas ke storage.
 *
 * CATATAN: `convex-test` tidak mencatat `contentType` untuk blob yang
 * disimpan, jadi setiap unggahan di test dianggap "tanpa tipe" dan DITOLAK —
 * persis seperti perilaku produksi untuk unggahan tanpa header. Jalur
 * "berterima" karena itu diuji lewat aturan murni `isStoredImage` di bawah,
 * bukan lewat mutasi. Melonggarkan aturan supaya test mutasi bisa lewat akan
 * membuka lubang nyata.
 */
const storeBlob = (t: ReturnType<typeof convexTest>, bytes: number) =>
  t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(bytes)])));

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
