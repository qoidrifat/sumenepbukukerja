/**
 * Aturan unggah foto — SATU sumber untuk klien dan server.
 *
 * Sebelumnya aturan yang sama ditulis dua kali: sekali di komponen
 * (`admin-profile.tsx`) dan sekali di server (`users.ts`, `community.ts`).
 * Dua salinan berarti dua kesempatan untuk berbeda pendapat, dan yang paling
 * sering terjadi adalah pesannya berbeda — pengguna melihat "maksimal 1 MB"
 * dari klien, lalu "Ukuran foto maksimal 1 MB" dari server, untuk berkas yang
 * sama. Sekarang keduanya memanggil fungsi ini, jadi kalimatnya tidak mungkin
 * berbeda.
 *
 * Modul ini sengaja TIDAK menyentuh DOM maupun React: diimpor dari komponen
 * peramban sekaligus dari fungsi Convex di server.
 */

/**
 * Batas ukuran foto.
 *
 * 1 MB desimal (1.000.000 byte), bukan 1 MiB — angka inilah yang tertulis di
 * antarmuka, jadi yang ditegakkan harus angka yang sama. Memakai 1.048.576
 * akan membuat berkas 1,02 MB lolos dari aturan yang tertulis "maksimal 1 MB".
 */
export const MAX_IMAGE_BYTES = 1_000_000;

/** Bentuk batasnya seperti yang tertulis di antarmuka. */
export const MAX_IMAGE_LABEL = "1 MB";

/** Format gambar yang bisa dibuka peramban mana pun tanpa syarat tambahan. */
export const ACCEPTED_IMAGE_LABEL = "JPG, PNG, atau WebP";

/**
 * Apakah berkas di storage benar-benar gambar?
 *
 * `contentType` dibaca dari metadata STORAGE, bukan dari `File` yang dikirim
 * klien — nama berkas dan `type` di sisi klien bisa dipalsukan, metadata ini
 * tidak. Kalau `contentType`-nya KOSONG, berkas DITOLAK: memperbolehkannya
 * berarti siapa pun bisa mengunggah apa saja dengan sengaja tidak mengirim
 * header, dan berkas itu lalu disajikan ulang dari storage milik kita.
 */
export function isStoredImage(contentType: string | undefined | null): boolean {
  return typeof contentType === "string" && contentType.startsWith("image/");
}

/**
 * Ukuran berkas dalam satuan yang bisa dibaca manusia.
 *
 * Satuannya dipilih supaya angkanya tidak pernah kehilangan besarannya. Ini
 * penting untuk berkas yang persis di batas: 1.000.001 byte sebagai "1 MB"
 * akan tampak seperti tidak melebihi batas "1 MB", padahal justru sebaliknya.
 * Karena itu di atas 1 MB selalu ditulis dua angka di belakang koma.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1_000) return `${Math.round(bytes)} byte`;
  if (bytes < MAX_IMAGE_BYTES) {
    return `${Math.round(bytes / 1_000).toLocaleString("id-ID")} KB`;
  }
  return `${(bytes / 1_000_000).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MB`;
}

/**
 * Kenapa berkas ini ditolak, atau `null` kalau lolos.
 *
 * Dipakai klien DAN server. Klien memanggilnya dengan `File` (punya `size` dan
 * `type`), server dengan metadata storage (punya `size` dan `contentType`),
 * jadi parameternya menerima keduanya.
 *
 * Urutan pemeriksaannya disengaja: JENIS lebih dulu, baru UKURAN. Berkas yang
 * jenisnya salah tidak akan pernah bisa dipakai berapa pun ukurannya, jadi
 * "harus berupa foto" adalah jawaban yang benar untuk sebuah PDF 3 MB —
 * sedangkan "terlalu besar" akan menyesatkan orang yang memilih PDF.
 */
export function imageRejection(input: {
  size: number;
  contentType?: string | null;
}): string | null {
  if (!isStoredImage(input.contentType)) {
    return `Berkas harus berupa foto (${ACCEPTED_IMAGE_LABEL}).`;
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return "Berkas foto kosong (0 byte) tidak bisa dipakai.";
  }
  if (input.size > MAX_IMAGE_BYTES) {
    return `Foto ${formatBytes(input.size)} melebihi batas ${MAX_IMAGE_LABEL}. Pilih foto yang lebih kecil.`;
  }
  return null;
}

/**
 * Baca id berkas dari jawaban endpoint unggah Convex.
 *
 * Endpoint itu menjawab `{ storageId }`, BUKAN string telanjang. Menuliskan
 * `as string` pada jawabannya adalah kesalahan yang pernah benar-benar
 * terjadi di sini: `pending` jadi berisi objek, lalu `imageStorageId` ditolak
 * validator `v.string()` di server dengan `ArgumentValidationError` — dan
 * karena `as` mematikan pemeriksaan tipe, tidak ada satu pun peringatan dari
 * TypeScript sebelum kejadian itu.
 *
 * Karena itu fungsinya menerima `unknown` dan memeriksanya sungguhan, bukan
 * menerima bentuk yang "seharusnya". Bentuk string telanjang tetap diterima
 * supaya perubahan bentuk jawaban di masa depan tidak langsung mematahkan
 * unggahan — tapi apa pun yang diterima harus benar-benar string tidak kosong.
 */
export function readUploadedStorageId(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload.trim().length > 0 ? payload : null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as { storageId?: unknown }).storageId;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/* ------------------------------------------------------------------ */
/* Persiapan unggahan di peramban                                      */
/* ------------------------------------------------------------------ */

/** Lebar maksimum foto setelah diperkecil di peramban. */
export const MAX_IMAGE_WIDTH = 1280;

/**
 * Hitung sha256 berkas di peramban, SEBELUM unggah.
 *
 * Ini kunci dedup: blob identik tidak pernah menyentuh jaringan dua kali.
 * Dipakai bersama `lookupBlobBySha` (server) — kalau peta sudah mengenal
 * berkas ini, klien memakai storageId yang ada dan melewati unggahan.
 */
export async function sha256OfBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Perkecil gambar di peramban bila lebarnya melebihi batas.
 *
 * Dibutuhkan karena batas 1 MB dengan kamera ponsel hampir selalu berarti
 * "tolak" — padahal isi fotonya layak. Canvas API bawaan peramban dipakai,
 * tanpa pustaka baru. Berkas non-gambar, kecil, atau yang gagal didekode
 * dikembalikan apa adanya: pemeriksaan jenis berkas tetap jalan di pemanggil,
 * dan kegagalan dekode tidak boleh mengubah perilaku menjadi "unggah rusak".
 */
export async function downscaleImageIfLarge(
  file: File,
  maxWidth = MAX_IMAGE_WIDTH,
): Promise<{ file: File; resized: boolean; beforeBytes: number; afterBytes: number }> {
  const beforeBytes = file.size;
  const decodeFailure = { file, resized: false, beforeBytes, afterBytes: beforeBytes };
  if (!file.type.startsWith("image/") || file.type === "image/gif") return decodeFailure;
  if (beforeBytes <= MAX_IMAGE_BYTES && !file.type.startsWith("image/svg")) {
    // Kecil dan bukan SVG: biarkan apa adanya. SVG diperkecil juga supaya
    // tidak pernah masuk storage sebagai vektor yang bisa berisi skrip.
    return decodeFailure;
  }
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width <= maxWidth) {
      bitmap.close?.();
      return decodeFailure;
    }
    const scale = maxWidth / bitmap.width;
    const canvas = document.createElement("canvas");
    canvas.width = maxWidth;
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return decodeFailure;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    // JPEG dipilih untuk keluaran karena paling hemat dan diterima semua
    // peramban; PNG dengan fotonya bisa jadi berkas yang LEBIH besar dari aslinya.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= beforeBytes) return decodeFailure;
    const scaled = new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    return { file: scaled, resized: true, beforeBytes, afterBytes: scaled.size };
  } catch {
    return decodeFailure;
  }
}

/**
 * Alur unggah lengkap di peramban: downscale → sha256 → cek peta → unggah
 * bila perlu → catat ke peta.
 *
 * Semua pemanggil (profil, galeri listing, bukti klaim) memakai fungsi ini
 * sehingga tidak ada jalur yang bisa lupa dedup atau lupa downscale. `lookup`
 * dan `record` adalah pemanggil Convex dari klien (`api.storage.*`).
 */
export async function uploadWithDedup(
  file: File,
  helpers: {
    lookup: (args: { sha256: string }) => Promise<{ storageId: string } | null>;
    record: (args: { sha256: string; storageId: string; size: number }) => Promise<void>;
    generateUploadUrl: () => Promise<string>;
  },
): Promise<{
  storageId: string;
  reused: boolean;
  resized: boolean;
  beforeBytes: number;
  afterBytes: number;
  fileName: string;
  fileType: string;
}> {
  const prepared = await downscaleImageIfLarge(file);
  const working = prepared.file;
  const rejection = imageRejection({ size: working.size, contentType: working.type });
  if (rejection) throw new Error(rejection);

  const sha256 = await sha256OfBlob(working);
  const existing = await helpers.lookup({ sha256 });
  if (existing) {
    return {
      storageId: existing.storageId,
      reused: true,
      resized: prepared.resized,
      beforeBytes: prepared.beforeBytes,
      afterBytes: prepared.afterBytes,
      fileName: working.name,
      fileType: working.type,
    };
  }

  const uploadUrl = await helpers.generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": working.type || "image/jpeg" },
    body: working,
  });
  if (!response.ok) throw new Error("Berkas gagal diunggah. Coba lagi.");
  const storageId = readUploadedStorageId(await response.json());
  if (!storageId) throw new Error("ID berkas belum diterima dari server.");
  await helpers.record({ sha256, storageId, size: working.size });
  return {
    storageId,
    reused: false,
    resized: prepared.resized,
    beforeBytes: prepared.beforeBytes,
    afterBytes: prepared.afterBytes,
    fileName: working.name,
    fileType: working.type,
  };
}
