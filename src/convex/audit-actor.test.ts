/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { formatAuditValue } from "../lib/audit-detail";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Jejak pelaku di audit log.
 *
 * Yang diuji bukan "kolomnya ada" — kolom itu akan selalu ada begitu schema
 * punya. Yang diuji adalah apakah jejaknya TERISI, dan apakah isian itu benar:
 * nama, email, peran, dan nomor sesi harus berasal dari akun yang benar, bukan
 * dari apa pun yang dikirim klien.
 *
 * Dua sisi yang mudah terbalik dan sama-sama berbahaya:
 *  - Baris baru kaya rincian, tapi baris lama — yang justru paling sering
 *    ditanyakan — tetap kosong selamanya.
 *  - Rincian kaya sampai bocor rahasia: passcode, token, atau id sesi mentah.
 */

async function seedUser(
  t: ReturnType<typeof convexTest>,
  user: { name: string; email: string },
  role?: "admin" | "staff" | "viewer",
) {
  const id = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", user);
  });
  if (role) {
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: id as never,
        role,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  }
  return id;
}

/**
 * Sesi Auth yang nyata, supaya `getAuthSessionId` mengembalikan sesuatu.
 * Tanpa ini, nomor sesi tidak akan pernah terisi dan tesnya hanya menguji
 * kebetulan.
 */
async function authSession(t: ReturnType<typeof convexTest>, userId: string) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 24 * 60 * 60_000,
    });
  });
}

describe("jejak pelaku pada baris audit", () => {
  test("perubahan peran menyimpan nama, email, peran, dan nomor sesi", async () => {
    const t = convexTest(schema, modules);
    const targetId = await seedUser(t, { name: "Budi Santoso", email: "budi@sumenep.co.id" });
    const actorId = await seedUser(
      t,
      { name: "Rofi'atul Qodriyah", email: "admin@sumenep.co.id" },
      "admin",
    );
    const sessionId = await authSession(t, actorId);
    const actor = t.withIdentity({ subject: `${actorId}|${sessionId}` });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: targetId as never,
        role: "staff",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await actor.mutation(api.users.changeStaffRole, { userId: targetId as never, role: "viewer" });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("byAction", (q) => q.eq("action", "staff.role_changed"))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.actorId).toBe(actorId);
    expect(row.actorName).toBe("Rofi'atul Qodriyah");
    expect(row.actorEmail).toBe("admin@sumenep.co.id");
    expect(row.actorRole).toBe("admin");
    expect(row.sessionRef).toMatch(/^ses_[0-9A-F]{8}$/);
    // Nilai sebelum dan sesudah ikut tercatat, dan yang tampil di panel bukan
    // JSON mentah melainkan nilai yang sudah dilepas tanda kutipnya.
    expect(formatAuditValue(row.oldValue)).toBe("staff");
    expect(formatAuditValue(row.newValue)).toBe("viewer");
  });

  test("logout admin juga membawa pelaku, bukan cuma waktu", async () => {
    const t = convexTest(schema, modules);
    const actorId = await seedUser(
      t,
      { name: "SuperAdmin Developer", email: "qoidrifat23@gmail.com" },
      "admin",
    );
    const sessionId = await authSession(t, actorId);
    const actor = t.withIdentity({ subject: `${actorId}|${sessionId}` });

    await actor.mutation(api.adminGate.logoutAdmin, { route: "/admin" });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("byAction", (q) => q.eq("action", "admin.logout"))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorEmail).toBe("qoidrifat23@gmail.com");
    expect(rows[0]?.actorRole).toBe("admin");
    expect(rows[0]?.sessionRef).toMatch(/^ses_[0-9A-F]{8}$/);
  });

  test("dua aksi dari satu sesi memakai nomor sesi yang sama", async () => {
    // Inilah gunanya nomor sesi: dua perubahan dari satu perangkat bisa dikenali
    // sebagai satu orang, bukan dua orang yang kebetulan tidak berbeda.
    const t = convexTest(schema, modules);
    const first = await seedUser(t, { name: "Target Satu", email: "satu@sumenep.co.id" });
    const second = await seedUser(t, { name: "Target Dua", email: "dua@sumenep.co.id" });
    const actorId = await seedUser(
      t,
      { name: "Admin Uji", email: "admin@sumenep.co.id" },
      "admin",
    );
    const sessionId = await authSession(t, actorId);
    const actor = t.withIdentity({ subject: `${actorId}|${sessionId}` });
    for (const target of [first, second]) {
      await t.run(async (ctx) => {
        await ctx.db.insert("staffMembers", {
          userId: target as never,
          role: "staff",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });
      await actor.mutation(api.users.changeStaffRole, { userId: target as never, role: "viewer" });
    }

    const rows = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const refs = new Set(rows.map((r) => r.sessionRef));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(refs.size).toBe(1);
  });

  test("akun yang sudah dihapus tidak mengarang nama, tapi jejaknya tetap ada", async () => {
    // Id user tetap dicatat, nomor sesi tetap tercatat, tapi TIDAK ada nama
    // atau email karangan. Baris seperti ini muncul saat akun dihapus, dan
    // mengarang identitas di situ lebih berbahaya daripada membiarkan kosong.
    const t = convexTest(schema, modules);
    const ghostId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      const id = await db.insert("users", { name: "Sementara", email: "sementara@sumenep.co.id" });
      await ctx.db.delete(id as never);
      return id;
    });
    const sessionId = await authSession(t, ghostId);
    await t.run(async (ctx) => {
      // Peran masih ada walau baris `users`-nya sudah dihapus: inilah
      // yang biasanya terjadi saat akun dicabut tapi riwayatnya tidak.
      await ctx.db.insert("staffMembers", {
        userId: ghostId as never,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const ghost = t.withIdentity({ subject: `${ghostId}|${sessionId}` });
    await ghost.mutation(api.adminGate.logoutAdmin, { route: "/admin" });

    const rows = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const row = rows[0];
    expect(row?.actorId).toBe(ghostId);
    expect(row?.actorName ?? null).toBeNull();
    expect(row?.actorEmail ?? null).toBeNull();
    expect(row?.sessionRef).toMatch(/^ses_[0-9A-F]{8}$/);
  });

  test("baris audit tidak pernah memuat passcode, token, atau hash internal", async () => {
    const t = convexTest(schema, modules);
    const actorId = await seedUser(
      t,
      { name: "Admin Uji", email: "admin@sumenep.co.id" },
      "admin",
    );
    const sessionId = await authSession(t, actorId);
    const actor = t.withIdentity({ subject: `${actorId}|${sessionId}` });
    await t.run(async (ctx) => {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-uji-audit",
        outcome: "success",
        ipHash: "hash-rahasia-audit",
        createdAt: Date.now(),
      });
    });
    await actor.mutation(api.adminGate.logoutAdmin, { route: "/admin" });

    const rows = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const serialized = JSON.stringify(rows).toLowerCase();
    for (const secret of ["passcode", "pbkdf2", "authorization", "bearer", "cookie"]) {
      expect(serialized, secret).not.toContain(secret);
    }
    expect(serialized).not.toContain("hash-rahasia-audit");
    // Id sesi mentah juga tidak boleh ikut: yang disimpan hanya turunannya.
    expect(serialized).not.toContain(sessionId);
  });
});

describe("pembacaan audit log oleh pengelola", () => {
  test("baris lama tanpa kolom pelaku tetap dilengkapi saat dibaca", async () => {
    // Baris yang ditulis sebelum kolom ini ada hanya punya `actorId`. Kalau
    // pembacaan tidak melakukan apa pun, panel akan penuh "Tanpa pelaku" untuk
    // semua kejadian lama.
    const t = convexTest(schema, modules);
    const actorId = await seedUser(
      t,
      { name: "SuperAdmin Developer", email: "qoidrifat23@gmail.com" },
      "admin",
    );
    const readerId = await seedUser(
      t,
      { name: "Pembaca Log", email: "pembaca@sumenep.co.id" },
      "admin",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        action: "staff.role_changed",
        actorId: actorId as never,
        entityId: "entitas-lama",
        oldValue: "staff",
        newValue: "admin",
        createdAt: Date.now() - 60_000,
      });
    });

    const reader = t.withIdentity({ subject: readerId });
    const rows = await reader.query(api.users.listAuditLogs, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorEmail).toBe("qoidrifat23@gmail.com");
    expect(rows[0]?.actorName).toBe("SuperAdmin Developer");
    expect(rows[0]?.actorRole).toBe("admin");
  });

  test("snapshot bertahan ketika akunnya sudah tidak ada", async () => {
    // Snapshot-lah yang membuat ini mungkin. Kalau baris itu hanya menyimpan
    // id, penghapusan akun akan menghapus pelaku dari log.
    const t = convexTest(schema, modules);
    const readerId = await seedUser(
      t,
      { name: "Pembaca Log", email: "pembaca@sumenep.co.id" },
      "admin",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        action: "admin.logout",
        actorName: "SuperAdmin Developer",
        actorEmail: "qoidrifat23@gmail.com",
        actorRole: "admin",
        sessionRef: "ses_ABCD1234",
        createdAt: Date.now() - 3_600_000,
      });
    });

    const reader = t.withIdentity({ subject: readerId });
    const rows = await reader.query(api.users.listAuditLogs, {});
    expect(rows[0]?.actorName).toBe("SuperAdmin Developer");
    expect(rows[0]?.sessionRef).toBe("ses_ABCD1234");
  });

  test("baris tanpa pelaku tidak dikarang pembacaan", async () => {
    const t = convexTest(schema, modules);
    const readerId = await seedUser(
      t,
      { name: "Pembaca Log", email: "pembaca@sumenep.co.id" },
      "admin",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        action: "error_report.created",
        entityId: "ERR-1",
        metadata: { severity: "error" },
        createdAt: Date.now() - 120_000,
      });
    });

    const reader = t.withIdentity({ subject: readerId });
    const rows = await reader.query(api.users.listAuditLogs, {});
    expect(rows[0]?.actorId ?? null).toBeNull();
    expect(rows[0]?.actorEmail ?? null).toBeNull();
    expect(rows[0]?.actorName ?? null).toBeNull();
  });

  test("warga biasa tidak bisa membaca audit log", async () => {
    const t = convexTest(schema, modules);
    const residentId = await seedUser(t, { name: "Warga Biasa", email: "warga@sumenep.co.id" });
    const resident = t.withIdentity({ subject: residentId });
    await expect(resident.query(api.users.listAuditLogs, {})).rejects.toThrow();
  });

  test("foto pelaku tersinkron realtime saat dibaca — tanpa menulis baris baru", async () => {
    // Baris audit adalah POTRET kejadian, bukan pelanggan profil: menyimpan id
    // foto di dalamnya hanya menghasilkan tautan mati, karena `updateMyProfile`
    // selalu menghapus blob lama begitu diganti. Sinkronisasi terjadi saat
    // DIBACA, dari baris `users` yang sekarang — dan query reaktif akan
    // menjalankan ulang pembacaan itu begitu profilnya berubah.
    const t = convexTest(schema, modules);
    const actorId = await seedUser(
      t,
      { name: "Nama Awal", email: "aktor@sumenep.co.id" },
      "admin",
    );
    const readerId = await seedUser(
      t,
      { name: "Pembaca Log", email: "pembaca@sumenep.co.id" },
      "admin",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        action: "listing.published",
        actorId: actorId as never,
        createdAt: Date.now() - 60_000,
      });
    });

    const reader = t.withIdentity({ subject: readerId });

    // Belum ada foto: tanpa URL, tanpa inisial yang dikarang server.
    const before = await reader.query(api.users.listAuditLogs, {});
    expect(before[0]?.actorImageUrl ?? null).toBeNull();

    // Unggah foto lewat jalur nyata (metada `contentType` diisi seperti yang
    // ditulis endpoint unggah — lihat catatan `storeImage` di profil.test).
    const firstImage = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(512)]));
      const system = ctx.db as unknown as {
        patch: (id: never, value: { contentType: string }) => Promise<void>;
      };
      await system.patch(id as never, { contentType: "image/jpeg" });
      return id as never;
    });
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        patch: (id: never, value: { profileImageStorageId: string }) => Promise<void>;
      };
      await db.patch(actorId as never, { profileImageStorageId: firstImage });
    });

    const withPhoto = await reader.query(api.users.listAuditLogs, {});
    expect(typeof withPhoto[0]?.actorImageUrl).toBe("string");

    // Ganti foto: URL harus ikut berubah pada pembacaan berikutnya, padahal
    // tidak ada satu baris audit pun yang ditulis ulang.
    const secondImage = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(256)]));
      const system = ctx.db as unknown as {
        patch: (id: never, value: { contentType: string }) => Promise<void>;
      };
      await system.patch(id as never, { contentType: "image/png" });
      return id as never;
    });
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        patch: (id: never, value: { profileImageStorageId: string }) => Promise<void>;
      };
      await db.patch(actorId as never, { profileImageStorageId: secondImage });
    });

    const after = await reader.query(api.users.listAuditLogs, {});
    expect(after[0]?.actorImageUrl).not.toBe(withPhoto[0]?.actorImageUrl);
    expect(typeof after[0]?.actorImageUrl).toBe("string");

    // Nama yang diubah juga ikut — sisi sinkronisasi yang sudah ada, dipakai
    // sebagai pembuktian bahwa foto berperilaku sama persis.
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        patch: (id: never, value: { name: string }) => Promise<void>;
      };
      await db.patch(actorId as never, { name: "Nama Baru" });
    });
    const renamed = await reader.query(api.users.listAuditLogs, {});
    expect(renamed[0]?.actorName).toBe("Nama Baru");
  });

  test("baris akun pemilik ditandai server dengan actorIsOwnerAccount", async () => {
    // Penanda ini yang dipakai panel untuk menampilkan gelar Super Admin dan
    // menyembunyikan emailnya. Dihitung server memakai daftar yang sama dengan
    // gerbang passcode — kalau klien yang menentukan, daftar itu harus disalin
    // ke berkas kedua dan cepat atau lambat keduanya berbeda pendapat.
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(
      t,
      { name: "noir", email: "qoidrifat23@gmail.com" },
      "admin",
    );
    const otherId = await seedUser(
      t,
      { name: "Pengelola Lain", email: "lain@sumenep.co.id" },
      "admin",
    );
    const readerId = await seedUser(
      t,
      { name: "Pembaca Log", email: "pembaca@sumenep.co.id" },
      "admin",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        action: "listing.published",
        actorId: ownerId as never,
        createdAt: Date.now() - 60_000,
      });
      await ctx.db.insert("auditLogs", {
        action: "listing.published",
        actorId: otherId as never,
        createdAt: Date.now() - 30_000,
      });
    });

    const rows = await t.withIdentity({ subject: readerId }).query(api.users.listAuditLogs, {});
    expect(rows).toHaveLength(2);
    const byActor = (id: string) => rows.find((row) => row.actorId === id);
    expect(byActor(ownerId)?.actorIsOwnerAccount).toBe(true);
    expect(byActor(otherId)?.actorIsOwnerAccount).toBe(false);
  });

  test("blob foto yang sudah hilang tidak menghasilkan URL mati", async () => {
    const t = convexTest(schema, modules);
    const actorId = await seedUser(
      t,
      { name: "Aktor", email: "aktor@sumenep.co.id" },
      "admin",
    );
    const readerId = await seedUser(
      t,
      { name: "Pembaca Log", email: "pembaca@sumenep.co.id" },
      "admin",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        action: "listing.published",
        actorId: actorId as never,
        createdAt: Date.now() - 60_000,
      });
    });
    // Baris `users` masih menunjuk foto, tapi blob-nya sudah tidak ada.
    const deadStorageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(64)]));
      const system = ctx.db as unknown as {
        patch: (id: never, value: { contentType: string }) => Promise<void>;
      };
      await system.patch(id as never, { contentType: "image/jpeg" });
      return id as never;
    });
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        patch: (id: never, value: { profileImageStorageId: string }) => Promise<void>;
      };
      await db.patch(actorId as never, { profileImageStorageId: deadStorageId });
      await ctx.storage.delete(deadStorageId);
    });

    const reader = t.withIdentity({ subject: readerId });
    const rows = await reader.query(api.users.listAuditLogs, {});
    expect(rows[0]?.actorImageUrl ?? null).toBeNull();
  });
});
