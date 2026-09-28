import { describe, expect, test } from "vitest";
import * as options from "./select-options";
import type { ThemedSelectOption } from "@/components/ui/themed-select";
import {
  errorReportStatusSelectOptions,
  interactionStatusSelectOptions,
  reportReasonSelectOptions,
  staffRoleLongLabel,
  staffRoleSelectOptions,
} from "./select-options";

/**
 * Label peran dalam bentuk panjang dipakai di dua tempat yang harus selalu
 * sepakat: kartu undangan di halaman penerima, dan pesan yang dikirim ke sana.
 * Kalau keduanya berbeda, penerima melihat "Administrator Ruang Kerja" di satu
 * layar lalu menerima pesan yang menyebut dirinya "admin" — dan tidak tahu mana
 * yang benar.
 *
 * Daftar ini dulu ditulis dua kali, jadi tes di sini mengunci bahwa SETIAP
 * peran punya label panjang dan tidak ada yang jatuh ke cadangan.
 */
describe("label panjang peran pengelola", () => {
  test("setiap peran punya label yang bisa dibaca orang awam", () => {
    expect(staffRoleLongLabel("admin")).toBe("Administrator Ruang Kerja");
    expect(staffRoleLongLabel("staff")).toBe("Pengelola Operasional");
    expect(staffRoleLongLabel("viewer")).toBe("Pengelola Pemantau");
  });

  test("tidak ada peran di daftar pilih yang jatuh ke cadangan", () => {
    for (const option of staffRoleSelectOptions) {
      expect(staffRoleLongLabel(option.value)).not.toBe("Pengelola");
    }
  });

  test("peran tak dikenal tidak pernah membuat UI kosong", () => {
    // Peran baru yang belum terdaftar akan sampai ke sini. Menampilkan
    // "undefined" lebih buruk daripada menampilkan peran umum.
    for (const value of ["superadmin", "", null, undefined]) {
      expect(staffRoleLongLabel(value)).toBe("Pengelola");
    }
  });
});

/**
 * Daftar lain di modul ini bisa hilang tanpa ada yang menyadarinya sampai
 * TypeScript meledak di tiga file yang tidak bersebelahan. Tes di bawah ada
 * untuk itu: setiap daftar harus masih diekspor, tidak kosong, dan nilainya
 * unik — karena nilai itulah yang dikirim ke server.
 */
describe("daftar pilihan lain di modul ini", () => {
  const lists: [string, ThemedSelectOption[]][] = [
    ["categorySelectOptions", options.categorySelectOptions],
    ["landmarkSelectOptions", options.landmarkSelectOptions],
    ["availabilitySelectOptions", options.availabilitySelectOptions],
    ["staffRoleSelectOptions", staffRoleSelectOptions],
    ["reportReasonSelectOptions", reportReasonSelectOptions],
    ["interactionStatusSelectOptions", interactionStatusSelectOptions],
    ["errorReportStatusSelectOptions", errorReportStatusSelectOptions],
  ];

  test("semua daftar masih diekspor dan tidak kosong", () => {
    for (const [name, list] of lists) {
      expect(list, name).toBeDefined();
      expect(list.length, name).toBeGreaterThan(0);
    }
  });

  test("tidak ada nilai duplikat di dalam satu daftar", () => {
    // Nilai duplikat membuat `<SelectItem key={value}` bentrok dan satu opsi
    // hilang tanpa jejak.
    for (const [name, list] of lists) {
      const values = list.map((o) => o.value);
      expect(new Set(values).size, name).toBe(values.length);
    }
  });

  test("label tidak pernah kosong", () => {
    for (const [name, list] of lists) {
      for (const option of list) {
        expect(option.label, name).toBeTruthy();
        expect(typeof option.value, name).toBe("string");
      }
    }
  });
});
