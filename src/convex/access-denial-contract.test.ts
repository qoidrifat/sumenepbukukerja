/// <reference types="vite/client" />
/**
 * Kontrak penolakan (FASE 10).
 *
 * BERKAS INI MENYIMPAN SEBUAH KESALAHAN YANG SUDAH TERBUKTI.
 *
 * Percobaan pertama adalah mencatat pola penolakan hak khusus dari DALAM
 * mutation: gerbang menulis satu baris ke `securityDenyLog`, lalu melempar
 * seperti biasa.
 *
 * Hasilnya: nol baris. Bukan karena salah ketik dan bukan karena ambangnya
 * salah, tapi karena mutation Convex bersifat atomik - ketika handler
 * melempar, seluruh perubahan di transaksi itu ikut dibuang. Test "bukti yang
 * hilang" di bawah membuktikannya langsung: satu baris ditulis, lalu
 * error dilempar, lalu baris itu diperiksa.
 *
 * Kenapa kesimpulan ini penting untuk dibaca orang lain: kode pencatatan yang
 * seperti itu TIDAK ERROR. Ia terlihat benar saat dibaca, tidak mengeluh saat
 * dijalankan, dan menulis satu baris ke database pada setiap penolakan yang
 * selalu hilang. Kalau tidak ada test yang mengunci kesimpulan ini, orang
 * berikutnya akan menulisnya lagi.
 *
 * Batasan kedua yang ditemukan di percobaan yang sama: `ConvexError` dengan
 * objek `{ code, message }` mengubah `message` menjadi JSON, jadi payload error
 * yang sampai ke toast pengguna berubah dari kalimatnya menjadi
 * `{"code":...}`. `security-surface.test.ts` menangkapnya sebagai regression.
 * Jadi `code` terstruktur juga tidak bisa ditambahkan ke gerbang umum tanpa
 * mengubah yang dilihat pengguna.
 *
 * Yang shipping sekarang: tidak ada perubahan pada perilaku penolakan. Aturan
 * `privileged_call_denied` dan `storage_reference_invalid` tetap belum
 * tersambung, dan alasannya ada di laporan. Yang tersambung adalah
 * `invite_token_invalid`, karena jalurnya mengembalikan nilai, bukan melempar -
 * perbandingannya diuji langsung di bawah.
 */
import { convexTest } from "convex-test";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Convex Auth menandatangani token sesi dengan RSA dan membaca kuncinya dari
 * environment. Tanpa ini, jalur "undangan berhasil dipakai" gagal dengan
 * `Missing environment variable JWT_PRIVATE_KEY` - jadi bagian yang paling
 * penting untuk dibuktikan (jalur SUKAR tidak menyalakan aturan) justru tidak
 * akan pernah dieksekusi.
 *
 * Kuncinya dibuat sungguhan di dalam test, lalu dipasang ke `process.env`
 * dengan pola yang sama seperti `invites.test.ts`. Tidak ada kunci produksi
 * yang disentuh.
 */
type EnvBag = { process?: { env?: Record<string, string | undefined> } };
const envBag = () => (globalThis as unknown as EnvBag).process?.env;
const setEnv = (key: string, value: string) => {
  const bag = envBag();
  if (!bag) throw new Error("Test environment does not expose an env record");
  bag[key] = value;
};
const AUTH_ENV_KEYS = ["JWT_PRIVATE_KEY", "CONVEX_SITE_URL"] as const;
/** Nilai asli sebelum test memasang kuncinya, dikembalikan di `afterAll`. */
const savedEnv: Record<string, string | undefined> = {};

type Db = {
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
};

const incidents = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => await ctx.db.query("securityIncidents").collect());

const denyRows = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => await ctx.db.query("securityDenyLog").collect());

async function staffIdentity(
  t: ReturnType<typeof convexTest>,
  email: string,
  role: "admin" | "staff" | "viewer" = "admin",
) {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    return await db.insert("users", { name: "Penguji", email });
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("staffMembers", {
      userId: userId as never,
      role,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return { userId, identity: t.withIdentity({ subject: userId }) };
}

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  for (const key of AUTH_ENV_KEYS) savedEnv[key] = envBag()?.[key];
  setEnv("JWT_PRIVATE_KEY", privateKey);
  setEnv("CONVEX_SITE_URL", "https://contoh.test");
});

afterAll(() => {
  for (const key of AUTH_ENV_KEYS) setEnv(key, savedEnv[key] ?? "");
});

describe("FASE 10 - batasan transaksi Convex", () => {
  test("bukti yang hilang: satu baris ditulis, lalu error dilempar", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(async (ctx) => {
        await ctx.db.insert("securityDenyLog", {
          subjectType: "user",
          subjectRef: "subjek-pembuktian",
          ruleKey: "privileged_call_denied",
          route: "bukti",
          createdAt: Date.now(),
        });
        throw new Error("penolakan");
      }),
    ).rejects.toThrow("penolakan");

    // Inilah inti dari berkas ini. Kalau baris ini NAHIK, kesimpulan di atas
    // salah dan pendekatan lama bisa dipertimbangkan lagi.
    expect(await denyRows(t), "tulis sebelum melempar harus ikut hilang").toHaveLength(0);
  });

  test("path yang mengembalikan nilai, bukan melempar, JEJAKNYA TETAP ADA", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("securityDenyLog", {
        subjectType: "invite",
        subjectRef: "tanpa-penolakan",
        ruleKey: "invite_token_invalid",
        route: "bukti",
        createdAt: Date.now(),
      });
      return ctx.db.query("securityDenyLog").collect();
    });

    // Perbandingan langsung dengan test di atas: tidak melempar berarti
    // transaksi selesai dan tulisannya bertahan. Itulah alasan invited path
    // bisa punya deteksi sementara gerbang yang melempar tidak bisa.
    expect(await denyRows(t)).toHaveLength(1);
  });
});

describe("FASE 10 - gerbang hak khusus tetap menolak dengan pesan yang sama", () => {
  test("viewer ditolak di mutation pengelola", async () => {
    const t = convexTest(schema, modules);
    const { identity } = await staffIdentity(t, "k10-a@sumenep.co.id", "viewer");

    await expect(
      identity.mutation(api.users.createStaffInvite, {
        email: "calon@sumenep.co.id",
        role: "viewer",
      }),
    ).rejects.toThrow("Hanya admin yang dapat melakukan tindakan ini");
  });

  test("warga biasa ditolak di query pengelola", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      return await db.insert("users", { name: "Warga", email: "warga@sumenep.co.id" });
    });
    const identity = t.withIdentity({ subject: userId });

    await expect(identity.query(api.securityIncidents.listIncidents, {})).rejects.toThrow(
      "Hanya pengelola yang dapat mengakses data ini",
    );
  });

  test("admin yang sah tetap bisa memakai pintunya", async () => {
    const t = convexTest(schema, modules);
    const { identity } = await staffIdentity(t, "k10-b@sumenep.co.id", "admin");

    const created = await identity.mutation(api.users.createStaffInvite, {
      email: "calon@sumenep.co.id",
      role: "viewer",
    });
    expect(created.token).toBeTruthy();
    // Jalur yang berhasil tidak boleh menyalakan aturan apa pun.
    expect(await incidents(t)).toHaveLength(0);
    expect(await denyRows(t)).toHaveLength(0);
  });

  test("payload error tetap berupa kalimat, bukan JSON", async () => {
    const t = convexTest(schema, modules);
    const { identity } = await staffIdentity(t, "k10-c@sumenep.co.id", "viewer");

    let caught: unknown;
    try {
      await identity.mutation(api.users.createStaffInvite, {
        email: "calon@sumenep.co.id",
        role: "viewer",
      });
    } catch (error) {
      caught = error;
    }

    // `ConvexError({ code, message })` akan mengubah `message` menjadi JSON
    // hasil `JSON.stringify`. Itu yang sampai ke toast pengguna, jadi menambah
    // `code` dengan cara itu adalah regression tampilan - bukan tambahan
    // informasi. Test ini mengunci pilihan menolak shotgun tersebut.
    const message = (caught as Error | undefined)?.message;
    expect(message).toBe("Hanya admin yang dapat melakukan tindakan ini");
    expect(message).not.toContain("{");
  });
});

describe("FASE 10 - jalur yang memang bisa dihitung", () => {
  test("token undangan ditebak berulang menjadi satu insiden", async () => {
    const t = convexTest(schema, modules);
    const anonymous = t.withIdentity({});

    // `acceptStaffInvite` mengembalikan objek, bukan melempar, jadi transaksinya
    // selesai. Itulah sebabnya aturan ini bisa hidup sementara penolakan yang
    // melempar tidak bisa.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await anonymous.mutation(api.users.acceptStaffInvite, { token: `tebakan-${attempt}` });
    }

    const rows = await incidents(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ruleKey).toBe("invite_token_invalid");
    expect(rows[0]?.severity).toBe("medium");
    expect(rows[0]?.count).toBe(10);
    expect(await denyRows(t)).toHaveLength(10);
  });

  test("token yang ditebak tidak pernah masuk tabel mana pun", async () => {
    const t = convexTest(schema, modules);
    const anonymous = t.withIdentity({});
    const token = "token-rahasia-yang-tidak-boleh-tersimpan";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await anonymous.mutation(api.users.acceptStaffInvite, { token });
    }

    const json = JSON.stringify({
      incidents: await incidents(t),
      denials: await denyRows(t),
      audit: await t.run(async (ctx) => await ctx.db.query("auditLogs").collect()),
    });
    expect(json).not.toContain(token);
  });

  test("undangan yang berhasil dipakai tidak menyalakan aturan", async () => {
    const t = convexTest(schema, modules);
    const { identity } = await staffIdentity(t, "k10-d@sumenep.co.id", "admin");
    const invite = await identity.mutation(api.users.createStaffInvite, {
      email: "penerima@sumenep.co.id",
      role: "viewer",
    });

    // Panggilan tanpa identitas: inilah bentuk sebenarnya dari klaim undangan,
    // karena penerima belum punya sesi sama sekali.
    const accepted = await t.mutation(api.users.acceptStaffInvite, { token: invite.token });
    expect(accepted.ok).toBe(true);

    expect(await incidents(t)).toHaveLength(0);
    expect(await denyRows(t)).toHaveLength(0);
  });
});

describe("FASE 10 - retensi Security Desk", () => {
  test("insiden terbuka tidak pernah dipangkas, yang sudah ditutup boleh", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const lama = Date.now() - 200 * 24 * 60 * 60_000;
      for (const [status, subjectRef] of [
        ["open", "subjek-terbuka"],
        ["resolved", "subjek-tutup"],
      ] as const) {
        await ctx.db.insert("securityIncidents", {
          ruleKey: "privileged_call_denied",
          severity: "high",
          status,
          subjectType: "user",
          subjectRef,
          route: "requireStaff",
          method: "POST",
          count: 5,
          firstSeenAt: lama,
          lastSeenAt: lama,
          createdAt: lama,
          updatedAt: lama,
        });
      }
      await ctx.db.insert("securityDenyLog", {
        subjectType: "user",
        subjectRef: "subjek-tutup",
        ruleKey: "privileged_call_denied",
        route: "requireStaff",
        createdAt: lama,
      });
      await ctx.db.insert("securityDenyLog", {
        subjectType: "user",
        subjectRef: "subjek-terbuka",
        ruleKey: "privileged_call_denied",
        route: "requireStaff",
        createdAt: Date.now(),
      });
    });

    await t.mutation(internal.securityIncidents.pruneIncidents, {
      olderThan: Date.now() - 90 * 24 * 60 * 60_000,
    });

    expect((await incidents(t)).map((row) => row.subjectRef)).toEqual(["subjek-terbuka"]);
    // Penghitung yang sudah lewat jendela aturan dibuang; yang baru tetap ada.
    expect((await denyRows(t)).map((row) => row.subjectRef)).toEqual(["subjek-terbuka"]);
  });
});