import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { LOCKOUT_MS } from "../lib/admin-passcode";

const modules = import.meta.glob("./**/*.ts");

/**
 * Admin untuk uji daftar Security Desk. `convex-test` tidak membuatkan baris
 * `users`, jadi identity dibentuk dari id baris yang di-seed manual, lalu
 * diberi peran admin lewat `staffMembers` seperti di `realtime.test.ts`.
 */
async function setupAdmin(t: ReturnType<typeof convexTest>) {
  const id = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", { name: "Admin Uji", email: "admin-uji@sumenep.co.id" });
  });
  const owner = t.withIdentity({ name: "Admin Uji", subject: id });
  await t.run(async (ctx) => {
    await ctx.db.insert("staffMembers", {
      userId: id as never,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return owner;
}

test("daftar event hanya membaca jendela indeks + take berplafon", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 40; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: `kunci-${i}`, outcome: "failed", createdAt: now - i * 1000,
      });
    }
  });
  const page = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 10 });
  expect(page.events).toHaveLength(10);
  expect(page.nextCursor).not.toBeNull();
  expect(page.truncated).toBe(false);
});

test("burst createdAt sama paginasi tanpa miss/duplikat dan hasMore eksak", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 15; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: `burst-${i}`,
        outcome: "failed",
        createdAt: now,
      });
    }
  });
  const page1 = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 10 });
  expect(page1.events).toHaveLength(10);
  expect(page1.nextCursor).not.toBeNull();
  expect(page1.truncated).toBe(false);
  const page2 = await owner.query(api.adminGate.listAdminSecurityEvents, {
    limit: 10,
    cursor: page1.nextCursor as string,
  });
  expect(page2.events).toHaveLength(5);
  expect(page2.nextCursor).toBeNull();
  expect(page2.truncated).toBe(false);
  const ids1 = new Set(page1.events.map((e: { _id: string }) => e._id));
  const ids2 = new Set(page2.events.map((e: { _id: string }) => e._id));
  expect(ids1.size).toBe(10);
  expect(ids2.size).toBe(5);
  for (const id of ids2) expect(ids1.has(id)).toBe(false);
  expect(ids1.size + ids2.size).toBe(15);
});

test("halaman terakhir penuh hasMore eksak (20 baris, limit 10)", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 20; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: `penuh-${i}`,
        outcome: "failed",
        createdAt: now - i * 1000,
      });
    }
  });
  const page1 = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 10 });
  expect(page1.events).toHaveLength(10);
  expect(page1.nextCursor).not.toBeNull();
  const page2 = await owner.query(api.adminGate.listAdminSecurityEvents, {
    limit: 10,
    cursor: page1.nextCursor as string,
  });
  expect(page2.events).toHaveLength(10);
  expect(page2.nextCursor).toBeNull();
  expect(page2.truncated).toBe(false);
  const ids = new Set([
    ...page1.events.map((e: { _id: string }) => e._id),
    ...page2.events.map((e: { _id: string }) => e._id),
  ]);
  expect(ids.size).toBe(20);
});

test("previous tanpa sidik sesi cocok dengan semantik lama (undefined === undefined)", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("adminPasscodeAttempts", {
      key: "tanpa-sidik-1",
      outcome: "success",
      createdAt: now - 5000,
    });
    await ctx.db.insert("adminPasscodeAttempts", {
      key: "tanpa-sidik-2",
      outcome: "failed",
      createdAt: now,
    });
  });
  const page = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 10 });
  const later = page.events.find(
    (e: { createdAt: number }) => e.createdAt === now,
  ) as { previousSuccessAt: number | null } | undefined;
  expect(later).toBeDefined();
  expect(later?.previousSuccessAt).toBe(now - 5000);
});

test("baris di luar jendela tidak memengaruhi halaman (bounded)", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  const outside = now - LOCKOUT_MS - 10_000;
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-jendela",
        outcome: "failed",
        ipHash: "ip-sama",
        createdAt: now - i * 1000,
      });
    }
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-jendela",
        outcome: "failed",
        ipHash: "ip-sama",
        createdAt: outside - i * 1000,
      });
    }
  });
  // limit 5 -> halaman pertama hanya 5 baris terbaru dalam jendela.
  const page = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 5 });
  expect(page.events).toHaveLength(5);
  expect(page.truncated).toBe(false);
  for (const e of page.events as Array<{
    attemptsInWindow: number;
    failedInWindow: number;
    ipTotal: number;
  }>) {
    // 5 dalam jendela: dirinya + 4 kerabat dalam jendela, bukan 10.
    expect(e.attemptsInWindow).toBe(5);
    expect(e.failedInWindow).toBe(4);
    expect(e.ipTotal).toBe(5);
  }
});

test("plafon take memicu truncated", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 120; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-ramai",
        outcome: "failed",
        ipHash: "ip-ramai",
        sessionFingerprint: "sidik-ramai",
        createdAt: now - i * 100,
      });
    }
  });
  const page = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 10 });
  expect(page.events).toHaveLength(10);
  expect(page.truncated).toBe(true);
});

test("ekuivalen dengan full-scan lama untuk fixture dalam jendela", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  const fixture = [
    { key: "k-a", outcome: "failed" as const, ipHash: "ip-1", sessionFingerprint: "fp-1", createdAt: now - 5000 },
    { key: "k-a", outcome: "failed" as const, ipHash: "ip-1", sessionFingerprint: "fp-1", createdAt: now - 4000 },
    { key: "k-b", outcome: "success" as const, ipHash: "ip-2", sessionFingerprint: "fp-2", createdAt: now - 3000 },
    { key: "k-b", outcome: "failed" as const, ipHash: "ip-2", sessionFingerprint: "fp-2", createdAt: now - 2000 },
    { key: "k-c", outcome: "success" as const, ipHash: undefined, sessionFingerprint: undefined, createdAt: now - 6000 },
    { key: "k-c", outcome: "failed" as const, ipHash: undefined, sessionFingerprint: undefined, createdAt: now - 1000 },
  ];
  await t.run(async (ctx) => {
    for (const row of fixture) {
      const { ipHash, sessionFingerprint, ...rest } = row;
      await ctx.db.insert("adminPasscodeAttempts", {
        ...rest,
        ...(ipHash === undefined ? {} : { ipHash }),
        ...(sessionFingerprint === undefined ? {} : { sessionFingerprint }),
      });
    }
  });
  const windowStart = now - LOCKOUT_MS;
  // Semantik lama: full-scan atas seluruh tabel.
  const all = await t.run(async (ctx) =>
    ctx.db.query("adminPasscodeAttempts").collect(),
  );
  const rowsDesc = [...all].sort(
    (a, b) => b.createdAt - a.createdAt || (a._id < b._id ? 1 : -1),
  );
  const successes = rowsDesc.filter((r) => r.outcome === "success");
  const expectedById = new Map<string, { related: number; failed: number; prev: number | null; rapid: number }>();
  for (const row of rowsDesc) {
    const related = rowsDesc.filter(
      (o) =>
        o.createdAt >= windowStart &&
        o._id !== row._id &&
        (o.key === row.key || (row.ipHash !== undefined && o.ipHash === row.ipHash)),
    );
    const prev = successes.find(
      (o) => o.createdAt < row.createdAt && o.sessionFingerprint === row.sessionFingerprint,
    );
    const rapid = rowsDesc.filter(
      (o) => o.createdAt >= row.createdAt - 60_000 && o.createdAt <= row.createdAt,
    ).length;
    expectedById.set(row._id as string, {
      related: related.length,
      failed: related.filter((o) => o.outcome === "failed").length,
      prev: prev?.createdAt ?? null,
      rapid,
    });
  }
  const page = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 25 });
  expect(page.truncated).toBe(false);
  expect(page.events).toHaveLength(fixture.length);
  for (const e of page.events as Array<{
    _id: string;
    attemptsInWindow: number;
    failedInWindow: number;
    previousSuccessAt: number | null;
  }>) {
    const exp = expectedById.get(e._id);
    expect(exp).toBeDefined();
    expect(e.attemptsInWindow).toBe((exp?.related ?? 0) + 1);
    expect(e.failedInWindow).toBe(exp?.failed);
    expect(e.previousSuccessAt).toBe(exp?.prev);
  }
});
