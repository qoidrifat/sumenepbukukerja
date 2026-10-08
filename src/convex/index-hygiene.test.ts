/// <reference types="vite/client" />
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Aturan 11: indeks dan query-nya lahir di commit yang sama; tabel mati
// dibuang, bukan dibiarkan. Tes ini mengunci tiga hal itu untuk Task 2 + 8.
//
// Sengaja TIDAK memeriksa "setiap indeks dipakai" secara global: 16 indeks
// lama (mis. bySeverity, byReportId, byLastUsed) saat ini nol referensi di
// kode non-test. Itu utang lama, di luar lingkup tugas ini — dicatat di
// laporan, bukan diperbaiki diam-diam di sini.

const CONVEX_DIR = join(__dirname);

function bacaSchema(): string {
  return readFileSync(join(CONVEX_DIR, "schema.ts"), "utf8");
}

// Sumber non-test: file .ts langsung di src/convex, tanpa .test.ts dan tanpa
// schema.ts itu sendiri (kalau schema ikut, setiap nama indeks "ketemu"
// dirinya sendiri dan pemeriksaannya hampa).
function bacaSumberNonTes(): Map<string, string> {
  const hasil = new Map<string, string>();
  for (const nama of readdirSync(CONVEX_DIR)) {
    const penuh = join(CONVEX_DIR, nama);
    if (!statSync(penuh).isFile()) continue;
    if (!nama.endsWith(".ts")) continue;
    if (nama.endsWith(".test.ts")) continue;
    if (nama === "schema.ts") continue;
    hasil.set(nama, readFileSync(penuh, "utf8"));
  }
  return hasil;
}

describe("higiene indeks schema (aturan 11)", () => {
  test("tabel mati vendorSubscriptions tidak ada di schema", () => {
    // Gagal sebelum perbaikan: tabel + indeks byVendor-nya masih ada.
    expect(bacaSchema()).not.toContain("vendorSubscriptions");
  });

  test("indeks co-born Task 8 dipakai query yang lahir bersamanya", () => {
    // Retensi notifikasi (Task 4) memangkas dari yang tertua; tanpa indeks
    // createdAt ia harus collect() seluruh tabel lalu mengurutkan di memori.
    // Indeks dan pemakainya ditambah di commit yang sama.
    const sumber = bacaSumberNonTes();
    const retensi = sumber.get("dataRetention.ts") ?? "";
    expect(bacaSchema()).toContain('.index("byCreatedAt", ["createdAt"])');
    expect(retensi).toContain('query("notifications").withIndex("byCreatedAt")');
  });

  test("indeks co-born Task 2 tidak hilang dan tetap dipakai", () => {
    // Ditambah Task 2 bersama getAdminSecurityAttempt; tugas ini hanya
    // memastikan, bukan menambah duplikat.
    const sumber = bacaSumberNonTes();
    const gerbang = sumber.get("adminGate.ts") ?? "";
    expect(bacaSchema()).toContain('.index("byIpHashCreatedAt", ["ipHash", "createdAt"])');
    expect(gerbang).toContain('"byIpHashCreatedAt"');
  });
});
