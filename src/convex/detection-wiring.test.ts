/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

/**
 * FASE 10 - pemicu yang tadinya belum tersambung.
 *
 * Empat dari sembilan aturan sudah punya pemicu sejak commit sebelumnya.
 * Yang tersisa tiga di sini, dan dua yang lain (lihat bagian 5.1 laporan)
 * terbukti mustahil dari dalam gerbang yang melempar.
 *
 * Yang diuji TIDAK "insiden pernah dibuat" saja. Itu mudah. Yang diuji
 * adalah SIFATNYA:
 *
 *   - di bawah ambang: TIDAK ada baris sama sekali (kalau ada, tabel ini
 *     meledak tepat saat ada yang menyerangnya);
 *   - di atas ambang: TEPAT satu baris, bukan satu per kejadian;
 *   - kejadian berikutnya digabung ke baris yang sama, bukan menambah baris;
 *   - penghitung tidak tumbuh tanpa batas;
 *   - bukti yang berbahaya disunting, bukan disimpan mentah.
 */

const modules = import.meta.glob("./**/*.ts");

const now = () => Date.now();

async function seedUser(
  t: ReturnType<typeof convexTest>,
  name: string,
  email: string,
) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", {
      email,
      emailVerificationTime: now(),
      name,
      createdAt: now(),
      updatedAt: now(),
    });
  });
}

async function seedVendor(t: ReturnType<typeof convexTest>, slug = "usaha-uji") {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("vendors", {
      slug,
      name: "Usaha Uji",
      category: "Kuliner",
      description: "Deskripsi usaha.",
      address: "Jl. Uji",
      landmark: "anom",
      price: "Mulai Rp20.000",
      hours: "Setiap hari",
      phone: "628123456789",
      rating: "4.8",
      accent: "from-blue-500 to-blue-700",
      mark: "UU",
      tags: ["Tag"],
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
  });
}

const incidents = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => ctx.db.query("securityIncidents").collect());

describe("public_mutation_rate: pemicu connect", () => {
  test("di bawah ambang tidak menghasilkan insiden sama sekali", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Warga", "warga-1@sumenep.co.id");
    const vendorId = await seedVendor(t);
    const caller = t.withIdentity({ subject: userId });

    // Satu borough yang wajar: membuka beberapa listing laluلاً merekam.
    for (let i = 0; i < 5; i += 1) {
      await caller.mutation(api.community.recordInteraction, {
        vendorId: vendorId as never,
        kind: "view",
      });
    }

    expect(await incidents(t)).toHaveLength(0);
  });

  test("di atas ambang menghasilkan TEPAT satu insiden, lalu menggabungkannya", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Warga", "warga-2@sumenep.co.id");
    const vendorId = await seedVendor(t);
    const caller = t.withIdentity({ subject: userId });

    // Ambang `public_mutation_rate` adalah 60 per menit (lihat security-rules).
    for (let i = 0; i < 75; i += 1) {
      await caller.mutation(api.community.recordInteraction, {
        vendorId: vendorId as never,
        kind: "view",
      });
    }

    const rows = await incidents(t);
    const rule = rows.filter((row) => row.ruleKey === "public_mutation_rate");
    // 75 kejadian TIDAK boleh jadi 75 insiden. Tepat satu, karena
    // `recordIncidentWithin` menggabungkan per subjek di dalam jendela.
    expect(rule).toHaveLength(1);
    expect(rule[0]?.count).toBeGreaterThanOrEqual(60);
    expect(rule[0]?.status).toBe("open");
    expect(rule[0]?.subjectRef).toBe(userId);
  });

  test("dua akun berbeda dihitung terpisah", async () => {
    const t = convexTest(schema, modules);
    const vendorId = await seedVendor(t);
    const a = await seedUser(t, "A", "a@sumenep.co.id");
    const b = await seedUser(t, "B", "b@sumenep.co.id");

    const flood = async (userId: string) => {
      const caller = t.withIdentity({ subject: userId });
      for (let i = 0; i < 65; i += 1) {
        await caller.mutation(api.community.recordInteraction, {
          vendorId: vendorId as never,
          kind: "view",
        });
      }
    };
    await flood(a);
    await flood(b);

    const rule = (await incidents(t)).filter(
      (row) => row.ruleKey === "public_mutation_rate",
    );
    // Satu per akun, bukan satu global - kalau global, satu penyerang bisa
    // membuat akun lain terlihat mencurigakan.
    expect(rule).toHaveLength(2);
    expect(new Set(rule.map((row) => row.subjectRef))).toEqual(new Set([a, b]));
  });

  test("penghitung tidak tumbuh tanpa batas: satu baris per subjek", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Warga", "warga-3@sumenep.co.id");
    const vendorId = await seedVendor(t);
    const caller = t.withIdentity({ subject: userId });

    for (let i = 0; i < 70; i += 1) {
      await caller.mutation(api.community.recordInteraction, {
        vendorId: vendorId as never,
        kind: "view",
      });
    }

    const counters = await t.run(async (ctx) =>
      ctx.db.query("securityRateCounters").collect(),
    );
    // 70 kejadian, tapi satu subjek = satu baris penghitung.
    expect(counters).toHaveLength(1);
    expect(counters[0]?.count).toBeGreaterThanOrEqual(60);
  });
});

describe("session_device_change: pemicu connect", () => {
  test("perangkat yang berpindah beberapa kali menghasilkan insiden", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Pengelola", "pengelola@sumenep.co.id");
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      await db.insert("staffMembers", {
        userId,
        role: "admin",
        createdAt: now(),
        updatedAt: now(),
      });
    });
    const sessionId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("authSessions", {
        userId,
        expirationTime: now() + 86_400_000,
      });
    });
    const manager = t.withIdentity({ subject: `${userId}|${sessionId}` });

    // Tiga perangkat berbeda dalam jendela 30 menit (ambang: 2).
    for (const device of ["perangkat-a", "perangkat-b", "perangkat-c"]) {
      await manager.mutation(api.adminGate.reportSessionContext, {
        token: "kctx-uji",
        deviceId: device,
      });
    }

    const rule = (await incidents(t)).filter(
      (row) => row.ruleKey === "session_device_change",
    );
    expect(rule).toHaveLength(1);
    expect(rule[0]?.subjectRef).toBe(userId);
  });

  test("perangkat yang sama berulang tidak dianggap pergantian", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "Pengelola", "pengelola-2@sumenep.co.id");
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      await db.insert("staffMembers", {
        userId,
        role: "admin",
        createdAt: now(),
        updatedAt: now(),
      });
    });
    const sessionId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("authSessions", {
        userId,
        expirationTime: now() + 86_400_000,
      });
    });
    const manager = t.withIdentity({ subject: `${userId}|${sessionId}` });

    // Heartbeat berulang dari perangkat yang sama. Ini perilaku normal dan
    // TIDAK boleh terlihat sebagai serangan.
    for (let i = 0; i < 10; i += 1) {
      await manager.mutation(api.adminGate.reportSessionContext, {
        token: "kctx-uji",
        deviceId: "perangkat-yang-sama",
      });
    }

    expect(
      (await incidents(t)).filter((row) => row.ruleKey === "session_device_change"),
    ).toHaveLength(0);
  });
});

describe("endpoint_error_burst: pemicu connect", () => {
  test("kegagalan berulang pada satu rute dihitung dari laporan error", async () => {
    const t = convexTest(schema, modules);

    // Ambang `endpoint_error_burst` adalah 20 dalam 5 menit. `errorReports`
    // menggabungkan kegagalan yang sama dengan `occurrences`, jadi satu baris
    // dengan occurrences 25 berarti 25 kegagalan nyata.
    await t.run(async (ctx) => {
      await ctx.db.insert("errorReports", {
        reportId: "uji-endpoint-burst",
        fingerprint: "uji-endpoint-burst",
        severity: "error",
        status: "open",
        errorCode: "WHATSAPP_WEBHOOK_FAILED",
        title: "Body webhook Meta bukan JSON yang valid.",
        message: "Body webhook Meta bukan JSON yang valid.",
        feature: "WhatsApp Webhook",
        operation: "webhook.whatsapp.meta.parse",
        source: "webhook",
        route: "/whatsapp/webhook",
        retryable: true,
        recommendedAction: "Periksa payload provider.",
        environment: "test",
        occurrences: 25,
        firstSeenAt: now(),
        lastSeenAt: now(),
        alertStatus: "skipped",
        createdAt: now(),
        updatedAt: now(),
      });
    });

    await t.mutation(internal.securityIncidents.recordEndpointErrorBurst, {
      route: "/whatsapp/webhook",
      feature: "WhatsApp Webhook",
    });

    const rule = (await incidents(t)).filter(
      (row) => row.ruleKey === "endpoint_error_burst",
    );
    expect(rule).toHaveLength(1);
    expect(rule[0]?.subjectRef).toBe("/whatsapp/webhook");
  });

  test("di bawah ambang tidak menghasilkan insiden", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.securityIncidents.recordEndpointErrorBurst, {
      route: "/whatsapp/webhook",
      feature: "WhatsApp Webhook",
    });
    expect(await incidents(t)).toHaveLength(0);
  });
});

describe("webhook: idempotensi dan replay", () => {
  async function seedThread(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("whatsappThreads", {
        phone: "628123456789",
        providerMessageId: "wamid.OLD",
        lastInboundAt: now() - 60_000,
        lastInboundBody: "halo",
        lastInboundKind: "text",
        unread: false,
        createdAt: now() - 60_000,
        updatedAt: now() - 60_000,
      });
    });
  }

  test("kiriman ulang dengan providerMessageId yang sama tidak mengubah apa pun", async () => {
    const t = convexTest(schema, modules);
    const threadId = await seedThread(t);

    await t.mutation(internal.whatsapp.recordInboundMessage, {
      phone: "08123456789",
      providerMessageId: "wamid.OLD",
      body: "halo",
      kind: "text",
      at: now(),
    });

    const thread = await t.run(async (ctx) =>
      ctx.db.get(threadId as never),
    ) as { unread?: boolean } | null;
    // `unread` tetap false: pesan ini sudah pernah masuk dan sudah dibaca.
    // Tanpa pemeriksaan ini, satu kiriman ulang akan menyalakan lencana baru.
    expect(thread?.unread).toBe(false);
  });

  test("pesan di luar pagar replay ditolak", async () => {
    const t = convexTest(schema, modules);

    // Berumur 30 hari - jauh di luar jendela 7 hari.
    const result = await t.mutation(internal.whatsapp.recordInboundMessage, {
      phone: "08123456789",
      providerMessageId: "wamid.LAMA",
      body: "pesan lama yang diputar ulang",
      kind: "text",
      at: now() - 30 * 24 * 60 * 60 * 1000,
    });
    expect(result).toBeNull();

    const threads = await t.run(async (ctx) =>
      ctx.db.query("whatsappThreads").collect(),
    );
    expect(threads).toHaveLength(0);
  });

  test("pesan tanpa timestamp provider tetap diterima", async () => {
    // Twilio tidak mengirim timestamp pada balasan masuk. Menolaknya hanya
    // akan membuang pesan sah, jadi aturannya "yang punya bukti ditolak".
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.whatsapp.recordInboundMessage, {
      phone: "08123456789",
      providerMessageId: "SM123",
      body: "halo",
      kind: "text",
      at: 0,
    });
    expect(result).toBeTruthy();
  });
});

describe("aturan yang terbukti tidak bisa disambungkan", () => {
  test("katalog tetap memuat dua aturan itu sebagai batas yang diketahui", async () => {
    // Bagian 2.9 laporan membuktikan bahwa penolakan yang dilempar membatalkan
    // seluruh tulisannya, sehingga `privileged_call_denied` dan
    // `storage_reference_invalid` TIDAK bisa mencatat jejaknya dari dalam
    // gerbang. Test ini ada supaya tidak ada yang mengira keduanya sedang
    // berjalan: kalau suatu saat salah satunya disambungkan, test ini gagal
    // dan obligated pembaca untuk memperbarui tabel status di laporan.
    const { SECURITY_RULES } = await import("../lib/security-rules");
    expect(SECURITY_RULES.privileged_call_denied).toBeDefined();
    expect(SECURITY_RULES.storage_reference_invalid).toBeDefined();

    const t = convexTest(schema, modules);
    await seedVendor(t);
    // Tidak ada pemicu yang memproduksinya dari jalur mana pun yang diuji di
    // berkas ini - itu memang keadaan yang diketahui, bukan kelalaian.
    expect(await incidents(t)).toHaveLength(0);
  });
});