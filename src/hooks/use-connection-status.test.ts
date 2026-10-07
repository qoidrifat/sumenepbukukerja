/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { useConnectionStatus } from "./use-connection-status";
import {
  getManualSyncStart,
  reportSyncStart,
  subscribeManualSync,
} from "@/lib/connection-status";

/**
 * Hook koneksi + pelacakan manual-sync (Task S2).
 *
 * Hook butuh DOM/event (navigator.onLine, online/offline, timer), jadi
 * strukturnya dikunci sebagai source-content (pola repo): useState +
 * navigator.onLine + listener online/offline + setTimeout grace/silent +
 * membaca state reportSyncStart + mengembalikan {status, ...}. Tanpa
 * setInterval, cleanup penuh, hormati pola mascot-loader (sets>=clears).
 *
 * Pelacakan manual-sync (reportSyncStart) adalah state modul + listener
 * pola bus repo dan diuji fungsional di sini — SyncIndicator memanggilnya
 * mengelilingi syncNow (satu-satunya wiring instrumentasi task ini).
 */

const hookSource = readFileSync(new URL("./use-connection-status.ts", import.meta.url), "utf8");
const libSource = readFileSync(new URL("../lib/connection-status.ts", import.meta.url), "utf8");

describe("hook memakai useState + navigator.onLine + listener online/offline", () => {
  test("hook diekspor dan membaca fakta jaringan", () => {
    expect(typeof useConnectionStatus).toBe("function");
    expect(hookSource).toContain("useState");
    expect(hookSource).toContain("navigator.onLine");
  });

  test("listener online/offline terpasang dengan cleanup", () => {
    expect(hookSource).toContain("addEventListener");
    expect(hookSource).toContain('"online"');
    expect(hookSource).toContain('"offline"');
    expect(hookSource).toContain("removeEventListener");
  });
});

describe("hook memakai single setTimeout sisa waktu (pola mascot-loader)", () => {
  test("grace + silent lewat setTimeout, tanpa setInterval", () => {
    expect(hookSource).toContain("setTimeout");
    expect(hookSource).toContain("RECONNECT_GRACE_MS");
    expect(hookSource).toContain("SILENT_TIMEOUT_MS");
    expect(hookSource).not.toContain("setInterval");
  });

  test("cleanup penuh + sets>=clears", () => {
    expect(hookSource).toContain("clearTimeout");
    const sets = (hookSource.match(/setTimeout/g) ?? []).length;
    const clears = (hookSource.match(/clearTimeout/g) ?? []).length;
    expect(sets).toBeGreaterThanOrEqual(1);
    expect(clears).toBeGreaterThanOrEqual(1);
    expect(sets).toBeGreaterThanOrEqual(clears);
  });
});

describe("hook membaca reportSyncStart state + mengembalikan {status, ...}", () => {
  test("hook membaca manual-sync store, bukan Auth/OTP", () => {
    expect(hookSource).toContain("reportSyncStart");
    expect(hookSource).not.toContain("useAuth");
    expect(hookSource).not.toContain("otp");
  });

  test("hook mengembalikan objek dengan status", () => {
    expect(hookSource).toContain("{ status");
    expect(hookSource).toContain("status");
  });
});

describe("lib reportSyncStart: module state + listener pola bus repo", () => {
  test("lib mengekspor reportSyncStart + subscribe + getter", () => {
    expect(typeof reportSyncStart).toBe("function");
    expect(typeof subscribeManualSync).toBe("function");
    expect(typeof getManualSyncStart).toBe("function");
    expect(libSource).toContain("reportSyncStart");
    expect(libSource).toContain("subscribeManualSync");
    expect(libSource).toContain("getManualSyncStart");
  });

  test("reportSyncStart menandai pending, cleanup menghapusnya", () => {
    expect(getManualSyncStart()).toBeNull();
    const finish = reportSyncStart();
    expect(typeof finish).toBe("function");
    const started = getManualSyncStart();
    expect(typeof started).toBe("number");
    expect((started as number) > 0).toBe(true);
    finish();
    expect(getManualSyncStart()).toBeNull();
  });

  test("listener diberi tahu saat mulai dan selesai", () => {
    let calls = 0;
    const release = subscribeManualSync(() => {
      calls += 1;
    });
    const finish = reportSyncStart();
    expect(calls).toBeGreaterThanOrEqual(1);
    finish();
    expect(calls).toBeGreaterThanOrEqual(2);
    release();
  });
});
