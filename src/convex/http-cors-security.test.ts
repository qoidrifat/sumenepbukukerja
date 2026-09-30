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
 *  3. Allowlist kosong tetap aman: wildcard tanpa credentials, plus `vary: Origin`
 *     dan `x-content-type-options: nosniff`.
 *
 * Bukti ukurannya ada di `tmp/qa-p91-http-evidence.json` (probe read-only ke
 * origin `.convex.site` pada 2026-09-30).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildContextCorsHeaders } from "./http";

const httpSource = readFileSync(fileURLToPath(new URL("./http.ts", import.meta.url)), "utf8");

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

const httpCode = stripComments(httpSource);

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

  test("tanpa allowlist: wildcard, tanpa credentials (perilaku tidak berubah)", () => {
    const headers = buildContextCorsHeaders("https://situs-lain.example", []);
    expect(headers["access-control-allow-origin"]).toBe("*");
    expect(headers["access-control-allow-credentials"]).toBeUndefined();
    expect(headers["access-control-allow-methods"]).toBe("POST, OPTIONS");
    // Preflight tetap harus bisa lewat supaya beacon Security Desk tidak mati.
    expect(headers["access-control-allow-headers"]).toContain("content-type");
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
    const originBuilder = httpCode.slice(
      httpCode.indexOf("const allowedContextOrigins"),
      httpCode.indexOf("const contextCorsHeaders"),
    );
    expect(originBuilder).not.toContain("SITE_URL");
    expect(originBuilder).not.toContain("CONVEX_SITE_URL");
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
