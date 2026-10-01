import { describe, expect, test } from "vitest";
import {
  toPublicRequestOffer,
  toPublicServiceRequest,
  type OfferSource,
  type RequestSource,
} from "./request-dto";

/**
 * Regression test untuk FASE 3 - minimisasi data papan permintaan.
 *
 * Yang dijaga di sini BUKAN "apakah bentuknya seperti yang diharapkan", tapi
 * "apakah ada jalan keluar bagi pengenal akun internal". Perbedaan itu
 * penting: test yang memeriksa bentuk akan tetap hijau kalau seseorang
 * menambahkan field baru ke DTO, sedangkan test yang memeriksa kebocoran
 * akan gagal.
 *
 * Sumber masalahnya dulu adalah pola `{ ...dokumen, ... }`: setiap field baru
 * di schema ikut terkirim tanpa ada yang memutuskan. Karena itu test di bawah
 * memakai dokumen yang SENGAJA punya field berlebih (`requesterId`,
 * `offeredBy`, `moderatedBy`), lalu membuktikan field itu tidak ikut.
 */

const request = (overrides: Partial<RequestSource> = {}): RequestSource => ({
  _id: "req_1",
  title: "Butuh tukang listrik",
  description: "Lampu ruang tamu mati sejak kemarin.",
  category: "Servis Teknik",
  landmark: "kalianget",
  status: "open",
  createdAt: 1_000,
  updatedAt: 1_000,
  ...overrides,
});

const offer = (overrides: Partial<OfferSource> = {}): OfferSource => ({
  _id: "off_1",
  requestId: "req_1",
  vendorId: "ven_1",
  offeredBy: "usr_penawar",
  status: "offered",
  createdAt: 2_000,
  updatedAt: 2_000,
  ...overrides,
});

describe("FASE 3 - papan permintaan tidak membocorkan pengenal akun", () => {
  test("requesterId tidak pernah ikut, bahkan untuk pemiliknya sendiri", () => {
    const owner = toPublicServiceRequest(request(), {
      viewerId: "usr_pemilik",
      requesterId: "usr_pemilik",
      requesterName: "Siti Hajar",
    });

    expect(owner.isMine).toBe(true);
    expect(owner).not.toHaveProperty("requesterId");
    expect(JSON.stringify(owner)).not.toContain("usr_pemilik");
  });

  test("requesterId tidak ikut untuk pengunjung anonim", () => {
    const tamu = toPublicServiceRequest(request(), {
      viewerId: null,
      requesterId: "usr_pemilik",
      requesterName: "Warga Sumenep",
    });

    expect(tamu.isMine).toBe(false);
    expect(tamu).not.toHaveProperty("requesterId");
    expect(JSON.stringify(tamu)).not.toContain("usr_pemilik");
  });

  test("offeredBy tidak pernah ikut, dan isMine menggantikannya", () => {
    const penawar = toPublicRequestOffer(offer(), { viewerId: "usr_penawar" });
    const lain = toPublicRequestOffer(offer(), { viewerId: "usr_orang_lain" });
    const tamu = toPublicRequestOffer(offer(), { viewerId: null });

    expect(penawar.isMine).toBe(true);
    expect(lain.isMine).toBe(false);
    expect(tamu.isMine).toBe(false);
    for (const item of [penawar, lain, tamu]) {
      expect(item).not.toHaveProperty("offeredBy");
      expect(JSON.stringify(item)).not.toContain("usr_penawar");
    }
  });

  test("field database yang berlebih tidak pernah mengalir ke DTO", () => {
    // Dokumen ini mewakili kondisi nyata setelah schema tumbuh: field baru
    // ada di database tetapi tidak ada di daftar putih.
    const bocor = {
      ...request(),
      requesterId: "usr_pemilik",
      moderatedBy: "usr_admin",
      internalNote: "catatan pengelola",
      sessionRef: "abc123",
    } as unknown as RequestSource;

    const dto = toPublicServiceRequest(bocor, {
      viewerId: null,
      requesterId: "usr_pemilik",
      requesterName: "Warga Sumenep",
    });

    const json = JSON.stringify(dto);
    expect(json).not.toContain("usr_pemilik");
    expect(json).not.toContain("usr_admin");
    expect(json).not.toContain("catatan pengelola");
    expect(json).not.toContain("abc123");
    expect(dto).not.toHaveProperty("moderatedBy");
    expect(dto).not.toHaveProperty("internalNote");
    expect(dto).not.toHaveProperty("sessionRef");
  });

  test("tidak ada nilai undefined yang ikut sebagai kunci", () => {
    const dto = toPublicServiceRequest(request(), {
      viewerId: null,
      requesterId: "usr_pemilik",
      requesterName: "Warga Sumenep",
    });

    // `{ budget: undefined }` tetap muncul di JSON.stringify sebagai
    // `"budget": undefined` -> dibuang, tapi di Object.keys tetap ada. Kunci
    // yang selalu ada membuat kontrak klien jadi tidak jujur.
    for (const [key, value] of Object.entries(dto)) {
      expect(value, `kunci ${key} tidak boleh undefined`).not.toBeUndefined();
    }
  });
});

describe("FASE 3 - kemampuan dihitung server, bukan ditebak klien", () => {
  test("pemilik boleh mengelola, penawar lain boleh menawarkan", () => {
    const pemilik = toPublicServiceRequest(request(), {
      viewerId: "usr_pemilik",
      requesterId: "usr_pemilik",
      requesterName: "Siti Hajar",
    });
    const warga = toPublicServiceRequest(request(), {
      viewerId: "usr_warga",
      requesterId: "usr_pemilik",
      requesterName: "Siti Hajar",
    });

    expect(pemilik).toMatchObject({ isMine: true, canManage: true, canOffer: false });
    expect(warga).toMatchObject({ isMine: false, canManage: false, canOffer: true });
  });

  test("pengunjung anonim tidak bisa menawarkan", () => {
    const tamu = toPublicServiceRequest(request(), {
      viewerId: null,
      requesterId: "usr_pemilik",
      requesterName: "Warga Sumenep",
    });
    expect(tamu.canOffer).toBe(false);
    expect(tamu.canManage).toBe(false);
  });

  test("pengelola boleh memoderasi permintaan orang lain", () => {
    const staff = toPublicServiceRequest(request(), {
      viewerId: "usr_staff",
      requesterId: "usr_pemilik",
      isStaff: true,
      requesterName: "Siti Hajar",
    });
    expect(staff.canManage).toBe(true);
    expect(staff.isMine).toBe(false);
  });

  test("permintaan kedaluwarsa atau sudah diklaim tidak bisa ditawari lagi", () => {
    const kedaluwarsa = toPublicServiceRequest(
      request({ status: "open", expiresAt: 5_000 }),
      { viewerId: "usr_warga", requesterId: "usr_pemilik", requesterName: "S", now: 6_000 },
    );
    const diklaim = toPublicServiceRequest(request({ status: "claimed" }), {
      viewerId: "usr_warga",
      requesterId: "usr_pemilik",
      requesterName: "S",
    });

    expect(kedaluwarsa.canOffer).toBe(false);
    expect(diklaim.canOffer).toBe(false);
  });

  test("permintaan terbuka yang belum lewat batas tetap bisa ditawari", () => {
    const masih = toPublicServiceRequest(request({ expiresAt: 9_000 }), {
      viewerId: "usr_warga",
      requesterId: "usr_pemilik",
      requesterName: "S",
      now: 6_000,
    });
    expect(masih.canOffer).toBe(true);
  });
});
