/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Hak jawab pemilik usaha atas ulasan (right-of-reply).
 *
 * Satu balasan per ulasan; pemanggilan ulang = edit. Yang boleh membalas
 * hanya pemilik listing itu atau pengelola (staf). Penulis ulasan yang
 * punya akun diberi tahu lewat notifikasi dalam aplikasi; penulis anonim
 * dilewati diam-diam karena tidak ada akun yang bisa diberi tahu.
 *
 * Listing harus `active`: balasan pada listing arsip/draf ditolak, sama
 * seperti ulasannya sendiri.
 */

const listingPayload = {
  name: "Bengkel Uji Balasan",
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

async function seedUser(t: Test, name: string, email: string, role?: "admin" | "staff") {
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
 * Listing aktif + satu ulasan dari warga ber-akun.
 *
 * Preseden yang sama dengan `activeListing` di
 * `reviews-notifications.test.ts`: `createVendor` selalu membuat draf untuk
 * akun non-staff, jadi pemiliknya harus berperan agar listingnya aktif.
 */
async function listingWithReview(t: Test, opts: { anonymousAuthor?: boolean } = {}) {
  const owner = await seedUser(
    t,
    "Pemilik Balasan",
    `pemilik-balasan-${Math.random().toString(36).slice(2, 8)}@sumenep.co.id`,
    "admin",
  );
  const vendorId = await owner.asUser.mutation(api.vendors.createVendor, {
    ...listingPayload,
    name: `Bengkel Uji Balasan ${Math.random().toString(36).slice(2, 6)}`,
  });
  const vendor = await t.run(async (ctx) => await ctx.db.get(vendorId as never));
  expect(vendor?.status).toBe("active");
  const slug = vendor!.slug;

  let author: Awaited<ReturnType<typeof seedUser>> | null = null;
  if (opts.anonymousAuthor) {
    await t.mutation(api.vendors.addReview, {
      vendorId,
      authorName: "Anonim",
      rating: 4,
      body: "Pompa beres, harga cocok.",
    });
  } else {
    author = await seedUser(t, "Warga Ulas", `warga-balas-${Math.random().toString(36).slice(2, 8)}@sumenep.co.id`);
    await author.asUser.mutation(api.vendors.addReview, {
      vendorId,
      authorName: "Warga Ulas",
      rating: 4,
      body: "Pompa beres, harga cocok.",
    });
  }
  // Tanpa `withIndex` di sini: helper memakai `t` bertipe generik (idiom
  // `type Test = ReturnType<typeof convexTest>` di berkas test repo ini),
  // sehingga `ctx` di `t.run` hanya mengenal indeks sistem. Satu baris
  // ulasan per database test, jadi `collect` + `find` cukup dan tetap eksak.
  const rows = await t.run(async (ctx) => await ctx.db.query("reviews").collect());
  const review = rows.find((row) => String(row.vendorId) === String(vendorId));
  expect(review).toBeTruthy();
  return { owner, vendorId, slug, reviewId: review!._id, author };
}

/**
 * Bentuk baris ulasan BESERTA balasan.
 *
 * Cast eksplisit ini disengaja, bukan kelonggaran: `dataModel.d.ts` adalah
 * hasil codegen dari `schema.ts`, dan codegen menolak jalan selama ada
 * error ketik — jadi test yang mengakses field skema BARU tidak bisa
 * mengandalkan tipe hasil codegen sebelum codegen pertama selesai. Setelah
 * `bunx convex codegen` hijau, cast ini tetap valid (Doc punya `reply`).
 * Yang diuji tetap perilaku runtime, bukan tipe.
 */
type ReviewWithReply = {
  reply?: { body: string; createdAt: number; updatedAt?: number };
};

async function getReview(t: Test, reviewId: { toString(): string }) {
  const row = await t.run(async (ctx) => await ctx.db.get(reviewId as never));
  return row as unknown as ReviewWithReply | null;
}

describe("replyReview", () => {
  test("pemilik membalas ulasan di listingnya", async () => {
    const t = convexTest(schema, modules);
    const { reviewId, vendorId } = await listingWithReview(t);
    // Alihkan kepemilikan ke warga biasa TANPA peran staf: balasan harus lolos
    // lewat jalur pemilik (`ownerId === userId`), bukan lewat jalur staf.
    const plainOwner = await seedUser(t, "Pemilik Biasa", "pemilik-biasa@sumenep.co.id");
    await t.run(async (ctx) => await ctx.db.patch(vendorId as never, { ownerId: plainOwner.userId as never }));

    const returned = await plainOwner.asUser.mutation(api.vendors.replyReview, {
      reviewId,
      body: "Terima kasih, senang bisa membantu.",
    });
    expect(String(returned)).toBe(String(reviewId));

    const review = await getReview(t, reviewId);
    expect(review?.reply).toMatchObject({ body: "Terima kasih, senang bisa membantu." });
    expect(typeof review?.reply?.createdAt).toBe("number");
    expect(review?.reply?.updatedAt).toBeUndefined();
  });

  test("panggil ulang = edit, bukan balasan kedua", async () => {
    const t = convexTest(schema, modules);
    const { owner, reviewId } = await listingWithReview(t);

    await owner.asUser.mutation(api.vendors.replyReview, { reviewId, body: "Balasan pertama." });
    const first = await getReview(t, reviewId);
    await owner.asUser.mutation(api.vendors.replyReview, { reviewId, body: "Balasan revisi." });

    const second = await getReview(t, reviewId);
    expect(second?.reply?.body).toBe("Balasan revisi.");
    expect(second?.reply?.createdAt).toBe(first?.reply?.createdAt);
    expect(typeof second?.reply?.updatedAt).toBe("number");

    const audits = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").filter((q) => q.eq(q.field("action"), "review.replied")).collect(),
    );
    expect(audits.map((row) => row.newValue)).toEqual(['"created"', '"edited"']);
  });

  test("bukan pemilik dan bukan staf ditolak", async () => {
    const t = convexTest(schema, modules);
    const { reviewId } = await listingWithReview(t);
    const outsider = await seedUser(t, "Orang Asing", "asing@sumenep.co.id");

    await expect(
      outsider.asUser.mutation(api.vendors.replyReview, { reviewId, body: "Saya bukan pemilik." }),
    ).rejects.toThrow("Hanya pemilik listing atau pengelola");
  });

  test("anonim (tanpa identity) ditolak", async () => {
    const t = convexTest(schema, modules);
    const { reviewId } = await listingWithReview(t);

    await expect(
      t.mutation(api.vendors.replyReview, { reviewId, body: "Saya anonim." }),
    ).rejects.toThrow();
  });

  test("staf tanpa kepemilikan boleh membalas (operasional)", async () => {
    const t = convexTest(schema, modules);
    const { reviewId } = await listingWithReview(t);
    const staff = await seedUser(t, "Staf Operasional", "staf-op@sumenep.co.id", "staff");

    await staff.asUser.mutation(api.vendors.replyReview, {
      reviewId,
      body: "Kami teruskan ke pemilik usaha.",
    });
    const review = await getReview(t, reviewId);
    expect(review?.reply?.body).toBe("Kami teruskan ke pemilik usaha.");
  });

  test("reviewId tak ada, body kosong/kepanjangan, listing nonaktif → error", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId, reviewId } = await listingWithReview(t);

    await expect(
      owner.asUser.mutation(api.vendors.replyReview, {
        // Id review karangan yang valid secara tipe tapi tidak ada di tabel.
        reviewId: reviewId,
        body: "   ",
      }),
    ).rejects.toThrow("tidak boleh kosong");

    await expect(
      owner.asUser.mutation(api.vendors.replyReview, { reviewId, body: "x".repeat(501) }),
    ).rejects.toThrow("500 karakter");
    // Tepat 500 masih boleh — balasan memang harus ringkas.
    await expect(
      owner.asUser.mutation(api.vendors.replyReview, { reviewId, body: "x".repeat(500) }),
    ).resolves.toBeTruthy();

    // Id berbentuk valid tapi barisnya tidak ada: sisipkan lalu hapus.
    const ghostId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
        delete: (id: string) => Promise<void>;
      };
      const id = await db.insert("reviews", {
        vendorId,
        authorName: "Hantu",
        rating: 5,
        body: "Ulasan hantu.",
        createdAt: Date.now(),
      });
      await db.delete(id);
      return id;
    });
    await expect(
      owner.asUser.mutation(api.vendors.replyReview, { reviewId: ghostId as never, body: "Halo." }),
    ).rejects.toThrow("Ulasan tidak ditemukan");

    await owner.asUser.mutation(api.vendors.archiveVendor, { id: vendorId });
    await expect(
      owner.asUser.mutation(api.vendors.replyReview, { reviewId, body: "Halo lagi." }),
    ).rejects.toThrow("Listing tidak ditemukan");
  });

  test("penulis ber-akun diberi tahu; penulis anonim tidak", async () => {
    const t = convexTest(schema, modules);
    const { owner, reviewId, author } = await listingWithReview(t);
    expect(author).toBeTruthy();

    await owner.asUser.mutation(api.vendors.replyReview, {
      reviewId,
      body: "Terima kasih atas ulasannya.",
    });

    const inbox = await author!.asUser.query(api.community.listNotifications, {});
    const replyNotes = inbox.filter((row) => row.kind === `review_reply:${reviewId}`);
    expect(replyNotes).toHaveLength(1);
    expect(replyNotes[0]).toMatchObject({ title: "Ulasan Anda dibalas", read: false });

    const tAnon = convexTest(schema, modules);
    const anonCase = await listingWithReview(tAnon, { anonymousAuthor: true });
    await anonCase.owner.asUser.mutation(api.vendors.replyReview, {
      reviewId: anonCase.reviewId,
      body: "Terima kasih.",
    });
    const bell = await tAnon.run(async (ctx) => await ctx.db.query("notifications").collect());
    // Penulis anonim tidak punya akun — tidak ada baris notifikasi yang dibuat.
    expect(bell).toHaveLength(0);
  });

  test("getBySlug menyertakan reply (display publik gratis)", async () => {
    const t = convexTest(schema, modules);
    const { owner, reviewId, slug } = await listingWithReview(t);

    await owner.asUser.mutation(api.vendors.replyReview, {
      reviewId,
      body: "Mampir lagi bila perlu servis.",
    });

    const detail = await t.query(api.vendors.getBySlug, { slug });
    expect(detail?.reviews).toHaveLength(1);
    expect(detail?.reviews[0]).toMatchObject({
      reply: { body: "Mampir lagi bila perlu servis." },
    });
  });
});
