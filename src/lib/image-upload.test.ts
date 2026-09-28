import { describe, expect, test } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_LABEL,
  formatBytes,
  imageRejection,
  isStoredImage,
  readUploadedStorageId,
} from "./image-upload";

/**
 * Aturan unggah foto.
 *
 * Kenapa aturan ini diuji sebagai fungsi murni dan bukan hanya lewat mutasi:
 * `convex-test` TIDAK mencatat `contentType` saat menyimpan blob — sudah
 * dibuktikan langsung, metadata hasil penyimpanan hanya berisi `sha256` dan
 * `size`. Jadi lewat mutasi, satu-satunya cabang yang bisa dijalankan adalah
 * "jenis berkas tidak diketahui", dan cabang ukuran tidak akan pernah tersentuh
 * di sana. Kalau aturannya ditulis di dalam mutasi, batas 1 MB-nya tidak akan
 * punya satu pun tes.
 */

describe("batas ukuran dan jenis foto", () => {
  test("berkas gambar di bawah batas diterima", () => {
    for (const contentType of ["image/png", "image/jpeg", "image/webp"]) {
      expect(imageRejection({ size: 512, contentType }), contentType).toBeNull();
    }
  });

  test("tepat di batas masih diterima, satu byte lebih ditolak", () => {
    // Batas yang ditegakkan harus angka yang sama dengan yang tertulis di
    // antarmuka. Kalau di sini dipakai 1 MiB (1.048.576), berkas 1,02 MB akan
    // lolos dari aturan yang berbunyi "maksimal 1 MB".
    expect(MAX_IMAGE_BYTES).toBe(1_000_000);
    expect(imageRejection({ size: MAX_IMAGE_BYTES, contentType: "image/jpeg" })).toBeNull();
    expect(imageRejection({ size: MAX_IMAGE_BYTES + 1, contentType: "image/jpeg" })).not.toBeNull();
  });

  test("peringatan ukuran menyebut ukuran berkasnya dan batasnya", () => {
    const message = imageRejection({ size: 5_242_880, contentType: "image/jpeg" });
    expect(message).toContain("5,24 MB");
    expect(message).toContain(MAX_IMAGE_LABEL);
    // Ajakan tindak lanjut, bukan sekadar larangan.
    expect(message).toContain("Pilih foto yang lebih kecil");
  });

  test("berkas persis 1 byte di atas batas tidak dilaporkan sebagai \"1 MB\"", () => {
    // Kalau ukurannya dibulatkan ke satu angka di belakang koma, berkas
    // 1.000.001 byte akan terbaca "1 MB" — persis sama dengan batasnya, dan
    // pesannya jadi terdengar salah.
    const message = imageRejection({ size: 1_000_001, contentType: "image/jpeg" }) ?? "";
    expect(message).toContain("1,00 MB");
    expect(message).not.toContain("Foto 1 MB ");
  });

  test("berkas kosong ditolak", () => {
    expect(imageRejection({ size: 0, contentType: "image/png" })).toContain("kosong");
    expect(imageRejection({ size: Number.NaN, contentType: "image/png" })).not.toBeNull();
    // Ukuran negatif tidak mungkin dari `File` sungguhan, tapi kalau datang
    // dari input yang dipalsukan ia harus ditolak, bukan dianggap kecil.
    expect(imageRejection({ size: -1, contentType: "image/png" })).toContain("kosong");
  });

  test("jenis berkas diperiksa lebih dulu daripada ukuran", () => {
    // Berkas yang jenisnya salah tidak akan pernah bisa dipakai berapa pun
    // ukurannya, jadi "harus berupa foto" adalah jawaban yang benar untuk
    // sebuah PDF 5 MB — "terlalu besar" akan menyesatkan orang yang memilih PDF.
    const message = imageRejection({ size: 5_242_880, contentType: "application/pdf" }) ?? "";
    expect(message).toContain("harus berupa foto");
    expect(message).not.toContain("melebihi batas");
  });

  test("berkas tanpa tipe ditolak, bukan ditebak", () => {
    // Memperbolehkan contentType kosong berarti siapa pun bisa mengunggah apa
    // saja dengan sengaja tidak mengirim header.
    for (const contentType of [undefined, null, ""]) {
      expect(imageRejection({ size: 512, contentType }), String(contentType)).not.toBeNull();
    }
  });

  test("pesan jenis berkas menyebut format yang diterima", () => {
    const message = imageRejection({ size: 512, contentType: "application/pdf" }) ?? "";
    expect(message).toContain("JPG, PNG, atau WebP");
  });
});

describe("formatBytes", () => {
  test("memilih satuan yang menjaga besarannya tetap terbaca", () => {
    expect(formatBytes(999)).toBe("999 byte");
    expect(formatBytes(1_234)).toBe("1 KB");
    expect(formatBytes(999_999)).toBe("1.000 KB");
    expect(formatBytes(1_000_001)).toBe("1,00 MB");
    expect(formatBytes(5_242_880)).toBe("5,24 MB");
  });

  test("ukuran tidak masuk akal tidak menghasilkan teks aneh", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatBytes(value), String(value)).toBe("0 KB");
    }
  });
});

describe("isStoredImage", () => {
  test("hanya menerima contentType gambar", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(isStoredImage(type), type).toBe(true);
    }
    for (const type of ["application/pdf", "text/html", "video/mp4", "", undefined, null]) {
      expect(isStoredImage(type), String(type)).toBe(false);
    }
  });
});

describe("membaca jawaban endpoint unggah", () => {
  test("mengambil storageId dari bentuk jawaban Convex yang sebenarnya", () => {
    // Inilah bentuk yang dikirim endpoint unggah Convex, dan inilah yang dulu
    // salah dibaca.
    expect(readUploadedStorageId({ storageId: "kg2br8d4dtkqs00aq0t91dxwxh8f8pv2" })).toBe(
      "kg2br8d4dtkqs00aq0t91dxwxh8f8pv2",
    );
  });

  test("tidak lagi mengembalikan objek jawaban sebagai id", () => {
    // Kalau objeknya diteruskan apa adanya, `imageStorageId` ditolak validator
    // `v.string()` di server dengan ArgumentValidationError — persis error yang
    // membuat tombol Simpan profil gagal.
    const parsed = readUploadedStorageId({ storageId: "abc" });
    expect(typeof parsed).toBe("string");
    expect(parsed).not.toEqual({ storageId: "abc" });
  });

  test("bentuk yang tidak sah ditolak, bukan dipaksa menjadi string", () => {
    for (const payload of [
      {},
      null,
      undefined,
      42,
      [],
      { storageId: 42 },
      { storageId: "" },
      { storageId: "   " },
      { storageId: null },
      { id: "abc" },
    ]) {
      expect(readUploadedStorageId(payload), JSON.stringify(payload) ?? "undefined").toBeNull();
    }
  });

  test("string telanjang tetap diterima, tapi hanya kalau isinya benar", () => {
    // Toleransi kecil supaya perubahan bentuk jawaban di masa depan tidak
    // langsung mematahkan unggahan. Yang tidak ditoleransi: isi yang kosong.
    expect(readUploadedStorageId("abc")).toBe("abc");
    expect(readUploadedStorageId("")).toBeNull();
    expect(readUploadedStorageId("   ")).toBeNull();
  });
});
