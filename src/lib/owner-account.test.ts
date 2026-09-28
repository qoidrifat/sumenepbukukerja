import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  isOwnerAccount,
  OWNER_ACCOUNT_EMAIL,
  OWNER_ACCOUNT_EMAILS,
  OWNER_ACCOUNT_TITLE,
} from "./owner-account";

/**
 * Aturan "akun pemilik" menentukan dua hal sekaligus: siapa yang boleh merotasi
 * passcode ruang admin, dan gelar yang tampil di panel pengelola. Kalau daftar
 * email dan gelarnya menyimpang, akun yang seharusnya terkunci tampil sebagai
 * admin biasa — dan penyimpangan yang paling diam adalah yang paling berbahaya.
 * Karena itu tes di sini mengunci LITERA, bukan hanya "masuk ke himpunan".
 */

describe("daftar akun pemilik", () => {
  test("email pemilik tersimpan persis seperti yang dikonfigurasi", () => {
    expect(OWNER_ACCOUNT_EMAIL).toBe("qoidrifat23@gmail.com");
    expect([...OWNER_ACCOUNT_EMAILS]).toEqual([OWNER_ACCOUNT_EMAIL]);
  });

  test("email pemilik dikenali", () => {
    expect(isOwnerAccount(OWNER_ACCOUNT_EMAIL)).toBe(true);
  });

  test("email lain tidak pernah dianggap pemilik", () => {
    for (const email of [
      "admin@sumenep.co.id",
      "qoidrifat23@gmail.com.evil.test",
      "prefixqoidrifat23@gmail.com",
      "qoidrifat23@gmail.co",
      "",
      null,
      undefined,
    ]) {
      expect(isOwnerAccount(email)).toBe(false);
    }
  });

  test("huruf besar dan spasi di ujung tidak mengecohkan", () => {
    // Email dari form bisa saja tidak rapi, dan itu bukan alasan untuk membuka
    // kunci passcode kepada orang yang salah.
    expect(isOwnerAccount("  Qoidrifat23@Gmail.COM ")).toBe(true);
    expect(isOwnerAccount("QOIdRiFaT23@gMaIl.CoM")).toBe(true);
  });
});

describe("gelar akun pemilik", () => {
  test("gelarnya persis 'SuperAdmin · Developer'", () => {
    // String ini tampil di UI. Mengubahnya diam-diam adalah perubahan produk,
    // jadi harus gagal di tes, bukan terlihat belakangan.
    expect(OWNER_ACCOUNT_TITLE).toBe("SuperAdmin · Developer");
  });

  test("gelar lama tidak lagi menjadi label", () => {
    expect(OWNER_ACCOUNT_TITLE).not.toContain("akun pemilik");
  });
});

describe("satu sumber kebenaran", () => {
  /**
   * Tanpa ini, aturan yang sama akan ditulis ulang di file lain — dan file
   * kedua itulah yang diam-diam menyimpang. Daftar email pemilik tidak boleh
   * ditulis literal di mana pun selain modul ini.
   */
  const files = [
    new URL("../components/admin-governance.tsx", import.meta.url),
    new URL("../components/admin-session-actions.tsx", import.meta.url),
    new URL("../convex/adminGate.ts", import.meta.url),
    new URL("../convex/users.ts", import.meta.url),
  ];

  test("tidak ada salinan daftar email pemilik di luar modulnya", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toContain(OWNER_ACCOUNT_EMAIL);
    }
  });

  test("tidak ada salinan gelar pemilik di luar modulnya", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toContain("SuperAdmin");
    }
  });
});
