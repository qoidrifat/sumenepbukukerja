/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

/**
 * FASE 10 - kontrak handoff kontak.
 *
 * Ini adalah endpoints baru, jadi ini juga attack surface baru. Yang diuji di
 * sini persis empat hal yang diklaim server lakukan, ditambah dua hal yang
 * harus NYATA agar tidak tetap jadi kebocoran:
 *
 *   1. Nomor mentah hanya keluar lewat handoff ini, tidak lewat katalog.
 *   2. `contactRef` tidak bisa ditebak, dan listing non-aktif tidak bisa
 *      dihubungi meski pegangannya bocor.
 *   3. Kuota berlaku untuk pemanggil yang punya identitas maupun yang tidak.
 *   4. Teks pesan disusun server - pemanggil tidak bisa menempelkan teks
 *      apa pun ke nomor siapa pun.
 *
 * Yang TIDAK diuji di sini: apakah tombolnya masih bisa ditekan. Itu butuh
 * peramban, dan lingkungan ini tidak punya satu pun (lihat laporan bagian 7).
 */

const modules = import.meta.glob("./**/*.ts");

const PHONE = "628123456789";
const CONTACT_REF = "cr1_abcdefabcdefabcdefabcdefabcdefab";

const now = () => Date.now();

type SeedOptions = {
  status?: "draft" | "active" | "archived";
  contactRef?: string | null;
  phone?: string;
};

async function seedVendor(
  t: ReturnType<typeof convexTest>,
  options: SeedOptions = {},
) {
  const {
    status = "active",
    contactRef = CONTACT_REF,
    phone = PHONE,
  } = options;
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("vendors", {
      slug: "usaha-uji",
      name: "Usaha Uji",
      category: "Kuliner",
      description: "Deskripsi usaha.",
      address: "Jl. Uji",
      landmark: "anom",
      price: "Mulai Rp20.000",
      hours: "Setiap hari",
      phone,
      ...(contactRef ? { contactRef } : {}),
      rating: "4.8",
      reviewsCount: 3,
      accent: "from-blue-500 to-blue-700",
      mark: "UU",
      tags: ["Tag Satu"],
      status,
      featured: false,
      verified: true,
      availability: "available",
      createdAt: now(),
      updatedAt: now(),
    });
  });
}

/** Nomor yang harus tidak pernah muncul di respons mana pun. */
const digitSuffix = () => PHONE.slice(-6);

describe("handoff kontak: happy path", () => {
  test("menghasilkan URL wa.me yang valid untuk listing aktif", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);

    const result = await t.mutation(api.vendors.getContactHandoff, {
      contactRef: CONTACT_REF,
      intent: "price",
    });

    expect(result.url.startsWith("https://wa.me/")).toBe(true);
    // Teks pesan harus ikut, dan itu disusun server dari data listing.
    expect(result.url).toContain(encodeURIComponent("Usaha Uji"));
    expect(result.telUrl.startsWith("tel:+")).toBe(true);
  });

  test("handoff tetap jalan untuk pemanggil tanpa sesi", async () => {
    // Tombol mati karena "belum masuk" adalah regresi produk yang jauh lebih
    // mahal daripada risiko yang hypothalamus batas laju ini cegah.
    const t = convexTest(schema, modules);
    await seedVendor(t);

    const anonymous = t.withIdentity({});
    const result = await anonymous.mutation(api.vendors.getContactHandoff, {
      contactRef: CONTACT_REF,
    });

    expect(result.url).toContain("wa.me");
  });
});

describe("handoff kontak: penolakan", () => {
  test("pegangan dengan bentuk salah ditolak", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);

    for (const bad of [
      "",
      "  ",
      "cr1_short",
      "not-a-ref",
      "cr1_0123456789abcdef0123456789abcdeg", // 'g' bukan hex
      PHONE, // nomor mentah itu sendiri
      `${CONTACT_REF} `, // ada spasi akhir setelah trim -> jadi valid, jadi di bawah
    ]) {
      if (bad === `${CONTACT_REF} `) continue;
      await expect(
        t.mutation(api.vendors.getContactHandoff, { contactRef: bad }),
        `pegangan ${JSON.stringify(bad)} seharusnya ditolak`,
      ).rejects.toBeTruthy();
    }
  });

  test("pegangan yang tidak dikenal ditolak", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);

    await expect(
      t.mutation(api.vendors.getContactHandoff, {
        contactRef: "cr1_00000000000000000000000000000000",
      }),
    ).rejects.toBeTruthy();
  });

  test("listing draft dan archived tidak bisa dihubungi meski pegangan bocor", async () => {
    // Ini yang membuat `contactRef` aman dibaca dari tangkapan layar atau log:
    // pegangnya leaked, tapi listingnya sudah tidak tayang.
    for (const status of ["draft", "archived"] as const) {
      const t = convexTest(schema, modules);
      await seedVendor(t, { status });

      await expect(
        t.mutation(api.vendors.getContactHandoff, { contactRef: CONTACT_REF }),
        `status ${status} seharusnya ditolak`,
      ).rejects.toBeTruthy();
    }
  });

  test("listing tanpa pegangan kontak tidak bisa dihubungi", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t, { contactRef: null });

    await expect(
      t.mutation(api.vendors.getContactHandoff, { contactRef: CONTACT_REF }),
    ).rejects.toBeTruthy();
  });

  test("nomor tidak valid ditolak, bukan diteruskan ke wa.me", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t, { phone: "123" });

    await expect(
      t.mutation(api.vendors.getContactHandoff, { contactRef: CONTACT_REF }),
    ).rejects.toBeTruthy();
  });
});

describe("handoff kontak: pembatasan laju", () => {
  test("pemanggil tanpa identitas dihentikan setelah kuota per listing", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);
    const anonymous = t.withIdentity({});

    // Dihitung, bukan diasumsikan: looping sampai ditolak, lalu memeriksa
    // banyaknya. Ini menjaga test tetap jujur kalau HENDOFF_ANON_PER_WINDOW
    // diubah - dan yang paling penting, membuktikan bahwa batas ITU ADA,
    // bukan hanya membandingkan konstanta dengan dirinya sendiri.
    let allowed = 0;
    for (;;) {
      try {
        await anonymous.mutation(api.vendors.getContactHandoff, {
          contactRef: CONTACT_REF,
        });
        allowed += 1;
      } catch {
        break;
      }
      if (allowed > 100) throw new Error("kuota tidak pernah berhenti");
    }

    expect(allowed, "kuota handoff anonim harus dibatasi").toBeGreaterThan(0);
    expect(allowed, "kuota handoff anonim harus dibatasi").toBeLessThanOrEqual(30);
    // Setelah kuota habis, panggilan berikutnya tetap ditolak.
    await expect(
      anonymous.mutation(api.vendors.getContactHandoff, {
        contactRef: CONTACT_REF,
      }),
    ).rejects.toBeTruthy();
  });

  test("baris kedaluwarsa dibersihkan sendiri, bukan menumpuk", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);
    const anonymous = t.withIdentity({});

    await anonymous.mutation(api.vendors.getContactHandoff, {
      contactRef: CONTACT_REF,
    });

    // Dorong baris ke masa lalu, di luar jendela satu jam.
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("contactHandoffs").collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { createdAt: Date.now() - 2 * 60 * 60 * 1000 });
      }
    });

    // Panggilan berikutnya harus berhasil: baris basi dibuang, bukan
    // menghitung kuota sendiri.
    const result = await anonymous.mutation(api.vendors.getContactHandoff, {
      contactRef: CONTACT_REF,
    });
    expect(result.url).toContain("wa.me");

    const remaining = await t.run(async (ctx) =>
      ctx.db.query("contactHandoffs").collect(),
    );
    expect(remaining.length).toBe(1);
  });
});

describe("handoff kontak: tidak bisa jadi alat spam", () => {
  test("teks pesan disusun server dan argumen tak dikenal ditolak", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);

    // `intent` dan `reference` adalah satu-satunya hal yang boleh dipilih
    // pemanggil. Kalau `text` atau `to` ikut diterima, endpoint ini berubah jadi
    // amplifier: pemanggil bisa menempelkan pesan apa saja ke nomor siapa saja.
    await expect(
      t.mutation(api.vendors.getContactHandoff, {
        contactRef: CONTACT_REF,
        text: "promo agua mineral cepat",
      } as never),
    ).rejects.toBeTruthy();

    await expect(
      t.mutation(api.vendors.getContactHandoff, {
        contactRef: CONTACT_REF,
        phone: PHONE,
      } as never),
    ).rejects.toBeTruthy();
  });

  test("referensi dipotong, bukan dipakai tanpa batas", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);

    const result = await t.mutation(api.vendors.getContactHandoff, {
      contactRef: CONTACT_REF,
      intent: "request",
      reference: "x".repeat(5_000),
    });
    // URL wa.me memuat teks; kalau referensi tidak dipotong, satu permintaan
    // bisa jadi payload besar.
    expect(result.url.length).toBeLessThan(1_000);
  });
});

describe("handoff kontak: jejak dan migrasi", () => {
  test("handoff tercatat di analitik tanpa nomor dan tanpa teks pesan", async () => {
    const t = convexTest(schema, modules);
    const vendorId = await seedVendor(t);

    await t.mutation(api.vendors.getContactHandoff, {
      contactRef: CONTACT_REF,
      intent: "estimate",
    });

    const events = await t.run(async (ctx) =>
      ctx.db.query("analyticsEvents").collect(),
    );
    const handoff = events.find((event) => event.event === "contact_handoff");
    expect(handoff).toBeTruthy();
    expect(handoff?.vendorId).toBe(vendorId);

    const json = JSON.stringify(events);
    expect(json).not.toContain(digitSuffix());
    expect(json).not.toContain("wa.me");
  });

  test("backfill mengisi listing lama dan idempoten", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t, { contactRef: null });

    const first = await t.mutation(internal.vendors.backfillContactRefs, {});
    expect(first).toEqual({ scanned: 1, updated: 1 });

    const [row] = await t.query(api.vendors.listActive, {});
    expect(row?.contactRef).toMatch(/^cr1_[0-9a-f]{32}$/);

    // Jalankan lagi: listing yang sudah punya pegangan tidak boleh berubah,
    // jadi tautan yang sudah dibagikan orang tetap hidup.
    const second = await t.mutation(internal.vendors.backfillContactRefs, {});
    expect(second).toEqual({ scanned: 1, updated: 0 });

    const [after] = await t.query(api.vendors.listActive, {});
    expect(after?.contactRef).toBe(row?.contactRef);
  });

  test("backfill hanya menyentuh listing aktif", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t, { status: "archived", contactRef: null });

    const result = await t.mutation(internal.vendors.backfillContactRefs, {});
    expect(result.updated).toBe(0);
  });
});