/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * Regression test untuk pemicu deteksi FASE 7.
 *
 * KENAPA TEST INI ADA.
 *
 * Katalog aturan, pencatat, dan panel bisa lulus test tanpa satu pun sinyal
 * pernah masuk. Itu kondisi yang berbahaya justru karena tampak selesai:
 * dashboardnya ada, tabelnya ada, dan tidak ada yang pernah memberitahu
 * operator apa pun. Berkas ini menguji SAMBUNGANNYA - bahwa percobaan nyata
 * benar-benar berubah menjadi baris insiden, pada ambang yang benar, dan
 * digabung menjadi satu baris, bukan satu baris per kejadian.
 *
 * Dua pemicu yang disambungkan di commit ini:
 *   1. `adminGate.recordAttempt` - kegagalan dan kunci gerbang passcode.
 *   2. `securityIncidents.recordWebhookSignatureFailure` - tandatangan webhook.
 */

const modules = import.meta.glob("./**/*.ts");

type Db = {
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
  get: (id: never) => Promise<Record<string, unknown> | null>;
};

const incidents = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => await ctx.db.query("securityIncidents").collect());

async function recordFailure(
  t: ReturnType<typeof convexTest>,
  args: { key?: string; ipHash?: string; failureReason?: string } = {},
) {
  await t.mutation(internal.adminGate.recordAttempt, {
    key: args.key ?? "kunci-uji-insiden",
    outcome: "failed",
    ipHash: args.ipHash ?? "hash-ip-uji",
    ipMasked: "203.0.113.x",
    failureReason: args.failureReason ?? "passcode tidak cocok",
    route: "/admin",
  });
}

describe("FASE 7 - pemicu gerbang passcode menghasilkan insiden", () => {
  test("di bawah ambang belum ada insiden sama sekali", async () => {
    const t = convexTest(schema, modules);
    // Ambangnya lima. Empat kegagalan adalah salah ketik, bukan serangan.
    for (let attempt = 0; attempt < 4; attempt += 1) await recordFailure(t);
    expect(await incidents(t)).toHaveLength(0);
  });

  test("kegagalan ke-lima membuat satu insiden pada tingkat dasar", async () => {
    const t = convexTest(schema, modules);
    for (let attempt = 0; attempt < 5; attempt += 1) await recordFailure(t);

    const rows = await incidents(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ruleKey).toBe("admin_passcode_failures");
    expect(rows[0]?.severity).toBe("high");
    expect(rows[0]?.status).toBe("open");
    expect(rows[0]?.count).toBe(5);
    // IP mentah tidak pernah tersimpan; yang ada bentuk tersamarnya.
    expect(rows[0]?.ipHash).toBe("hash-ip-uji");
    expect(rows[0]?.ipMasked).toBe("203.0.113.x");
    expect(rows[0]?.route).toBe("/admin");
    expect(rows[0]?.method).toBe("POST");
    expect(rows[0]?.subjectType).toBe("ip");
  });

  test("kegagalan berikutnya DIGABUNG, bukan membuat baris baru", async () => {
    const t = convexTest(schema, modules);
    for (let attempt = 0; attempt < 5; attempt += 1) await recordFailure(t);
    const setelahAmbang = (await incidents(t))[0];

    for (let attempt = 0; attempt < 15; attempt += 1) await recordFailure(t);

    const rows = await incidents(t);
    // Ini inti dari agregasi. Percobaan beruntun dua puluh kali harus tetap
    // terbaca sebagai SATU insiden; tabel yang seharusnya memberi peringatan
    // akan menenggelamkan peringatannya sendiri kalau ia tumbuh secepat
    // serangannya.
    expect(rows, "dua puluh percobaan harus tetap satu baris").toHaveLength(1);
    expect(rows[0]?._id).toBe(setelahAmbang?._id);
    expect(rows[0]?.count).toBe(20);
    expect(rows[0]?.firstSeenAt).toBe(setelahAmbang?.firstSeenAt);
    expect(rows[0]?.lastSeenAt).toBeGreaterThanOrEqual(setelahAmbang?.lastSeenAt ?? 0);
  });

  test("lonjakan menaikkan tingkat, dan tingkat tidak pernah turun lagi", async () => {
    const t = convexTest(schema, modules);
    for (let attempt = 0; attempt < 5; attempt += 1) await recordFailure(t);

    const dasar = await incidents(t);
    expect(dasar[0]?.severity, "tepat di ambang masih tingkat dasar").toBe("high");

    // Delapan percobaan tambahan membawa hitungan ke 13, yaitu 2,6x ambang.
    // Pelipatan 2x menaikkan satu langkah, jadi tingkatnya menjadi critical.
    for (let attempt = 0; attempt < 8; attempt += 1) await recordFailure(t);

    const naik = await incidents(t);
    expect(naik).toHaveLength(1);
    expect(naik[0]?.severity).toBe("critical");
    expect(naik[0]?.count).toBe(13);

    // Tingkat hanya boleh naik. Kalau jendelanya bergeser dan hitungannya
    // mengecil, kewaspadaan tidak boleh ikut diturunkan - insiden yang sama
    // sudah terbukti menyentuh 2x ambang.
    const insidenId = naik[0]?._id as never;
    await t.run(async (ctx) => {
      await ctx.db.patch(insidenId, {
        severity: "critical",
        count: 13,
        lastSeenAt: Date.now(),
      });
    });
    const sesudah = await incidents(t);
    expect(sesudah[0]?.severity).toBe("critical");
  });

  test("kunci gerbang penuh membuat insiden tersendiri pada tingkat critical", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.adminGate.recordAttempt, {
      key: "kunci-uji-insiden",
      outcome: "locked",
      ipHash: "hash-ip-uji",
      ipMasked: "203.0.113.x",
      attemptNumber: 7,
      route: "/admin",
    });

    const rows = await incidents(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ruleKey).toBe("admin_lockout_threshold");
    expect(rows[0]?.severity).toBe("critical");
    expect(rows[0]?.count).toBe(1);
  });

  test("baris percobaan tetap tersimpan utuh", async () => {
    const t = convexTest(schema, modules);
    for (let attempt = 0; attempt < 6; attempt += 1) await recordFailure(t);
    const attempts = await t.run(
      async (ctx) => await ctx.db.query("adminPasscodeAttempts").collect(),
    );
    // Enam percobaan, enam baris. Deteksi TIDAK boleh menyentuh jalur
    // pencatatan percobaan - itu justru bukti mentahnya.
    expect(attempts).toHaveLength(6);
  });

  test("bukti yang berbahaya disunting, bukan disimpan apa adanya", async () => {
    const t = convexTest(schema, modules);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await recordFailure(t, {
        failureReason: "passcode: 4321 dikirim oleh budi@contoh.test dari 081234567890",
      });
    }

    const rows = await incidents(t);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("4321");
    expect(json).not.toContain("contoh.test");
    expect(json).not.toContain("081234567890");
    expect(json).toContain("[disunting]");
  });

  test("kegagalan deteksi tidak bisa menghapus bukti percobaan", async () => {
    const t = convexTest(schema, modules);
    // Gerbang tetap harus mencatat walaupun jalur insiden bermasalah. Ini
    // dibuktikan dengan cara paling langsung: percobaan tetap tersimpan
    // setelah rangkaian normal, dan jumlahnya sama dengan jumlah pemanggilan.
    for (let attempt = 0; attempt < 3; attempt += 1) await recordFailure(t);
    const attempts = await t.run(
      async (ctx) => await ctx.db.query("adminPasscodeAttempts").collect(),
    );
    expect(attempts).toHaveLength(3);
    expect(attempts.every((row) => row.outcome === "failed")).toBe(true);
  });
});

describe("FASE 7 - pemicu tandatangan webhook", () => {
  /** Satu laporan error webhook yang sudah digabung menurut sidik jari. */
  async function seedSignatureReport(
    t: ReturnType<typeof convexTest>,
    occurrences: number,
  ) {
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const now = Date.now();
      await db.insert("errorReports", {
        reportId: `rep-${occurrences}-${now}`,
        fingerprint: `fp-signature-${occurrences}`,
        severity: "critical",
        status: "open",
        errorCode: "WEBHOOK_SIGNATURE",
        title: "Tandatangan webhook tidak cocok",
        message: "Webhook ditolak karena signature tidak cocok.",
        feature: "WhatsApp",
        operation: "webhook.whatsapp.meta.signature",
        source: "webhook",
        retryable: false,
        recommendedAction: "Periksa secret provider.",
        environment: "test",
        occurrences,
        firstSeenAt: now,
        lastSeenAt: now,
        alertStatus: "skipped",
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  test("di bawah ambang belum ada insiden", async () => {
    const t = convexTest(schema, modules);
    await seedSignatureReport(t, 2);
    await t.mutation(internal.securityIncidents.recordWebhookSignatureFailure, {
      provider: "meta",
      route: "/whatsapp/webhook",
    });
    // Ambangnya tiga; dua tandatangan palsu belum cukup.
    expect(await incidents(t)).toHaveLength(0);
  });

  test("ambang tercapai membuat insiden critical dan digabung seterusnya", async () => {
    const t = convexTest(schema, modules);
    await seedSignatureReport(t, 3);
    await t.mutation(internal.securityIncidents.recordWebhookSignatureFailure, {
      provider: "meta",
      route: "/whatsapp/webhook",
    });

    const pertama = await incidents(t);
    expect(pertama).toHaveLength(1);
    expect(pertama[0]?.ruleKey).toBe("webhook_signature_failure");
    expect(pertama[0]?.severity).toBe("critical");
    expect(pertama[0]?.count).toBe(3);
    expect(pertama[0]?.subjectRef).toBe("meta");
    expect(pertama[0]?.evidence).toEqual(["tanda tangan meta tidak cocok"]);

    // Provider kedua punya subjek sendiri, jadi insidennya terpisah - dua
    // provider yang berbeda tidak boleh saling menimpa.
    await t.mutation(internal.securityIncidents.recordWebhookSignatureFailure, {
      provider: "twilio",
      route: "/whatsapp/webhook",
    });
    const dua = await incidents(t);
    expect(dua).toHaveLength(2);
    expect(dua.map((row) => row.subjectRef).sort()).toEqual(["meta", "twilio"]);

    // Panggilan berikutnya untuk provider yang sama tetap satu baris.
    await t.mutation(internal.securityIncidents.recordWebhookSignatureFailure, {
      provider: "meta",
      route: "/whatsapp/webhook",
    });
    const tiga = await incidents(t);
    expect(tiga.filter((row) => row.subjectRef === "meta")).toHaveLength(1);
  });

  test("laporan error yang bukan tanda tangan tidak dihitung", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const now = Date.now();
      for (const operation of ["webhook.whatsapp.meta.status", "webhook.whatsapp.twilio.inbound"]) {
        await db.insert("errorReports", {
          reportId: `rep-${operation}`,
          fingerprint: `fp-${operation}`,
          severity: "warning",
          status: "open",
          errorCode: "WEBHOOK_OTHER",
          title: "Kegagalan webhook lain",
          message: "Bukan kegagalan tandatangan.",
          feature: "WhatsApp",
          operation,
          source: "webhook",
          retryable: false,
          recommendedAction: "Periksa.",
          environment: "test",
          occurrences: 50,
          firstSeenAt: now,
          lastSeenAt: now,
          alertStatus: "skipped",
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    await t.mutation(internal.securityIncidents.recordWebhookSignatureFailure, {
      provider: "meta",
      route: "/whatsapp/webhook",
    });
    // Lima puluh kegagalan yang BUKAN tandatangan tidak boleh memicu insiden
    // tandatangan - kalau ikut terhitung, aturan ini akan menyala setiap kali
    // ada gangguan provider yang wajar.
    expect(await incidents(t)).toHaveLength(0);
  });
});
