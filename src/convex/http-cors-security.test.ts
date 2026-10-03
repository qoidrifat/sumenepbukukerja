/// <reference types="vite/client" />
/**
 * FASE 9.1 - F-11: invariant CORS pada route HTTP milik aplikasi.
 *
 * Kenapa test ini bentuknya "invariant" dan bukan "snapshot header":
 * yang dijaga bukan nilai persis tiap header, tapi aturan yang tidak boleh
 * dilanggar berapa pun konfigurasinya:
 *
 *  1. TIDAK PERNAH ada `access-control-allow-credentials` di route mana pun.
 *     Wildcard + credentials adalah kombinasi yang paling berbahaya di CORS,
 *     dan route `/admin-gate/context` tidak butuh cookie sama sekali.
 *  2. Kalau allowlist origin terisi, hanya origin itu yang mendapat
 *     `access-control-allow-origin`. Origin lain TIDAK boleh mendapat apa pun -
 *     bukan `*`, bukan nilai bogus.
 *  3. Allowlist kosong berarti TUTUP (Fase 6), bukan wildcard. Wildcard hanya
 *     boleh muncul kalau operator memintanya lewat
 *     `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS`, dan tetap tanpa credentials.
 *     `vary: Origin` dan `x-content-type-options: nosniff` ada di semua mode.
 *
 * Bukti ukurannya ada di `tmp/qa-p91-http-evidence.json` (probe read-only ke
 * origin `.convex.site` pada 2026-09-30).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildContextCorsHeaders, resolveContextCorsMode } from "./http";

const httpSource = readFileSync(fileURLToPath(new URL("./http.ts", import.meta.url)), "utf8");

/*
 * Aturan CORS dipindah ke modul murni supaya fungsi Vercel di
 * `api/admin-context.ts` memakai aturan yang sama tanpa menarik
 * `convex/server` ke runtime server. Ketiga berkas yang boleh menyentuh
 * header CORS ikut dipindai - kalau ada file keempat yang mulai mengirim
 * header sendiri, test ini tidak akan ikut menyadarinya.
 */
const corsSource = readFileSync(
  fileURLToPath(new URL("../lib/admin-context-cors.ts", import.meta.url)),
  "utf8",
);
const relaySource = readFileSync(
  fileURLToPath(new URL("../../api/admin-context.ts", import.meta.url)),
  "utf8",
);
const allSources = httpSource + "\n" + corsSource + "\n" + relaySource;

/**
 * Buang komentar sebelum sumber dipindai.
 *
 * Tanpa ini, test "tidak ada allow-credentials" akan salah lulus atau salah
 * gagal hanya karena ada KATA-KATA itu di dalam penjelasan - dan penjelasan
 * justru tempat paling perlu menyebut larangannya. Yang diuji adalah kode yang
 * benar-benar mengirim header, bukan dokumentasinya.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const httpCode = stripComments(allSources);

describe("Fase 9.1: CORS route konteks tidak pernah memakai wildcard berkredensial", () => {
  test("tidak ada satu pun route yang mengirim access-control-allow-credentials", () => {
    expect(
      httpCode,
      "route mana pun yang mengirim allow-credentials berarti kredensial bisa dibaca lintas origin",
    ).not.toContain("access-control-allow-credentials");
  });

  test("header selalu menyertakan vary Origin dan nosniff", () => {
    const headers = buildContextCorsHeaders("https://aplikasi.contoh", []);
    expect(headers.vary).toBe("Origin");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["access-control-allow-credentials"]).toBeUndefined();
  });

  test("tanpa allowlist: TUTUP secara bawaan, wildcard harus diminta eksplisit", () => {
    // Fase 6. Allowlist kosong dulu berarti `*`, dan wildcard berarti situs mana
    // pun bisa memanggil route ini dari peramban pengunjung lalu membaca
    // masked IP, kota, negara, dan token konteks miliknya. Kontrak itu diubah
    // secara sadar, jadi testnya ikut berubah - bukan dihapus.
    const tertutup = buildContextCorsHeaders("https://situs-lain.example", []);
    expect(tertutup["access-control-allow-origin"]).toBeUndefined();
    expect(tertutup["access-control-allow-credentials"]).toBeUndefined();
    // Header dasar tetap ada supaya preflight yang ditolak masih bisa
    // dibedakan dari "rute tidak ada".
    expect(tertutup["access-control-allow-methods"]).toBe("POST, OPTIONS");
    expect(tertutup["access-control-allow-headers"]).toContain("content-type");
    expect(tertutup.vary).toBe("Origin");

    // Wildcard masih bisa diminta, tapi hanya atas permintaan tertulis.
    const liar = buildContextCorsHeaders("https://situs-lain.example", [], {
      allowWildcard: true,
    });
    expect(liar["access-control-allow-origin"]).toBe("*");
    expect(liar["access-control-allow-credentials"]).toBeUndefined();
  });

  test("allowlist terisi mengalahkan permintaan wildcard", () => {
    // Allowlist yang tersimpan adalah keputusan yang lebih sempit, jadi
    // permintaan wildcard tidak boleh melontarkannya kembali jadi `*`.
    const allowed = ["https://bukukerja.example"];
    expect(
      buildContextCorsHeaders("https://situs-lain.example", allowed, { allowWildcard: true })[
        "access-control-allow-origin"
      ],
    ).toBeUndefined();
    expect(
      buildContextCorsHeaders(allowed[0], allowed, { allowWildcard: true })[
        "access-control-allow-origin"
      ],
    ).toBe(allowed[0]);
  });

  test("mode CORS hanya bergantung pada allowlist dan permintaan eksplisit", () => {
    expect(resolveContextCorsMode([])).toBe("closed");
    expect(resolveContextCorsMode([], { allowWildcard: true })).toBe("wildcard");
    expect(resolveContextCorsMode(["https://bukukerja.example"])).toBe("allowlist");
    expect(resolveContextCorsMode(["https://bukukerja.example"], { allowWildcard: true })).toBe(
      "allowlist",
    );
    // Wildcard tidak boleh muncul hanya karena string allowlist berisi spasi.
    expect(resolveContextCorsMode([" ", ""])).toBe("closed");
  });

  test("izinin wildcard hanya dibaca dari variabel khusus", () => {
    expect(httpCode).toContain("ADMIN_CONTEXT_ALLOW_WILDCARD_CORS");
    // Penegakan tidak boleh bergantung pada tebakan lingkungan. `NODE_ENV`
    // tidak dijamin ada di setiap deployment Convex, jadi mengandalkannya
    // berarti kontrol ini bisa diam-diam tidak aktif.
    expect(httpCode).not.toContain("NODE_ENV");
  });

  test("dengan allowlist: hanya origin yang sama yang diizinkan", () => {
    const allowed = ["https://bukukerja.example"];
    expect(buildContextCorsHeaders(allowed[0], allowed)["access-control-allow-origin"]).toBe(allowed[0]);
  });

  test("dengan allowlist: origin asing tidak mendapat header CORS apa pun", () => {
    const headers = buildContextCorsHeaders("https://penyerang.example", ["https://bukukerja.example"]);
    expect(headers["access-control-allow-origin"]).toBeUndefined();
    expect(headers.vary).toBe("Origin");
  });

  test("dengan allowlist: permintaan tanpa Origin tidak mendapat allow-origin", () => {
    const headers = buildContextCorsHeaders(null, ["https://bukukerja.example"]);
    expect(headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("beberapa origin boleh diizinkan sekaligus", () => {
    const allowed = ["https://bukukerja.example", "https://www.bukukerja.example"];
    expect(buildContextCorsHeaders("https://www.bukukerja.example", allowed)["access-control-allow-origin"]).toBe(
      "https://www.bukukerja.example",
    );
  });

  test("SITE_URL tidak pernah dipakai sebagai allowlist CORS", () => {
    // Di deployment yang diuji, `SITE_URL` menunjuk origin `.convex.site`
    // sendiri - bukan frontend. Memakainya sebagai allowlist mematikan beacon
    // Security Desk. Kode harus membacanya dari variabel khusus.
    expect(httpCode).toContain("ADMIN_CONTEXT_ALLOWED_ORIGINS");
    const corsCode = stripComments(corsSource);
    const originBuilder = corsCode.slice(
      corsCode.indexOf("export function allowedContextOrigins"),
      corsCode.indexOf("export function resolveContextCorsMode"),
    );
    expect(originBuilder).not.toContain("SITE_URL");
    expect(originBuilder).not.toContain("CONVEX_SITE_URL");
  });

  test("fungsi relay Vercel memakai allowlist yang sama", () => {
    // Relay dipanggil dari browser pada origin yang sama, jadi tidak butuh
    // CORS untuk bekerja. Tapi ia tetap boleh dibaca situs lain kalau
    // mengirim `*`, dan jawabannya berisi masked IP milik pengunjung.
    const relayCode = stripComments(relaySource);
    expect(relayCode).toContain("contextCorsHeaders");
    expect(relayCode).not.toContain("ADMIN_CONTEXT_ALLOW_WILDCARD_CORS");
    // Secret hanya boleh berpindah Vercel ke backend, tidak pernah diminta
    // dari browser. Fungsi yang menolak tanpa header Authorization akan
    // membuat beacon mati total.
    expect(relayCode).not.toMatch(/authorization.*verifyRelaySecret/i);
  });

  test("route webhook tidak pernah membuka CORS ke peramban", () => {
    // Meta dan Twilio memanggil dari server ke server, tidak lewat peramban.
    // Membuka CORS di sana tidak menambah kemampuan apa pun, hanya permukaan.
    const webhookBlock = httpCode.slice(
      httpCode.indexOf("const whatsappWebhook"),
      httpCode.indexOf('http.route({ path: "/twilio/status"'),
    );
    expect(webhookBlock).not.toContain("access-control-allow-origin");
  });
});
