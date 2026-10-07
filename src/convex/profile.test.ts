/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PHONE_DATA_KEY_ENV } from "../lib/phone-crypto";
import { makeInboundCode } from "./profile";

/**
 * Profil warga Fase 9.6 — gate kelengkapan + verifikasi nomor INBOUND.
 *
 * Nomor dibuktikan dengan mengirim kode `K-XXXX` (diterbitkan server) dari
 * nomor itu sendiri ke WhatsApp bisnis; webhook mencocokkan dan menandai
 * terverifikasi. Tanpa template, tanpa biaya, tanpa SMS.
 *
 * Yang dikunci di sini:
 *  1. Status lengkap hanya bila nama + nomor terverifikasi + alamat ada.
 *  2. Kode inbound: hash saja tersimpan; salah nomor tidak membakar kode;
 *     kedaluwarsa/terpakai ditolak; pengirim asing diabaikan.
 *  3. Simpan profil atomik dan MENOLAK nomor yang belum terverifikasi.
 *  4. Ganti nomor di preferensi menghapus stempel verifikasi lama.
 *  5. Jalur outbound lama (`requestPhoneCode`) tetap berperilaku.
 */

const modules = import.meta.glob("./**/*.ts");

/** Kunci uji deterministik. Bukan kunci produksi. */
const TEST_KEY_B64 = btoa(
  String.fromCharCode(...new Uint8Array(Array.from({ length: 32 }, (_, i) => i + 1))),
);

type EnvBag = { process?: { env?: Record<string, string | undefined> } };
const envBag = () => (globalThis as unknown as EnvBag).process?.env;
// Env dummy khusus file ini: kunci enkripsi + kredensial Meta (jalur
// outbound mencapai fetch yang distub) + nomor bisnis (jalur inbound).
const MANAGED_ENV = [
  PHONE_DATA_KEY_ENV,
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_NUMBER",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  const bag = envBag();
  if (!bag) throw new Error("Test environment does not expose an env record");
  for (const name of MANAGED_ENV) savedEnv[name] = bag[name];
  bag[PHONE_DATA_KEY_ENV] = TEST_KEY_B64;
  bag["WHATSAPP_ACCESS_TOKEN"] = "uji-token-meta";
  bag["WHATSAPP_PHONE_NUMBER_ID"] = "uji-phone-id";
  bag["WHATSAPP_BUSINESS_NUMBER"] = "6280000000000";
});

afterAll(() => {
  const bag = envBag();
  if (!bag) return;
  for (const name of MANAGED_ENV) {
    if (savedEnv[name] === undefined) delete bag[name];
    else bag[name] = savedEnv[name];
  }
});

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Isi `body` panggilan fetch terakhir ke Meta. */
let lastPayload = "";
let fetchCalls = 0;

function stubMeta(status = 200) {
  lastPayload = "";
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      fetchCalls += 1;
      lastPayload = String(init?.body ?? "");
      if (status !== 200) return new Response("nope", { status });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.uji1" }] }), { status: 200 });
    }),
  );
}

const seedUser = async (
  t: ReturnType<typeof convexTest>,
  input: { email?: string; publicName?: string; homeAddress?: string } = {},
) =>
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.publicName !== undefined ? { publicName: input.publicName } : {}),
      ...(input.homeAddress !== undefined ? { homeAddress: input.homeAddress } : {}),
    });
    return userId;
  });

const callerFor = (t: ReturnType<typeof convexTest>, userId: string) =>
  t.withIdentity({ subject: `${userId}|sesi-uji-profil` });

const INBOUND_ARGS = (phone: string, body: string) => ({
  phone,
  providerMessageId: `wamid-${phone}-${body}`,
  body,
  kind: "text",
  at: Date.now(),
});

describe("makeInboundCode", () => {
  test("format K-XXXX tanpa karakter ambigu, deterministik dari input", () => {
    for (let i = 0; i < 50; i += 1) {
      const bytes = new Uint32Array([i * 2654435761, i + 7, i * 40503, i + 13]);
      const code = makeInboundCode(bytes);
      expect(code).toMatch(/^K-[A-HJ-NP-Z2-9]{4}$/);
    }
    const same = new Uint32Array([1, 2, 3, 4]);
    expect(makeInboundCode(same)).toBe(makeInboundCode(same));
  });
});

describe("myProfileStatus", () => {
  test("pengguna baru belum lengkap; saran nama diisi dari email", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { email: "budi.santoso@gmail.com" });
    const status = await callerFor(t, userId).query(api.profile.myProfileStatus, {});
    expect(status.complete).toBe(false);
    expect(status.name).toBe("");
    expect(status.nameSuggestion).toBe("Budi Santoso");
    expect(status.phone).toBe("");
    expect(status.phoneVerified).toBe(false);
    expect(status.address).toBe("");
  });

  test("tanpa sesi ditolak", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.profile.myProfileStatus, {})).rejects.toBeTruthy();
  });
});

describe("requestInboundCode", () => {
  test("menerbitkan kode + tautan chat bisnis, tanpa menyentuh provider", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    stubMeta();
    const result = await callerFor(t, userId).action(api.profile.requestInboundCode, {
      phone: "081234567890",
      name: "Siti Hajar",
      address: "Jl. Uji No. 1, Sumenep",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toMatch(/^K-[A-HJ-NP-Z2-9]{4}$/);
    expect(result.chatUrl).toContain("https://wa.me/6280000000000?text=");
    expect(result.chatUrl).toContain(encodeURIComponent(result.code));
    // Server tidak mengirim apa-apa di jalur ini: nol panggilan keluar.
    expect(fetchCalls).toBe(0);
  });

  test("teks chat membawa data form: nama, email sesi, nomor, alamat", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { email: "siti.hajar@gmail.com" });
    const result = await callerFor(t, userId).action(api.profile.requestInboundCode, {
      phone: "081234567890",
      name: "Siti Hajar",
      address: "Jl. Uji No. 1, Sumenep",
    });
    const text = decodeURIComponent(result.chatUrl.split("?text=")[1] ?? "");
    expect(text).toContain("Siti Hajar");
    expect(text).toContain("siti.hajar@gmail.com");
    expect(text).toContain("6281234567890");
    expect(text).toContain("Jl. Uji No. 1, Sumenep");
    expect(text).toContain(result.code);
  });

  test("nomor bisnis belum dikonfigurasi = gagal terlihat, bukan diam", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    const bag = envBag();
    const saved = bag?.["WHATSAPP_BUSINESS_NUMBER"];
    if (bag) delete bag["WHATSAPP_BUSINESS_NUMBER"];
    try {
      await expect(
        callerFor(t, userId).action(api.profile.requestInboundCode, {
          phone: "081234567890",
          name: "Siti",
          address: "Jl. Uji",
        }),
      ).rejects.toThrow(/belum dikonfigurasi/);
    } finally {
      if (bag && saved !== undefined) bag["WHATSAPP_BUSINESS_NUMBER"] = saved;
    }
  });

  test("nomor invalid dan plafon ditolak seperti jalur outbound", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    const caller = callerFor(t, userId);
    await expect(
      caller.action(api.profile.requestInboundCode, { phone: "123", name: "", address: "" }),
    ).rejects.toBeTruthy();
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i += 1) {
        await ctx.db.insert("phoneVerificationCodes", {
          userId,
          phone: "6281234567890",
          codeHash: "a".repeat(64),
          expiresAt: now + 600_000,
          attempts: 0,
          createdAt: now - i * 60_000,
        });
      }
    });
    await expect(
      caller.action(api.profile.requestInboundCode, {
        phone: "081234567890",
        name: "Siti",
        address: "Jl. Uji",
      }),
    ).rejects.toBeTruthy();
  });
});

describe("verifikasi inbound lewat webhook", () => {
  async function issueCode(
    t: ReturnType<typeof convexTest>,
    userId: string,
    phone = "081234567890",
  ) {
    const caller = callerFor(t, userId);
    const issued = await caller.action(api.profile.requestInboundCode, {
      phone,
      name: "Siti Hajar",
      address: "Jl. Uji No. 1, Sumenep",
    });
    return { caller, code: issued.code };
  }

  test("kode benar dari nomor yang sama = terverifikasi + terenkripsi, status lengkap setelah simpan", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { email: "siti.hajar@gmail.com" });
    const { caller, code } = await issueCode(t, userId);
    const claimed = await t.mutation(internal.whatsapp.recordInboundMessage, INBOUND_ARGS("6281234567890", code));
    expect(claimed).toBeTruthy();
    const status = await caller.query(api.profile.myProfileStatus, {});
    expect(status.phone).toBe("6281234567890");
    expect(status.phoneVerified).toBe(true);
    expect(status.complete).toBe(false);
    const saved = await caller.mutation(api.profile.saveMyProfile, {
      name: "Siti Hajar",
      phone: "6281234567890",
      address: "Jl. Uji No. 1, Sumenep",
    });
    expect(saved.ok).toBe(true);
    const done = await caller.query(api.profile.myProfileStatus, {});
    expect(done.complete).toBe(true);
    expect(done.name).toBe("Siti Hajar");
    expect(done.address).toBe("Jl. Uji No. 1, Sumenep");
    const prefs = await t.run(async (ctx) => {
      const all = (await ctx.db.query("notificationPreferences").collect()) as unknown as Array<{
        whatsappPhone?: string;
        whatsappPhoneEnc?: string;
        whatsappVerifiedAt?: number;
      }>;
      return all[0];
    });
    expect(prefs?.whatsappPhone).toBeUndefined();
    expect(prefs?.whatsappPhoneEnc).toMatch(/^bk1\./);
    expect(typeof prefs?.whatsappVerifiedAt).toBe("number");
  });

  test("bukan kode = diabaikan; nomor beda = kode TIDAK hangus", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    const { caller, code } = await issueCode(t, userId);
    // Bukan kode verifikasi: hanya tercatat sebagai thread biasa.
    await t.mutation(internal.whatsapp.recordInboundMessage, INBOUND_ARGS("6281234567890", "halo min"));
    expect((await caller.query(api.profile.myProfileStatus, {})).phoneVerified).toBe(false);
    // Kode benar dari nomor SALAH: ditolak dan TIDAK membakar kode pemilik.
    await t.mutation(internal.whatsapp.recordInboundMessage, INBOUND_ARGS("6289999999999", code));
    expect((await caller.query(api.profile.myProfileStatus, {})).phoneVerified).toBe(false);
    // Pemilik mengirim dari nomor benar: tetap berhasil.
    await t.mutation(internal.whatsapp.recordInboundMessage, INBOUND_ARGS("6281234567890", code));
    expect((await caller.query(api.profile.myProfileStatus, {})).phoneVerified).toBe(true);
  });

  test("kode kedaluwarsa ditolak", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    const { caller, code } = await issueCode(t, userId);
    const ancient = Date.now() - 11 * 60_000;
    await t.run(async (ctx) => {
      const all = (await ctx.db.query("phoneVerificationCodes").collect()) as unknown as Array<{
        _id: string;
      }>;
      for (const row of all) {
        await ctx.db.patch(row._id as never, { expiresAt: ancient, createdAt: ancient });
      }
    });
    await t.mutation(internal.whatsapp.recordInboundMessage, INBOUND_ARGS("6281234567890", code));
    expect((await caller.query(api.profile.myProfileStatus, {})).phoneVerified).toBe(false);
  });
});

describe("saveMyProfile", () => {
  test("menyimpan + menandai terverifikasi setelah klik Konfirmasi (click-attested)", async () => {
    // Keputusan pemilik: klik "Konfirmasi ke Admin" di gate sudah cukup
    // untuk mengaktifkan Simpan. Server tetap validasi nama/alamat/nomor,
    // menyimpan terenkripsi, dan menandai terverifikasi — dengan makna
    // "dinyatakan pengguna", bukan "terbukti webhook", kecuali webhook
    // memang sempat mencocokkan lebih dulu.
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    const saved = await callerFor(t, userId).mutation(api.profile.saveMyProfile, {
      name: "Siti Hajar",
      phone: "6281234567890",
      address: "Jl. Uji No. 1, Sumenep",
    });
    expect(saved.ok).toBe(true);
    const status = await callerFor(t, userId).query(api.profile.myProfileStatus, {});
    expect(status.complete).toBe(true);
    expect(status.phoneVerified).toBe(true);
  });

  test("nama dan alamat divalidasi seperti jalur aslinya", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    const caller = callerFor(t, userId);
    const issued = await caller.action(api.profile.requestInboundCode, { phone: "081234567890", name: "Siti Hajar", address: "Jl. Uji No. 1, Sumenep" });
    await t.mutation(internal.whatsapp.recordInboundMessage, INBOUND_ARGS("6281234567890", issued.code));
    await expect(
      caller.mutation(api.profile.saveMyProfile, { name: "a", phone: "6281234567890", address: "Jl. Uji No. 1" }),
    ).rejects.toBeTruthy();
    await expect(
      caller.mutation(api.profile.saveMyProfile, { name: "Siti Hajar", phone: "6281234567890", address: "Jl" }),
    ).rejects.toBeTruthy();
  });
});

describe("verifikasi batal saat nomor diganti di preferensi", () => {
  test("ganti nomor menghapus stempel, gate kembali belum lengkap", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, { email: "ganti@example.test" });
    const caller = callerFor(t, userId);
    const issued = await caller.action(api.profile.requestInboundCode, { phone: "081234567890", name: "Siti Hajar", address: "Jl. Uji No. 1, Sumenep" });
    await t.mutation(internal.whatsapp.recordInboundMessage, INBOUND_ARGS("6281234567890", issued.code));
    await caller.mutation(api.profile.saveMyProfile, {
      name: "Ganti Nomor",
      phone: "6281234567890",
      address: "Jl. Uji No. 2, Sumenep",
    });
    expect((await caller.query(api.profile.myProfileStatus, {})).complete).toBe(true);
    await caller.mutation(api.community.setNotificationPreferences, {
      whatsappPhone: "6289999999999",
    });
    const status = await caller.query(api.profile.myProfileStatus, {});
    expect(status.complete).toBe(false);
    expect(status.phoneVerified).toBe(false);
  });
});

describe("jalur outbound tetap berperilaku (dorman sampai template live)", () => {
  test("kode 6 digit terkirim + tersimpan hash; gagal provider tak bakar kuota", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    stubMeta();
    const caller = callerFor(t, userId);
    const result = await caller.action(api.profile.requestPhoneCode, { phone: "081234567890" });
    expect(result.ok).toBe(true);
    expect(fetchCalls).toBe(1);
    expect(lastPayload).toContain("6281234567890");
    expect(lastPayload).toMatch(/\b\d{6}\b/);
  });
});

describe("retensi kode verifikasi nomor", () => {
  test("pruneOtpCodes menyapu baris mati >7 hari, baris hidup utuh", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, {});
    const ancient = Date.now() - 8 * 24 * 60 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("phoneVerificationCodes", {
        userId,
        phone: "6281111111111",
        codeHash: "x".repeat(64),
        expiresAt: ancient,
        attempts: 5,
        consumedAt: ancient,
        createdAt: ancient,
      });
      await ctx.db.insert("phoneVerificationCodes", {
        userId,
        phone: "6282222222222",
        codeHash: "y".repeat(64),
        expiresAt: Date.now() + 600_000,
        attempts: 0,
        createdAt: Date.now(),
      });
    });
    const removed = await t.mutation(internal.otpEmail.pruneOtpCodes, {});
    expect(removed).toBeGreaterThanOrEqual(1);
    const remaining = await t.run(async (ctx) => {
      const all = (await ctx.db.query("phoneVerificationCodes").collect()) as unknown as Array<{
        phone: string;
      }>;
      return all.map((row) => row.phone);
    });
    expect(remaining).toContain("6282222222222");
    expect(remaining).not.toContain("6281111111111");
  });
});
