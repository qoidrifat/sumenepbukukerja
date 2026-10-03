import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SessionGateBoundary } from "./SessionGateBoundary";

/*
 * Kontrak batas penolakan sesi.
 *
 * Empat dari lima laporan `critical` itu (ERR-20261001-0O72S0A,
 * ERR-20261002-0O72S0A, ERR-20261003-0O72S0A, ERR-20261003-0O72S0A-2) punya
 * satu sebab yang sama: query yang butuh sesi dipanggil tanpa sesi. Nama
 * fungsi dan Request ID di bawah disalin apa adanya dari laporan.
 */

const dariLaporan = (udf: string, requestId: string) =>
  new Error(
    `ConvexError: [CONVEX Q(${udf})] [Request ID: ${requestId}] Server Error\n  Called by client`,
  );

describe("klasifikasi error oleh batas sesi", () => {
  test.each([
    ["vendors:listForAdmin", "fdef7197fd99914a"],
    ["vendors:listForOwner", "958623015a6eda87"],
    ["adminGate:currentAdminSession", "0941b51b1a88c5ed"],
  ])("%s ditulis sebagai penolakan sesi", (udf, requestId) => {
    expect(SessionGateBoundary.getDerivedStateFromError(dariLaporan(udf, requestId))).toEqual({
      udf,
    });
  });

  test("error lain dibiarkan lewat ke batas di atasnya", () => {
    // Kalau batas ini ikut menahannya, error asli tidak akan pernah sampai ke
    // RootErrorBoundary dan tidak akan pernah dilaporkan.
    expect(
      SessionGateBoundary.getDerivedStateFromError(
        new Error("TypeError: Failed to fetch dynamically imported module: /assets/Admin-ZfOF0elJ.js"),
      ),
    ).toEqual({ udf: null });
    expect(
      SessionGateBoundary.getDerivedStateFromError(
        new Error("ConvexError: [CONVEX Q(catalogStore:publicSitemap)] [Request ID: 7b31aa90c4de1122] Server Error"),
      ),
    ).toEqual({ udf: null });
  });
});

/*
 * Sisanya diuji lewat source. Jalur ini yang paling mudah jadi INERT tanpa
 * terlihat: `render()` yang mengembalikan `this.props.children` untuk error
 * yang bukan penolakan sesi membuat React menggambar anak yang sama lagi,
 * error yang sama terlempar lagi, dan halaman berputar tanpa henti. Kompilasi,
 * lint, dan type check semuanya tetap hijau pada kondisi itu.
 */
const SUMBER = readFileSync("src/components/SessionGateBoundary.tsx", "utf8");
const MAIN = readFileSync("src/main.tsx", "utf8");

test("error yang bukan penolakan sesi dilempar ulang, bukan digambar ulang", () => {
  const catt = SUMBER.slice(SUMBER.indexOf("componentDidCatch("));
  const cabangLolos = catt.slice(catt.indexOf("if (!udf)"), catt.indexOf("console.info"));
  expect(cabangLolos).toContain("throw error;");
});

test("batas sesi tidak pernah menulis laporan ke server", () => {
  // Melaporkan penolakan sesi ke server itulah yang memenuhi antrean Critical
  // dan menutupi masalah sungguhan. Jejaknya cukup di console.
  expect(SUMBER).not.toMatch(/reportErrorToServer|sendBeacon|fetch\(/);
});

test("batas sesi dipasang DI DALAM RootErrorBoundary, bukan menggantikannya", () => {
  const rootBuka = MAIN.indexOf("<RootErrorBoundary");
  const sesiBuka = MAIN.indexOf("<SessionGateBoundary>");
  const rootTutup = MAIN.lastIndexOf("</RootErrorBoundary>");
  expect(rootBuka).toBeGreaterThan(-1);
  expect(sesiBuka).toBeGreaterThan(rootBuka);
  expect(rootTutup).toBeGreaterThan(sesiBuka);
});

test("batas sesi hanya membungkus Routes, bukan Suspense atau gerbang pencabutan", () => {
  // `Suspense` berada DI LUAR batas ini supaya error sesi tidak tertahan
  // sebagai fallback; `SessionRevokedGuard` juga di luar, supaya penolakan
  // sesi tidak memicu CABRAL.
  const main = MAIN.slice(MAIN.indexOf("<SessionGateBoundary>"));
  expect(main).not.toContain("<Suspense");
  expect(MAIN.indexOf("<Suspense")).toBeLessThan(MAIN.indexOf("<SessionGateBoundary>"));
});