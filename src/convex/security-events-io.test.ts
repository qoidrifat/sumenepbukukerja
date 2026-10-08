import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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
