/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const now = () => Date.now();

async function seed(t: ReturnType<typeof convexTest>, count: number) {
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    const userId = await db.insert("users", {
      email: "pemilik-rahasia@sumenep.co.id",
      emailVerificationTime: now(),
      name: "Pemilik Rahasia",
      image: undefined,
      createdAt: now(),
      updatedAt: now(),
    });
    for (let i = 0; i < count; i += 1) {
      await db.insert("vendors", {
        slug: `usaha-${i}`,
        name: `Usaha Nomor ${i}`,
        category: "Servis Teknik",
        description: "Deskripsi usaha.",
        address: "Jl. Uji",
        landmark: "kota",
        lat: -7.01,
        lng: 113.86,
        price: "Mulai Rp50.000",
        hours: "Setiap hari",
        phone: "628000000000",
        rating: "4.8",
        reviewsCount: 3,
        accent: "from-blue-500 to-blue-700",
        mark: "UU",
        tags: ["Tag"],
        status: "active",
        featured: false,
        verified: false,
        photoId: "storage_internal_abc123",
        ownerId: userId,
        businessId: "RAHASIA-BISNIS-999",
        subscriptionTier: "premium",
        whatsappClicks: 1234,
        shareClicks: 567,
        searchImpressions: 8901,
        availability: "open",
        availabilityNote: "Catatan internalAvailability",
        nextAvailableAt: now() + 1000,
        responseMinutes: 12,
        serviceRadiusKm: 5,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  });
}

describe("PROBE payload publik", () => {
  test("field dan ukuran payload saat ini", async () => {
    for (const size of [6, 500]) {
      const t = convexTest(schema, modules);
      await seed(t, size);
      const rows = await t.query(api.vendors.listActive, {});
      const json = JSON.stringify(rows);
      const fields = Object.keys(rows[0] ?? {}).sort();
      console.log(`PROBE n=${size} bytes=${json.length} fields=${fields.length}`);
      console.log(`PROBE_FIELDS n=${size} ${JSON.stringify(fields)}`);
      if (size === 6) {
        console.log(`PROBE_SAMPLE ${JSON.stringify(rows[0]).slice(0, 900)}`);
      }
      expect(rows.length).toBe(size);
    }
  });
});
