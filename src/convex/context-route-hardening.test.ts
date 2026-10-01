/// <reference types="vite/client" />
/**
 * FASE 6 - route tangkapan konteks: CORS fail-closed dan batas permintaan.
 *
 * Dua hal yang diuji di sini keduanya terlihat dari luar, jadi keduanya diuji
 * lewat `t.fetch` ke router HTTP, bukan lewat fungsi turunannya:
 *
 *  1. CORS benar-benar menutup bila allowlist kosong. Header yang salah lebih
 *     berbahaya daripada header yang hilang, jadi yang dijaga adalah jawaban
 *     yang benar-benar dikirim.
 *  2. Batas permintaan bekerja, dan kunci hitungannya berasal dari IP yang
 *     diamati server. Kalau kuncinya bisa datang dari klien, batasnya hanya
 *     hiasan.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { CONTEXT_REQUEST_LIMIT } from "./adminGate";
import { sha256Hex } from "../lib/security-context";

const modules = import.meta.glob("./**/*.ts");

type Db = {
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
};

/** Header edge yang dipakai `resolveClientIp` sebagai sumber paling tepercaya. */
const edge = (ip: string) => ({ "cf-connecting-ip": ip });

describe("FASE 6 - CORS route konteks menutup saat allowlist kosong", () => {
  test("POST tanpa Origin tidak mendapat allow-origin, tapi tetap menjawab", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/admin-gate/context", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8", ...edge("203.0.113.10") },
    });

    // Route ini tidak butuh kredensial, jadi permintaan tanpa Origin boleh
    // tetap dilayani. Yang tidak boleh terjadi adalah jawaban yang memberi
    // izin baca lintas origin.
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("preflight dari origin asing ditutup, bukan dijawab longgar", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/admin-gate/context", {
      method: "OPTIONS",
      headers: { origin: "https://situs-lain.example" },
    });

    expect(response.status).toBe(204);
    // Tidak ada `*`, tidak ada echo, tidak ada credentials.
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("respons memakai nosniff dan no-store di setiap jalur", async () => {
    const t = convexTest(schema, modules);
    for (const init of [
      { method: "OPTIONS", headers: {} },
      {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8", ...edge("203.0.113.11") },
      },
    ] as RequestInit[]) {
      const response = await t.fetch("/admin-gate/context", init);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("vary")).toBe("Origin");
    }
  });

  test("metode lain tidak pernah menyentuh handler", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/admin-gate/context", { method: "PUT" });
    // Router menolak kombinasi method dan path yang tidak terdaftar, sebelum
    // handler sempat jalan. Yang penting di sini: jawaban penolakan tidak
    // membawa izin CORS apa pun.
    expect([404, 405]).toContain(response.status);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("FASE 6 - batas permintaan route konteks", () => {
  const ip = "198.51.100.7";

  async function seedContexts(t: ReturnType<typeof convexTest>, count: number, hash: string) {
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const now = Date.now();
      for (let index = 0; index < count; index += 1) {
        await db.insert("adminSecurityContexts", {
          token: `kctx-batas-${hash}-${index}`,
          ipHash: hash,
          ipSource: "CF-Connecting-IP",
          ipFamily: "IPv4",
          requestId: `req-${index}`,
          createdAt: now - index,
          expiresAt: now + 5 * 60_000,
        });
      }
    });
  }

  test("jumlah baris dalam jendela dihitung per sumber IP", async () => {
    const t = convexTest(schema, modules);
    await seedContexts(t, 3, "hash-satu");

    expect(
      await t.mutation(internal.adminGate.contextRequestWindow, { ipHash: "hash-satu" }),
    ).toMatchObject({ count: 3 });
    // Sumber lain tidak ikut terhitung: satu ember bersama akan menjatuhkan
    // semua orang hanya karena satu orang berlebihan.
    expect(
      await t.mutation(internal.adminGate.contextRequestWindow, { ipHash: "hash-dua" }),
    ).toMatchObject({ count: 0 });
  });

  test("baris di luar jendela tidak dihitung", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const now = Date.now();
      await db.insert("adminSecurityContexts", {
        token: "kctx-lama",
        ipHash: "hash-lama",
        ipSource: "CF-Connecting-IP",
        requestId: "req-lama",
        // Sepuluh menit lalu: jauh di luar jendela satu menit.
        createdAt: now - 10 * 60_000,
        expiresAt: now + 60_000,
      });
    });

    expect(
      await t.mutation(internal.adminGate.contextRequestWindow, { ipHash: "hash-lama" }),
    ).toMatchObject({ count: 0 });
  });

  test("permintaan ke-31 ditolak, sementara yang ke-30 boleh lewat", async () => {
    const t = convexTest(schema, modules);
    const headers = {
      "content-type": "text/plain;charset=UTF-8",
      ...edge(ip),
    };
    // Isi jendela sampai tepat di batas, memakai hash yang DIAMATI server -
    // bukan label bebas. Kalau kunci hitungannya bisa asal, rate limit hanya
    // hiasan.
    await seedContexts(t, CONTEXT_REQUEST_LIMIT, await sha256Hex(ip));

    const kedua = await t.fetch("/admin-gate/context", { method: "POST", headers });
    expect(kedua.status).toBe(429);
    expect(kedua.headers.get("retry-after")).toBe("60");

    const body = (await kedua.json()) as { error?: string; retryAfterSeconds?: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBe(60);

    // Penolakan tidak boleh memakai wildcard, kalau tidak ia jadi jalur baca
    // lintas origin yang justru baru dibuat.
    expect(kedua.headers.get("access-control-allow-origin")).toBeNull();
    expect(kedua.headers.get("vary")).toBe("Origin");
  });

  test("permintaan yang ditolak tidak menambah baris, jadi tidak mengunci selamanya", async () => {
    const t = convexTest(schema, modules);
    const headers = {
      "content-type": "text/plain;charset=UTF-8",
      ...edge(ip),
    };
    await seedContexts(t, CONTEXT_REQUEST_LIMIT, await sha256Hex(ip));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await t.fetch("/admin-gate/context", { method: "POST", headers });
      expect(response.status).toBe(429);
    }

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("adminSecurityContexts").collect(),
    );
    // Lima permintaan ditolak, nol baris baru. Kalau penolakan ikut menulis,
    // satu hob saja sudah mengunci IP itu lebih lama dari jendelanya.
    expect(rows).toHaveLength(CONTEXT_REQUEST_LIMIT);
  });

  test("IP lain tidak ikut terkena batas yang sama", async () => {
    const t = convexTest(schema, modules);
    await seedContexts(t, CONTEXT_REQUEST_LIMIT, await sha256Hex(ip));

    const response = await t.fetch("/admin-gate/context", {
      method: "POST",
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        ...edge("198.51.100.200"),
      },
    });

    expect(response.status).toBe(200);
  });

  test("preflight tidak pernah ikut dibatasi", async () => {
    const t = convexTest(schema, modules);
    await seedContexts(t, CONTEXT_REQUEST_LIMIT, await sha256Hex(ip));

    const response = await t.fetch("/admin-gate/context", {
      method: "OPTIONS",
      headers: { ...edge(ip) },
    });
    // Kalau preflight ikut dibatasi, peramban yang sah berhenti sebelum
    // pernah mengirim POST-nya.
    expect(response.status).toBe(204);
  });

  test("permintaan di bawah batas tetap mengembalikan konteks yang usable", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/admin-gate/context", {
      method: "POST",
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        ...edge("203.0.113.77"),
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      contextId?: string | null;
      ipMasked?: string | null;
      ipSource?: string;
    };
    expect(typeof body.contextId).toBe("string");
    expect(body.ipMasked).toBe("203.0.113.xxx");
    expect(body.ipSource).toBe("CF-Connecting-IP");

    // Baris yang dibuat benar-benar bisa dipakai gerbang passcode.
    const contexts = await t.run(async (ctx) =>
      await ctx.db.query("adminSecurityContexts").collect(),
    );
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.token).toBe(body.contextId);
  });
});