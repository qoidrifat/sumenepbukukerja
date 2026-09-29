/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

/**
 * Bukti untuk keputusan "paginasi ditunda".
 *
 * Pertanyaannya bukan "apakah perlu implementasikan paginasi sekarang", tapi
 * "apakah arsitektur sekarang sudah mentok SEBELUM ambang 500 vendor". Kalau
 * iya, itu bukti untuk membuka kembali keputusannya. Kalau tidak, keputusan
 * menunda tetap beralasan dan tidak perlu diganggu.
 *
 * Yang diukur adalah `vendors:listActive` - query yang dipakai katalog
 * publik - pada ukuran: produksi-saati, beberapa ratus, dan tepat di ambang.
 */

const modules = import.meta.glob("./**/*.ts");

const now = () => Date.now();

async function seedMany(t: ReturnType<typeof convexTest>, count: number) {
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    for (let i = 0; i < count; i += 1) {
      await db.insert("vendors", {
        slug: `usaha-${i}`,
        name: `Usaha Nomor ${i}`,
        category: i % 2 === 0 ? "Servis Teknik" : "Kuliner",
        description: "Deskripsi usaha yang cukup panjang untuk menguji beban.",
        address: "Jl. Uji",
        landmark: i % 3 === 0 ? "kota" : "anom",
        price: "Mulai Rp50.000",
        hours: "Setiap hari · 07.00-17.00",
        phone: "628000000000",
        rating: "4.8",
        accent: "from-blue-500 to-blue-700",
        mark: "UU",
        tags: ["Tag Satu", "Tag Dua"],
        status: "active",
        createdAt: now(),
        updatedAt: now(),
      });
    }
  });
}

describe("skala katalog publik", () => {
  test("latensi listActive pada beberapa ukuran himpunan", async () => {
    const SIZES = [6, 100, 300, 500];
    const results: { size: number; ms: number; rows: number }[] = [];

    for (const size of SIZES) {
      const t = convexTest(schema, modules);
      await seedMany(t, size);
      // Diulang tiga kali; yang diambil adalah yang paling baik supaya
      // cold-start JIT tidak ikut terukur.
      const runs: number[] = [];
      let rows = 0;
      for (let i = 0; i < 3; i += 1) {
        const start = performance.now();
        const result = await t.query(api.vendors.listActive, {});
        runs.push(performance.now() - start);
        rows = result.length;
      }
      results.push({ size, ms: Math.round(Math.min(...runs)), rows });
    }

    const detail = results.map((r) => ({
      vendor: r.size,
      ms: r.ms,
      msPerVendor: Number((r.ms / r.size).toFixed(3)),
      baris: r.rows,
    }));
    console.log("SKALA " + JSON.stringify(detail));

    const smallest = results[0]!.ms;
    const largest = results[results.length - 1]!.ms;
    const growth = largest / Math.max(smallest, 0.1);
    const dataGrowth = results[results.length - 1]!.size / results[0]!.size;
    console.log(
      `SKALA_RINGKAS pertumbuhan_data=${dataGrowth.toFixed(1)}x pertumbuhan_latensi=${growth.toFixed(1)}x`,
    );

    // Bentuk grundel: dari 6 ke 500 vendor (83x data) latensi tidak boleh
    // meledak tak terkendali. Kalau ini gagal, ambang 500 benar-benar sudah
    // terlampaui dan keputusan menunda paginasi harus dibuka ulang.
    expect(growth, "latensi tumbuh jauh lebih cepat daripada jumlah data").toBeLessThan(40);
  });

  test("ukuran muatan tetap wajar di ambang 500 vendor", async () => {
    const t = convexTest(schema, modules);
    await seedMany(t, 500);
    const payload = JSON.stringify(await t.query(api.vendors.listActive, {})).length;
    console.log(`SKALA_PAYLOAD 500 vendor = ${payload} byte`);
    // 500 vendor harus tetap jadi payload yang wajar (di bawah ~2 MB).
    expect(payload).toBeLessThan(2_000_000);
  });
});
