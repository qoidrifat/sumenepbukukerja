/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { RESEND_COOLDOWN_MS, sha256Hex } from "../lib/otp-email";

/**
 * OTP email Fase 9.5 — requestCode + status + signIn "otp-email".
 *
 * Yang paling berisiko di fitur ini:
 *  1. kode OTP tidak boleh tersimpan polos (hanya hash SHA-256),
 *  2. respons untuk email tak dikenal harus SAMA dengan sukses
 *     (anti user-enumeration),
 *  3. kode hanya hidup 10 menit, maksimal 5x verifikasi salah, dan tidak
 *     bisa dipakai ulang,
 *  4. detail kegagalan provider tidak boleh bocor ke klien.
 *
 * Semuanya diuji di sini terhadap database sungguhan lewat convex-test,
 * termasuk alur signIn penuh provider `otp-email` — bukan authorize palsu.
 */

const modules = import.meta.glob("./**/*.ts");

type EnvBag = { process?: { env?: Record<string, string | undefined> } };
const envBag = () => (globalThis as unknown as EnvBag).process?.env;
const setEnv = (key: string, value: string) => {
  const bag = envBag();
  if (!bag) throw new Error("Test environment does not expose an env record");
  bag[key] = value;
};
const AUTH_ENV_KEYS = ["JWT_PRIVATE_KEY", "CONVEX_SITE_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};
let savedResendKey: string | undefined;

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  setEnv("JWT_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  setEnv("CONVEX_SITE_URL", "https://otp-uji.convex.site");
  for (const key of AUTH_ENV_KEYS) savedEnv[key] = envBag()?.[key];
  savedResendKey = envBag()?.["RESEND_API_KEY"];
  setEnv("RESEND_API_KEY", "re_uji");
});

afterAll(() => {
  const bag = envBag();
  if (!bag) return;
  for (const key of AUTH_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete bag[key];
    else bag[key] = savedEnv[key];
  }
  if (savedResendKey === undefined) delete bag["RESEND_API_KEY"];
  else bag["RESEND_API_KEY"] = savedResendKey;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Isi `html` dari panggilan fetch terakhir ke Resend. */
let lastHtml = "";
/** Berapa kali fetch dipanggil sejak stub dipasang. */
let fetchCalls = 0;
const originalFetch = globalThis.fetch;

function stubResendOk() {
  lastHtml = "";
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      fetchCalls += 1;
      lastHtml = String((JSON.parse(String(init?.body)) as { html: string }).html);
      return new Response(JSON.stringify({ id: "re_uji123" }), { status: 200 });
    }),
  );
}

function stubResendFailure(status: number, body: string) {
  lastHtml = "";
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      fetchCalls += 1;
      return new Response(body, { status });
    }),
  );
}

type OtpRow = {
  _id: string;
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  consumedAt?: number;
  createdAt: number;
};

async function otpRows(t: ReturnType<typeof convexTest>, email: string): Promise<OtpRow[]> {
  return await t.run(async (ctx) => {
    // Tanpa withIndex: di bawah `ReturnType<typeof convexTest>` generik,
    // withIndex tabel kustom tidak terketik (pola cast Db longgar antar-test
    // lain); collect + saring di memori cukup untuk volume uji.
    const rows = (await ctx.db.query("emailOtpCodes").collect()) as unknown as OtpRow[];
    return rows.filter((row) => row.email === email);
  });
}

/** Mundurkan `createdAt` semua baris supaya cooldown lewat tapi plafon jam tetap. */
async function ageRows(t: ReturnType<typeof convexTest>, email: string, ms: number) {
  await t.run(async (ctx) => {
    const rows = (await ctx.db.query("emailOtpCodes").collect()) as unknown as OtpRow[];
    for (const row of rows) {
      if (row.email !== email) continue;
      await ctx.db.patch(row._id as never, { createdAt: Date.now() - ms });
    }
  });
}

/**
 * Kode 6 digit yang baru saja dikirim: satu-satunya kandidat yang hash-nya
 * cocok dengan baris tersimpan. Mengambil dari `html` supaya test membuktikan
 * kode yang DIHASH sama dengan kode yang DIKIRIM — bukan dua sumber berbeda.
 */
async function sentCode(row: OtpRow): Promise<string> {
  const candidates = lastHtml.match(/\d{6}/g) ?? [];
  for (const candidate of candidates) {
    if ((await sha256Hex(candidate)) === row.codeHash) return candidate;
  }
  throw new Error("html Resend tidak memuat kode yang cocok dengan codeHash");
}

describe("otp email backend", () => {
  test("requestCode menyimpan hash bukan polos + status enabled", async () => {
    stubResendOk();
    const t = convexTest(schema, modules);

    const result = await t.action(api.otpEmail.requestCode, { email: "warga@example.id" });
    expect(result).toEqual({ ok: true, retryAfterMs: RESEND_COOLDOWN_MS });

    const rows = await otpRows(t, "warga@example.id");
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);

    const code = await sentCode(row);
    expect(JSON.stringify(row)).not.toContain(code);
    // TTL: 10 menit dari sekarang, bukan angka yang ditulis ulang.
    const ttl = row.expiresAt - Date.now();
    expect(ttl).toBeGreaterThan(9.5 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000);

    expect(await t.query(api.otpEmail.status, {})).toEqual({ enabled: true });
  });

  test("cooldown: request kedua <60 dtk tak membuat baris baru + retryAfterMs>0", async () => {
    stubResendOk();
    const t = convexTest(schema, modules);

    const first = await t.action(api.otpEmail.requestCode, { email: "sabar@example.id" });
    expect(first).toEqual({ ok: true, retryAfterMs: RESEND_COOLDOWN_MS });
    const second = await t.action(api.otpEmail.requestCode, { email: "sabar@example.id" });
    expect(second.ok).toBe(true);
    expect(second.retryAfterMs).toBeGreaterThan(0);
    expect(second.retryAfterMs).toBeLessThanOrEqual(RESEND_COOLDOWN_MS);

    expect(await otpRows(t, "sabar@example.id")).toHaveLength(1);
    expect(fetchCalls).toBe(1);
  });

  test("cap 5/jam: request ke-6 melempar 'Terlalu banyak permintaan'", async () => {
    stubResendOk();
    const t = convexTest(schema, modules);
    const email = "boros@example.id";

    for (let i = 0; i < 5; i++) {
      await t.action(api.otpEmail.requestCode, { email });
      // Mundurkan cooldown supaya kiriman berikutnya diizinkan, tapi tetap
      // di dalam jendela satu jam untuk plafon.
      await ageRows(t, email, 61_000);
    }
    expect(await otpRows(t, email)).toHaveLength(5);
    await expect(t.action(api.otpEmail.requestCode, { email })).rejects.toThrow(
      "Terlalu banyak permintaan",
    );
  });

  test("email invalid: respons generik SAMA seperti sukses (anti-enumeration)", async () => {
    stubResendOk();
    const t = convexTest(schema, modules);

    const result = await t.action(api.otpEmail.requestCode, { email: "bukan-email" });
    expect(result).toEqual({ ok: true, retryAfterMs: RESEND_COOLDOWN_MS });
    expect(fetchCalls).toBe(0);
    expect(await otpRows(t, "bukan-email")).toHaveLength(0);
  });

  test("Resend 429 → ConvexError generik tanpa body provider", async () => {
    stubResendFailure(429, "rate_limited_dari_provider");
    const t = convexTest(schema, modules);

    const error = await t
      .action(api.otpEmail.requestCode, { email: "gagal@example.id" })
      .then(
        () => {
          throw new Error("seharusnya melempar");
        },
        (err: Error) => err,
      );
    expect(error.message).toContain("Email belum terkirim");
    expect(error.message).not.toContain("rate_limited_dari_provider");

    // Kirim-dulu-simpan-belakangan: kiriman gagal tidak meninggalkan baris,
    // jadi tidak membakar plafon 5/jam dan tidak memulai cooldown 60 dtk.
    // Buktinya percobaan ulang langsung terkirim penuh (retryAfterMs utuh,
    // bukan sisa cooldown), bukan ditahan.
    expect(await otpRows(t, "gagal@example.id")).toHaveLength(0);
    stubResendOk();
    const retry = await t.action(api.otpEmail.requestCode, { email: "gagal@example.id" });
    expect(retry).toEqual({ ok: true, retryAfterMs: RESEND_COOLDOWN_MS });
    expect(await otpRows(t, "gagal@example.id")).toHaveLength(1);
    expect(fetchCalls).toBe(1);
  });

  test("pruneOtpCodes: baris mati >7 hari hilang, baris hidup + mati muda utuh", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const old = now - 8 * 24 * 60 * 60_000;
    await t.run(async (ctx) => {
      // Kedaluwarsa lama.
      await ctx.db.insert("emailOtpCodes", {
        email: "tua@example.id",
        codeHash: "a".repeat(64),
        expiresAt: old + 600_000,
        attempts: 0,
        createdAt: old,
      });
      // Terpakai lama (masih dalam TTL tapi sudah hangus).
      await ctx.db.insert("emailOtpCodes", {
        email: "tua@example.id",
        codeHash: "b".repeat(64),
        expiresAt: now + 600_000,
        attempts: 1,
        consumedAt: old + 1000,
        createdAt: old,
      });
      // Hidup: belum dipakai + belum kedaluwarsa.
      await ctx.db.insert("emailOtpCodes", {
        email: "hidup@example.id",
        codeHash: "c".repeat(64),
        expiresAt: now + 600_000,
        attempts: 0,
        createdAt: now,
      });
      // Mati muda (<7 hari): masih dalam masa retensi.
      await ctx.db.insert("emailOtpCodes", {
        email: "muda@example.id",
        codeHash: "d".repeat(64),
        expiresAt: now + 600_000,
        attempts: 1,
        consumedAt: now - 1000,
        createdAt: now - 3_600_000,
      });
    });

    expect(await t.mutation(internal.otpEmail.pruneOtpCodes, {})).toBe(2);
    expect(await otpRows(t, "tua@example.id")).toHaveLength(0);
    expect(await otpRows(t, "hidup@example.id")).toHaveLength(1);
    expect(await otpRows(t, "muda@example.id")).toHaveLength(1);
  });

  test("signIn penuh: kode benar → sesi; salah 5x → hangus; kedaluwarsa → null; pakai-ulang → null", async () => {
    stubResendOk();
    const t = convexTest(schema, modules);
    const email = "masuk@example.id";

    await t.action(api.otpEmail.requestCode, { email });
    const code = await sentCode((await otpRows(t, email))[0]!);

    const signed = await t.action(api.auth.signIn, {
      provider: "otp-email",
      params: { email, code },
    });
    expect(signed.tokens?.token).toBeTruthy();
    expect(signed.tokens?.refreshToken).toBeTruthy();

    // Sesi sungguhan: sub JWT menunjuk ke user yang terverifikasi emailnya,
    // dan identitas itu bisa dipakai memanggil sebagai pengguna tersebut.
    const payload = JSON.parse(
      Buffer.from(String(signed.tokens?.token).split(".")[1], "base64url").toString("utf8"),
    ) as { sub: string };
    const userId = payload.sub.split("|")[0]!;
    const state = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId as never);
      return user as unknown as { email?: string; emailVerificationTime?: number } | null;
    });
    expect(state?.email).toBe(email);
    expect(state?.emailVerificationTime).toBeGreaterThan(0);
    const asSigned = t.withIdentity({ subject: payload.sub });
    expect(await asSigned.query(api.users.currentUserId, {})).toBeTruthy();

    // Pakai-ulang kode yang sama → ditolak.
    const reuse = await t.action(api.auth.signIn, {
      provider: "otp-email",
      params: { email, code },
    });
    expect(reuse.tokens).toBeNull();

    // Kode salah 5x → baris hangus; kode benar sesudahnya tetap ditolak.
    // ageRows dulu: kode pertama baru dipakai <60 dtk lalu, jadi tanpa ini
    // requestCode hanya mengembalikan cooldown tanpa baris baru.
    await ageRows(t, email, 61_000);
    await t.action(api.otpEmail.requestCode, { email });
    const fresh = (await otpRows(t, email)).sort((a, b) => b.createdAt - a.createdAt)[0]!;
    const freshCode = await sentCode(fresh);
    // Dijamin salah apa pun kode aslinya (peluang tabrakan 1e-6 dihindari).
    const wrongCode = freshCode === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      const wrong = await t.action(api.auth.signIn, {
        provider: "otp-email",
        params: { email, code: wrongCode },
      });
      expect(wrong.tokens).toBeNull();
    }
    const burned = await t.action(api.auth.signIn, {
      provider: "otp-email",
      params: { email, code: freshCode },
    });
    expect(burned.tokens).toBeNull();

    // Kode kedaluwarsa → ditolak walau benar.
    await ageRows(t, email, 61_000);
    await t.action(api.otpEmail.requestCode, { email });
    const expiring = (await otpRows(t, email)).sort((a, b) => b.createdAt - a.createdAt)[0]!;
    const expiringCode = await sentCode(expiring);
    await t.run(async (ctx) => {
      await ctx.db.patch(expiring._id as never, { expiresAt: Date.now() - 1000 });
    });
    const expired = await t.action(api.auth.signIn, {
      provider: "otp-email",
      params: { email, code: expiringCode },
    });
    expect(expired.tokens).toBeNull();
  });
});
