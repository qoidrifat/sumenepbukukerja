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
