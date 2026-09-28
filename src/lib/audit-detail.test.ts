import { describe, expect, test } from "vitest";
import {
  AUDIT_ACTION_LABEL,
  auditActionChipClass,
  auditActionLabel,
  auditActionTone,
  auditMetadataLabel,
  formatAuditValue,
  initialsOf,
  sessionRefOf,
} from "./audit-detail";

/**
 * Rincian audit log.
 *
 * Fungsi-fungsi di sini yang decides apa yang terbaca saat log dibuka, jadi
 * diuji dengan huruf yang persis — bukan "mengandung kata". Label yang
 * berubah diam-diam membuat log lama tak terbaca, dan log lama justru yang
 * paling sering ditanyakan.
 */

describe("label aksi audit", () => {
  test("semua aksi yang pernah muncul di log punya label", () => {
    // Daftar ini diambil dari baris yang benar-benar ada di panel, bukan
    // dari semua kemungkinan yang hanya ada di kepala.
    for (const action of [
      "staff.role_changed",
      "staff.invited",
      "staff.invite_accepted",
      "staff.invite_rejected",
      "staff.role_change_blocked",
      "admin.invite_created",
      "admin.logout",
      "admin.passcode_changed",
      "admin.session_revoked",
      "listing.published",
      "listing.archived",
      "error_report.created",
      "error_report.status",
    ]) {
      expect(AUDIT_ACTION_LABEL[action], action).toBeTruthy();
      expect(auditActionLabel(action), action).not.toBe(action);
    }
  });

  test("aksinya sendiri tetap ditulis di bawah labelnya", () => {
    // Kode mesin dibutuhkan saat log dicari atau dibandingkan; label saja
    // tidak bisa dicari.
    expect(auditActionLabel("staff.role_changed")).toBe("Peran pengelola diubah");
  });

  test("aksi tak dikenal jatuh ke kode mentah, bukan ke string kosong", () => {
    expect(auditActionLabel("masa.depan.ditambahkan")).toBe("masa.depan.ditambahkan");
  });
});

describe("warna chip aksi", () => {
  test("kelompok warna mengikuti kelompok aksi", () => {
    expect(auditActionTone("error_report.created")).toBe("inactive");
    expect(auditActionTone("admin.logout")).toBe("confirmed");
    expect(auditActionTone("staff.role_changed")).toBe("confirmed");
    expect(auditActionTone("listing.published")).toBe("verified");
    expect(auditActionTone("photo.uploaded")).toBe("unclaimed");
  });

  test("chip memakai kelas admin, bukan palet baru", () => {
    for (const action of Object.keys(AUDIT_ACTION_LABEL)) {
      expect(auditActionChipClass(action)).toMatch(/^admin-status admin-status-/);
    }
  });
});

describe("nomor sesi", () => {
  test("deterministik untuk sesi yang sama", () => {
    // Kalau tidak deterministik, korelasi antar baris jadi tidak mungkin —
    // dan itu seluruh gunanya.
    return Promise.all([sessionRefOf("ses_abcd1234"), sessionRefOf("ses_abcd1234")]).then(
      ([a, b]) => expect(a).toBe(b),
    );
  });

  test("berbeda untuk sesi yang berbeda", async () => {
    expect(await sessionRefOf("ses_abcd1234")).not.toBe(await sessionRefOf("ses_wrong9876"));
  });

  test("id sesi mentah tidak pernah muncul di reference", async () => {
    const ref = await sessionRefOf("ses_k7f3a9c21b84d4e6f");
    expect(ref).toMatch(/^ses_[0-9A-F]{8}$/);
    expect(ref).not.toContain("k7f3a9c21");
  });

  test("sesi kosong tidak menghasilkan nomor", async () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(await sessionRefOf(value)).toBeNull();
    }
  });
});

describe("inisial pelaku", () => {
  test("dua huruf dari nama depan dan belakang", () => {
    expect(initialsOf("Rofi'atul Qodriyah")).toBe("RQ");
  });

  test("nama tunggal tetap terbaca", () => {
    expect(initialsOf("superadmin")).toBe("SU");
  });

  test("tanpa nama menghasilkan tanda tanya, bukan kotak kosong", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });
});

describe("nilai sebelum dan sesudah", () => {
  test("JSON string dilepas supaya tidak tampil sebagai tanda kutip", () => {
    expect(formatAuditValue('"admin"')).toBe("admin");
  });

  test("nilai panjang dipotong dengan tanda ellipsis", () => {
    const out = formatAuditValue("x".repeat(500));
    expect(out).not.toBeNull();
    expect((out ?? "").length).toBe(120);
    expect(out?.endsWith("…")).toBe(true);
  });

  test("nilai kosong berarti tidak ada, bukan string kosong", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(formatAuditValue(value)).toBeNull();
    }
  });

  test("teks biasa tidak JSON tetap tampil utuh", () => {
    expect(formatAuditValue("bootstrap")).toBe("bootstrap");
  });
});

describe("label metadata", () => {
  test("kunci yang sering muncul punya nama manusia", () => {
    expect(auditMetadataLabel("source")).toBe("Sumber");
    expect(auditMetadataLabel("severity")).toBe("Tingkat");
    expect(auditMetadataLabel("from")).toBe("Dari");
  });

  test("kunci baru tidak pernah hilang", () => {
    expect(auditMetadataLabel("kunci_baru")).toBe("kunci_baru");
  });
});
