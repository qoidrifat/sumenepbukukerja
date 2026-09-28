/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Aturan bisnis ulasan dan notifikasi.
 *
 * Dua hal ini sama-sama terlihat benar di layar dan salah di server:
 *  - ulasan yang salah orang bisa menaikkan atau menurunkan rating rata-rata
 *    sebuah listing, dan rating itu dipakai orang untuk memercayai;
 *  - notifikasi yang hilang tidak merusak apa pun sampai pengguna bertanya
 *    "kenapa saya tidak diberi tahu", lalu fitur dianggap tidak ada.
 *
 * Perhatikan cara listing aktif dibuat di bawah: pemilik harus berperan. Itu
 * aturan produk yang sudah ada, bukan التقنية test.
 */

const listingPayload = {
  name: "Bengkel Uji Ulasan",
  category: "Servis Teknik",
  description: "Servis pompa air dan listrik untuk warga Sumenep.",
  address: "Jl. Uji No. 2, Sumenep",
  landmark: "kalianget",
  price: "Mulai Rp50.000",
  hours: "Setiap hari · 07.00–17.00",
  phone: "081234567890",
  tags: ["pompa"],
  status: "active" as const,
  availability: "available" as const,
  responseMinutes: 45,
  serviceRadiusKm: 8,
};

type Test = ReturnType<typeof convexTest>;

async function seedUser(t: Test, name: string, email: string, role?: "admin") {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    const id = await db.insert("users", { name, email });
    if (role) {
      await db.insert("staffMembers", { userId: id, role, createdAt: Date.now(), updatedAt: Date.now() });
    }
    return id;
  });
  return { userId, asUser: t.withIdentity({ subject: userId }) };
}

/**
 * Listing aktif.
 *
 * `createVendor` selalu membuat draf untuk akun non-staff, dan `updateVendor`
 * menolak memaksa status menjadi `active` tanpa peran pengelola — jadi untuk
 * punya listing aktif, pemiliknya harus berperan. Itu bukan penyesuaian test:
 * itu aturan produk yang sama dengan "Listing diterbitkan · Admin" di audit log.
 */
async function activeListing(t: Test, name = "Bengkel Uji Ulasan") {
  const owner = await seedUser(
    t,
    "Pemilik Ulasan",
    `pemilik-${Math.random().toString(36).slice(2, 8)}@sumenep.co.id`,
    "admin",
  );
  const vendorId = await owner.asUser.mutation(api.vendors.createVendor, { ...listingPayload, name });
  const vendor = await t.run(async (ctx) => await ctx.db.get(vendorId as never));
  expect(vendor?.status).toBe("active");
  return { owner, vendorId, slug: vendor!.slug };
}

describe("aturan bisnis ulasan", () => {
  test("warga yang masuk bisa menulis ulasan", async () => {
    const t = convexTest(schema, modules);
    const { vendorId, slug } = await activeListing(t);
    const resident = await seedUser(t, "Warga Ulas", "warga-ulasan@sumenep.co.id");

    const reviewId = await resident.asUser.mutation(api.vendors.addReview, {
      vendorId,
      authorName: "Warga Ulas",
      rating: 5,
      body: "Pompa langsung dinyalakan, kerja rapi.",
    });

    expect(reviewId).toBeTruthy();
    const detail = await t.query(api.vendors.getBySlug, { slug });
    expect(detail?.reviews).toHaveLength(1);
    expect(detail?.reviews[0]).toMatchObject({ rating: 5, authorName: "Warga Ulas" });
  });

  test("ulasan kedua dari orang yang sama ditolak", async () => {
    const t = convexTest(schema, modules);
    const { vendorId } = await activeListing(t);
    const resident = await seedUser(t, "Warga Ganda", "warga-ganda@sumenep.co.id");
    const args = { vendorId, authorName: "Warga Ganda", rating: 4, body: "Pelayanan baik." };
    await resident.asUser.mutation(api.vendors.addReview, args);

    await expect(resident.asUser.mutation(api.vendors.addReview, args)).rejects.toThrow(
      "sudah menulis ulasan",
    );
    // Menolak yang kedua tidak boleh mengubah apa pun.
    const rows = await t.run(async (ctx) => await ctx.db.query("reviews").collect());
    expect(rows).toHaveLength(1);
  });

  test("rating di luar 1-5 ditolak, bukan dijepit", async () => {
    // Perilaku lama `Math.min(5, Math.max(1, rating))` mengubah 0 menjadi
    // bintang 1 dan 99 menjadi bintang 5. Penolakan yang jujur lebih berguna.
    const t = convexTest(schema, modules);
    const { vendorId } = await activeListing(t);
    for (const rating of [0, -1, 6, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        t.mutation(api.vendors.addReview, {
          vendorId,
          authorName: "Warga",
          rating,
          body: "Ulasan.",
        }),
        String(rating),
      ).rejects.toThrow("Rating harus antara 1 dan 5");
    }
    expect(await t.run(async (ctx) => await ctx.db.query("reviews").collect())).toHaveLength(0);
  });

  test("rating pecahan tetap dibulatkan, bukan ditolak", async () => {
    // Bintang setengah itu wajar; 4.6 harus jadi 5, bukan ditolak.
    const t = convexTest(schema, modules);
    const { vendorId, slug } = await activeListing(t);
    await t.mutation(api.vendors.addReview, {
      vendorId,
      authorName: "Warga Pecahan",
      rating: 4.6,
      body: "Lumayan.",
    });
    const detail = await t.query(api.vendors.getBySlug, { slug });
    expect(detail?.reviews[0]?.rating).toBe(5);
  });

  test("ulasan kosong atau kepanjangan ditolak", async () => {
    const t = convexTest(schema, modules);
    const { vendorId } = await activeListing(t);
    await expect(
      t.mutation(api.vendors.addReview, { vendorId, authorName: "Warga", rating: 4, body: "   " }),
    ).rejects.toThrow("tidak boleh kosong");
    await expect(
      t.mutation(api.vendors.addReview, { vendorId, authorName: "  ", rating: 4, body: "Ulasan." }),
    ).rejects.toThrow("tidak boleh kosong");
    await expect(
      t.mutation(api.vendors.addReview, {
        vendorId,
        authorName: "Warga",
        rating: 4,
        body: "x".repeat(601),
      }),
    ).rejects.toThrow("600 karakter");
    // Tepat 600 masih boleh.
    await expect(
      t.mutation(api.vendors.addReview, {
        vendorId,
        authorName: "Warga",
        rating: 4,
        body: "x".repeat(600),
      }),
    ).resolves.toBeTruthy();
  });

  test("listing nonaktif tidak bisa diulas", async () => {
    // Menutup listing harus menutup ulasan juga: rating halaman arsip tidak
    // boleh berubah karena orang bisa menulis di halaman lama.
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await activeListing(t);
    await owner.asUser.mutation(api.vendors.archiveVendor, { id: vendorId });
    await expect(
      t.mutation(api.vendors.addReview, {
        vendorId,
        authorName: "Warga",
        rating: 5,
        body: "Masih bagus?",
      }),
    ).rejects.toThrow("Listing tidak ditemukan");
  });

  test("pemilik tanpa peran tidak bisa menerbitkan listingnya sendiri", async () => {
    // Aturan produk yang terlihat dari sini: draf tetap draf sampai pengelola
    // yang menerbitkannya. Ulasan hanya berlaku untuk listing aktif, jadi
    // tanpa aturan ini, engage bisa dibangun di halaman yang tidak terlihat.
    const t = convexTest(schema, modules);
    const resident = await seedUser(t, "Warga Biasa", "warga-biasa@sumenep.co.id");
    const draftId = await resident.asUser.mutation(api.vendors.createVendor, {
      ...listingPayload,
      name: "Bengkel Draft Uji",
    });
    await resident.asUser.mutation(api.vendors.updateVendor, {
      id: draftId,
      ...listingPayload,
      name: "Bengkel Draft Uji",
      status: "active",
    });
    const draft = (await t.run(async (ctx) => await ctx.db.get(draftId as never))) as {
      status?: string;
    } | null;
    expect(draft?.status).not.toBe("active");
    // Dan drafnya tidak bisa diulas, karena `addReview` hanya untuk listing aktif.
    await expect(
      t.mutation(api.vendors.addReview, {
        vendorId: draftId,
        authorName: "Warga",
        rating: 5,
        body: "Ulasan untuk draf.",
      }),
    ).rejects.toThrow("Listing tidak ditemukan");
  });

  test("listing tanpa ulasan tetap aman dibaca", async () => {
    // Halaman profil harus bekerja saat `reviews` kosong: ini keadaan awal
    // setiap listing baru, jadi harus jadi jalur yang paling sering diuji.
    const t = convexTest(schema, modules);
    const { vendorId, slug } = await activeListing(t);
    const detail = await t.query(api.vendors.getBySlug, { slug });
    expect(detail?.reviews).toEqual([]);
    expect(detail?.reviewsCount ?? 0).toBe(0);
    expect(detail?.rating ?? "0").toBeDefined();

    const list = await t.query(api.vendors.listActive, {});
    expect(list.some((vendor) => vendor._id === vendorId)).toBe(true);
  });

  test("rata-rata dan jumlah ulasan dihitung benar", async () => {
    const t = convexTest(schema, modules);
    const { vendorId, slug } = await activeListing(t);
    for (const [index, rating] of [5, 4, 3].entries()) {
      const resident = await seedUser(t, `Warga ${index}`, `warga-${index}@sumenep.co.id`);
      await resident.asUser.mutation(api.vendors.addReview, {
        vendorId,
        authorName: `Warga ${index}`,
        rating,
        body: `Ulasan nomor ${index}`,
      });
    }
    const detail = await t.query(api.vendors.getBySlug, { slug });
    // (5 + 4 + 3) / 3 = 4.0
    expect(detail?.rating).toBe("4.0");
    expect(detail?.reviewsCount).toBe(3);
    expect(detail?.reviews).toHaveLength(3);
  });

  test("ulasan anonim dibatasi per hari, dan tidak dihitung per orang", async () => {
    // Tanpa akun, identitas orang tidak bisa dihitung, jadi batasnya kuota
    // harian per listing. Ini satu-satunya pembatas spam yang tersedia.
    const t = convexTest(schema, modules);
    const { vendorId } = await activeListing(t);
    for (let index = 0; index < 3; index += 1) {
      await t.mutation(api.vendors.addReview, {
        vendorId,
        authorName: `Anonim ${index}`,
        rating: 5,
        body: `Ulasan anonim ${index}`,
      });
    }
    await expect(
      t.mutation(api.vendors.addReview, {
        vendorId,
        authorName: "Anonim 4",
        rating: 5,
        body: "Ulasan anonim keempat",
      }),
    ).rejects.toThrow("Terlalu banyak ulasan hari ini");
  });
});

describe("notifikasi dalam aplikasi", () => {
  async function offerFlow(t: Test) {
    const { owner, vendorId } = await activeListing(t, "Bengkel Uji Tawaran");
    const requester = await seedUser(t, "Peminta", "peminta@sumenep.co.id");
    const requestId = await requester.asUser.mutation(api.community.createRequest, {
      title: "Pompa air tersendat",
      description: "Pompa air di rumah tersendat sejak semalam dan tidak mau menyala.",
      category: "Servis Teknik",
      landmark: "kalianget",
    });
    const offerId = await owner.asUser.mutation(api.offers.offerRequest, {
      requestId,
      vendorId,
      message: "Bisa datang besok pagi.",
    });
    return { owner, requester, vendorId, requestId, offerId };
  }

  test("tawaran diterima memberi tahu pemilik listing DAN peminta", async () => {
    // Celah nyata yang ditemukan di Fase 1: peminta hanya diberi tahu lewat
    // WhatsApp, yang sedang mati karena token kedaluwarsa. Jadi satu-satunya
    // kanal yang tersisa untuk "tawaran Anda diterima" adalah in-app.
    const t = convexTest(schema, modules);
    const { owner, requester, requestId, offerId } = await offerFlow(t);

    await requester.asUser.mutation(api.offers.acceptRequestOffer, { requestId, offerId });

    const ownerRows = await owner.asUser.query(api.community.listNotifications, {});
    const requesterRows = await requester.asUser.query(api.community.listNotifications, {});

    expect(ownerRows.map((row) => row.title)).toContain("Tawaran Anda diterima");
    // Peminta boleh punya notifikasi lain (permintaannya sendiri dipublikasikan),
    // tapi tepat satu yang memberitahukan hasil tawaran ini.
    const claimed = requesterRows.filter((row) => row.kind === `request_claimed:${requestId}`);
    expect(claimed).toHaveLength(1);
    // Keduanya belum dibaca: angka lonceng di Dashboard harus bergerak.
    expect(ownerRows.every((row) => row.read === false)).toBe(true);
    expect(claimed[0]?.read).toBe(false);
  });

  test("menerima tawaran dua kali tidak menghasilkan notifikasi ganda", async () => {
    // Notifikasi ganda adalah spam, dan bagi pengguna itu berarti fitur ini
    // tidak bisa dipercaya. Mutasi kedua harus gagal, jadi tidak ada insert.
    const t = convexTest(schema, modules);
    const { requester, requestId, offerId } = await offerFlow(t);
    await requester.asUser.mutation(api.offers.acceptRequestOffer, { requestId, offerId });
    await expect(
      requester.asUser.mutation(api.offers.acceptRequestOffer, { requestId, offerId }),
    ).rejects.toBeTruthy();
    const rows = await requester.asUser.query(api.community.listNotifications, {});
    expect(rows.filter((row) => row.kind === `request_claimed:${requestId}`)).toHaveLength(1);
  });

  test("moderasi laporan memberi tahu pelapor, dan hanya saat status berubah", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await activeListing(t, "Bengkel Uji Laporan");
    const moderator = await seedUser(t, "Pengelola", "pengelola@sumenep.co.id", "admin");
    const reporter = await seedUser(t, "Pelapor", "pelapor@sumenep.co.id");

    const reportId = await reporter.asUser.mutation(api.community.createReport, {
      vendorId,
      reason: "Informasi tidak sesuai",
      details: "Nomor telepon di listing tidak bisa dihubungi sejak kemarin.",
    });
    expect(await reporter.asUser.query(api.community.listNotifications, {})).toHaveLength(0);

    await moderator.asUser.mutation(api.community.updateReport, { id: reportId, status: "resolved" });
    const after = await reporter.asUser.query(api.community.listNotifications, {});
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: `report_update:${reportId}`, read: false });

    // Moderasi ulang dengan status yang sama tidak menambah notifikasi kedua.
    await moderator.asUser.mutation(api.community.updateReport, { id: reportId, status: "resolved" });
    expect(await reporter.asUser.query(api.community.listNotifications, {})).toHaveLength(1);
    expect(owner).toBeTruthy();
  });

  test("warga biasa tidak bisa memoderasi laporan", async () => {
    // `updateReport` menolak tanpa peran: kalau tidak, siapa pun bisa menutup
    // laporan dan membuat pelapor menerima "sudah ditangani" yang palsu.
    const t = convexTest(schema, modules);
    const { vendorId } = await activeListing(t, "Bengkel Uji Otorisasi");
    const reporter = await seedUser(t, "Pelapor", "pelapor-otorisasi@sumenep.co.id");
    const reportId = await reporter.asUser.mutation(api.community.createReport, {
      vendorId,
      reason: "Spam",
      details: "Listing ini Appear dua kali dengan nama berbeda.",
    });
    await expect(
      reporter.asUser.mutation(api.community.updateReport, { id: reportId, status: "dismissed" }),
    ).rejects.toBeTruthy();
  });

  test("tandai terbaca hanya menyentuh notifikasi orang itu", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUser(t, "Warga Satu", "warga-satu@sumenep.co.id");
    const second = await seedUser(t, "Warga Dua", "warga-dua@sumenep.co.id");
    for (const user of [first, second]) {
      await t.run(async (ctx) => {
        await ctx.db.insert("notifications", {
          userId: user.userId as never,
          kind: "request_update",
          title: "Pembaruan",
          body: "Isi",
          read: false,
          createdAt: Date.now(),
        });
      });
    }

    await first.asUser.mutation(api.community.markNotificationsRead, {});

    expect(await first.asUser.query(api.community.listNotifications, {})).toMatchObject([{ read: true }]);
    // Notifikasi orang lain tidak boleh ikut ditandai — ini batas otorisasinya.
    expect(await second.asUser.query(api.community.listNotifications, {})).toMatchObject([{ read: false }]);
  });

  test("tanpa masuk, daftar notifikasi kosong dan penandaan tidak menyentuh apa pun", async () => {
    // `requireUser` di aplikasi ini juga menerima identitas anonim Convex Auth,
    // jadi `markNotificationsRead` tidak melempar — ia hanya menandai baris milik
    // pemanggil, dan anonim tidak punya baris. Yang dikunci di sini adalah
    // sifat amannya, bukan penolakan.
    const t = convexTest(schema, modules);
    const anonymous = t.withIdentity({ name: "Pengunjung" });
    expect(await anonymous.query(api.community.listNotifications, {})).toEqual([]);
    const marked = await anonymous.mutation(api.community.markNotificationsRead, {});
    expect(marked).toBe(0);
  });

  test("notifikasi bertahan setelah dibaca dan tidak hilang sendiri", async () => {
    // Notifikasi yang lenyap setelah dibaca tidak bisa dipakai untuk menelusuri
    // kembali: "tawaran Anda diterima" harus masih bisa dibaca besok.
    const t = convexTest(schema, modules);
    const user = await seedUser(t, "Warga Simpan", "warga-simpan@sumenep.co.id");
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        userId: user.userId as never,
        kind: "request_update",
        title: "Tawaran Anda diterima",
        body: "Isi",
        read: false,
        createdAt: Date.now(),
      });
    });
    await user.asUser.mutation(api.community.markNotificationsRead, {});
    const rows = await user.asUser.query(api.community.listNotifications, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.read).toBe(true);
  });
});
