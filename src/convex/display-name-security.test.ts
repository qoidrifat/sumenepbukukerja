import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";

/**
 * FASE 9.2 - F-05. Mengganti `users.name` di papan publik dengan nama
 * turunan bisa membuka kebocoran baru dalam satu langkah: nama turunan dibaca
 * dari email, jadigodahedralika satu kesalahan pada proyeksi akan|Shipwreck
 *Surelinya seluruh email wargaSumenep ke halaman publik.
 *
 * Test di sini mengunci dua hal yang harus benar:
 *  1. Papan publik benar-benar menampilkan nama turunan, bukan `users.name`.
 *  2. Email, `publicName`, dan `requesterId` TIDAK PERNAH ikut di respons -
 *     untuk pemanggil tanpa sesi maupun yang punya sesi.
 */

const modules = import.meta.glob("./**/*.ts");

const seedRequester = async (
  t: ReturnType<typeof convexTest>,
  input: { name?: string; email?: string; publicName?: string } = {},
) =>
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      // `name` sengaja diisi apa adanya. Kalau ada bagian mana pun yang
      // masih memakainya, nilai ini akan bocor dan test di bawah menangkapnya.
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.publicName !== undefined ? { publicName: input.publicName } : {}),
    });
    const vendorId = await ctx.db.insert("vendors", {
      name: "Warung Uji",
      slug: "warung-uji-display-name",
      category: "Kuliner",
      landmark: "Kota Sumenep",
      phone: "081234567890",
      address: "Jl. Uji 1",
      description: "Listing untuk pengujian nama tampilan.",
      hours: "08.00-17.00",
      price: "Rp10.000",
      featured: false,
      status: "active",
      ownerId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const requestId = await ctx.db.insert("serviceRequests", {
      title: "Butuh bantuan uji",
      description: "Permintaan yang dibuat oleh penguji nama tampilan.",
      category: "Servis Teknik",
      landmark: "Kota Sumenep",
      requesterId: userId,
      vendorId,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { userId, requestId, vendorId };
  });

const board = async (
  t: ReturnType<typeof convexTest>,
  requestId: string,
  identity?: string,
) => {
  const caller = identity ? t.withIdentity({ subject: identity }) : t;
  return await caller.query(api.community.listRequests, { limit: 20 });
};

const findRequest = (
  rows: Awaited<ReturnType<typeof board>>,
  requestId: string,
) => rows.find((row) => row._id === requestId);

describe("F-05 - papan publik menampilkan nama turunan, bukan nama akun", () => {
  test("email berpemisah dibaca persis, dan users.name tidak ikut", async () => {
    const t = convexTest(schema, modules);
    const { requestId, userId } = await seedRequester(t, {
      // Nama akun yang JAUH lebih Initializes dari tebakan, supaya test
      // gagal begitu ada yang kembali memakai `users.name`.
      name: "NAMA AKUN ASLI YANG TIDAK BOLEH BOCOR",
      email: "ahmanuddin.firman@gmail.com",
    });

    const rows = await board(t, requestId);
    const row = findRequest(rows, requestId);

    expect(row?.requesterName).toBe("Ahmanuddin Firman");
    expect(row?.requesterName).not.toContain("NAMA AKUN ASLI");
    expect(userId).toBeTruthy();
  });

  test("email tanpa pemisah menghasilkan satu token, dan itu ditampilkan apa adanya", async () => {
    const t = convexTest(schema, modules);
    const { requestId } = await seedRequester(t, {
      email: "ahmanuddinfirman92@gmail.com",
    });

    const row = findRequest(await board(t, requestId), requestId);
    // Satu token, jujur, bukan tebakan dua kata. Kalau test ini gagal dengan
    // "Ahmanuddin Firman", berarti seseorang menambahkan daftar nama-given.
    expect(row?.requesterName).toBe("Ahmanuddinfirman");
  });

  test("koreksi pengguna mengalahkan tebakan, dan bertahan di pembacaan berikutnya", async () => {
    const t = convexTest(schema, modules);
    const { requestId, userId } = await seedRequester(t, {
      name: "Nama Akun",
      email: "ahmanuddinfirman92@gmail.com",
    });

    expect(findRequest(await board(t, requestId), requestId)?.requesterName).toBe(
      "Ahmanuddinfirman",
    );

    const caller = t.withIdentity({ subject: `${userId}|sesi-uji-1` });
    const tersimpan = await caller.mutation(api.users.setMyDisplayName, {
      name: "Ahmanuddin Firman",
    });
    expect(tersimpan).toBe("Ahmanuddin Firman");

    // Dibaca lagi lewat jalur yang sama dengan pemanggil anonim. Kalau
    // koreksi tidak disimpan, nama akan kembali menjadi tebakan di sini.
    expect(findRequest(await board(t, requestId), requestId)?.requesterName).toBe(
      "Ahmanuddin Firman",
    );
  });

  test("akun tanpa email atau tanpa nama yang bisa diturunkan jatuh ke fallback", async () => {
    const t = convexTest(schema, modules);
    const { requestId } = await seedRequester(t, { name: "Tanpa Email" });
    expect(findRequest(await board(t, requestId), requestId)?.requesterName).toBe(
      "Warga Sumenep",
    );
  });
});

describe("F-05 - tidak ada kebocoran email lewat nama turunan", () => {
  test("email tidak ikut di respons, untuk anonim maupun yang punya sesi", async () => {
    const t = convexTest(schema, modules);
    const email = "ahmanuddin.firman@gmail.com";
    const { requestId, userId } = await seedRequester(t, { email });

    for (const identity of [undefined, `${userId}|sesi-uji-2`]) {
      const rows = await board(t, requestId, identity);
      const json = JSON.stringify(rows);
      expect(json, "email tidak boleh muncul di respons papan").not.toContain(email);
      expect(json).not.toContain("gmail.com");
      // Local part-nya pun tidak boleh, kalau tidak nama turunan jadi
      // fungsi kebocoran yang bisa dibalik.
      expect(json).not.toContain("ahmanuddin.firman");
    }
  });

  test("publicName mentah tidak ikut, hanya bentuk bersihnya", async () => {
    const t = convexTest(schema, modules);
    // Disimpan dengan bentuk yang TIDAK akan lolos sanitasi kalau ada yang
    // memintanya tanpa dibersihkan lebih dulu.
    const { requestId, userId } = await seedRequester(t, {
      email: "budi.santoso@gmail.com",
      publicName: "  budi   SANTOSO<script>  ",
    });

    const json = JSON.stringify(await board(t, requestId, `${userId}|sesi-uji-3`));
    // Yang dijamin adalah tidak ada HTML yang lolos dan tidak ada spasi
    // bertumpuk. Bentuk kata hasil sanitasi tidak dikunci di sini, karena
    // `lettersOnly` memperlakukan `<` dan `>` sebagai pemisah - "budi
    // santos<script>" menjadi "Budi Santos Script", bukan "Budi Script".
    // Mengunci bentuk yang tepat di sini akan jadi rem yang menahan
    // perubahan sanitasi yang benar di kemudian hari.
    expect(json).not.toContain("<script>");
    expect(json).not.toContain("  ");
    const shown = findRequest(await board(t, requestId), requestId)?.requesterName ?? "";
    expect(shown).toMatch(/^[A-Za-z ]+$/);
    expect(shown).toContain("Budi");
    // Nama akun tidak ikut, dan email tidak ikut.
    expect(shown).not.toContain("gmail.com");
    expect(json).not.toContain("gmail.com");
  });

  /**
   * FASE 3 - KONTRAK DIPERKETAT.
   *
   * Versi sebelumnya test ini mengunci `requesterId` sebagai perilaku yang
   * benar untuk pemanggil yang punya sesi. Sekarang tidak ada satu pun bentuk
   * jawaban yang memuatnya: pertanyaan "ini permintaan saya?" dijawab server
   * dengan `isMine`/`canManage`, dan id akunnya tetap di server.
   *
   * Email juga tetap diperiksa di sini karena ia satu-satunya field akun yang
   * punya jalur nyata menuju DTO ini lewat `resolvePublicName`.
   */
  test("papan mengirim kemampuan, dan tidak pernah mengirim id akun atau email", async () => {
    const t = convexTest(schema, modules);
    const { requestId, userId } = await seedRequester(t, {
      email: "siti.hajar@gmail.com",
    });

    const anonim = findRequest(await board(t, requestId), requestId);
    expect(anonim?.isMine).toBe(false);
    expect(anonim?.canOffer).toBe(false);
    expect(anonim).not.toHaveProperty("requesterId");
    expect(anonim?.requesterName).toBe("Siti Hajar");

    const pemilik = findRequest(
      await board(t, requestId, `${userId}|sesi-uji-4`),
      requestId,
    );
    expect(pemilik?.isMine).toBe(true);
    expect(pemilik?.canManage).toBe(true);
    // Meski pemanggilnya pemilik, id akunnya TIDAK ikut keluar.
    expect(pemilik).not.toHaveProperty("requesterId");
  });
});

describe("F-05 - jalur koreksi tidak bisa dipakai untuk menulis milik orang lain", () => {
  test("setMyDisplayName menolak pemanggil tanpa sesi", async () => {
    const t = convexTest(schema, modules);
    await seedRequester(t, { email: "budi.santoso@gmail.com" });

    await expect(
      t.mutation(api.users.setMyDisplayName, { name: "Nama Baru" }),
    ).rejects.toBeTruthy();
  });

  test("setMyDisplayName menolak nama yang tidak menghasilkan nama", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedRequester(t, { email: "budi.santoso@gmail.com" });
    const caller = t.withIdentity({ subject: `${userId}|sesi-uji-5` });

    for (const name of ["", "  ", "a", "123", "..."]) {
      await expect(
        caller.mutation(api.users.setMyDisplayName, { name }),
      ).rejects.toBeTruthy();
    }
  });

  test("nama yang akan diubah oleh server dijawab apa adanya, bukan diterima diam-diam", async () => {
    // Kalau server diam-diam menyimpan bentuk hasil sanitasi, pengguna akan
    // mengira yang tersimpan adalah yang dia ketik, lalu menemukan kesalahannya
    // lama setelahnya.
    const t = convexTest(schema, modules);
    const { userId } = await seedRequester(t, { email: "budi.santoso@gmail.com" });
    const caller = t.withIdentity({ subject: `${userId}|sesi-uji-6` });

    // Isi yang hilang (spasi ganda, angka, tanda baca, HTML) tetap ditolak.
    await expect(
      caller.mutation(api.users.setMyDisplayName, { name: "budi  santoso" }),
    ).rejects.toThrow(/Coba: Budi Santoso/);
    await expect(
      caller.mutation(api.users.setMyDisplayName, { name: "budi santoso 99" }),
    ).rejects.toThrow(/Coba: Budi Santoso/);
    await expect(
      caller.mutation(api.users.setMyDisplayName, { name: "budi<script>" }),
    ).rejects.toThrow(/Coba: Budi Script/);
  });

  test("kapitalisasi bukan alasan menolak: isian huruf kecil langsung disimpan", async () => {
    // Laporan ERR F-14: "Shina suka matcha" ditolak dengan balasan "Coba:
    // Shina Suka Matcha", jadi pengguna harus mengetik ulang. Isian huruf
    // kecil adalah bentuk paling normal dari mengetik nama - menolaknya
    // memaksa pengguna menebak aturan yang tidak pernah ditampilkan.
    const t = convexTest(schema, modules);
    const { userId } = await seedRequester(t, { email: "shina@mail.com" });
    const caller = t.withIdentity({ subject: `${userId}|sesi-uji-9` });

    const tersimpan = await caller.mutation(api.users.setMyDisplayName, {
      name: "Shina suka matcha",
    });
    expect(tersimpan).toBe("Shina Suka Matcha");

    // Yang tersimpan harus benar-benar yang dipanggil papan publik, bukan
    // hanya nilai balasan.
    expect(await caller.query(api.users.myDisplayName, {})).toMatchObject({
      publicName: "Shina Suka Matcha",
      current: "Shina Suka Matcha",
    });

    // Menulis ulang dengan bentuk kapital yang sama tetap idempoten.
    expect(
      await caller.mutation(api.users.setMyDisplayName, {
        name: "shina suka matcha",
      }),
    ).toBe("Shina Suka Matcha");
  });

  test("ensureMyDisplayName idempoten dan tidak menimpa koreksi", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedRequester(t, { email: "siti.hajar@gmail.com" });
    const caller = t.withIdentity({ subject: `${userId}|sesi-uji-7` });

    expect(await caller.mutation(api.users.ensureMyDisplayName, {})).toBe("Siti Hajar");
    expect(await caller.mutation(api.users.ensureMyDisplayName, {})).toBe("Siti Hajar");

    await caller.mutation(api.users.setMyDisplayName, { name: "Siti Hajar Aminah" });
    // `ensure` tidak boleh mengembalikan tebakan lama dan menimpa koreksi.
    expect(await caller.mutation(api.users.ensureMyDisplayName, {})).toBe(
      "Siti Hajar Aminah",
    );
  });

  test("myDisplayName hanya menjawab untuk sesi sendiri", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedRequester(t, { email: "siti.hajar@gmail.com" });
    const pemanggil = t.withIdentity({ subject: `${userId}|sesi-uji-8` });

    const hasil = await pemanggil.query(api.users.myDisplayName, {});
    expect(hasil.current).toBe("Siti Hajar");
    // Email tidak boleh keluar dari query milik pemilik sendiri.
    expect(JSON.stringify(hasil)).not.toContain("gmail.com");

    await expect(t.query(api.users.myDisplayName, {})).rejects.toBeTruthy();
  });
});
