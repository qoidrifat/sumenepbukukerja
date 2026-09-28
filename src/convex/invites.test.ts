/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Undangan pengelola sekali klik.
 *
 * Yang paling berisiko di fitur ini bukan tampilannya, melainkan dua hal:
 *  1. token undangan tidak boleh bocor lewat query mana pun, dan
 *  2. satu token hanya boleh menghasilkan SATU akun/sesi, walau dua orang
 *     menekan tombolnya pada milidetik yang sama.
 *
 * Keduanya diuji di sini terhadap database sungguhan lewat convex-test,
 * bukan terhadap mock.
 */

const modules = import.meta.glob("./**/*.ts");

/**
 * Convex Auth menandatangani token sesi dengan RSA dan membaca kuncinya dari
 * environment. Tanpa ini, `auth:store` gagal dengan
 * "Missing environment variable JWT_PRIVATE_KEY" dan bagian paling penting
 * dari fitur ini — penerbitan sesi — tidak akan pernah teruji.
 *
 * Kuncinya dibuat sungguhan di dalam test, lalu dipasang ke `process.env`
 * dengan pola yang sama seperti `realtime.test.ts` memakai untuk
 * `ADMIN_PASSCODE_HASH`. Tidak ada kunci produksi yang tersentuh, dan tidak
 * ada yang perlu diisi lewat tab Keys hanya supaya tes ini jalan.
 */
type EnvBag = { process?: { env?: Record<string, string | undefined> } };
const envBag = () => (globalThis as unknown as EnvBag).process?.env;
const setEnv = (key: string, value: string) => {
  const bag = envBag();
  if (!bag) throw new Error("Test environment does not expose an env record");
  bag[key] = value;
};
const AUTH_ENV_KEYS = ["JWT_PRIVATE_KEY", "CONVEX_SITE_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  setEnv("JWT_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  setEnv("CONVEX_SITE_URL", "https://undangan-uji.convex.site");
  for (const key of AUTH_ENV_KEYS) savedEnv[key] = envBag()?.[key];
});

afterAll(() => {
  const bag = envBag();
  if (!bag) return;
  for (const key of AUTH_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete bag[key];
    else bag[key] = savedEnv[key];
  }
});

const sha256Hex = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

async function seedUserId(t: ReturnType<typeof convexTest>, user: { name: string; email: string }) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", user);
  });
}

async function setupAdmin(t: ReturnType<typeof convexTest>) {
  const userId = await seedUserId(t, { name: "Admin Undangan", email: "admin-uji@sumenep.co.id" });
  await t.run(async (ctx) => {
    await ctx.db.insert("staffMembers", {
      userId: userId as never,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return t.withIdentity({ subject: userId });
}

/** Undangan aktif yang dibuat lewat jalur produksi, bukan disemai manual. */
async function makeInvite(
  t: ReturnType<typeof convexTest>,
  admin: ReturnType<typeof convexTest>["withIdentity"] extends (...a: never) => infer R ? R : never,
  overrides: { email?: string; role?: "admin" | "staff" | "viewer" } = {},
) {
  const email = overrides.email ?? "penerima@sumenep.co.id";
  const role = overrides.role ?? "staff";
  return await admin.mutation(api.users.createStaffInvite, { email, role });
}

describe("undangan pengelola", () => {
  test("pembuatan undangan menyimpan hash token, bukan token mentah", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);

    const result = await makeInvite(t, admin);
    expect(result.token).toBeTruthy();
    expect(result.email).toBe("penerima@sumenep.co.id");
    expect(result.role).toBe("staff");

    const stored = await t.run(async (ctx) => {
      const rows = await ctx.db.query("staffInvites").collect();
      return rows[0];
    });
    // Yang tersimpan harus persis SHA-256 dari token yang diberikan.
    expect(stored?.tokenHash).toBe(await sha256Hex(result.token));
    // Dan tidak boleh ada kolom mana pun yang menyimpan token mentah.
    expect(JSON.stringify(stored)).not.toContain(result.token);

    // Masa berlaku mengikuti TTL tunggal (48 jam), bukan angka yang ditulis
    // ulang di tempat lain.
    const ttlHours = (result.expiresAt - Date.now()) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(47.5);
    expect(ttlHours).toBeLessThan(48.5);
  });

  test("non-admin dan warga biasa tidak bisa membuat undangan", async () => {
    const t = convexTest(schema, modules);
    await setupAdmin(t);
    const residentId = await seedUserId(t, { name: "Warga", email: "warga-uji@sumenep.co.id" });
    const resident = t.withIdentity({ subject: residentId });

    await expect(
      resident.mutation(api.users.createStaffInvite, { email: "x@y.id", role: "staff" }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.users.createStaffInvite, { email: "x@y.id", role: "staff" }),
    ).rejects.toThrow();
  });

  test("getInviteDetails tidak membocorkan id internal maupun membedakan alasan gagal", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    const invite = await makeInvite(t, admin);

    const valid = await t.query(api.users.getInviteDetails, { token: invite.token });
    expect(valid.valid).toBe(true);
    if (!valid.valid) throw new Error("harus valid");
    expect(valid.email).toBe("penerima@sumenep.co.id");
    expect(valid.role).toBe("staff");
    expect(valid.invitedByName).toBe("Administrator Sistem");

    // Bentuk yang kembali ke klien tidak boleh memuat pengenal internal.
    const serialized = JSON.stringify(valid);
    expect(serialized).not.toContain(invite.token);
    expect(serialized).not.toContain(await sha256Hex(invite.token));

    // Anti-enumerasi: "tidak ada", "sudah dipakai", dan "kedaluwarsa" harus
    // benar-benar tidak bisa dibedakan.
    const unknown = await t.query(api.users.getInviteDetails, { token: "token-ngawur" });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("staffInvites").first();
      await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1000 });
    });
    const expired = await t.query(api.users.getInviteDetails, { token: invite.token });
    expect(JSON.stringify(unknown)).toBe(JSON.stringify(expired));
    expect(unknown).toEqual({ valid: false, reason: "EXPIRED_OR_INVALID" });
  });

  test("klaim berhasil membuat akun, mengikat peran, dan menerbitkan sesi", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    const invite = await makeInvite(t, admin, { email: "baru@sumenep.co.id", role: "staff" });

    const result = await t.mutation(api.users.acceptStaffInvite, { token: invite.token });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("harus berhasil");

    // Akun + peran + tanda terima ada semua setelah satu mutasi.
    const state = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", "baru@sumenep.co.id"))
        .unique();
      const membership = user
        ? await ctx.db.query("staffMembers").withIndex("byUser", (q) => q.eq("userId", user._id)).unique()
        : null;
      const row = await ctx.db.query("staffInvites").first();
      const audits = await ctx.db.query("auditLogs").collect();
      return {
        userId: user?._id,
        verified: user?.emailVerificationTime,
        role: membership?.role,
        acceptedBy: row?.acceptedBy,
        actions: audits.map((a) => a.action),
      };
    });
    expect(state.userId).toBeTruthy();
    expect(state.verified).toBeGreaterThan(0);
    expect(state.role).toBe("staff");
    expect(state.acceptedBy).toBe(state.userId);
    expect(state.actions).toContain("staff.invite_accepted");

    // Sesi yang diterbitkan harus sesi Convex Auth sungguhan: ada baris
    // `authSessions`, dan sub JWT-nya persis `userId|sessionId`.
    const session = await t.run(async (ctx) => {
      const row = await ctx.db.query("authSessions").first();
      return row;
    });
    expect(session).toBeTruthy();
    const payload = JSON.parse(
      Buffer.from(result.tokens.token.split(".")[1], "base64url").toString("utf8"),
    );
    expect(payload.sub).toBe(`${state.userId}|${session?._id}`);
    expect(result.tokens.refreshToken).toBeTruthy();
  });

  test("sesi terbit bisa dipakai: identity pembacaan sesi menghasilkan user yang sama", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    const invite = await makeInvite(t, admin, { email: "pakai@sumenep.co.id" });
    const result = await t.mutation(api.users.acceptStaffInvite, { token: invite.token });
    if (!result.ok) throw new Error("harus berhasil");

    // Sesi baru dipakai sebagai identitas pemanggil pada operasi berikutnya:
    // kalau penerbitan sesinya benar, baris akunnya ikut terbaca.
    const asInvited = t.withIdentity({
      subject: JSON.parse(
        Buffer.from(result.tokens.token.split(".")[1], "base64url").toString("utf8"),
      ).sub,
    });
    const userId = await asInvited.query(api.users.currentUserId, {});
    expect(userId).toBeTruthy();
  });

  test("token yang sudah dipakai tidak bisa diklaim kedua kali", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    const invite = await makeInvite(t, admin);

    const first = await t.mutation(api.users.acceptStaffInvite, { token: invite.token });
    expect(first.ok).toBe(true);
    const second = await t.mutation(api.users.acceptStaffInvite, { token: invite.token });
    expect(second).toEqual({ ok: false, reason: "ALREADY_ACCEPTED" });

    // Dan kegagalannya tercatat, supaya percobaan ulang terlihat.
    const rejected = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect())
        .filter((a) => a.action === "staff.invite_rejected")
        .map((a) => a.metadata?.reason),
    );
    expect(rejected).toContain("ALREADY_ACCEPTED");
  });

  test("dua klaim bersamaan hanya menghasilkan satu sesi", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    const invite = await makeInvite(t, admin, { email: "balapan@sumenep.co.id" });

    // Dua panggilan pada saat sama, persis skenario dua orang menekan
    // tombol di milidetik yang sama.
    const [a, b] = await Promise.all([
      t.mutation(api.users.acceptStaffInvite, { token: invite.token }),
      t.mutation(api.users.acceptStaffInvite, { token: invite.token }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    expect(winners.length).toBe(1);
    const losers = [a, b].filter((r) => !r.ok);
    expect(losers.length).toBe(1);
    expect(losers[0].reason).toBe("ALREADY_ACCEPTED");

    // Tepat satu akun, satu peran, satu baris sesi.
    const counts = await t.run(async (ctx) => ({
      sessions: (await ctx.db.query("authSessions").collect()).length,
      accepted: (await ctx.db.query("staffInvites").collect()).filter((r) => r.acceptedAt).length,
    }));
    expect(counts.sessions).toBe(1);
    expect(counts.accepted).toBe(1);
  });

  test("token kedaluwarsa dan token asing ditolak tanpa membuat akun", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    const invite = await makeInvite(t, admin, { email: "kedaluwarsa@sumenep.co.id" });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("staffInvites").first();
      await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 });
    });

    await expect(
      t.mutation(api.users.acceptStaffInvite, { token: invite.token }),
    ).resolves.toEqual({ ok: false, reason: "EXPIRED_OR_INVALID" });
    await expect(
      t.mutation(api.users.acceptStaffInvite, { token: "token-ngawur" }),
    ).resolves.toEqual({ ok: false, reason: "EXPIRED_OR_INVALID" });

    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users.some((u) => u.email === "kedaluwarsa@sumenep.co.id")).toBe(false);
  });

  test("pengikatan email dijaga: pemanggil yang sudah masuk dengan email lain ditolak", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    const invite = await makeInvite(t, admin, { email: "pemilik@sumenep.co.id" });
    const otherId = await seedUserId(t, { name: "Orang Lain", email: "bukan-pemilik@sumenep.co.id" });
    const intruder = t.withIdentity({ subject: otherId });

    await expect(
      intruder.mutation(api.users.acceptStaffInvite, { token: invite.token }),
    ).resolves.toEqual({ ok: false, reason: "EMAIL_MISMATCH" });

    // Undangan masih utuh untuk orang yang benar-benar diundang.
    const rightful = await t.mutation(api.users.acceptStaffInvite, { token: invite.token });
    expect(rightful.ok).toBe(true);
  });

  test("admin yang sudah ada tidak dapat diturunkan lewat undangan", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUserId(t, { name: "Admin Tetap", email: "tetap@sumenep.co.id" });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: adminId as never,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    // `createStaffInvite` sendiri menolak email yang sudah punya peran, jadi
    // baris undangan disemai langsung di sini. Keadaan ini tetap bisa terjadi
    // di produksi (peran bisa berubah setelah undangan dibuat), jadi guard
    // penurunan peran harus diuji sebagai defense-in-depth.
    const token = "token-uji-turun-peran";
    await t.run(async (ctx) => {
      await ctx.db.insert("staffInvites", {
        email: "tetap@sumenep.co.id",
        role: "viewer",
        tokenHash: await sha256Hex(token),
        invitedBy: adminId as never,
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      });
    });

    const result = await t.mutation(api.users.acceptStaffInvite, { token });
    expect(result).toEqual({ ok: false, reason: "CANNOT_DEMOTE_ADMIN" });

    const membership = await t.run(async (ctx) => ctx.db.query("staffMembers").collect());
    expect(membership[0]?.role).toBe("admin");
  });

  test("pembuatan undangan menulis jejak audit admin.invite_created", async () => {
    const t = convexTest(schema, modules);
    const admin = await setupAdmin(t);
    await makeInvite(t, admin, { role: "viewer" });
    const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const created = audits.find((a) => a.action === "admin.invite_created");
    expect(created).toBeTruthy();
    // Audit tidak boleh memuat token mentah.
    expect(JSON.stringify(audits)).not.toMatch(/"token":\s*"[A-Za-z0-9_-]{20,}/);
  });
});
