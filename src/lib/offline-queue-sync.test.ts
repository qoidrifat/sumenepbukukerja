import { describe, expect, test } from "vitest";

import { formatLastSync } from "./offline-queue";

describe("formatLastSync", () => {
  test("timestamp konkret diformat DD/MM/YYYY HH:MM", () => {
    // Dibangun lewat konstruktor lokal supaya uji tidak bergantung zona waktu
    // mesin CI: komponen lokalnya selalu 6 Okt 2026 04:07.
    const value = new Date(2026, 9, 6, 4, 7).getTime();
    expect(formatLastSync(value)).toBe("06/10/2026 04:07");
  });

  test("pad 2-digit manual, bukan locale (Intl id-ID memakai titik untuk jam)", () => {
    const value = new Date(2026, 0, 5, 9, 3).getTime();
    expect(formatLastSync(value)).toBe("05/01/2026 09:03");
  });

  test("null berarti belum pernah sinkron", () => {
    expect(formatLastSync(null)).toBe("Belum pernah");
  });
});
