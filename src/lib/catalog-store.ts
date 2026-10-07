import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useConvex, useMutation, useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Vendor } from "./catalog";
import { enqueueOfflineMutation, flushOfflineQueue, registerOfflineHandlers } from "./offline-queue";
import { uploadWithDedup } from "./image-upload";
import { useErrorReporter, withErrorReporting } from "./error-reporter";
import type { RegisteredReporter } from "./error-report-bus";
import { ERROR_CODES, type ErrorCode, type ErrorKind } from "./error-reporting";

export type VendorReview = {
  _id: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: number;
  // Hak jawab pemilik (`vendors:replyReview`): satu balasan per ulasan,
  // panggil ulang = edit. Opsional supaya ulasan lama tetap valid.
  reply?: { body: string; createdAt: number; updatedAt?: number };
};

export type VendorRecord = Vendor & {
  _id: string;
  _creationTime: number;
  /**
   * Wajib di sini, opsional di `Vendor`.
   *
   * `VendorRecord` hanya dibentuk dari `vendors:listForOwner` dan
   * `vendors:listForAdmin`, yang keduanya mengembalikan dokumen listing utuh
   * kepada pemiliknya sendiri atau pengelola. Katalog publik tidak pernah
   * membentuk tipe ini - jadi mewajibkan `phone` justru memperkuat pemisahan
   * itu: kalau suatu saat listing publik bocor ke jalur pemilik, build gagal
   * alih-alih diam-diam mengirim nomor mentah ke anonim.
   */
  phone: string;
  status: "draft" | "active" | "archived";
  featured?: boolean;
  verified?: boolean;
  reviewsCount?: number;
  whatsappClicks?: number;
  shareClicks?: number;
  searchImpressions?: number;
  updatedAt: number;
  createdAt: number;
  reviewItems?: VendorReview[];
};

export type ServiceRequest = {
  _id: string;
  //
  // FASE 3: `requesterId` SENGAJA tidak ada di sini lagi.
  //
  // Pengenal akun internal tidak pernah dikirim server ke papan publik, jadi
  // menaruhnya di tipe klien hanya menciptakan field yang selalu `undefined`
  // dan mengundang kode baru untuk memakainya. Yang dipakai UI sekarang
  // adalah tiga kemampuan yang dihitung server.
  //
  // `isMine`    - permintaan ini dibuat oleh pengguna yang sedang masuk
  // `canManage` - pengguna boleh mengubah statusnya (pemilik atau pengelola)
  // `canOffer`  - pengguna boleh mengirim tawaran; ini PETUNJUK TAMPILAN,
  //               otorisasi sebenarnya tetap di mutation `claimRequest`.
  isMine?: boolean;
  canManage?: boolean;
  canOffer?: boolean;
  requesterName: string;
  title: string;
  description: string;
  category: Vendor["category"];
  landmark: string;
  budget?: string;
  neededAt?: number;
  status: "open" | "claimed" | "completed" | "cancelled" | "expired";
  vendorId?: string;
  vendorName?: string;
  offers?: RequestOffer[];
  createdAt: number;
  updatedAt: number;
};

export type ListingClaim = {
  _id: string;
  vendorId: string;
  requesterId: string;
  whatsappPhone: string;
  email: string;
  businessAddress: string;
  evidenceStorageId?: string;
  evidenceUrl?: string;
  status: "pending" | "verified" | "rejected";
  reviewNote?: string;
  reviewedAt?: number;
  createdAt: number;
  vendorName?: string;
  requesterName?: string;
  requesterEmail?: string;
};

export type RequestOffer = {
  _id: string;
  requestId: string;
  vendorId: string;
  // FASE 3: `offeredBy` diganti `isMine`. Pengenal akun penawar tidak lagi
  // meninggalkan server; yang dibutuhkan klien hanya "ini tawaran saya atau
  // bukan", dan itu dijawab satu boolean.
  isMine?: boolean;
  vendorName?: string;
  message?: string;
  status: "offered" | "accepted" | "withdrawn" | "expired";
  createdAt: number;
  updatedAt: number;
};

export type OwnerRequest = ServiceRequest & {
  vendorMatches: Array<{ vendorId: string; name: string; distanceKm?: number; responseMinutes?: number }>;
  offers: RequestOffer[];
};

export type VendorPackage = {
  _id: string;
  vendorId: string;
  name: string;
  description: string;
  price: string;
  duration?: string;
  area?: string;
  active?: boolean;
};

export type VendorInteraction = {
  _id: string;
  vendorId: string;
  vendorName: string;
  vendorSlug?: string;
  kind: "whatsapp" | "share" | "call" | "view" | "request";
  status: "opened" | "waiting" | "completed" | "dismissed";
  note?: string;
  createdAt: number;
  updatedAt: number;
};

export type NotificationItem = {
  _id: string;
  kind: string;
  title: string;
  body: string;
  read?: boolean;
  createdAt: number;
};

export type NotificationPreferences = {
  whatsappUpdates: boolean;
  areaUpdates: boolean;
  requestUpdates: boolean;
};

const STORAGE_KEY = "sumenep-buku-kerja-favorites";
const COLLECTION_STORAGE_KEY = "sumenep-buku-kerja-favorite-collections";
const CATALOG_SNAPSHOT_KEY = "sumenep-buku-kerja-catalog-snapshot";
const CATALOG_SNAPSHOT_EVENT = "sumenep-catalog-snapshot-updated";

type LocalCollections = Record<string, string>;

function readCatalogSnapshot(): Vendor[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(CATALOG_SNAPSHOT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is Vendor => Boolean(item && typeof item.slug === "string")) : [];
  } catch {
    return [];
  }
}

function persistCatalogSnapshot(vendors: Vendor[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CATALOG_SNAPSHOT_KEY, JSON.stringify(vendors.slice(0, 500)));
  } catch {
    // A storage quota error must not block the live catalog.
  }
  window.dispatchEvent(new Event(CATALOG_SNAPSHOT_EVENT));
}

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readLocalCollections(): LocalCollections {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(COLLECTION_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([slug, collection]) => typeof slug === "string" && typeof collection === "string"),
    ) as LocalCollections;
  } catch {
    return {};
  }
}

function persistFavorites(slugs: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // A blocked storage API must not prevent browsing or contacting a vendor.
  }
  window.dispatchEvent(new Event("sumenep-favorites-updated"));
}

function persistCollections(collections: LocalCollections) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collections));
  } catch {
    // Collection labels are a convenience; losing them must not break favorites.
  }
}

/**
 * Katalog yang dibaca di sini SELALU berasal dari server.
 *
 * Dulu fungsi ini memanggil `vendors:ensureCatalogSeeded` sendiri begitu tab
 * pertama dibuka. Akibatnya pengunjung pertama diam-diam mengisi tabel produksi
 * dengan enam listing contoh dari `lib/catalog.ts`: usaha fiktif yang lalu
 * tayang sebagai listing publik aktif, lengkap dengan jalur WhatsApp-nya.
 * Penulisannya memang idempoten sehingga tidak merusak data, tapi "aman"
 * bukan berarti benar - situs publik tidak boleh mengiklankan usaha yang tidak
 * pernah ada.
 *
 * Pengisian katalog kini keputusan eksplisit operator, bukan efek samping
 * membuka halaman: `npx convex run vendors:ensureCatalogSeeded --prod`.
 * Mutasinya tetap ada dan tetap idempoten; hanya pemanggil otomatisnya yang
 * dicabut.
 */
function useCatalogRemote() {
  const remote = useQuery(api.vendors.listActive, {});

  useEffect(() => {
    if (remote === undefined || remote.length === 0) return;
    persistCatalogSnapshot(remote as Vendor[]);
    const urls = ["/", ...remote.slice(0, 60).map((vendor) => `/v/${vendor.slug}`)];
    navigator.serviceWorker?.controller?.postMessage({ type: "CACHE_URLS", urls });
  }, [remote]);

  return remote;
}

export function useCatalogSeedBootstrap() {
  return useCatalogRemote();
}

export function useCatalogVendors() {
  const remote = useCatalogRemote();
  const [, setSnapshotRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setSnapshotRevision((revision) => revision + 1);
    window.addEventListener(CATALOG_SNAPSHOT_EVENT, refresh);
    return () => window.removeEventListener(CATALOG_SNAPSHOT_EVENT, refresh);
  }, []);
  // `remote` yang sudah menjawab apa adanya itu kebenaran, termasuk ketika
  // jawabannya array kosong. Snapshot lokal hanya dipakai saat server belum
  // menjawab atau perangkat sedang luring, karena isinya data yang benar-benar
  // pernah diambil dari server - bukan karangan.
  if (remote) return remote as Vendor[];
  return readCatalogSnapshot();
}

export function useVendor(slug: string | undefined) {
  const remote = useQuery(api.vendors.getBySlug, { slug: slug ?? "" });

  if (remote === undefined) {
    const local = readCatalogSnapshot().find((item) => item.slug === slug);
    return local ? { ...local, reviewItems: [] } : undefined;
  }
  if (remote === null) return null;

  const { reviews, ...vendor } = remote;
  return {
    ...vendor,
    reviews: vendor.reviewsCount ?? reviews.length,
    reviewItems: reviews,
  } as Vendor;
}

function useStoredFavorites() {
  const [local, setLocal] = useState<string[]>(readFavorites);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [collections, setCollections] = useState<LocalCollections>(readLocalCollections);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      setLocal(readFavorites());
      setCollections(readLocalCollections());
    };
    window.addEventListener("sumenep-favorites-updated", sync);
    window.addEventListener("sumenep-favorite-collections-updated", sync);
    return () => {
      window.removeEventListener("sumenep-favorites-updated", sync);
      window.removeEventListener("sumenep-favorite-collections-updated", sync);
    };
  }, []);

  const setLocalSaved = (slug: string, saved: boolean) => {
    if (local.includes(slug) === saved) return;
    const next = saved
      ? Array.from(new Set([...local, slug]))
      : local.filter((item) => item !== slug);
    persistFavorites(next);
    setLocal(next);

    if (!saved) {
      setCollections((currentCollections) => {
        if (!(slug in currentCollections)) return currentCollections;
        const nextCollections = { ...currentCollections };
        delete nextCollections[slug];
        persistCollections(nextCollections);
        window.dispatchEvent(new Event("sumenep-favorite-collections-updated"));
        return nextCollections;
      });
    }
  };

  const setLocalCollection = (slug: string, collection: string) => {
    setCollections((current) => {
      const next = { ...current, [slug]: collection || "Tersimpan" };
      persistCollections(next);
      window.dispatchEvent(new Event("sumenep-favorite-collections-updated"));
      return next;
    });
  };

  const clearLocal = useCallback((slugsToClear: string[]) => {
    const cleared = new Set(slugsToClear);
    setLocal((current) => {
      const next = current.filter((slug) => !cleared.has(slug));
      if (next.length === current.length) return current;
      persistFavorites(next);
      return next;
    });
    setCollections((currentCollections) => {
      const nextCollections = { ...currentCollections };
      let changed = false;
      slugsToClear.forEach((slug) => {
        if (slug in nextCollections) {
          delete nextCollections[slug];
          changed = true;
        }
      });
      if (!changed) return currentCollections;
      persistCollections(nextCollections);
      window.dispatchEvent(new Event("sumenep-favorite-collections-updated"));
      return nextCollections;
    });
  }, []);

  return { local, collections, online, setLocalSaved, setLocalCollection, clearLocal } as const;
}

export function useVendorPhoto(photoId: string | undefined) {
  return useQuery(api.vendors.getImageUrl, { storageId: photoId ?? "" });
}

export function useVendorPhotos(vendorId: string | undefined) {
  return useQuery(
    api.community.listVendorPhotos,
    vendorId ? { vendorId: vendorId as never } : "skip",
  );
}

export function useFavorites() {
  const { isAuthenticated } = useConvexAuth();
  const remote = useQuery(api.vendors.listFavorites, {});
  const favorite = useMutation(api.vendors.toggleFavorite);
  const syncLocalFavorites = useMutation(api.vendors.syncLocalFavorites);
  const {
    local,
    collections: localCollections,
    online,
    setLocalSaved,
    setLocalCollection,
    clearLocal,
  } = useStoredFavorites();
  const attemptedSync = useRef(new Set<string>());
  const remoteLoaded = remote !== undefined;
  const remoteSlugs = useMemo(
    () => new Set(remote?.map((item) => item.slug) ?? []),
    [remote],
  );
  const remoteCollections = useMemo(
    () =>
      new Map(
        remote?.map((item) => [item.slug, item.collection ?? "Tersimpan"]) ?? [],
      ),
    [remote],
  );
  const slugs = new Set(
    isAuthenticated && remoteLoaded
      ? remote?.map((item) => item.slug) ?? []
      : local,
  );
  const pendingLocalItems = useMemo(
    () =>
      isAuthenticated && remoteLoaded
        ? local
            .filter((slug) => !remoteSlugs.has(slug))
            .map((slug) => ({
              slug,
              collection: localCollections[slug] ?? "Tersimpan",
            }))
        : [],
    [isAuthenticated, local, localCollections, remoteLoaded, remoteSlugs],
  );
  const pendingSyncKey = pendingLocalItems
    .map((item) => `${item.slug}:${item.collection}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!isAuthenticated || !online) return;
    const handlers = {
      favorite: async (payload: Record<string, unknown>) => {
        if (typeof payload.vendorId !== "string") return;
        await favorite({
          vendorId: payload.vendorId as never,
          saved: payload.saved !== false,
          collection: typeof payload.collection === "string" ? payload.collection : undefined,
        });
      },
    };
    registerOfflineHandlers(handlers);
    void flushOfflineQueue(handlers);
  }, [favorite, isAuthenticated, online]);

  useEffect(() => {
    if (!pendingSyncKey || !online || attemptedSync.current.has(pendingSyncKey)) return;
    attemptedSync.current.add(pendingSyncKey);
    const items = pendingLocalItems.slice(0, 100);
    void syncLocalFavorites({ items })
      .then(() => clearLocal(items.map((item) => item.slug)))
      .catch(() => attemptedSync.current.delete(pendingSyncKey));
  }, [clearLocal, online, pendingLocalItems, pendingSyncKey, syncLocalFavorites]);

  const save = (slug: string, vendorId?: string, collection = "Tersimpan") => {
    const shouldSave = !slugs.has(slug);
    if (!isAuthenticated || !vendorId) {
      setLocalSaved(slug, shouldSave);
      if (shouldSave && collection !== "Tersimpan") setLocalCollection(slug, collection);
      return;
    }
    setLocalSaved(slug, shouldSave);
    if (shouldSave && collection !== "Tersimpan") setLocalCollection(slug, collection);
    void favorite({
      vendorId: vendorId as never,
      collection,
      saved: shouldSave,
    }).catch(() => {
      enqueueOfflineMutation("favorite", { vendorId, collection, saved: shouldSave });
    });
  };

  const setCollection = (slug: string, vendorId: string | undefined, collection: string) => {
    setLocalSaved(slug, true);
    setLocalCollection(slug, collection);
    if (!isAuthenticated || !vendorId) return;
    void favorite({
      vendorId: vendorId as never,
      collection,
      saved: true,
    }).catch(() => {
      enqueueOfflineMutation("favorite", { vendorId, collection, saved: true });
    });
  };

  return {
    slugs,
    isSaved: (slug: string) => slugs.has(slug),
    local,
    save,
    collectionFor: (slug: string) => remoteCollections.get(slug) ?? localCollections[slug] ?? "Tersimpan",
    setCollection,
  };
}

/**
 * Peta pelaporan per aksi.
 *
 * Ini satu-satunya tempat yang tahu fitur mana milik operasi mana, jadi
 * laporan di panel pengelola bisa dibaca tanpa menebak. Aksi yang tidak
 * ada di sini tetap berjalan tanpa pelaporan -- lebih baik dilaporkan
 * sebagai `operation` generik daripada tidak sama sekali.
 *
 * `kind` menentukan apakah kegagalan layak membangunkan admin:
 * `validation` dan `permission` tidak pernah didukung.
 */
type ActionReportContext = {
  feature: string;
  operation: string;
  kind?: ErrorKind;
  code?: ErrorCode;
};

const ACTION_REPORT_CONTEXT: Record<string, ActionReportContext> = {
  create: { feature: "Listing Management", operation: "vendors.createVendor" },
  update: { feature: "Listing Management", operation: "vendors.updateVendor" },
  archive: { feature: "Listing Management", operation: "vendors.archiveVendor" },
  click: { feature: "Analytics", operation: "vendors.incrementClick", kind: "operation" },
  recordSearch: { feature: "Catalog Search", operation: "vendors.recordSearch" },
  favorite: { feature: "Saved Listings", operation: "vendors.toggleFavorite" },
  syncLocalFavorites: { feature: "Saved Listings", operation: "vendors.syncLocalFavorites" },
  review: { feature: "Reviews", operation: "vendors.addReview" },
  feedback: { feature: "Catalog Feedback", operation: "vendors.submitFeedback" },
  subscription: { feature: "Listing Subscription", operation: "vendors.setSubscription" },
  generateUploadUrl: { feature: "File Upload", operation: "vendors.generateUploadUrl", code: ERROR_CODES.storage },
  availability: { feature: "Availability", operation: "community.updateAvailability" },
  interaction: { feature: "Interaction History", operation: "community.recordInteraction" },
  updateInteraction: { feature: "Interaction History", operation: "community.updateInteraction" },
  createRequest: { feature: "Community Requests", operation: "community.createRequest" },
  claimRequest: { feature: "Community Requests", operation: "community.claimRequest" },
  updateRequest: { feature: "Community Requests", operation: "community.updateRequestStatus" },
  createPackage: { feature: "Packages", operation: "community.createPackage" },
  updatePackage: { feature: "Packages", operation: "community.updatePackage" },
  removePackage: { feature: "Packages", operation: "community.removePackage" },
  markNotificationsRead: { feature: "Notifications", operation: "community.markNotificationsRead" },
  setNotificationPreferences: {
    feature: "WhatsApp Notification Settings",
    operation: "community.setNotificationPreferences",
  },
  createReport: { feature: "Listing Reports", operation: "community.createReport" },
  updateReport: { feature: "Listing Reports", operation: "community.updateReport" },
  moderatePhoto: { feature: "Photo Moderation", operation: "community.moderateVendorPhoto" },
  createPhoto: { feature: "File Upload", operation: "community.createVendorPhoto", code: ERROR_CODES.storage },
  removePhoto: { feature: "Photo Moderation", operation: "community.removeVendorPhoto" },
  submitClaim: { feature: "Listing Claim", operation: "claims.claimVendorListing" },
  reviewClaim: { feature: "Claim Moderation", operation: "claims.reviewVendorClaim" },
  offerRequest: { feature: "Request Offers", operation: "offers.offerRequest" },
  acceptOffer: { feature: "Request Offers", operation: "offers.acceptRequestOffer" },
  withdrawOffer: { feature: "Request Offers", operation: "offers.withdrawRequestOffer" },
  reopenRequest: { feature: "Community Requests", operation: "community.reopenRequest" },
  track: { feature: "Analytics", operation: "analytics.track" },
  sendTestWhatsapp: {
    feature: "WhatsApp Notification Settings",
    operation: "whatsapp.sendTestWhatsapp",
    kind: "integration",
    code: ERROR_CODES.whatsappSend,
  },
  markWhatsappThreadRead: {
    feature: "WhatsApp Notification Settings",
    operation: "whatsapp.markWhatsappThreadRead",
  },
};

type AnyAction = (args: never) => Promise<unknown>;

/**
 * Bungkus sekumpulan aksi Convex dengan pelaporan error.
 *
 * Error asli diteruskan tanpa perubahan, jadi setiap komponen yang sudah
 * punya penanganan error sendiri tetap bekerja persis seperti sebelumnya.
 * Yang ditambahkan hanya satu lapis pelaporan di sampingnya.
 */
const reportActions = <T extends Record<string, AnyAction>>(
  reporter: RegisteredReporter,
  actions: T,
): T => {
  const output: Record<string, unknown> = {};
  for (const [name, action] of Object.entries(actions)) {
    const context = ACTION_REPORT_CONTEXT[name];
    output[name] = context
      ? withErrorReporting(reporter, context.operation, action, context)
      : action;
  }
  return output as T;
};

export function useCatalogActions() {
  const create = useMutation(api.vendors.createVendor);
  const update = useMutation(api.vendors.updateVendor);
  const archive = useMutation(api.vendors.archiveVendor);
  const click = useMutation(api.vendors.incrementClick);
  const recordSearch = useMutation(api.vendors.recordSearch);
  const favorite = useMutation(api.vendors.toggleFavorite);
  const syncLocalFavorites = useMutation(api.vendors.syncLocalFavorites);
  const review = useMutation(api.vendors.addReview);
  const feedback = useMutation(api.vendors.submitFeedback);
  const subscription = useMutation(api.vendors.setSubscription);
  const generateUploadUrl = useMutation(api.vendors.generateUploadUrl);
  const availability = useMutation(api.community.updateAvailability);
  const interaction = useMutation(api.community.recordInteraction);
  const updateInteraction = useMutation(api.community.updateInteraction);
  const createRequest = useMutation(api.community.createRequest);
  const claimRequest = useMutation(api.community.claimRequest);
  const updateRequest = useMutation(api.community.updateRequestStatus);
  const createPackage = useMutation(api.community.createPackage);
  const updatePackage = useMutation(api.community.updatePackage);
  const removePackage = useMutation(api.community.removePackage);
  const markNotificationsRead = useMutation(api.community.markNotificationsRead);
  const setNotificationPreferences = useMutation(api.community.setNotificationPreferences);
  const createReport = useMutation(api.community.createReport);
  const updateReport = useMutation(api.community.updateReport);
  const moderatePhoto = useMutation(api.community.moderateVendorPhoto);
  const createPhoto = useMutation(api.community.createVendorPhoto);
  const removePhoto = useMutation(api.community.removeVendorPhoto);
  const submitClaim = useMutation(api.claims.claimVendorListing);
  const reviewClaim = useMutation(api.claims.reviewVendorClaim);
  const offerRequest = useMutation(api.offers.offerRequest);
  const acceptOffer = useMutation(api.offers.acceptRequestOffer);
  const withdrawOffer = useMutation(api.offers.withdrawOffer);
  const reopenRequest = useMutation(api.community.reopenRequest);
  const track = useMutation(api.analytics.track);
  const sendTestWhatsapp = useAction(api.whatsapp.sendTestWhatsapp);
  const markWhatsappThreadRead = useMutation(api.whatsapp.markWhatsappThreadRead);
  return reportActions(useErrorReporter(), {
    create,
    update,
    archive,
    click,
    recordSearch,
    favorite,
    syncLocalFavorites,
    review,
    feedback,
    subscription,
    generateUploadUrl,
    availability,
    interaction,
    updateInteraction,
    createRequest,
    claimRequest,
    updateRequest,
    createPackage,
    updatePackage,
    removePackage,
    markNotificationsRead,
    setNotificationPreferences,
    createReport,
    updateReport,
    moderatePhoto,
    createPhoto,
    removePhoto,
    submitClaim,
    reviewClaim,
    offerRequest,
    acceptOffer,
    withdrawOffer,
    reopenRequest,
    track,
    sendTestWhatsapp,
    markWhatsappThreadRead,
  });
}

export function useServiceRequests(args: {
  status?: "open" | "claimed" | "completed" | "cancelled" | "expired";
  landmark?: string;
  category?: Vendor["category"];
  search?: string;
  limit?: number;
  mine?: boolean;
} = {}) {
  return useQuery(api.community.listRequests, args);
}

export function useVendorPackages(vendorId?: string) {
  return useQuery(api.community.listPackages, vendorId ? { vendorId: vendorId as never } : {});
}

export function useMyInteractions() {
  return useQuery(api.community.listInteractions, {});
}

export function useNotifications() {
  return useQuery(api.community.listNotifications, {});
}

export function useNotificationPreferences() {
  return useQuery(api.community.getNotificationPreferences, {});
}

/**
 * Nama tampilan publik milik pengguna yang sedang masuk.
 *
 * FASE 9.2 - F-05. Nama ini yang muncul di papan permintaan publik. Ia bukan
 * nama akun: `users.name` milik Convex Auth dan dipakai panel admin, jadi
 * menimpanya akan mengubah tiga alur lain tanpa disengaja.
 */
export function useMyDisplayName() {
  return useQuery(api.users.myDisplayName, {});
}

/**
 * Menyimpan tebakan turunan sekali, lalu menerima koreksi pengguna.
 *
 * `ensure` dipanggil sekali setelah masuk supaya nama stabil; `set` hanya
 * dipanggil saat pengguna benar-benar menekan tombol simpan. Keduanya
 * dipisah karena `ensure` idempoten (aman dipanggil ulang) sedangkan `set`
 * tidak - memanggil `set` diam-diam akan menimpa koreksi.
 */
export function useDisplayNameActions() {
  const ensure = useMutation(api.users.ensureMyDisplayName);
  const set = useMutation(api.users.setMyDisplayName);
  return {
    ensureDisplayName: ensure,
    setDisplayName: set,
  };
}

export function useWhatsappStatus() {
  return useQuery(api.whatsapp.getWhatsappStatus, {});
}

/**
 * Pratinjau tautan handoff WhatsApp untuk admin.
 *
 * Query melempar untuk akun biasa, jadi komponen yang memakainya hanya boleh
 * dirender di dalam ruang admin. Yang dikembalikan adalah tautan `wa.me`,
 * ringkasan harian, dan nomor tujuan dalam bentuk tersamar - bukan bukti
 * pengiriman apa pun. Buka `src/lib/admin-whatsapp.ts` untuk batas buktinya.
 */
export function useAdminHandoffPreview() {
  return useQuery(api.whatsapp.adminHandoffPreview, {});
}

export function useMyClaims() {
  return useQuery(api.claims.listMyClaims, {});
}

export function useCommunityMetrics() {
  return useQuery(api.community.listCommunityMetrics, {});
}

export function useCurrentAccess() {
  return useQuery(api.users.currentAccess, {});
}

/* ------------------------------------------------------------------ */
/* Laporan error (khusus panel pengelola)                              */
/* ------------------------------------------------------------------ */

/**
 * Query laporan error melempar untuk akun biasa -- inilah yang membuat
 * `useQuery` di panel admin jatuh ke error boundary kalau bukan pengelola.
 */
export function useErrorReports(status?: "open" | "acknowledged" | "resolved" | "ignored") {
  return useQuery(api.errorReports.listErrorReports, status ? { status } : {});
}

export type AdminErrorReport = NonNullable<ReturnType<typeof useErrorReports>>[number];

export function useErrorReportSummary() {
  return useQuery(api.errorReports.errorReportSummary, {});
}

export function useErrorReportActions() {
  const setErrorReportStatus = useMutation(api.errorReports.setErrorReportStatus);
  const deleteErrorReport = useMutation(api.errorReports.deleteErrorReport);
  const setStatus = useCallback(
    (id: string, status: "open" | "acknowledged" | "resolved" | "ignored") =>
      setErrorReportStatus({ id: id as never, status }),
    [setErrorReportStatus],
  );
  const remove = useCallback(
    (id: string) => deleteErrorReport({ id: id as never }),
    [deleteErrorReport],
  );
  return { setStatus, remove };
}

export function useOpenReports() {
  return useQuery(api.community.listReports, {});
}

export function useVendorReports() {
  return useQuery(api.community.listMyVendorReports, {});
}

export function useOwnerVendors() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.vendors.listForOwner, isAuthenticated ? {} : "skip") as VendorRecord[] | undefined;
}

export function useAdminVendors(status?: "draft" | "active" | "archived") {
  return useQuery(
    api.vendors.listForAdmin,
    status ? { status } : {},
  ) as VendorRecord[] | undefined;
}

export function useVendorClaims(vendorId: string | undefined) {
  return useQuery(
    api.claims.listVendorClaims,
    vendorId ? { vendorId: vendorId as never } : "skip",
  ) as ListingClaim[] | undefined;
}

export function usePendingClaims(enabled = true) {
  return useQuery(api.claims.listPendingClaims, enabled ? {} : "skip") as ListingClaim[] | undefined;
}

export function useStaffMembers(enabled = true) {
  return useQuery(api.users.listStaff, enabled ? {} : "skip");
}

export function useStaffInvites(enabled = true) {
  return useQuery(api.users.listStaffInvites, enabled ? {} : "skip");
}

export function useAuditLogs() {
  return useQuery(api.users.listAuditLogs, { limit: 80 });
}

export function useAnalyticsMetrics() {
  return useQuery(api.analytics.adminMetrics, {});
}

export function useOwnerRequests() {
  return useQuery(api.offers.listOwnerRequests, {}) as OwnerRequest[] | undefined;
}

export function useMatchingRequests(vendorId?: string) {
  return useQuery(
    api.offers.listMatchingRequests,
    vendorId ? { vendorId: vendorId as never } : {},
  ) as OwnerRequest[] | undefined;
}

export function useRequestOffers(requestId: string | undefined) {
  return useQuery(
    api.offers.listRequestOffers,
    requestId ? { requestId: requestId as never } : "skip",
  );
}

export function usePhotosForModeration(enabled = true) {
  return useQuery(api.community.listPhotosForModeration, enabled ? {} : "skip");
}

export function useListingHistory(vendorId: string | undefined) {
  return useQuery(
    api.users.listListingHistory,
    vendorId ? { vendorId: vendorId as never } : "skip",
  );
}

export function useRecentListingHistory(enabled = true) {
  return useQuery(api.users.listRecentListingHistory, enabled ? { limit: 40 } : "skip");
}

/**
 * Unggah foto lewat SATU alur: perkecil bila perlu, cek peta blob, unggah hanya
 * bila benar-benar baru.
 *
 * Hook ini ada supaya tidak ada komponen yang menyusun sendiri rangkaian
 * `fetch(uploadUrl)` + `recordUploadedBlob`; setiap jalur unggah yang ditulis
 * ulang adalah satu jalur yang lupa downscale atau lupa dedup. Argumen
 * `generateUploadUrl` diteruskan dari hook pemanggil karena tiap domain punya
 * gerbang sendiri (foto listing butuh pemilik listing, bukti klaim
 * butuh akun warga).
 *
 * Peta blob dibaca lewat client (`useConvex`) bukan `useQuery`, karena sha256
 * baru diketahui setelah berkas dipilih — subscribing ke hook reaktif untuk
 * nilai yang sudah lewat akan membuat satu render sia-sia per pilihan berkas.
 */
export function useImageUpload() {
  const convex = useConvex();
  const record = useMutation(api.storage.recordUploadedBlob);
  return async (
    file: File,
    generateUploadUrl: () => Promise<string>,
  ): Promise<{
    storageId: string;
    reused: boolean;
    resized: boolean;
    beforeBytes: number;
    afterBytes: number;
  }> =>
    uploadWithDedup(file, {
      lookup: async ({ sha256 }) => {
        const found = await convex.query(api.storage.lookupBlobBySha, { sha256 });
        return found ? { storageId: found.storageId } : null;
      },
      record: async (args) => {
        await record(args);
      },
      generateUploadUrl,
    });
}

export function useAdminSecurityEvents(limit = 25, cursor?: string, enabled = true) {
  return useQuery(
    api.adminGate.listAdminSecurityEvents,
    enabled ? { limit, cursor: cursor ?? undefined } : "skip",
  );
}

/** Ringkasan jendela waktu untuk strip pembuka panel audit keamanan. */
export function useAdminSecuritySummary(windowHours = 24, enabled = true) {
  return useQuery(api.adminGate.adminSecuritySummary, enabled ? { windowHours } : "skip");
}

/** "Aktivitas berdasarkan IP": satu baris per IP dengan hitungan dan geo. */
export function useAdminIpActivity(limit = 20, enabled = true) {
  return useQuery(api.adminGate.listAdminIpActivity, enabled ? { limit } : "skip");
}

/** Panel "Sesi Anda": hanya tentang sesi pengelola yang sedang membaca. */
export function useCurrentAdminSession(enabled = true) {
  return useQuery(api.adminGate.currentAdminSession, enabled ? {} : "skip");
}

export function useReviewQueue(enabled = true) {
  return useQuery(api.community.listReviewQueue, enabled ? {} : "skip");
}

export { readFavorites, persistFavorites };
