import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Admin untuk uji heartbeat. `convex-test` tidak membuatkan baris `users`,
 * jadi identity dibentuk dari id baris yang di-seed manual, sama seperti di
 * `security-events-io.test.ts`.
 */
async function setupAdmin(t: ReturnType<typeof convexTest>) {
  const id = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", { name: "Admin Uji", email: "admin-heartbeat@sumenep.co.id" });
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

test("heartbeat segar adalah no-op tanpa patch", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const first = await owner.mutation(api.adminGate.heartbeatAdminPresence, { route: "/admin" });
  expect(first.wrote).toBe(true);
  const second = await owner.mutation(api.adminGate.heartbeatAdminPresence, { route: "/admin" });
  expect(second.wrote).toBe(false);
  expect(second.lastSeenAt).toBe(first.lastSeenAt);
});

test("heartbeat dengan route berbeda tetap menulis", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const first = await owner.mutation(api.adminGate.heartbeatAdminPresence, { route: "/admin" });
  expect(first.wrote).toBe(true);
  // Route berpindah berarti konteks tampilan berubah, jadi harus patch.
  const second = await owner.mutation(api.adminGate.heartbeatAdminPresence, { route: "/admin/sesi" });
  expect(second.wrote).toBe(true);
});

// Penghitung token supaya setiap baris konteks punya token unik, tapi isinya
// tetap identik — field hasil komputasi harus sama persis antar panggilan.
let contextTokenCounter = 0;

/**
 * Meniru `POST /admin-gate/context`: satu baris konteks server yang berlaku.
 * Isinya sengaja tetap (tidak acak) supaya dua token berurutan menghasilkan
 * field komputasi yang identik — syarat uji no-op di bawah.
 */
async function seedContextToken(t: ReturnType<typeof convexTest>) {
  contextTokenCounter += 1;
  const token = `kctx-uji-noop-${contextTokenCounter}-${Date.now()}`;
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    const now = Date.now();
    await db.insert("adminSecurityContexts", {
      token,
      ipHash: "hash-server-noop",
      ipMasked: "103.28.14.xxx",
      ipSource: "CF-Connecting-IP",
      ipFamily: "IPv4",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      requestId: "req_noop-server",
      createdAt: now,
      expiresAt: now + 5 * 60_000,
    });
  });
  return token;
}

/** Baris presence tunggal untuk uji no-op. */
async function readPresence(t: ReturnType<typeof convexTest>) {
  const rows = await t.run(async (ctx) => await ctx.db.query("adminPresence").collect());
  if (rows.length !== 1) throw new Error(`presence harus 1 baris, ada ${rows.length}`);
  return rows[0] as unknown as { lastSeenAt: number };
}

test("reportSessionContext identik adalah no-op", async () => {
  const t = convexTest(schema, modules);
  const admin = await setupAdmin(t);
  const token = await seedContextToken(t);
  await admin.mutation(api.adminGate.reportSessionContext, { token });
  const before = await readPresence(t);
  await admin.mutation(api.adminGate.reportSessionContext, { token: await seedContextToken(t) });
  const after = await readPresence(t);
  expect(after.lastSeenAt).toBe(before.lastSeenAt);
});
