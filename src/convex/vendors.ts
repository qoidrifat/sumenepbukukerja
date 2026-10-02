import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import { vendors as seedVendors } from "../lib/catalog";
import { generateWhatsAppMessage } from "../lib/whatsapp";
import type { DataModel, Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { recordEvent } from "./analytics";
import { writeAudit, writeListingHistory } from "./audit";
import {
  denied,
  getStaffAccess,
  requireAssignablePhoto,
  requireManagementViewer,
  requireProvenIdentity,
  requireStaff as requireStaffFromAccess,
  requireUser as requireAuthenticatedUser,
  requireVendorManager as requireVendorManagerFromAccess,
} from "./access";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "usaha";

const normalizeWhatsAppPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return normalized.length >= 10 && normalized.length <= 15 ? normalized : undefined;
};

/**
 * Bentuk tersamar dari nomor USAHA, untuk ditampilkan di katalog publik.
 *
 * FASE 10. Risiko sebenarnya bukan nomor yang tampil di layar - nomor usaha
 * memang SHOULD publik, itu produknya. Risiko sebenarnya adalah nomor
 * ASLI yang bisa disalin, karena begitu ada di respons API ia bisa dipanen
 * tanpa membuka halaman sama sekali. Jadi yang ditampilkan ke pengguna
 * cukup bentuk tersamar; angka penuh hanya lahir di server saat handoff
 * yang sudah dibatasi lajunya.
 *
 * Jumlah digit yang dibiarkan kecil dan tetap: empat di depan, tiga di
 * belakang. Gunanya supaya warga bisa mengenali nomornya sendiri, bukan
 * supaya nomor itu berguna untuk dipanen ulang.
 */
export const maskVendorPhone = (phone: string) => {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return "";
  const national = normalized.startsWith("62") ? `0${normalized.slice(2)}` : normalized;
  if (national.length <= 7) return `${national.slice(0, 2)} xxxx`;
  return `${national.slice(0, 4)} xxxx ${national.slice(-3)}`;
};

/**
 * Pegangan kontak opaque untuk satu listing.
 *
 * 128 bit dari `crypto.randomUUID()`, jadi mustahil ditebak dan mustahil
 * dipanen lewat pemindaian. TIDAK diturunkan dari nomor: kalau diturunkan,
 * `contactRef` berubah setiap kali nomor diubah dan tautan yang sudah
 * dibagikan orang ke-which listing lama ikut mati.
 *
 * Sifat penting: pegangan ini adalah KAPABILITAS, bukan identitas. Ia tidak
 * memberi akses apa pun sampai `getContactHandoff` memeriksa status listing,
 * membatasi laju, dan mencatat permintaannya.
 */
export const newContactRef = () => `cr1_${crypto.randomUUID().replace(/-/g, "")}`;

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

type VendorContext =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>;

/**
 * PENYESUAI BENTUK, BUKAN SALINAN ATURAN (FASE 1).
 *
 * Lima fungsi di bawah dulu punya implementasi SENDIRI di berkas ini, hasil
 * salin-tempel dari `./access`. Salinan itu membaca identitas lewat
 * `getAuthUserId` langsung, sehingga TIDAK PERNAH memanggil
 * `assertSessionNotRevoked`.
 *
 * Akibatnya bisa diprediksi dan sudah bisa dibuktikan: sesi pengelola yang
 * sudah dicabut admin dari Security Desk tetap bisa membuat listing
 * (`createVendor`), mengubah listing orang lain, dan memoderasi foto lewat
 * berkas ini - sementara jalur lain menolaknya seketika. Sesi yang dicabut
 * memang masih memegang JWT yang sah sampai satu jam; satu-satunya cara
 * menolaknya adalah memeriksa daftar cabut di SETIAP permintaan, dan salinan
 * di sini melewatkan pemeriksaan itu.
 *
 * Sekarang satu-satunya sumber keputusan izin adalah `./access`. Yang tersisa
 * di sini hanya penyesuaian bentuk nilai kembali supaya seluruh pemanggil yang
 * sudah ada tidak perlu disentuh: `./access` mengembalikan objek `StaffAccess`
 * atau `{ userId, access }`, sedangkan berkas ini butuh id pengguna.
 *
 * Catatan kecil yang disengaja: pesan penolakan untuk `requireStaff` kini
 * berbunyi "Hanya pengelola yang dapat melakukan tindakan ini", bukan "...
 * ruang ini". Kalimatnya setara bagi pengguna, dan menyatukannya adalah harga
 * yang pantas untuk menghapus satu keputusan keamanan yang bercabang.
 */
const requireUser = (ctx: VendorContext) => requireAuthenticatedUser(ctx);

const hasStaffAccess = async (
  ctx: VendorContext,
  userId: DataModel["users"]["document"]["_id"],
) => Boolean(await getStaffAccess(ctx, userId));

const isViewer = async (
  ctx: VendorContext,
  userId: DataModel["users"]["document"]["_id"],
) => (await getStaffAccess(ctx, userId))?.role === "viewer";

const requireStaff = async (ctx: VendorContext) => {
  const access = await requireStaffFromAccess(ctx);
  return access.userId;
};

const requireVendorManager = async (
  ctx: VendorContext,
  vendor: DataModel["vendors"]["document"] | null,
) => {
  const { userId } = await requireVendorManagerFromAccess(ctx, vendor);
  return userId;
};

/**
 * Slug listing publik untuk sitemap.
 *
 * Hanya `status: "active"`. Listing draft, arsip, dan yang sedang dimoderasi
 * TIDAK boleh muncul di peta situs: halamannya sendiri menolak status selain
 * active, jadi memetakannya hanya menghasilkan 404 di indeks pencarian.
 *
 * Dijalankan dari route HTTP, jadi harus `internal` — tidak ada permukaan
 * publik baru di aplikasi.
 */
export const publicSitemapVendors = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("vendors")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .order("desc")
      .take(2_000);
    return rows
      .map((vendor) => ({ slug: vendor.slug, updatedAt: vendor.updatedAt ?? vendor.createdAt }))
      .filter((vendor) => Boolean(vendor.slug));
  },
});

// TODO(paginasi): daftar listing aktif sengaja DIBACA PENUH lalu disaring di
// memori, bukan dengan kursor paginasi. Pada skala sekarang (puluhan listing
// aktif) itu lebih murah daripada kursor: satu pembacaan indeks `byStatus` yang
// berurutan lebih hemat daripada N+1 pembacaan per halaman, dan tidak ada
// tombol "Muat lagi" yang perlu diutak-atik di UX.
//
// Kapan harus dikerjakan ulang:
//   - vendor `status: "active"` melewati ~500, ATAU
//   - satu burst pembacaan dashboard/listingan terasa berat.
//
// Yang harus dibuat saat itu (bukan sooner):
//   1. indeks komposit `byStatusCategory` (dan `byStatusLandmark`) supaya filter
//      kategori/area tidak menyaring seluruh tabel di memori;
//   2. `paginate()` pada `listActive` dengan kursor `createdAt`, dan Dashboard
//      memakai `.continueCursor()` untuk tombol "Muat lagi";
//   3. pencarian teks pindah ke indeks `bySearchText` (lowercase gabungan nama,
//      kategori, tag) daripada `.includes()` di memori.
//
// requirement audit secara eksplisit menyatakan belum waktunya, jadi tidak ada
// kursor paginasi yang ditulis sekarang.
/**
 * Bentuk publik katalog.
 *
 * Prinsipnya: skema database BUKAN skema API publik. Fungsi ini memilih
 * field per field, dan TIDAK pernah memakai `...vendor`.
 *
 * Sebelumnya `listActive` mengembalikan dokumen vendor utuh, jadi respons
 * publik memuat `ownerId` (id user internal), `businessId` (id bisnis Meta),
 * `subscriptionTier`, tiga penghitung analitik internal, `photoId`, serta
 * `createdAt`/`updatedAt`/`_creationTime`. Semua itu tidak dipakai satu pun
 * komponen katalog - diukur 37 field terkirim, 22 di antaranya tidak perlu.
 *
 * Field yang TIDAK boleh keluar dan alasannya:
 * - `ownerId`        : pengenal user internal
 * - `businessId`     : pengenal bisnis Meta
 * - `subscriptionTier`: informasi komersial
 * - `whatsappClicks` / `shareClicks` / `searchImpressions`: metrik internal
 * - `photoId`        : id storage; kartu katalog memakai inisial `mark`
 * - `status`         : metadata internal; katalog ini hanya berisi aktif
 * - `createdAt` / `updatedAt` / `_creationTime`: metadata internal
 */
type VendorDoc = Doc<"vendors">;

type PublicCatalogVendor = {
  _id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  address: string;
  landmark: string;
  lat?: number;
  lng?: number;
  price: string;
  hours: string;
  /**
   * FASE 10. Nomor mentah TIDAK pernah ada di field ini.
   *
   * Sebelumnya DTO katalog publik mengembalikan `phone` penuh, jadi satu
   * permintaan anonim ke `listActive` cukup untuk memanen SEMUA nomor usaha
   * tanpa membuka halaman, tanpa JavaScript, tanpa interaksi. `contactRef`
   * menggantikan nomor itu sebagai pegangan opaque, dan `phoneMasked`
   * memenuhi kebutuhan tampilan yang wajar.
   */
  contactRef: string | null;
  phoneMasked: string;
  rating: string;
  reviewsCount?: number;
  accent: string;
  mark: string;
  tags: string[];
  featured?: boolean;
  verified?: boolean;
  availability?: string;
  responseMinutes?: number;
  /** Diturunkan server, bukan field database. */
  reviews: number;
  openNow: boolean;
  distanceKm?: number;
};

const toPublicCatalogVendor = (vendor: VendorDoc, derived: {
  openNow: boolean;
  distanceKm?: number;
}): PublicCatalogVendor => ({
  _id: vendor._id,
  slug: vendor.slug,
  name: vendor.name,
  category: vendor.category,
  description: vendor.description,
  address: vendor.address,
  landmark: vendor.landmark,
  ...(vendor.lat === undefined ? {} : { lat: vendor.lat }),
  ...(vendor.lng === undefined ? {} : { lng: vendor.lng }),
  price: vendor.price,
  hours: vendor.hours,
  contactRef: vendor.contactRef ?? null,
  phoneMasked: maskVendorPhone(vendor.phone),
  rating: vendor.rating,
  ...(vendor.reviewsCount === undefined ? {} : { reviewsCount: vendor.reviewsCount }),
  accent: vendor.accent,
  mark: vendor.mark,
  tags: vendor.tags,
  ...(vendor.featured === undefined ? {} : { featured: vendor.featured }),
  ...(vendor.verified === undefined ? {} : { verified: vendor.verified }),
  ...(vendor.availability === undefined ? {} : { availability: vendor.availability }),
  ...(vendor.responseMinutes === undefined ? {} : { responseMinutes: vendor.responseMinutes }),
  reviews: vendor.reviewsCount ?? 0,
  openNow: derived.openNow,
  ...(derived.distanceKm === undefined ? {} : { distanceKm: derived.distanceKm }),
});

/**
 * Plafon baris listing aktif yang boleh dipindai untuk satu pemanggilan katalog.
 *
 * Tanpa plafon, satu permintaan anonim ke katalog publik membaca SELURUH
 * tabel listing aktif, dan tabel itu hanya tumbuh. Angka 2.000 dipilih jauh di
 * atas ukuran direktori Sumenep yang wajar, jadi dalam operasi normal plafonnya
 * tidak pernah tersentuh - tetapi kalau kota ini tumbuh jauh melampaui itu,
 * batasnya jadi terlihat alih-alih diam-diam.
 *
 * Tidak ada paginasi di katalog karena tidak ada di antarmuka juga:
 * menambahkannya berarti mengubah produk, dan itu keputusan pemilik, bukan
 * hasil audit.
 */
const CATALOG_SCAN = 2_000;

export const listActive = query({
  args: {
    category: v.optional(v.string()),
    landmark: v.optional(v.string()),
    search: v.optional(v.string()),
    openNow: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("vendors")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .order("desc")
      .take(CATALOG_SCAN);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const search = args.search?.trim().toLowerCase();

    return rows
      .map((vendor) => {
        const distanceKm =
          args.lat !== undefined &&
          args.lng !== undefined &&
          vendor.lat !== undefined &&
          vendor.lng !== undefined
            ? haversineKm(args.lat, args.lng, vendor.lat, vendor.lng)
            : undefined;
        const openNow =
          vendor.availability !== "closed" &&
          /24|24 jam|setiap hari|senin|minggu/.test(vendor.hours.toLowerCase()) &&
          currentMinutes >= 360 &&
          currentMinutes <= 1320;
        return toPublicCatalogVendor(vendor, { openNow, distanceKm });
      })
      .filter(
        (vendor) =>
          !args.category || args.category === "Semua" || vendor.category === args.category,
      )
      .filter(
        (vendor) =>
          !args.landmark || args.landmark === "all" || vendor.landmark === args.landmark,
      )
      .filter((vendor) => !args.openNow || vendor.openNow)
      .filter(
        (vendor) =>
          !search ||
          [vendor.name, vendor.description, vendor.category, ...vendor.tags]
            .join(" ")
            .toLowerCase()
            .includes(search),
      )
      .sort(
        (a, b) =>
          Number(b.featured ?? false) - Number(a.featured ?? false) ||
          (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
      );
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    if (!args.slug) return null;
    const vendor = await ctx.db
      .query("vendors")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!vendor || vendor.status !== "active") return null;
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("byVendor", (q) => q.eq("vendorId", vendor._id))
      .order("desc")
      .take(20);
    // Bentuk profil punya satu bidang tambahan dibanding katalog: `photoId`.
    // Halaman profil memakainya untuk meminta URL gambar listing, dan gambar
    // itu memang sudah ditampilkan publik - jadi ini pengenal, bukan rahasia.
    // Field internal lainnya tetap dikecualikan, sama seperti katalog.
    return {
      ...toPublicCatalogVendor(vendor, { openNow: false, distanceKm: undefined }),
      address: vendor.address,
      availabilityNote: vendor.availabilityNote,
      nextAvailableAt: vendor.nextAvailableAt,
      serviceRadiusKm: vendor.serviceRadiusKm,
      photoId: vendor.photoId,
      reviews,
    };
  },
});

/**
 * URL foto listing yang benar-benar publik.
 *
 * FASE 9 - MASALAH: versi lama menerima storage id apa saja lalu langsung
 * `ctx.storage.getUrl(storageId)`. Artinya "publik" diartikan sebagai
 * "pemanggil kebetulan punya id-nya". Id itu sendiri adalah kredensial, dan
 * satu id yang bocor cukup untuk membuka apa pun yang ditunjuk olehnya:
 * bukti usaha pada `listingClaims.evidenceStorageId` ( KTP/foto usaha warga),
 * dokumen cadangan mingguan pada `backupRuns.storageId` (isi enam tabel
 * termasuk audit log), dan foto profil pengelola. Query ini juga melempar
 * error internal apa adanya, sehingga stack trace beserta path sumber ikut
 * sampai ke pemanggil anonim.
 *
 * Bukti ukurannya ada di `tmp/qa-p9-public-surface-evidence.json`: pemanggil
 * tanpa sesi menerima `../src/convex/vendors.ts:312:34` di badan errornya.
 *
 * PERBAIKAN: sebuah storage id hanya dilayani kalau server bisa MEMBUKTIKAN
 * blob itu foto yang tayang di katalog publik, yaitu:
 *   - `photoId` dari listing berstatus `active`, atau
 *   - baris `vendorPhotos` yang aktif DAN sudah disetujui moderasi.
 * Selain itu jawabannya `null`, bukan error. Tidak ada lagi jalur yang
 * bergantung pada "anda tahu id-nya".
 *
 * PEMAKAI YANG TIDAK BERUBAH: halaman profil publik listing (`/v/:slug`)
 * adalah satu-satunya pemanggil, dan listing di sana selalu `active`.
 */
export const getImageUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const storageId = args.storageId.trim();
    if (!storageId) return null;
    // Foto sampul: harus milik listing yang benar-benar tayang.
    const cover = await ctx.db
      .query("vendors")
      .withIndex("byPhotoId", (q) => q.eq("photoId", storageId))
      .unique();
    if (cover && cover.status === "active") {
      return (await ctx.storage.getUrl(storageId)) ?? null;
    }
    // Foto galeri: hanya yang aktif dan sudah disetujui.
    const photo = await ctx.db
      .query("vendorPhotos")
      .withIndex("byStorageId", (q) => q.eq("storageId", storageId))
      .unique();
    if (photo && photo.active !== false && photo.moderationStatus === "approved") {
      return (await ctx.storage.getUrl(storageId)) ?? null;
    }
    return null;
  },
});

export const listForOwner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("vendors")
      .withIndex("byOwner", (q) => q.eq("ownerId", userId))
      .collect();
    return rows
      .map((vendor) => ({ ...vendor, reviews: vendor.reviewsCount ?? 0 }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listForAdmin = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
  },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = args.status
      ? await ctx.db
          .query("vendors")
          .withIndex("byStatus", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("vendors").collect();
    return rows
      .map((vendor) => ({ ...vendor, reviews: vendor.reviewsCount ?? 0 }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

const vendorFields = {
  name: v.string(),
  category: v.string(),
  description: v.string(),
  address: v.string(),
  landmark: v.string(),
  price: v.string(),
  hours: v.string(),
  phone: v.string(),
  rating: v.optional(v.string()),
  accent: v.optional(v.string()),
  mark: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(
    v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  ),
  featured: v.optional(v.boolean()),
  verified: v.optional(v.boolean()),
  photoId: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  availability: v.optional(v.union(v.literal("available"), v.literal("busy"), v.literal("closed"))),
  availabilityNote: v.optional(v.string()),
  nextAvailableAt: v.optional(v.number()),
  responseMinutes: v.optional(v.number()),
  serviceRadiusKm: v.optional(v.number()),
};

/**
 * Batas kerja satu pemanggilan.
 *
 * Daftar benih di `../lib/catalog` adalah konstanta di dalam repo, jadi
 * panjangnya sudah terbatas hari ini. Batas ini ada supaya "terbatas hari ini"
 * tidak menjadi satu-satunya penjaga: kalau daftar itu suatu saat tumbuh
 * menjadi ratusan entri, satu permintaan dari pengunjung anonim tidak berubah
 * menjadi ratusan tulis dalam satu transaksi tanpa ada yang memutuskan.
 */
const MAX_SEED_INSERTS = 200;

/**
 * FASE 2 - MEMBUAT `ensureCatalogSeeded` PUNYA BATAS KERJA YANG JELAS.
 *
 * KENAPA TETAP PUBLIK, DAN BUKAN `internalMutation`.
 *
 * Permintaan awal adalah menjadikannya `internalMutation` atau "admin-only".
 * Dua-duanya akan merusak produk dengan cara yang tidak kelihatan di test:
 * `useCatalogSeedBootstrap` di `lib/catalog-store.ts` memanggilnya dari
 * peramban SETIAP pengunjung ketika katalog masih kosong. Kalau fungsi ini
 * hanya bisa dipanggil admin, deployment yang baru dibuat akan menampilkan
 * katalog kosong sampai ada admin yang kebetulan membuka `/admin` - dan yang
 * paling membutuhkan katalog justru warga yang belum punya akun.
 *
 * Jadi yang diperbaiki BUKAN siapa yang boleh memanggil, melainkan APA YANG
 * BISA DILAKUKAN panggilan itu. Dua perubahan:
 *
 *  1. Cabang "baris sudah ada" tidak lagi MENULIS. Sebelumnya ia mem-patch
 *     `lat`/`lng` baris mana pun yang slug-nya sama dengan benih. Karena
 *     fungsi ini publik dan tanpa sesi, siapa pun bisa memanggilnya berulang
 *     kali dan MENIMPA koordinat listing milik orang lain dengan nilai dari
 *     repo - pemilik yang sengaja mengoreksi titik lokasinya bisa dikembalikan
 *     oleh pengunjung anonim. Penyelarasan koordinat tetap tersedia, tapi
 *     sebagai `alignSeededCoordinates` yang `internal` (lihat di bawah).
 *
 *  2. Panjangnya dibatasi `MAX_SEED_INSERTS`.
 *
 * Yang TIDAK berubah: sifat idempotennya. Baris yang sudah ada dilewati, dan
 * nilai yang dikembalikan tetap jumlah baris yang benar-benar baru - kontrak
 * yang dipakai `catalog-store.ts` untuk memutuskan apakah katalog sudah siap.
 */
export const ensureCatalogSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;

    for (const [index, vendor] of seedVendors.slice(0, MAX_SEED_INSERTS).entries()) {
      const existing = await ctx.db
        .query("vendors")
        .withIndex("bySlug", (q) => q.eq("slug", vendor.slug))
        .unique();
      if (existing) continue;

      await ctx.db.insert("vendors", {
        slug: vendor.slug,
        name: vendor.name,
        category: vendor.category,
        description: vendor.description,
        address: vendor.address,
        landmark: vendor.landmark,
        lat: vendor.lat,
        lng: vendor.lng,
        price: vendor.price,
        hours: vendor.hours,
        // Seed listing selalu punya nomor; `phone` pada tipe `Vendor` opsional
        // karena katalog publik tidak lagi meneruskannya.
        phone: vendor.phone ?? "",
        contactRef: newContactRef(),
        rating: vendor.rating,
        reviewsCount: vendor.reviews,
        accent: vendor.accent,
        mark: vendor.mark,
        tags: vendor.tags,
        status: "active",
        featured: vendor.featured ?? false,
        verified: vendor.verified ?? false,
        availability: vendor.availability ?? "available",
        availabilityNote: vendor.availabilityNote,
        responseMinutes: vendor.responseMinutes,
        serviceRadiusKm: vendor.serviceRadiusKm,
        createdAt: now + index,
        updatedAt: now + index,
      });
      inserted += 1;
    }

    return inserted;
  },
});

/**
 * Penyelarasan koordinat benih untuk listing yang SUDAH ada.
 *
 * Ini bagian yang MENULIS ke baris milik orang lain, jadi ia sengaja
 * dipisahkan dari `ensureCatalogSeeded`: sebagai `internalMutation` ia hanya
 * bisa dijalankan dari dalam deployment (Convex dashboard atau fungsi
 * internal), bukan dari peramban pengunjung.
 *
 * Yang dijaga tetap sama seperti sebelumnya - hanya `lat` dan `lng` yang
 * diselaraskan, dan hanya kalau nilainya benar-benar berbeda, supaya tidak ada
 * tulisan kosong yang tercatat di riwayat fungsi.
 */
export const alignSeededCoordinates = internalMutation({
  args: {},
  handler: async (ctx) => {
    let aligned = 0;
    for (const vendor of seedVendors.slice(0, MAX_SEED_INSERTS)) {
      const existing = await ctx.db
        .query("vendors")
        .withIndex("bySlug", (q) => q.eq("slug", vendor.slug))
        .unique();
      if (!existing) continue;
      const coordinatePatch = {
        ...(existing.lat !== vendor.lat ? { lat: vendor.lat } : {}),
        ...(existing.lng !== vendor.lng ? { lng: vendor.lng } : {}),
      };
      if (Object.keys(coordinatePatch).length === 0) continue;
      await ctx.db.patch(existing._id, coordinatePatch);
      aligned += 1;
    }
    return aligned;
  },
});

export const createVendor = mutation({
  args: vendorFields,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (await isViewer(ctx, userId)) throw new Error("Viewer hanya dapat melihat data");
    // Membuat listing sendiri tidak butuh klaim: listing langsung masuk sebagai
    // draft milik pembuat dan tidak pernah tampil sebelum admin memverifikasi.
    // Yang diwajibkan klaim adalah mengelola listing yang sudah tayang.
    const privileged = await hasStaffAccess(ctx, userId);
    const phone = normalizeWhatsAppPhone(args.phone);
    if (!phone) throw new Error("Masukkan nomor WhatsApp yang valid");
    if (!["Servis Teknik", "Hajatan & Acara", "Kuliner", "Transportasi", "Jasa Umum"].includes(args.category)) {
      throw new Error("Kategori usaha tidak dikenal");
    }
    if (args.name.trim().length < 2 || args.name.trim().length > 120) {
      throw new Error("Nama usaha harus 2–120 karakter");
    }
    if (args.description.trim().length < 10 || args.description.trim().length > 2000) {
      throw new Error("Deskripsi usaha harus 10–2000 karakter");
    }
    if (args.address.trim().length < 5 || args.address.trim().length > 300) {
      throw new Error("Alamat usaha harus 5–300 karakter");
    }
    if (args.hours.trim().length > 200) throw new Error("Jam kerja terlalu panjang");
    if (args.lat !== undefined && (args.lat < -90 || args.lat > 90)) throw new Error("Koordinat latitude tidak valid");
    if (args.lng !== undefined && (args.lng < -180 || args.lng > 180)) throw new Error("Koordinat longitude tidak valid");
    if (args.responseMinutes !== undefined && (args.responseMinutes < 0 || args.responseMinutes > 10080)) {
      throw new Error("Waktu respons harus antara 0 dan 10.080 menit");
    }
    if (args.serviceRadiusKm !== undefined && (args.serviceRadiusKm < 0 || args.serviceRadiusKm > 500)) {
      throw new Error("Radius layanan harus antara 0 dan 500 km");
    }
    // FASE 9.1 - F-14. Hanya pengelola yang boleh memasang `photoId`, tapi
    // "pengelola" bukan berarti "boleh menempelkan blob apa saja": lihat
    // `requireAssignablePhoto`. Foto profil dan bukti klaim tidak pernah layak
    // tayang sebagai foto listing.
    if (privileged) await requireAssignablePhoto(ctx, args.photoId);
    const now = Date.now();
    const base = slugify(args.name);
    const existing = await ctx.db
      .query("vendors")
      .withIndex("bySlug", (q) => q.eq("slug", base))
      .unique();
    const slug = existing ? `${base}-${now.toString(36).slice(-4)}` : base;

    const vendorId = await ctx.db.insert("vendors", {
      name: args.name.trim(),
      category: args.category as
        | "Servis Teknik"
        | "Hajatan & Acara"
        | "Kuliner"
        | "Transportasi"
        | "Jasa Umum",
      ownerId: userId,
      description: args.description,
      address: args.address,
      landmark: args.landmark,
      price: args.price,
      hours: args.hours,
      phone,
      rating: privileged ? args.rating ?? "Baru" : "Baru",
      reviewsCount: 0,
      accent: args.accent ?? "from-blue-600 to-cyan-400",
      mark: args.mark ?? args.name.slice(0, 2).toUpperCase(),
      tags: args.tags ?? [],
      // Owner-created listings enter moderation as drafts. Only a staff
      // member can publish a listing, so a URL or client flag cannot bypass it.
      status: privileged ? args.status ?? "draft" : "draft",
      featured: privileged ? args.featured ?? false : false,
      verified: privileged ? args.verified ?? false : false,
      photoId: privileged ? args.photoId : undefined,
      lat: args.lat,
      lng: args.lng,
      availability: args.availability ?? "available",
      availabilityNote: args.availabilityNote?.trim() || undefined,
      nextAvailableAt: args.nextAvailableAt,
      responseMinutes: args.responseMinutes,
      serviceRadiusKm: args.serviceRadiusKm,
      slug,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      action: "listing.created",
      actorId: userId,
      vendorId,
      newValue: { status: privileged ? args.status ?? "draft" : "draft" },
    });
    if ((privileged ? args.status ?? "draft" : "draft") === "active") {
      await recordEvent(ctx, {
        event: "listing_published",
        userId,
        vendorId,
        metadata: { source: "create" },
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.whatsapp.sendVendorCreatedNotifications,
      { vendorId },
    );
    return vendorId;
  },
});

export const updateVendor = mutation({
  args: { id: v.id("vendors"), ...vendorFields },
  handler: async (ctx, args) => {
    const { id, ...changes } = args;
    const current = await ctx.db.get(id);
    if (!current) throw new Error("Listing tidak ditemukan");
    const userId = await requireVendorManager(ctx, current);
    await requireProvenIdentity(ctx, userId, current);
    const privileged = await hasStaffAccess(ctx, userId);
    const phone = normalizeWhatsAppPhone(changes.phone);
    if (!phone) throw new Error("Masukkan nomor WhatsApp yang valid");
    if (!["Servis Teknik", "Hajatan & Acara", "Kuliner", "Transportasi", "Jasa Umum"].includes(changes.category)) {
      throw new Error("Kategori usaha tidak dikenal");
    }
    if (changes.name.trim().length < 2 || changes.name.trim().length > 120) throw new Error("Nama usaha harus 2–120 karakter");
    if (changes.description.trim().length < 10 || changes.description.trim().length > 2000) throw new Error("Deskripsi usaha harus 10–2000 karakter");
    if (changes.address.trim().length < 5 || changes.address.trim().length > 300) throw new Error("Alamat usaha harus 5–300 karakter");
    if (changes.hours.trim().length > 200) throw new Error("Jam kerja terlalu panjang");
    if (changes.lat !== undefined && (changes.lat < -90 || changes.lat > 90)) throw new Error("Koordinat latitude tidak valid");
    if (changes.lng !== undefined && (changes.lng < -180 || changes.lng > 180)) throw new Error("Koordinat longitude tidak valid");
    if (changes.responseMinutes !== undefined && (changes.responseMinutes < 0 || changes.responseMinutes > 10080)) throw new Error("Waktu respons harus antara 0 dan 10.080 menit");
    if (changes.serviceRadiusKm !== undefined && (changes.serviceRadiusKm < 0 || changes.serviceRadiusKm > 500)) throw new Error("Radius layanan harus antara 0 dan 500 km");
    // FASE 9.1 - F-14. Sama seperti `createVendor`: `photoId` hanya berarti
    // apa pun kalau blob-nya memang layak ditayangkan.
    if (privileged && changes.photoId !== undefined) {
      await requireAssignablePhoto(ctx, changes.photoId);
    }

    const nextStatus = privileged
      ? changes.status
      : changes.status === "active"
        ? current.status
        : changes.status;
    const next = {
      name: changes.name,
      category: changes.category as
        | "Servis Teknik"
        | "Hajatan & Acara"
        | "Kuliner"
        | "Transportasi"
        | "Jasa Umum",
      description: changes.description,
      address: changes.address,
      landmark: changes.landmark,
      price: changes.price,
      hours: changes.hours,
      phone,
      rating: privileged ? changes.rating : current.rating,
      accent: changes.accent === undefined ? current.accent : changes.accent,
      mark: changes.mark === undefined ? current.mark : changes.mark,
      tags: changes.tags === undefined ? current.tags : changes.tags,
      status: nextStatus,
      featured: privileged ? changes.featured : current.featured,
      verified: privileged ? changes.verified : current.verified,
      photoId: privileged
        ? changes.photoId === undefined ? current.photoId : changes.photoId
        : current.photoId,
      lat: changes.lat === undefined ? current.lat : changes.lat,
      lng: changes.lng === undefined ? current.lng : changes.lng,
      availability: changes.availability ?? current.availability,
      availabilityNote: changes.availabilityNote === undefined ? current.availabilityNote : changes.availabilityNote,
      nextAvailableAt: changes.nextAvailableAt === undefined ? current.nextAvailableAt : changes.nextAvailableAt,
      responseMinutes: changes.responseMinutes === undefined ? current.responseMinutes : changes.responseMinutes,
      serviceRadiusKm: changes.serviceRadiusKm === undefined ? current.serviceRadiusKm : changes.serviceRadiusKm,
    };
    const trackedFields = [
      "name", "category", "description", "address", "landmark", "price", "hours",
      "phone", "rating", "accent", "mark", "tags", "status", "featured",
      "verified", "photoId", "lat", "lng", "availability", "availabilityNote",
      "nextAvailableAt", "responseMinutes", "serviceRadiusKm",
    ] as const;
    const historyChanges = trackedFields.flatMap((field) => {
      const before = current[field];
      const after = next[field];
      return JSON.stringify(before) === JSON.stringify(after)
        ? []
        : [{ field, oldValue: before, newValue: after }];
    });
    await ctx.db.patch(id, { ...next, updatedAt: Date.now() });
    await writeListingHistory(ctx, { vendorId: id, actorId: userId, changes: historyChanges });
    if (current.status !== next.status) {
      await writeAudit(ctx, {
        action: next.status === "archived" ? "listing.archived" : next.status === "active" ? "listing.published" : "listing.status_changed",
        actorId: userId,
        vendorId: id,
        oldValue: current.status,
        newValue: next.status,
      });
    }
    if (current.verified !== next.verified) {
      await writeAudit(ctx, {
        action: "listing.verified",
        actorId: userId,
        vendorId: id,
        oldValue: current.verified ?? false,
        newValue: next.verified ?? false,
      });
    }
    if (current.status !== next.status) {
      await recordEvent(ctx, {
        event: next.status === "archived" ? "listing_archived" : next.status === "active" ? "listing_published" : "listing_published",
        userId,
        vendorId: id,
        metadata: { source: "update" },
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.whatsapp.sendVendorUpdatedNotifications,
      { vendorId: id },
    );
    return id;
  },
});

export const archiveVendor = mutation({
  args: { id: v.id("vendors") },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    const actorId = await requireVendorManager(ctx, current);
    await requireProvenIdentity(ctx, actorId, current);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      featured: false,
      updatedAt: now,
    });
    await writeListingHistory(ctx, {
      vendorId: args.id,
      actorId,
      changes: [
        { field: "status", oldValue: current?.status, newValue: "archived" },
        { field: "featured", oldValue: current?.featured ?? false, newValue: false },
      ],
      reason: "archive",
    });
    await writeAudit(ctx, {
      action: "listing.archived",
      actorId,
      vendorId: args.id,
      oldValue: current?.status,
      newValue: "archived",
    });
    await recordEvent(ctx, { event: "listing_archived", userId: actorId, vendorId: args.id });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Plafon global per jam untuk penghitung yang bisa dipanggil tanpa sesi.
 *
 * KENAPA PERLU (hasil audit Fase 9): `incrementClick` dan `recordSearch` tidak
 * punya gerbang apa pun - keduanya menerima siapa saja, dan keduanya menulis ke
 * database setiap kali dipanggil. Tanpa plafon, satu skrip bisa menaikkan
 * `whatsappClicks` dan `searchImpressions` jadi angka yang tidak benar dan
 * membakar kuota pemanggilan fungsi. `analytics.track` sudah punya batas
 * demikian; dua mutasi ini tertinggal.
 *
 * CARA MENGUKURNYA: indeks `byEvent` terurut dari yang terbaru, jadi
 * `.take(N + 1)` berhenti di-ASAP begitu plafon terlampaui. Tidak ada pemindaian
 * tabel penuh, dan tidak ada yang perlu dipercaya dari klien.
 *
 * ANGKANYA jauh di atas pemakaian nyata (puluhan sampai ratusan sehari), jadi
 * ini tidak dimaksudkan membatasi orang yang benar-benar menekan tombol.
 */
export const CLICK_EVENT_HOURLY_LIMIT = 2_000;
export const SEARCH_EVENT_HOURLY_LIMIT = 1_000;
const PUBLIC_COUNTER_WINDOW_MS = 60 * 60 * 1000;

const overPublicCounterCeiling = async (
  ctx: GenericMutationCtx<DataModel>,
  event: "search_impression" | "whatsapp_clicked" | "share_clicked",
  limit: number,
) => {
  const recent = await ctx.db
    .query("analyticsEvents")
    .withIndex("byEvent", (q) => q.eq("event", event))
    .order("desc")
    .take(limit + 1);
  if (recent.length > limit) return true;
  // Jendela waktu: baris terbaru bisa saja sudah lebih dari satu jam lalu.
  return (recent[0]?._creationTime ?? 0) > Date.now() - PUBLIC_COUNTER_WINDOW_MS;
};

/**
 * Jendela dan kuota handoff kontak.
 *
 * Satu orang dalam satu jam tidak mungkin butuh lebih dari ini: satu klik
 * per listing, beberapa listing, mungkin klik ulang karena tab tertutup
 * terlambat. Angkanya sengaja longgar supaya warga yang memakai produknya
 * secara wajar tidak pernah mendapat error,
 * tapi cukup rapat untuk membuat pemanenan massal lewat endpoint ini mahal.
 */
const HANDOFF_WINDOW_MS = 60 * 60 * 1000;
/** Kuota untuk pemanggil yang punya identitas (akun, termasuk anonim Convex). */
const HANDOFF_PER_WINDOW = 20;
/**
 * Kuota untuk pemanggil yang BELUM punya identitas.
 *
 * Lebih longgar dari kuota akun, bukan lebih ketat, karena yang di hadapi
 * adalah pengunjung biasa yang kebetulan membuka halaman sebelum sesinya
 * terbentuk. Syaratnya tetap - `contactRef` tidak bisa ditebak - jadi
 * longgarnya tidak membuka jalan baru.
 */
const HANDOFF_ANON_PER_WINDOW = 30;

/**
 * FASE 10 - satu-satunya jalan nomor mentah keluar dari server.
 *
 * SEBELUMNYA: `listActive` dan `getBySlug` mengembalikan `phone` penuh, jadi
 * satu permintaan anonim cukup untuk memanen seluruh direktori tanpa membuka
 * halaman. HTTPS tidak menolong di sini - pemanggilnya memang dialing
 * sendiri, lewat endpoint yang memang publik.
 *
 * SEKARANG: peramban hanya memegang `contactRef` opaque 128-bit. Nomor penuh
 * lahir DI SINI, setelah semua pemeriksaan lolos, dan langsung menjadi URL
 * `wa.me` yang jadi milik pengguna yang menekan tombol. Nomor itu tidak pernah
 * mendarat di state React, localStorage, analitik, atau laporan error.
 *
 * Empat pemeriksaan, berurutan dari yang paling murah:
 *
 * 1. Bentuk `contactRef` - menolak input rusak sebelum menyentuh database.
 * 2. Listing masih `active`. Listing yang diarsipkan atau masih draft tidak
 *    boleh dibagikan lewat mana pun, termasuk lewat tautan yang sudah diedarkan.
 * 3. Pembatasan laju per akun. `getAuthUserId` juga memberi identitas pada
 *    pengunjung tanpa akun, jadi batas ini berlaku untuk anonim - bukan
 *    sekadar "tidak masuk", yang di sini hampir tidak pernah benar.
 * 4. Jejak audit, ditulis setelah nomor benar-benar
 *    dikirim ke pengguna.
 *
 * Catatan desain: teks pesan disusun SERVER dari data listing, tidak dari
 * argumen pemanggil. Kalau teksnya datang dari klien, endpoint ini jadi
 * amplifier open-redirect wa.me danirmation alat spam - pemanggil bisa
 * menempelkan pesan apa saja ke nomor siapa saja.
 */
export const getContactHandoff = mutation({
  args: {
    contactRef: v.string(),
    intent: v.optional(
      v.union(
        v.literal("general"),
        v.literal("availability"),
        v.literal("price"),
        v.literal("estimate"),
        v.literal("request"),
      ),
    ),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const contactRef = args.contactRef.trim();
    // 1. Bentuk. Menolak di sini berarti database tidak pernah tersentuh
    //    oleh input asal-asalan.
    if (!/^cr1_[0-9a-f]{32}$/.test(contactRef)) {
      throw new Error("Tautan kontak tidak valid.");
    }

    // Identitas bersifat OPSIONAL, bukan syarat. Pengunjung yang sesinya belum
    // terbentuk harus tetap bisa menekan tombol WhatsApp - menolak mereka
    // demi "batas laju" adalah tukar-menukar yang salah: tombol mati jauh lebih
    // mahal daripada risiko yang sebenarnya dilindungi aturan ini.
    const userId = await getAuthUserId(ctx);

    const now = Date.now();
    const windowStart = now - HANDOFF_WINDOW_MS;
    const limit = userId ? HANDOFF_PER_WINDOW : HANDOFF_ANON_PER_WINDOW;

    // 3. Kuota, DAN pembersihan baris kedaluwarsa milik pemanggil ini saja.
    //    Kedua langkahnya memakai indeks majemuk, jadi readership terbatas
    //    pada satu akun (atau satu listing) dalam satu jendela - bukan
    //    pemindaian tabel. `take(limit + 1)` berhenti begitu batas terlampaui.
    const recent = userId
      ? await ctx.db
          .query("contactHandoffs")
          .withIndex("byUserCreatedAt", (q) => q.eq("userId", userId))
          .take(limit + 1)
      : await ctx.db
          .query("contactHandoffs")
          .withIndex("byContactRefCreatedAt", (q) => q.eq("contactRef", contactRef))
          .take(limit + 1);

    const expired = recent.filter((row) => row.createdAt < windowStart);
    for (const row of expired) await ctx.db.delete(row._id);
    if (recent.length - expired.length >= limit) {
      throw new Error("Terlalu banyak permintaan kontak baru saja. Coba lagi nanti.");
    }

    const vendor = await ctx.db
      .query("vendors")
      .withIndex("byContactRef", (q) => q.eq("contactRef", contactRef))
      .unique();

    // 2. Listing harus benar-benar tayang. Tanpa ini, `contactRef` yang bocor
    //    (mis. dari tangkapan layar atau log) tetap bisa membuka
    //    membuka nomor listing yang sudah diarsipkan.
    if (!vendor || vendor.status !== "active") {
      throw new Error("Listing ini sudah tidak tersedia.");
    }

    const phone = normalizeWhatsAppPhone(vendor.phone);
    if (!phone) throw new Error("Nomor WhatsApp usaha ini belum valid.");

    await ctx.db.insert("contactHandoffs", {
      ...(userId ? { userId } : {}),
      contactRef,
      createdAt: now,
    });

    // 4. Jejak. Yang dicatat: jenis permintaan dan listing mana. Bukan nomor,
    //    bukan teks pesan.
    await recordEvent(ctx, {
      event: "contact_handoff",
      ...(userId ? { userId } : {}),
      vendorId: vendor._id,
      metadata: { intent: args.intent ?? "general" },
    });

    const message = generateWhatsAppMessage({
      vendorName: vendor.name,
      category: vendor.category,
      landmark: vendor.landmark,
      intent: args.intent,
      reference: args.reference?.slice(0, 120),
    });

    // `telUrl` sengaja ikut dikembalikan, bukan dibiarkan peramban menyusunnya
    // sendiri. schemes `tel:` harus sudah ada sebelum diklik, jadi nomor tetap
    // sampai ke peramban - tapi hanya SESUDAH pengguna menekan tombol, lewat
    // jalur yang sudah dibatasi kuotanya dan tercatat jejaknya. Yang bisa
    // dipanen adalah respons katalog, dan itu tidak lagi memuat nomor.
    return {
      url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      telUrl: `tel:+${phone}`,
    };
  },
});

/**
 * FASE 10 - isi `contactRef` untuk listing yang dibuat sebelum migrasi.
 *
 * Idempoten dan additive: hanya menyentuh listing `active` yang `contactRef`-nya
 * masih kosong, jadi menjalankannya berkali-kali tidak mengubah apa pun dan
 * listing yang sudah punya pegangan tidak pernah kehilangan tautan yang sudah
 * dibagikan orang.
 *
 * Batas kerjanya dipotong per admin batch supaya satu panggilan tidak menulis
 * tak terbatas.
 */
export const backfillContactRefs = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);
    const rows = await ctx.db
      .query("vendors")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .take(limit);
    let updated = 0;
    for (const vendor of rows) {
      if (vendor.contactRef) continue;
      await ctx.db.patch(vendor._id, { contactRef: newContactRef() });
      updated += 1;
    }
    return { scanned: rows.length, updated };
  },
});

export const incrementClick = mutation({
  args: {
    id: v.id("vendors"),
    kind: v.optional(
      v.union(v.literal("whatsapp"), v.literal("share"), v.literal("impression")),
    ),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || current.status !== "active") return;
    const kind = args.kind ?? "whatsapp";
    if (
      await overPublicCounterCeiling(
        ctx,
        kind === "share" ? "share_clicked" : "whatsapp_clicked",
        CLICK_EVENT_HOURLY_LIMIT,
      )
    ) {
      return;
    }
    const key =
      kind === "whatsapp"
        ? "whatsappClicks"
        : kind === "share"
          ? "shareClicks"
          : "searchImpressions";
    await ctx.db.patch(args.id, {
      [key]: (current[key] ?? 0) + 1,
      updatedAt: current.updatedAt,
    });
    if (kind === "whatsapp") {
      await recordEvent(ctx, { event: "whatsapp_clicked", vendorId: args.id });
    } else if (kind === "share") {
      await recordEvent(ctx, { event: "share_clicked", vendorId: args.id });
    }
  },
});

export const recordSearch = mutation({
  args: {
    vendorIds: v.array(v.id("vendors")),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = args.query.trim().slice(0, 120);
    if (normalized.length < 2 || args.vendorIds.length === 0) return 0;
    if (await overPublicCounterCeiling(ctx, "search_impression", SEARCH_EVENT_HOURLY_LIMIT)) return 0;
    const uniqueIds = [...new Set(args.vendorIds)].slice(0, 24);
    const vendors = await Promise.all(
      uniqueIds.map((vendorId) => ctx.db.get(vendorId)),
    );
    await Promise.all(
      vendors
        .filter((vendor) => vendor?.status === "active")
        .map((vendor) =>
          ctx.db.patch(vendor!._id, {
            searchImpressions: (vendor!.searchImpressions ?? 0) + 1,
          }),
        ),
    );
    await Promise.all(
      vendors
        .filter((vendor) => vendor?.status === "active")
        .map((vendor) => recordEvent(ctx, { event: "search_impression", vendorId: vendor!._id, metadata: { queryLength: normalized.length } })),
    );
    return vendors.filter((vendor) => vendor?.status === "active").length;
  },
});

/** Kuota ulasan anonim per listing per 24 jam. */
const ANONYMOUS_REVIEW_DAILY_LIMIT = 3;

/** Berapa ulasan terbaru yang diperiksa untuk menghitung kuota itu. */
const ANONYMOUS_REVIEW_SCAN = 100;

export const addReview = mutation({
  args: {
    vendorId: v.id("vendors"),
    authorName: v.string(),
    rating: v.number(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.status !== "active") throw new Error("Listing tidak ditemukan");
    const authorName = args.authorName.trim();
    const body = args.body.trim();
    if (!authorName || !body) throw new Error("Nama dan ulasan tidak boleh kosong");
    if (body.length > 600) throw new Error("Ulasan maksimal 600 karakter");
    // Rating dibatasi 1-5 DAN harus bilangan bulat. Tanpa pembulatan, `4.7`
    // akan tersimpan dan merusak rata-rata yang tampil di listing.
    //
    // Nilai DI LUAR rentang kini DITOLAK, bukan dijepit ke 1 atau 5. Versi
    // lama memakai `Math.min(5, Math.max(1, rating))`, jadi panggilan `0`
    // diam-diam tersimpan sebagai bintang 1 dan panggilan `99` sebagai bintang
    // 5. UI hanya menawarkan 1-5, jadi tidak ada pengguna sah yang terdampak;
    // yang terpengaruh hanya pemanggil yang mengirim angka tidak masuk akal —
    // dan baginya penolakan yang jujur lebih berguna daripada bintang palsunya.
    if (!Number.isFinite(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new Error("Rating harus antara 1 dan 5");
    }
    const rating = Math.round(args.rating);

    // Satu ulasan per orang per listing. Tanpa ini, satu akun bisa menulis
    // ratusan ulasan dalam semalam dan mengubah rating rata-rata — dan untuk
    // direktori lokal, rating yang bisa dib bought bukan lagi sinyal.
    //
    // Hanya berlaku untuk penulis yang punya akun. Penulis tanpa akun
    // (anonim) tetap boleh menulis — itu model yang sudah berjalan — tapi tidak
    // bisa dihitung per orang, jadi batasnya berupa kuota harian per listing.
    if (userId) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("byVendorAuthor", (q) => q.eq("vendorId", args.vendorId).eq("authorId", userId))
        .first();
      if (existing) throw new Error("Anda sudah menulis ulasan untuk listing ini");
    } else {
      const todayStart = Date.now() - 24 * 60 * 60_000;
      // Hanya ulasan yang BARU yang bisa memenuhi kuota hari ini, jadi cukup
      // membaca ujung terbaru. Versi lama mengoleksi seluruh ulasan listing
      // untuk menghitung tiga baris, sehingga satu listing yang ramai membuat
      // setiap ulasan anonim membaca ribuan dokumen.
      const recentAnonymous = await ctx.db
        .query("reviews")
        .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
        .order("desc")
        .take(ANONYMOUS_REVIEW_SCAN);
      const sameDay = recentAnonymous.filter(
        (row) => !row.authorId && row.createdAt >= todayStart,
      ).length;
      if (sameDay >= ANONYMOUS_REVIEW_DAILY_LIMIT) {
        throw new Error("Terlalu banyak ulasan hari ini untuk listing ini");
      }
    }

    const reviewId = await ctx.db.insert("reviews", {
      vendorId: args.vendorId,
      authorId: userId ?? undefined,
      authorName,
      rating,
      body,
      helpful: 0,
      createdAt: Date.now(),
    });
    const all = await ctx.db
      .query("reviews")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    const average = all.reduce((sum, item) => sum + item.rating, 0) / all.length;
    await ctx.db.patch(args.vendorId, {
      rating: average.toFixed(1),
      reviewsCount: all.length,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      action: "review.created",
      actorId: userId ?? undefined,
      vendorId: args.vendorId,
      entityId: reviewId,
      newValue: rating,
      metadata: { hasAccount: Boolean(userId) },
    });
    return reviewId;
  },
});

export const syncLocalFavorites = mutation({
  args: {
    items: v.array(
      v.object({
        slug: v.string(),
        collection: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const uniqueSlugs = Array.from(
      new Set(args.items.map((item) => item.slug.trim()).filter(Boolean)),
    ).slice(0, 100);
    let imported = 0;

    for (const slug of uniqueSlugs) {
      const vendor = await ctx.db
        .query("vendors")
        .withIndex("bySlug", (q) => q.eq("slug", slug))
        .unique();
      if (!vendor || vendor.status !== "active") continue;
      const existing = await ctx.db
        .query("favorites")
        .withIndex("byUserVendor", (q) =>
          q.eq("userId", userId).eq("vendorId", vendor._id),
        )
        .unique();
      if (existing) continue;
      const requestedCollection = args.items.find(
        (item) => item.slug.trim() === slug,
      )?.collection?.trim();
      await ctx.db.insert("favorites", {
        userId,
        vendorId: vendor._id,
        collection: requestedCollection || "Tersimpan",
        createdAt: Date.now(),
      });
      imported += 1;
    }

    return imported;
  },
});

export const toggleFavorite = mutation({
  args: {
    vendorId: v.id("vendors"),
    collection: v.optional(v.string()),
    saved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.status !== "active") throw new Error("Listing tidak ditemukan");
    const existing = await ctx.db
      .query("favorites")
      .withIndex("byUserVendor", (q) =>
        q.eq("userId", userId).eq("vendorId", args.vendorId),
      )
      .unique();
    const shouldSave = args.saved ?? !existing;
    if (!shouldSave && existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    if (shouldSave && !existing) {
      await ctx.db.insert("favorites", {
        userId,
        vendorId: args.vendorId,
        collection: args.collection?.trim() || "Tersimpan",
        createdAt: Date.now(),
      });
    } else if (shouldSave && existing && args.collection !== undefined) {
      await ctx.db.patch(existing._id, {
        collection: args.collection.trim() || "Tersimpan",
      });
    }
    return shouldSave;
  },
});

export const listFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("favorites")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .collect();
    const favorites = await Promise.all(
      rows.map(async (favorite) => {
        const vendor = await ctx.db.get(favorite.vendorId);
        return vendor
          ? { vendorId: favorite.vendorId, slug: vendor.slug, collection: favorite.collection ?? "Tersimpan", createdAt: favorite.createdAt }
          : null;
      }),
    );
    return favorites.filter((favorite): favorite is NonNullable<typeof favorite> => favorite !== null);
  },
});

export const setFavoriteCollection = mutation({
  args: {
    vendorId: v.id("vendors"),
    collection: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("favorites")
      .withIndex("byUserVendor", (q) => q.eq("userId", userId).eq("vendorId", args.vendorId))
      .unique();
    if (!existing) throw new Error("Simpan listing sebelum memilih koleksi");
    await ctx.db.patch(existing._id, { collection: args.collection.trim() || "Tersimpan" });
    return existing._id;
  },
});

/**
 * FASE 9.1 - F-12: batas laju untuk masukan warga.
 *
 * SEBELUM PERBAIKAN INI, `submitFeedback` tidak punya gerbang apa pun: siapa pun,
 * dengan atau tanpa sesi, bisa menulis baris `notifications` sebanyak pun. Satu
 * skrip sederhana cukup mengisi tabel yang menyimpan masukan warga - membakar
 * kuota fungsi, memperlambat panel moderasi, dan membuat data pengirim nyata
 * jadi tercemar.
 *
 * IDENTITASNYA DIAMBIL DARI SISI SERVER, tidak pernah dari klien. Ini jawaban
 * langsung atas syarat "penghitung tidak boleh bisa dilewati dengan mengubah
 * pengenal dari klien": fungsi ini tidak menerima APA PUN id dari pemanggil, jadi
 * tidak ada yang bisa dipalsukan, dihapus, atau dirotasi untuk memulai ulang
 * hitungan. Dua lapis batas, keduanya bounded:
 *
 *  1. Per akun. Berlaku kalau pemanggil benar-benar punya baris `users` -
 *     persis seperti pembeda yang dipakai `storage.recordUploadedBlob` untuk
 *     membedakan akun nyata dari identitas anonim Convex Auth. Satu pembacaan
 *     pada indeks `byUser` dengan `.take(limit + 1)`.
 *  2. Plafon global. Untuk pengunjung tanpa akun, dan sebagai jaring
 *     pengaman kalau banyak akun dipakai bergantian. Satu pembacaan pada
 *     indeks `byKindCreatedAt` (kind, createdAt) dalam rentang satu jam.
 *
 * ANGKANYA mengikuti pemakaian nyata, bukan angka kecil asal: seorang warga
 * menulis paling banyak satu atau dua masukan, jadi lima per jam per akun
 * tidak menyentuh alur sah, sementara satu skrip yang mengetik ribuan kali
 * berhenti di ambang pertama.
 *
 * PESAN PENOLAKAN memakai `denied()` supaya tidak pernah jadi "Server Error"
 * yang memuat stack trace dan path sumber ke pemanggil anonim.
 */
export const FEEDBACK_PER_ACCOUNT_HOURLY_LIMIT = 5;
export const FEEDBACK_GLOBAL_HOURLY_LIMIT = 200;
const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;
const MAX_FEEDBACK_TITLE = 160;
const MAX_FEEDBACK_BODY = 2_000;
const MAX_FEEDBACK_EMAIL = 200;

const countAccountFeedback = async (
  ctx: GenericMutationCtx<DataModel>,
  userId: DataModel["users"]["document"]["_id"],
  windowStart: number,
) => {
  const recent = await ctx.db
    .query("notifications")
    .withIndex("byUser", (q) => q.eq("userId", userId))
    .filter((q) => q.and(q.eq(q.field("kind"), "feedback"), q.gte(q.field("createdAt"), windowStart)))
    .take(FEEDBACK_PER_ACCOUNT_HOURLY_LIMIT + 1);
  return recent.length;
};

const countGlobalFeedback = async (
  ctx: GenericMutationCtx<DataModel>,
  windowStart: number,
) => {
  const recent = await ctx.db
    .query("notifications")
    .withIndex("byKindCreatedAt", (q) =>
      q.eq("kind", "feedback").gte("createdAt", windowStart),
    )
    .take(FEEDBACK_GLOBAL_HOURLY_LIMIT + 1);
  return recent.length;
};

export const submitFeedback = mutation({
  args: { email: v.optional(v.string()), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    // `getAuthUserId` juga mengembalikan id untuk penyedia Anonymous Convex Auth,
    // jadi "punya sesi" bukan berarti "punya akun". Baris `users` adalah bukti
    // akun yang benar-benar ada - sumber yang sama dengan yang dipakai
    // `recordUploadedBlob`.
    const account = userId ? await ctx.db.get(userId) : null;

    // Batas isi dulu, sebelum batas laju: payload 10 MB sudah harus ditolak
    // berdasarkan isinya, bukan berdasarkan siapa yang mengirimnya.
    const title = args.title.trim();
    const body = args.body.trim();
    if (title.length < 3 || title.length > MAX_FEEDBACK_TITLE) {
      denied(`Judul masukan harus 3-${MAX_FEEDBACK_TITLE} karakter`);
    }
    if (body.length < 10 || body.length > MAX_FEEDBACK_BODY) {
      denied(`Isi masukan harus 10-${MAX_FEEDBACK_BODY} karakter`);
    }
    const email = args.email?.trim().slice(0, MAX_FEEDBACK_EMAIL) || undefined;

    const windowStart = Date.now() - FEEDBACK_WINDOW_MS;
    if (account) {
      if ((await countAccountFeedback(ctx, account._id, windowStart)) >= FEEDBACK_PER_ACCOUNT_HOURLY_LIMIT) {
        denied("Terlalu banyak masukan terkirim. Coba lagi satu jam lagi.");
      }
    }
    if ((await countGlobalFeedback(ctx, windowStart)) >= FEEDBACK_GLOBAL_HOURLY_LIMIT) {
      denied("Terlalu banyak masukan terkirim. Coba lagi sebentar lagi.");
    }

    return await ctx.db.insert("notifications", {
      userId: account?._id,
      email,
      kind: "feedback",
      title,
      body,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const setSubscription = mutation({
  args: {
    vendorId: v.id("vendors"),
    tier: v.union(v.literal("free"), v.literal("featured"), v.literal("premium")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    await ctx.db.patch(args.vendorId, {
      subscriptionTier: args.tier,
      featured: args.tier !== "free",
      updatedAt: Date.now(),
    });
  },
});
