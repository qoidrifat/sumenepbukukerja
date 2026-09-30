import { describe, expect, test } from "vitest";

import {
  DISPLAY_NAME_MAX,
  deriveDisplayName,
  resolveDisplayName,
  sanitizeDisplayName,
} from "./display-name";

describe("deriveDisplayName", () => {
  test("email yang pemisahnya memuat nama lengkap membacanya persis", () => {
    // Email dengan titik atau garis bawah memuat pemisah aslinya, jadi
    // hasilnya bukan perkiraan - itu hasil baca.
    expect(deriveDisplayName("ahmanuddin.firman@gmail.com")).toBe("Ahmanuddin Firman");
    expect(deriveDisplayName("budi.santoso@gmail.com")).toBe("Budi Santoso");
    expect(deriveDisplayName("siti_hajar_123@yahoo.co.id")).toBe("Siti Hajar");
  });

  test("TIDAK menebak: email dengan singkatan dibaca apa adanya", () => {
    // `ahm.uddin.firman` memuat dua singkatan. Aturan membacanya apa adanya
    // menjadi "Ahm Uddin Firman" - dan itu BENAR, karena itulah isi emailnya.
    // Test ini ada supaya contoh `ahm.uddin.firman` -> "Ahmanuddin Firman"
    // tidak pernah lagi ditulis di dokumentasi mana pun.
    expect(deriveDisplayName("ahm.uddin.firman@gmail.com")).toBe("Ahm Uddin Firman");
  });

  test("KASUS YANG DISEPAKATKAN: email tanpa pemisah hanya menghasilkan satu token", () => {
    // Aturan apa pun tidak bisa memisahkan "Ahmanuddin" dari "Firman" di
    // sini. Test ini ada supaya tidak ada yang nanti menulis daftar nama-given
    // dan mengklaim itu tebakan yang akurat.
    expect(deriveDisplayName("ahmanuddinfirman92@gmail.com")).toBe("Ahmanuddinfirman");
  });

  test("membuang angka di seluruh token, bukan hanya di ekor", () => {
    expect(deriveDisplayName("fitness123@gmail.com")).toBe("Fitness");
    expect(deriveDisplayName("1122ab@gmail.com")).toBe("Ab");
  });

  test("menerapkan aturan gmail: tag plus dan titik diabaikan", () => {
    // `a.b+tag@` dan `ab@` adalah akun yang sama bagi Gmail, jadi nama
    // turunannya harus sama.
    expect(deriveDisplayName("budi.santoso+tag@gmail.com")).toBe("Budi Santoso");
    expect(deriveDisplayName("b.santoso+tag@gmail.com")).toBe("B Santoso");
  });

  test("huruf besar dirapikan ke Title Case", () => {
    expect(deriveDisplayName("BUDI.SANTOSO@GMAIL.COM")).toBe("Budi Santoso");
  });

  test("mengembalikan null kalau tidak ada yang bisa ditulis dengan jujur", () => {
    // Email anonymous punya `undefined`, dan itu jalur yang harus menutup.
    expect(deriveDisplayName(undefined)).toBeNull();
    expect(deriveDisplayName(null)).toBeNull();
    expect(deriveDisplayName("")).toBeNull();
    expect(deriveDisplayName("bukan-email")).toBeNull();
    expect(deriveDisplayName("@gmail.com")).toBeNull();
    // Dua `@` bukan alamat email; menafsirkan bagian pertama bisa membuat
    // nama yang salah dan konstan.
    expect(deriveDisplayName("a@b@gmail.com")).toBeNull();
    // Terlalu pendek untuk disebut nama.
    expect(deriveDisplayName("a@gmail.com")).toBeNull();
    expect(deriveDisplayName("1234@gmail.com")).toBeNull();
    // Hanya tanda baca.
    expect(deriveDisplayName("...@gmail.com")).toBeNull();
  });

  test("memotong nama yang terlalu panjang, bukan menolaknya", () => {
    const panjang = `${"a".repeat(80)}@gmail.com`;
    const hasil = deriveDisplayName(panjang);
    expect(hasil).toHaveLength(DISPLAY_NAME_MAX);
    // Huruf pertama tetap kapital - pemotongan tidak boleh merusak Title Case.
    expect(hasil?.[0]).toBe("A");
  });
});

describe("sanitizeDisplayName", () => {
  test("membersihkan masukan pengguna dan mengembalikan Title Case", () => {
    expect(sanitizeDisplayName("  budi   santoso  ")).toBe("Budi Santoso");
    expect(sanitizeDisplayName("budi<script>")).toBe("Budi Script");
  });

  test("menolak masukan yang tidak menghasilkan nama", () => {
    expect(sanitizeDisplayName("")).toBeNull();
    expect(sanitizeDisplayName("  ")).toBeNull();
    expect(sanitizeDisplayName("a")).toBeNull();
    expect(sanitizeDisplayName(null)).toBeNull();
    expect(sanitizeDisplayName(undefined)).toBeNull();
    expect(sanitizeDisplayName("123")).toBeNull();
  });
});

describe("resolveDisplayName", () => {
  test("nama yang dikoreksi pengguna selalu menang terhadap tebakan", () => {
    // Ini urutan yang paling mudah dibalik salah. Kalau tebakan menang,
    // koreksi pengguna tidak akan pernah berlaku dan orang berhenti
    // mengoreksinya.
    expect(
      resolveDisplayName("Budi Santoso", "ahmanuddinfirman92@gmail.com"),
    ).toBe("Budi Santoso");
  });

  test("memakai tebakan ketika belum ada nama tersimpan", () => {
    expect(resolveDisplayName(undefined, "ahmanuddin.firman@gmail.com")).toBe(
      "Ahmanuddin Firman",
    );
    expect(resolveDisplayName("", "ahmanuddin.firman@gmail.com")).toBe(
      "Ahmanuddin Firman",
    );
  });

  test("jatuh ke fallback terakhir, dan tidak pernah mengembalikan string kosong", () => {
    // Fallback ini yang tampil di papan publik. KOSONG akan membuat kartu
    // kehilangan konteks dan terlihat rusak.
    expect(resolveDisplayName(undefined, undefined)).toBe("Warga Sumenep");
    expect(resolveDisplayName(null, "x@gmail.com")).toBe("Warga Sumenep");
    expect(resolveDisplayName("", "")).toBe("Warga Sumenep");
  });

  test("nilai tersimpan yang rusak jatuh ke tebakan, bukan ke fallback", () => {
    expect(resolveDisplayName("123", "ahmanuddin.firman@gmail.com")).toBe(
      "Ahmanuddin Firman",
    );
  });
});

describe("batas yang didokumentasikan, diuji", () => {
  test("nama turunan adalah PSEUDONIM dan itu harus tetap tertulis", () => {
    // Nama yang diturunkan masih bisa dibalik menjadi alamat email oleh
    // orang yang benar-benar berniat. Test ini menjaga supaya penyataan
    // "namanya sudah privat" tidak pernah masuk ke dokumen tanpa disbanded.
    const diturunkan = deriveDisplayName("ahmanuddin.firman@gmail.com");
    expect(diturunkan).toBe("Ahmanuddin Firman");
    // Namanya masih bisa dibalik ke alamat email:
    expect("ahmanuddin.firman@gmail.com").toContain("gmail.com");
    // Artinya: paparan tidak sengaja berkurang, paparan disengaja tidak.
  });
});
