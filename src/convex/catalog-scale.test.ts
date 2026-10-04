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
 *
 * CATATAN STABILITAS DAN MUTU ANGKA. Versi pertama test ini membandingkan
 * latensi 500 vendor dengan 6 vendor setelah dibulatkan ke milidetik penuh.
 * Dua hal salah di situ, dan keduanya terbukti saat diukur ulang:
 *
 * - Membulatkan ke milidetik penuh menghapus resolusi ukuran terkecil. Nilai
 *   wajar 6 vendor ada di sekitar 0,3-0,4 ms, dan pembulatan bisa
 *   menjatuhkannya ke 0 ms.
 * - Ketika itu terjadi, pembagiannya memakai lantai 0,1 ms, sehingga rasio yang
 *   dilaporkan (17-36x) adalah artefak pembulatan, bukan sifat arsitektur.
 *   Rasio 6 -> 500 yang sebenarnya terukur 37-48x, dan ambang 40x dulu hanya
 *   kadang lolos - bukan karena mesinnya, tetapi karena pembulatannya.
 *
 * Angka 6 vendor memang didominasi overhead tetap per panggilan, jadi rasio
 * terhadap 500 vendor nyaris tidak bisa diresolusi dengan stabil. Karena itu
 * gate-nya mengukur hal yang sebenarnya jadi pertanyaan keputusan - apakah
 * BIAYA PER VENDOR naik saat data membesar - dan mengambil rentang 100 -> 500
 * yang resolusinya cukup. Detail 6 vendor tetap dicetak sebagai konteks.
 *
 * Agar angkanya tidak goyah karena suite berjalan paralel: semua ukuran
 * disiapkan lebih dulu, tiap ukuran dipanaskan sekali, sampel diambil
 * bergiliran (round-robin) antar ukuran supaya pembilang dan penyebut selalu
 * melihat kondisi mesin yang sama, dan setiap sampel menjumlah beberapa
 * permintaan supaya ukuran kecil tidak tenggelam di derau timer.
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

type Tangga = {
  size: number;
  t: ReturnType<typeof convexTest>;
  baris: number;
};

describe("skala katalog publik", () => {
  test(
    "latensi listActive pada beberapa ukuran himpunan",
    { timeout: 30_000 },
    async () => {
      const SIZES = [6, 100, 300, 500];
      // Empat putaran bergiliran, minimum tiap ukuran diambil dari keempatnya.
      const ROUNDS = 4;
      // Beberapa permintaan dihitung sebagai satu sampel. Pada 6 vendor satu
      // permintaan bisa selesai di bawah 1 ms; menjumlahkannya membuat angka
      // yang diukur jauh di atas derau timer.
      const BATCH = 3;

      // Semua ukuran disiapkan dan di-seed lebih dulu, supaya tidak ada
      // pengukuran yang menunggu seeding di tengah jalan.
      const tangga: Tangga[] = [];
      for (const size of SIZES) {
        const t = convexTest(schema, modules);
        await seedMany(t, size);
        tangga.push({ size, t, baris: 0 });
      }

      // Pemanasan: panggilan pertama tiap ukuran dibuang supaya kompilasi dan
      // JIT tidak ikut terukur pada sampel pertama.
      for (const u of tangga) {
        u.baris = (await u.t.query(api.vendors.listActive, {})).length;
      }

      const sampel = new Map<number, number[]>(tangga.map((u) => [u.size, []]));
      for (let round = 0; round < ROUNDS; round += 1) {
        for (const u of tangga) {
          const start = performance.now();
          for (let i = 0; i < BATCH; i += 1) {
            u.baris = (await u.t.query(api.vendors.listActive, {})).length;
          }
          sampel.get(u.size)!.push((performance.now() - start) / BATCH);
        }
      }

      const results = tangga.map((u) => ({
        size: u.size,
        ms: Number(Math.min(...sampel.get(u.size)!).toFixed(3)),
        rows: u.baris,
      }));

      const detail = results.map((r) => ({
        vendor: r.size,
        ms: r.ms,
        msPerVendor: Number((r.ms / r.size).toFixed(3)),
        baris: r.rows,
      }));
      console.log("SKALA " + JSON.stringify(detail));

      const dataGrowth =
        results[results.length - 1]!.size / results[0]!.size;
      const growth =
        results[results.length - 1]!.ms / results[0]!.ms;
      const biayaPerVendor = results.map((r) => r.ms / r.size);
      // Rentang 100 -> 500 yang menentukan: data tumbuh 5x, dan biaya per
      // vendor pada ambang 500 tidak boleh naik lebih dari 2x dibanding biaya
      // per vendor terbaik di rentang yang sama. Ukuran 6 vendor tidak ikut
      // jadi dasar karena yang tertinggi justru di sana, murni karena overhead
      // tetap per panggilan - memakainya akan menutupi kenaikan yang mau
      // dideteksi.
      const dasar = Math.min(...biayaPerVendor.slice(1));
      const kenaikanBiaya = biayaPerVendor[biayaPerVendor.length - 1]! / dasar;
      console.log(
        `SKALA_RINGKAS pertumbuhan_data=${dataGrowth.toFixed(1)}x pertumbuhan_latensi=${growth.toFixed(1)}x biaya_per_vendor_500_vs_terbaik=${kenaikanBiaya.toFixed(2)}x`,
      );

      // Bentuk grundel: sepanjang 100 -> 500 vendor biaya per vendor tidak
      // boleh naik lebih dari 2x. Kalau ini gagal, arsitektur benar-benar
      // melengkung sebelum ambang 500 dan keputusan menunda paginasi harus
      // dibuka ulang.
      expect(
        kenaikanBiaya,
        "biaya per vendor naik jauh lebih cepat daripada jumlah data",
      ).toBeLessThan(2);
    },
  );

  test("ukuran muatan tetap wajar di ambang 500 vendor", async () => {
    const t = convexTest(schema, modules);
    await seedMany(t, 500);
    const payload = JSON.stringify(await t.query(api.vendors.listActive, {})).length;
    console.log(`SKALA_PAYLOAD 500 vendor = ${payload} byte`);
    // 500 vendor harus tetap jadi payload yang wajar (di bawah ~2 MB).
    expect(payload).toBeLessThan(2_000_000);
  });
});
