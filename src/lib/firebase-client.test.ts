// Pengaman untuk terjemahan error Firebase di sisi peramban.
//
// Fungsi ini pernah jadi sumber kebocoran dalam dua arah sekaligus: terlalu
// sempit sehingga kode konfigurasi yang salah setelan ikut tersembunyi di
// balik "gagal masuk", dan terlalu longgar sehingga pesan mentah SDK bisa
// tampil di halaman publik. Test di bawah mengunci kedua sisi itu.
//
// Fungsi yang diuji murni - tidak ada jaringan, tidak ada initializeApp, tidak
// ada ACCESS ke DOM. Itu disengaja supaya test ini tetap bisa dijalankan di
// lingkungan tanpa kredensial Firebase apa pun.

import { afterEach, describe, expect, test, vi } from "vitest";
import { FirebaseClientError, firebaseErrorMessage } from "./firebase-client";

const GENERIC = "Gagal masuk. Coba lagi sebentar lagi.";

/**
 * Semua kode yang punya pesan khusus. Daftar ini harus sama persis dengan isi
 * peta di `firebase-client.ts`; kalau ada kode yang ditambahkan di sana tapi
 * lupa di sini, test "pesan tidak pernah bocor" tidak akan memeriksanya.
 */
const SPECIFIC_CODES = [
  // Kredensial dan status akun.
  "auth/invalid-credential",
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-email",
  "auth/email-already-in-use",
  "auth/weak-password",
  "auth/user-disabled",
  "auth/credential-already-in-use",
  "auth/multi-factor-auth-required",
  "auth/unsupported-first-factor",
  // Verifikasi email.
  "auth/email-already-verified",
  "auth/invalid-verification-code",
  "auth/invalid-verification-id",
  "auth/expired-action-code",
  // Jendela masuk dan peramban.
  "auth/popup-closed-by-user",
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
  "auth/network-request-failed",
  // Konfigurasi.
  "auth/unauthorized-domain",
  "auth/invalid-api-key",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.",
  "auth/project-not-found",
  "auth/configuration-not-found",
  "auth/requests-from-referer-are-blocked",
  "auth/app-not-authorized",
  "auth/operation-not-allowed",
  "auth/tenant-id-mismatch",
  // Kuota dan laju.
  "auth/too-many-requests",
  "auth/quota-exceeded",
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("firebaseErrorMessage", () => {
  test("setiap kode yang dipetakan punya pesan spesifik, bukan kalimat generik", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const generic = new Set<string>();
    for (const code of SPECIFIC_CODES) {
      const message = firebaseErrorMessage({ code });
      expect(message, `kode ${code} jatuh ke pesan generik`).not.toBe(GENERIC);
      expect(message.length).toBeGreaterThan(20);
      generic.add(message);
    }
    // Tidak ada alasan untuk menumpuk kalimat yang identik: kalau berbeda kode
    // tapi kalimat sama, salah satunya sebenarnya tidak terpetakan.
    expect(generic.size).toBeGreaterThan(15);
  });

  test("pesan tidak pernah menyebut environment variable, project, atau kunci", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const code of SPECIFIC_CODES) {
      const message = firebaseErrorMessage({ code });
      expect(message, `kode ${code} membocorkan nama konfigurasi`).not.toMatch(
        /VITE_|FIREBASE_|AIza|process\.env|sumenepbukukerja/i,
      );
    }
  });

  test("kode tak dikenal tetap generik, dan kodenya dicatat ke console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const message = firebaseErrorMessage({ code: "auth/kode-masa-depan-2099" });
    expect(message).toBe(GENERIC);
    // Inilah yang hilang dulu: tanpa baris console ini, operator tidak punya
    // apa pun untuk mencari penyebab ketika kode baru muncul.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("auth/kode-masa-depan-2099"),
    );
  });

  test("galat tanpa kode yang bisa dibaca menghasilkan pesan generik", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const inputs: unknown[] = [
      null,
      undefined,
      "bocor",
      42,
      {},
      { code: 7 },
      { code: null },
      new Error("pesan dari server"),
    ];
    for (const input of inputs) {
      expect(firebaseErrorMessage(input)).toBe(GENERIC);
    }
  });

  test("FirebaseClientError memakai pesannya sendiri tanpa yoga ke peta", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const message = "Sandi minimal 6 karakter.";
    const error = new FirebaseClientError("weak-password", message);
    expect(firebaseErrorMessage(error)).toBe(message);
    // Galat yang sudah diterjemahkan tidak perlu dicatat ulang.
    expect(warn).not.toHaveBeenCalled();
  });

  test("pesan mentah dari SDK tidak pernah diteruskan apa adanya", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const leaked = "INVALID_API_KEY : AIzaSyRAHASIA di project sumenepbukukerja";
    const message = firebaseErrorMessage({
      code: "auth/invalid-api-key",
      message: leaked,
    });
    expect(message).not.toContain("AIzaSy");
    expect(message).not.toContain("sumenepbukukerja");
    expect(message).not.toBe(leaked);
  });
});