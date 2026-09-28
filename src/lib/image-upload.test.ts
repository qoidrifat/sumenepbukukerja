import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_LABEL,
  MAX_IMAGE_WIDTH,
  downscaleImageIfLarge,
  formatBytes,
  imageRejection,
  isStoredImage,
  readUploadedStorageId,
  uploadWithDedup,
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

/* ------------------------------------------------------------------ */
/* Perkecil gambar di peramban                                          */
/* ------------------------------------------------------------------ */

/**
 * Canvas dan `createImageBitmap` tidak ada di lingkungan uji
 * (`edge-runtime`), jadi keduanya diganti double yang mencatat panggilannya.
 *
 * Bukti bahwa modul ini benar-benar mengecilkan foto sungguhan ada di
 * `scripts/qa/verify-downscale.mjs` — skrip itu menjalankan modul yang sama di
 * Chromium dan mengukur lebar, rasio, dan ukuran luarnya. Test di sini
 * mengunci KEPUTUSAN logikanya pada kondisi yang tidak bisa diuji di
 * peramban: berkas mana yang tidak boleh disentuh, dan bagaimana kegagalan
 * dekode diperlakukan.
 */
type DrawCall = { source: unknown; w: number; h: number };

function stubBrowser(options: {
  bitmap?: { width: number; height: number };
  decodeFails?: boolean;
  blobBytes?: number | null;
}) {
  const drawCalls: DrawCall[] = [];
  let canvasCreated = 0;
  vi.stubGlobal("createImageBitmap", async () => {
    if (options.decodeFails) throw new Error("gagal dekode");
    return { ...(options.bitmap ?? { width: 4000, height: 3000 }), close: () => {} };
  });
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag !== "canvas") throw new Error(`tag tak terduga: ${tag}`);
      canvasCreated += 1;
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (source: unknown, _x: number, _y: number, w: number, h: number) =>
            drawCalls.push({ source, w, h }),
        }),
        toBlob: (resolve: (blob: Blob | null) => void) => {
          if (options.blobBytes === null) return resolve(null);
          resolve(new Blob([new Uint8Array(options.blobBytes ?? 400_000)]));
        },
      };
      return canvas;
    },
  });
  return { drawCalls, canvasCount: () => canvasCreated };
}

function jpegFile(bytes: number, name = "foto-kamera.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("perkecil gambar di peramban", () => {
  test("foto besar diperkecil ke lebar 1280 dengan rasio terjaga", async () => {
    const { drawCalls } = stubBrowser({ bitmap: { width: 4000, height: 3000 } });
    const result = await downscaleImageIfLarge(jpegFile(3_000_000));

    expect(result.resized).toBe(true);
    expect(result.beforeBytes).toBe(3_000_000);
    expect(result.afterBytes).toBeLessThan(result.beforeBytes);
    // Rasio 4000:3000 harus jadi 1280:960, bukan 1280:1280.
    expect(drawCalls[0]).toMatchObject({ w: MAX_IMAGE_WIDTH, h: 960 });
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toBe("foto-kamera.jpg");
  });

  test("hasil perkecil tetap memenuhi batas unggah", async () => {
    // Downscale bukan hanya soal lebar: keluarannya juga harus benar-benar
    // bisa melewati batas 1 MB, kalau tidak menyusutnya tidak berguna.
    stubBrowser({ bitmap: { width: 3000, height: 2000 }, blobBytes: 457_000 });
    const result = await downscaleImageIfLarge(jpegFile(7_800_000));
    expect(imageRejection({ size: result.afterBytes, contentType: result.file.type })).toBeNull();
  });

  test("foto yang sudah cukup kecil tidak disentuh sama sekali", async () => {
    const { canvasCount } = stubBrowser({ bitmap: { width: 900, height: 675 } });
    const original = jpegFile(400_000);
    const result = await downscaleImageIfLarge(original);

    expect(result.resized).toBe(false);
    expect(result.file).toBe(original);
    expect(result.afterBytes).toBe(result.beforeBytes);
    // Tidak ada canvas yang dibuat: tidak ada biaya untuk gambar yang sudah ok.
    expect(canvasCount()).toBe(0);
  });

  test("berkas non-gambar dan GIF tidak pernah didekode", async () => {
    stubBrowser({ bitmap: { width: 5000, height: 5000 } });
    const pdf = new File([new Uint8Array(500_000)], "dokumen.pdf", { type: "application/pdf" });
    const gif = new File([new Uint8Array(500_000)], "animasi.gif", { type: "image/gif" });
    for (const file of [pdf, gif]) {
      const result = await downscaleImageIfLarge(file);
      expect(result.file, file.name).toBe(file);
      expect(result.resized, file.name).toBe(false);
    }
  });

  test("kegagalan dekode mengembalikan berkas asli, bukan melempar", async () => {
    // Kegagalan decode tidak boleh berubah menjadi "unggah rusak": pengguna
    // tetap bisa mengunggah berkasnya dan ditolak/diterima oleh aturan yang
    // sudah ada.
    stubBrowser({ decodeFails: true });
    const original = jpegFile(800_000);
    const result = await downscaleImageIfLarge(original);
    expect(result.file).toBe(original);
    expect(result.resized).toBe(false);
  });

  test("canvas tanpa konteks tidak membuat berkas rusak", async () => {
    stubBrowser({ bitmap: { width: 4000, height: 3000 }, blobBytes: null });
    const original = jpegFile(2_000_000);
    const result = await downscaleImageIfLarge(original);
    expect(result.file).toBe(original);
    expect(result.resized).toBe(false);
  });

  test("keluaran yang lebih besar dari aslinya dibuang", async () => {
    // Kasus nyata: PNG berisi foto yang setelah diubah jadi JPEG justru lebih
    // besar. Mengirim hasil yang lebih besar hanya membuang kuota unggah.
    stubBrowser({ bitmap: { width: 4000, height: 3000 }, blobBytes: 2_000_001 });
    const original = jpegFile(2_000_000);
    const result = await downscaleImageIfLarge(original);
    expect(result.file).toBe(original);
    expect(result.resized).toBe(false);
  });
});

describe("alur unggah dengan dedup", () => {
  test("berkas yang sudah dikenal dipakai tanpa mengunggah ulang", async () => {
    stubBrowser({ bitmap: { width: 4000, height: 3000 } });
    const lookup = vi.fn().mockResolvedValue({ storageId: "kg2br8d4dtkqs00aq0t91dxwxh8f8pv2" });
    const record = vi.fn();
    const generateUploadUrl = vi.fn();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await uploadWithDedup(jpegFile(3_000_000), {
      lookup,
      record,
      generateUploadUrl,
    });

    expect(result.reused).toBe(true);
    expect(result.storageId).toBe("kg2br8d4dtkqs00aq0t91dxwxh8f8pv2");
    // Tidak ada unggahan, tidak ada pencatatan baru: blob tidak pernah
    // menyentuh jaringan untuk kedua kali.
    expect(generateUploadUrl).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  test("berkas baru diunggah sekali lalu dicatat untuk pemakaian berikutnya", async () => {
    stubBrowser({ bitmap: { width: 4000, height: 3000 } });
    const lookup = vi.fn().mockResolvedValue(null);
    const record = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ storageId: "kg2newblob00000000000000000000" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await uploadWithDedup(jpegFile(3_000_000), {
      lookup,
      record,
      generateUploadUrl: vi.fn().mockResolvedValue("https://upload.test/abc"),
    });

    expect(result.reused).toBe(false);
    expect(result.storageId).toBe("kg2newblob00000000000000000000");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Yang dikirim ke jaringan adalah HASIL perkecil, bukan berkas asli.
    const sent = fetchSpy.mock.calls[0][1].body as File;
    expect(sent.type).toBe("image/jpeg");
    expect(sent.size).toBe(result.afterBytes);
    expect(result.resized).toBe(true);
    // SHA yang dicatat adalah SHA hasil akhir, supaya pencarian berikutnya
    // mencocokkan berkas yang sama.
    expect(record).toHaveBeenCalledWith({
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      storageId: "kg2newblob00000000000000000000",
      size: result.afterBytes,
    });
  });

  test("downscale tidak bisa dipakai menembus batas ukuran", async () => {
    // Berkas 2 MB yang hasil perkecilnya justru lebih besar akan kembali utuh,
    // lalu ditolak aturan 1 MB — bukan lolos karena "sudah diperkecil".
    stubBrowser({ bitmap: { width: 4000, height: 3000 }, blobBytes: 2_000_001 });
    const lookup = vi.fn();

    await expect(
      uploadWithDedup(jpegFile(2_000_000), {
        lookup,
        record: vi.fn(),
        generateUploadUrl: vi.fn(),
      }),
    ).rejects.toThrow(MAX_IMAGE_LABEL);
    expect(lookup).not.toHaveBeenCalled();
  });
});
