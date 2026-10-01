/**
 * Bentuk data yang boleh keluar dari papan permintaan publik.
 *
 * KENAPA BERKAS SENDIRI (FASE 3):
 *
 * Sebelum ini `community.listRequests` membentuk jawabannya dengan
 * `{ ...publicRequest, ... }` - yaitu menyebar seluruh dokumen database lalu
 * membuang beberapa field satu per satu. Pola itu selalu kalah cepat dari
 * perubahan schema: setiap field baru yang ditambahkan ke `serviceRequests`
 * otomatis ikut terkirim ke pengunjung anonim, tanpa ada yang memutuskan
 * bahwa field itu boleh keluar. Yang sudah terbukti bocor lewat pola ini
 * adalah `requesterId` dan `offeredBy` - pengenal akun internal (`users._id`).
 *
 * Sekarang arahnya dibalik: DTO adalah DAFTAR PUTIH. Field yang tidak
 * disebutkan di sini TIDAK PERNAH keluar, apa pun yang terjadi pada schema.
 * Kalau seseorang menambah field ke tabel, dia harus sengaja menambahkannya
 * ke berkas ini juga - dan keputusan itu terlihat di code review.
 *
 * KENAPA "KEMAMPUAN", BUKAN "IDENTITAS":
 *
 * UI tetap perlu tahu "ini permintaan saya" dan "saya boleh menawarkan".
 * Jawaban itu tidak butuh id akun siapa pun; yang dibutuhkan hanya tiga
 * boolean yang dihitung DI SERVER, dari data yang memang sudah dibaca server:
 *
 *   isMine    - pemanggil adalah pembuat permintaan ini
 *   canManage - pemanggil boleh mengubah status permintaan ini
 *   canOffer  - pemanggil boleh mengirim tawaran untuk permintaan ini
 *
 * Perhatikan bahwa `canOffer`/`canManage` adalah PETUNJUK UI, bukan
 * otorisasi. Otorisasi sebenarnya tetap di `claimRequest` dan
 * `updateRequestStatus`, yang memeriksa kepemilikan listing dan klaim
 * identitas. Berkas ini tidak boleh dipakai untuk memutuskan apa pun.
 *
 * `requesterName` juga tidak dihitung di sini: nilainya berasal dari
 * `resolvePublicName` yang sudah mengurus urutan `publicName` -> tebakan email
 * -> fallback, dan `email` mentah tidak pernah ikut keluar.
 */

/**
 * Kategori permintaan.
 *
 * Ditulis sebagai union yang sama dengan validator Convex di schema, bukan
 * `string`. Kalau di sini `string`, tipe ini jadi lebih lebar daripada tipe
 * yang dipakai UI (`Category` di `lib/catalog-store.ts`), dan hasilnya error
 * tipe di komponen yang menampilkan papan - persis yang terjadi saat FASE 3
 * pertama dikerjakan. Nilai di database sudah dijamin salah satu dari lima
 * ini oleh `categoryValidator`, jadi menuliskannya di sini tidak menambah
 * asumsi baru; yang ditambah hanya kejujuran tipe.
 */
export type RequestCategory =
  | "Servis Teknik"
  | "Hajatan & Acara"
  | "Kuliner"
  | "Transportasi"
  | "Jasa Umum";

/** Status permintaan, sama persis dengan `requestStatusValidator` di schema. */
export type RequestStatus =
  | "open"
  | "claimed"
  | "completed"
  | "cancelled"
  | "expired";

/** Status tawaran, sama persis dengan validator `requestOffers.status`. */
export type OfferStatus = "offered" | "accepted" | "withdrawn" | "expired";

/** Bentuk minimal dokumen permintaan yang dibutuhkan DTO ini. */
export type RequestSource = {
  _id: string;
  title: string;
  description: string;
  category: RequestCategory;
  landmark: string;
  lat?: number;
  lng?: number;
  budget?: string;
  neededAt?: number;
  status: RequestStatus;
  vendorId?: string;
  claimedAt?: number;
  completedAt?: number;
  expiresAt?: number;
  cancelledReason?: string;
  reopenedAt?: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * Bentuk minimal dokumen tawaran yang dibutuhkan DTO ini.
 *
 * `offeredBy` ada di sini HANYA sebagai bahan perbandingan untuk menghitung
 * `isMine`. Nilainya tidak pernah disalin ke DTO keluaran - itulah bedanya
 * "field yang dibaca" dan "field yang dikirim".
 */
export type OfferSource = {
  _id: string;
  requestId: string;
  vendorId: string;
  offeredBy: string;
  status: OfferStatus;
  message?: string;
  createdAt: number;
  updatedAt: number;
};

export type RequestCapabilities = {
  /** Id akun pemanggil, atau null/undefined untuk pengunjung tanpa sesi. */
  viewerId?: string | null;
  /** Id akun pembuat permintaan. HANYA dipakai untuk membandingkan. */
  requesterId: string;
  /** Pengelola/staff yang boleh memoderasi papan. */
  isStaff?: boolean;
  /** Label nama yang sudah diturunkan server. */
  requesterName: string;
  /** Jumlah waktu sekarang, supaya pemeriksaan kedaluwarsa bisa diuji. */
  now?: number;
};

export type PublicRequestOffer = {
  _id: string;
  requestId: string;
  vendorId: string;
  vendorName?: string;
  message?: string;
  status: OfferStatus;
  createdAt: number;
  updatedAt: number;
  /** Tawaran ini dibuat oleh pemanggil. */
  isMine: boolean;
};

export type PublicServiceRequest = {
  _id: string;
  title: string;
  description: string;
  category: RequestCategory;
  landmark: string;
  lat?: number;
  lng?: number;
  budget?: string;
  neededAt?: number;
  status: RequestStatus;
  vendorId?: string;
  vendorName?: string;
  claimedAt?: number;
  completedAt?: number;
  expiresAt?: number;
  cancelledReason?: string;
  reopenedAt?: number;
  createdAt: number;
  updatedAt: number;
  requesterName: string;
  isMine: boolean;
  canManage: boolean;
  canOffer: boolean;
  offers: PublicRequestOffer[];
};

/** Permintaan yang masih bisa ditawari: terbuka dan belum kedaluwarsa. */
const isOpenForOffers = (request: RequestSource, now: number) =>
  request.status === "open" && (!request.expiresAt || request.expiresAt > now);

/**
 * Daftar putih tawaran. `offeredBy` sengaja TIDAK ada di sini: pengenal akun
 * penawar tidak dibutuhkan UI mana pun, dan dulu ikut terkirim ke semua
 * pembaca yang punya sesi.
 */
export function toPublicRequestOffer(
  offer: OfferSource,
  options: { viewerId?: string | null; vendorName?: string },
): PublicRequestOffer {
  return {
    _id: offer._id,
    requestId: offer.requestId,
    vendorId: offer.vendorId,
    ...(options.vendorName === undefined ? {} : { vendorName: options.vendorName }),
    ...(offer.message === undefined ? {} : { message: offer.message }),
    status: offer.status,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    isMine: Boolean(options.viewerId && offer.offeredBy === options.viewerId),
  };
}

/**
 * Daftar putih permintaan. Field yang tidak disebut di sini tidak keluar.
 *
 * `options.vendorName` adalah nama listing yang diklaim, bukan id pemiliknya.
 */
export function toPublicServiceRequest(
  request: RequestSource,
  options: RequestCapabilities & { vendorName?: string; offers?: PublicRequestOffer[] },
): PublicServiceRequest {
  const now = options.now ?? Date.now();
  const isMine = Boolean(options.viewerId && options.viewerId === options.requesterId);
  // Pembuat permintaan boleh mengubah statusnya. Pengelola ikut boleh, karena
  // moderasi papan memang tugas mereka. Dua-duanya diperiksa ULANG di
  // mutation-nya; nilai ini hanya dipakai UI untuk memutuskan tombol mana yang
  // ditampilkan.
  const canManage = isMine || Boolean(options.isStaff);
  // Pengunjung anonim tidak punya listing, jadi tidak mungkin menawarkan.
  // Pembuat permintaan tidak boleh menawarkan ke dirinya sendiri - aturan yang
  // sama sudah ditegakkan di `claimRequest`.
  const canOffer = Boolean(options.viewerId) && !isMine && isOpenForOffers(request, now);

  return {
    _id: request._id,
    title: request.title,
    description: request.description,
    category: request.category,
    landmark: request.landmark,
    ...(request.lat === undefined ? {} : { lat: request.lat }),
    ...(request.lng === undefined ? {} : { lng: request.lng }),
    ...(request.budget === undefined ? {} : { budget: request.budget }),
    ...(request.neededAt === undefined ? {} : { neededAt: request.neededAt }),
    status: request.status,
    ...(request.vendorId === undefined ? {} : { vendorId: request.vendorId }),
    ...(options.vendorName === undefined ? {} : { vendorName: options.vendorName }),
    ...(request.claimedAt === undefined ? {} : { claimedAt: request.claimedAt }),
    ...(request.completedAt === undefined ? {} : { completedAt: request.completedAt }),
    ...(request.expiresAt === undefined ? {} : { expiresAt: request.expiresAt }),
    ...(request.cancelledReason === undefined ? {} : { cancelledReason: request.cancelledReason }),
    ...(request.reopenedAt === undefined ? {} : { reopenedAt: request.reopenedAt }),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    requesterName: options.requesterName,
    isMine,
    canManage,
    canOffer,
    offers: options.offers ?? [],
  };
}
