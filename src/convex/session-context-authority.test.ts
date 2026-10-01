/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { deriveSessionFingerprint, parseUserAgent } from "../lib/security-context";

/**
 * Regresi FASE 5 - `reportSessionContext` harus server-authoritative.
 *
 * KENAPA TEST INI ADA.
 *
 * Argumen `token` pada mutation itu masuk validator sebagai `v.string()` yang
 * wajib, tapi sebelumnya tidak pernah dibaca. Semua nilai jaringan di tabel
 * `adminPresence` - ipHash, ipMasked, ipSource, ipFamily, requestId,
 * userAgent, browser, os, deviceType - berasal dari browser. Panel "Sesi Anda"
 * karena itu menampilkan apa pun yang diklaim klien.
 *
 * Yang dipalsukan bukan izin siapa pun, tapi bahan investigasi. Security Desk
 * dipakai untuk memutuskan "cabut sesi ini" atau "t slightest ini bukan orang
 * saya", dan dua keputusan itu tidak boleh dibangun di atas angka yang bisa
 * ditulis sendiri oleh perangkat yang sedang diperiksa.
 *
 * Test di sini menguji SUMBER nilainya, bukan tampilan UI: nilai yang benar
 * harus datang dari baris `adminSecurityContexts` yang dibaca token, dan nilai
 * yang dipalsukan harus hilang total dari baris presence.
 */

const modules = import.meta.glob("./**/*.ts");
const SALT = "sumenep-buku-kerja";

type Db = {
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
};

/** User agent server yang harus menjadi satu-satunya sumber klasifikasi. */
const SERVER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Semua nilai yang dicoba dipalsukan klien pada test di bawah. */
const FORGED = {
  ipHash: "hash-palsu-0000",
  ipMasked: "45.142.212.xxx",
  ipSource: "X-Forwarded-For",
  // `ipFamily` sengaja bernilai IPv6: kalau nilai klien sempat dipakai, baris
  // akan menyimpannya dan pemindaian di bawah menangkapnya.
  ipFamily: "IPv6",
  requestId: "req_dibuat-sendiri",
  browser: "Opera",
  os: "Windows 11",
  deviceType: "Mobile",
};

type Row = Record<string, unknown>;

async function staff(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    return await db.insert("users", { name: "Penguji", email });
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("staffMembers", {
      userId: userId as never,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return userId;
}

async function authSession(t: ReturnType<typeof convexTest>, userId: string) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    return await db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 30 * 24 * 60 * 60_000,
    });
  });
}

/** Meniru `POST /admin-gate/context`: satu baris konteks server yang berlaku. */
async function seedServerContext(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
) {
  const token = "kctx-uji-fase-5";
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    const now = Date.now();
    await db.insert("adminSecurityContexts", {
      token,
      ipHash: "hash-server-1111",
      ipMasked: "103.28.14.xxx",
      ipSource: "CF-Connecting-IP",
      ipFamily: "IPv4",
      ipTrust: "edge",
      userAgent: SERVER_UA,
      acceptLanguage: "id-ID",
      referrer: "https://contoh.test/admin",
      requestId: "req_asli-server",
      country: "ID",
      createdAt: now,
      expiresAt: now + 5 * 60_000,
      ...overrides,
    });
  });
  return token;
}

const presence = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => await ctx.db.query("adminPresence").collect());

async function adminIdentity(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await staff(t, email);
  const sessionId = await authSession(t, userId);
  return { userId, admin: t.withIdentity({ subject: `${userId}|${sessionId}` }) };
}

describe("FASE 5 - konteks sesi admin berasal dari server", () => {
  test("nilai yang dipalsukan klien hilang, nilai server yang tersimpan", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await adminIdentity(t, "fase5-a@sumenep.co.id");
    const token = await seedServerContext(t);

    await admin.mutation(api.adminGate.reportSessionContext, {
      token,
      deviceId: "perangkat-uji-fase-5",
      ...FORGED,
    });

    const rows = await presence(t);
    expect(rows).toHaveLength(1);
    const row = rows[0] as Row;

    // Kolom jaringan harus persis yang diamati server saat beacon.
    expect(row.ipHash).toBe("hash-server-1111");
    expect(row.ipMasked).toBe("103.28.14.xxx");
    expect(row.ipSource).toBe("CF-Connecting-IP");
    expect(row.ipFamily).toBe("IPv4");
    expect(row.requestId).toBe("req_asli-server");

    // Tidak ada satu pun nilai palsu yang boleh muncul di baris presence.
    const json = JSON.stringify(row);
    for (const value of Object.values(FORGED)) {
      expect(json, `nilai palsu ${value} tidak boleh tersimpan`).not.toContain(value);
    }
  });

  test("browser, sistem operasi, dan jenis perangkat diturunkan server", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await adminIdentity(t, "fase5-b@sumenep.co.id");
    const token = await seedServerContext(t);

    await admin.mutation(api.adminGate.reportSessionContext, {
      token,
      deviceId: "perangkat-uji-fase-5-b",
      userAgent: "Opera/9.99 Chrome/1.1 Mobile/1.1",
      browser: "Opera",
      os: "Windows 11",
      deviceType: "Mobile",
    });

    const expected = parseUserAgent(SERVER_UA);
    const row = (await presence(t))[0] as Row;

    // Yang diklaim klien: Opera, Windows 11, ponsel. Yang diamati server:
    // Chrome, Windows 10, desktop.
    expect(row.browser).toBe(expected.browser);
    expect(row.browser).toBe("Chrome");
    expect(row.os).toBe(expected.os);
    expect(row.os).toBe("Windows");
    expect(row.deviceType).toBe(expected.deviceType);
    expect(row.deviceType).toBe("Desktop");
    expect(row.userAgent).toBe(SERVER_UA);
  });

  test("tanpa konteks server, klaim IP dan request id tetap tidak tersimpan", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await adminIdentity(t, "fase5-c@sumenep.co.id");

    // Token tidak dikenal: beacon gagal, atau dipanggil tanpa pernah lewat
    // httpAction. Panel harus tetap jalan, tapi tidak boleh berisi angka bikainan.
    await admin.mutation(api.adminGate.reportSessionContext, {
      token: "kctx-tidak-pernah-dibuat",
      deviceId: "perangkat-uji-fase-5-c",
      ...FORGED,
    });

    const row = (await presence(t))[0] as Row;
    expect(row.sessionFingerprint).toBe(await deriveSessionFingerprint(
      "perangkat-uji-fase-5-c",
      SALT,
    ));
    expect(row.ipHash).toBeUndefined();
    expect(row.ipMasked).toBeUndefined();
    expect(row.ipSource).toBeUndefined();
    expect(row.requestId).toBeUndefined();
    // Tanpa konteks server pun, klaim peramban tidak boleh mengarang OS.
    expect(row.os).toBeUndefined();
    expect(row.browser).toBeUndefined();
  });

  test("user agent kiriman klien hanya dipakai sebagai bahan mentah", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await adminIdentity(t, "fase5-d@sumenep.co.id");

    await admin.mutation(api.adminGate.reportSessionContext, {
      token: "kctx-tidak-pernah-dibuat",
      deviceId: "perangkat-uji-fase-5-d",
      // Klien Specialized Mengirim UA ponsel sungguhan...
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      // ...sambil menyatakan operating system Windows 11.
      os: "Windows 11",
      deviceType: "Desktop",
    });

    const row = (await presence(t))[0] as Row;
    // OS diturunkan dari UA itu, jadi benar-benar iOS. Nilai yang diklaim
    // ("Windows 11", "Desktop") dibuang.
    expect(row.os).toBe("iOS");
    expect(row.deviceType).toBe("Mobile");
  });

  test("token hanya berlaku sekali: pemakaian ulang tidak menulis ulang apa pun", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await adminIdentity(t, "fase5-e@sumenep.co.id");
    const token = await seedServerContext(t);

    await admin.mutation(api.adminGate.reportSessionContext, {
      token,
      deviceId: "perangkat-uji-fase-5-e",
    });
    const kedua = await admin.mutation(api.adminGate.reportSessionContext, {
      token,
      deviceId: "perangkat-uji-fase-5-e",
      ...FORGED,
    });

    // Panggilan kedua tidak lagi punya konteks server, jadi tidak boleh
    // menimpa nilai yang sudah benar dengan nilai bikainan.
    expect(kedua).toEqual({ isNewSession: false });
    const row = (await presence(t))[0] as Row;
    expect(row.ipMasked).toBe("103.28.14.xxx");
    expect(row.requestId).toBe("req_asli-server");
    expect(JSON.stringify(row)).not.toContain(FORGED.requestId);
  });

  test("konteks kedaluwarsa diperlakukan sama dengan token tak dikenal", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await adminIdentity(t, "fase5-f@sumenep.co.id");
    const token = await seedServerContext(t, { expiresAt: Date.now() - 1_000 });

    await admin.mutation(api.adminGate.reportSessionContext, {
      token,
      deviceId: "perangkat-uji-fase-5-f",
      ...FORGED,
    });

    const row = (await presence(t))[0] as Row;
    expect(row.ipMasked).toBeUndefined();
    expect(row.requestId).toBeUndefined();
    // Baris yang sudah basi tetap dihapus, supaya tidak menumpuk.
    const contexts = await t.run(async (ctx) =>
      await ctx.db.query("adminSecurityContexts").collect(),
    );
    expect(contexts).toHaveLength(0);
  });

  test("presence milik admin lain tidak bisa ditimpa", async () => {
    const t = convexTest(schema, modules);
    const { userId, admin } = await adminIdentity(t, "fase5-g@sumenep.co.id");

    // Baris presence milik orang lain, dengan nilai server yang sudah benar.
    await t.run(async (ctx) => {
      await ctx.db.insert("adminPresence", {
        userId: userId as never,
        ipMasked: "103.28.14.xxx",
        lastSeenAt: Date.now() - 60_000,
      });
    });

    const token = await seedServerContext(t);
    await admin.mutation(api.adminGate.reportSessionContext, {
      token,
      deviceId: "perangkat-uji-fase-5-g",
    });

    const rows = await presence(t);
    expect(rows).toHaveLength(1);
    // Nilai dari server masuk ke baris yang sama, bukan baris baru.
    expect(rows[0]?.ipMasked).toBe("103.28.14.xxx");
  });

  test("tanpa peran pengelola, konteks tidak pernah ditulis", async () => {
    const t = convexTest(schema, modules);
    const token = await seedServerContext(t);
    const anon = t.withIdentity({ subject: "anonim" });

    await anon.mutation(api.adminGate.reportSessionContext, {
      token,
      deviceId: "perangkat-uji-fase-5-h",
      ...FORGED,
    });

    expect(await presence(t)).toHaveLength(0);
  });
});