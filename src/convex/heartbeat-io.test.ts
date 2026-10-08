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
