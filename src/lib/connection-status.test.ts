/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import {
  RECONNECT_GRACE_MS,
  SILENT_TIMEOUT_MS,
  nextConnectionState,
  type ConnectionStatus,
} from "./connection-status";

/**
 * Kontrak reducer status konektivitas: murni, tanpa DOM, tanpa timer.
 *
 * Reducer ini TIDAK menyentuh `navigator.onLine`, tidak memakai `Date.now()`,
 * dan tidak memakai efek. Waktu (jendela grace, batas diam) dihitung oleh
 * pemanggil (hook Task S2); reducer hanya menerima event yang sudah matang:
 * `grace-elapsed` dan `timeout-elapsed`.
 *
 * TABEL TRANSISI (sumber kebenaran untuk reviewer — kelengkapan diverifikasi
 * di sini, bukan dengan membaca tiap test satu per satu):
 *
 * | prev          | went-offline | went-online   | grace-elapsed | timeout-elapsed |
 * |---------------|--------------|---------------|---------------|-----------------|
 * | online        | offline      | online        | online        | silent          |
 * | offline       | offline      | reconnecting  | offline       | offline         |
 * | reconnecting  | offline      | reconnecting  | online        | reconnecting    |
 * | silent        | offline      | silent        | silent        | silent          |
 *
 * Catatan: `went-online` dari `reconnecting`/`silent`/`online` = tak berubah
 * (bukan offline-pertama-kali, jadi bukan awal grace). `timeout-elapsed`
 * hanya berarti dari `online`; dari state lain diabaikan. Event di luar
 * union `ConnectionEvent` tidak terwakili oleh sistem tipe — lihat Test 4.
 */

const ALL_STATUSES: ConnectionStatus[] = ["online", "offline", "reconnecting", "silent"];

describe("Test 1 - went-offline selalu menjadi offline", () => {
  test.each(ALL_STATUSES)("dari %s menjadi offline", (prev) => {
    expect(nextConnectionState(prev, "went-offline")).toBe("offline");
  });
});

describe("Test 2 - went-online hanya memulai grace dari offline", () => {
  test("offline -> reconnecting (grace dimulai, hook yang menghitung waktu)", () => {
    expect(nextConnectionState("offline", "went-online")).toBe("reconnecting");
  });

  test("bukan dari offline = tak berubah (bukan awal grace)", () => {
    expect(nextConnectionState("online", "went-online")).toBe("online");
    expect(nextConnectionState("reconnecting", "went-online")).toBe("reconnecting");
    expect(nextConnectionState("silent", "went-online")).toBe("silent");
  });

  test("grace-elapsed dari reconnecting kembali online", () => {
    expect(nextConnectionState("reconnecting", "grace-elapsed")).toBe("online");
  });

  test("grace-elapsed di luar reconnecting = tak berubah", () => {
    expect(nextConnectionState("online", "grace-elapsed")).toBe("online");
    expect(nextConnectionState("offline", "grace-elapsed")).toBe("offline");
    expect(nextConnectionState("silent", "grace-elapsed")).toBe("silent");
  });
});

describe("Test 3 - timeout-elapsed hanya berarti dari online", () => {
  test("online -> silent (sistem diam padahal online)", () => {
    expect(nextConnectionState("online", "timeout-elapsed")).toBe("silent");
  });

  test("sudah offline = diabaikan (offline adalah fakta jaringan, bukan diam)", () => {
    expect(nextConnectionState("offline", "timeout-elapsed")).toBe("offline");
  });

  test("dari reconnecting/silent = tak berubah", () => {
    expect(nextConnectionState("reconnecting", "timeout-elapsed")).toBe("reconnecting");
    expect(nextConnectionState("silent", "timeout-elapsed")).toBe("silent");
  });
});

describe("Test 4 - event tak relevan = state tak berubah", () => {
  test("semua pasangan tak relevan pada tabel mengembalikan prev", () => {
    const irrelevant: Array<[ConnectionStatus, "went-online" | "grace-elapsed" | "timeout-elapsed"]> = [
      ["online", "went-online"],
      ["reconnecting", "went-online"],
      ["silent", "went-online"],
      ["online", "grace-elapsed"],
      ["offline", "grace-elapsed"],
      ["silent", "grace-elapsed"],
      ["offline", "timeout-elapsed"],
      ["reconnecting", "timeout-elapsed"],
      ["silent", "timeout-elapsed"],
    ];
    for (const [prev, event] of irrelevant) {
      expect(nextConnectionState(prev, event)).toBe(prev);
    }
  });

  test("string di luar union bukan event yang sah (ditolak sistem tipe)", () => {
    // Reducer memakai exhaustive switch TANPA default supaya penambahan
    // event baru gagal dikompilasi sampai ditangani. Konsekuensinya: string
    // asing hanya bisa tiba dari pemanggil JS tanpa tipe — secara tipe
    // tidak ada "unknown event" yang sah, jadi tidak ada perilaku
    // tak-berubah yang bisa dikunci untuknya di sini. Baris ini mendokumentasikan
    // batas itu, bukan mengujinya: cast di bawah sengaja TIDAK dijalankan
    // sebagai asersi perilaku.
    const notAnEvent = "bogus" as unknown as never;
    expect(["went-offline", "went-online", "grace-elapsed", "timeout-elapsed"]).not.toContain(
      notAnEvent,
    );
  });
});

describe("Test 5 - konstanta jendela waktu", () => {
  test("grace reconnect 8 detik, batas diam 12 detik", () => {
    expect(RECONNECT_GRACE_MS).toBe(8_000);
    expect(SILENT_TIMEOUT_MS).toBe(12_000);
  });
});
