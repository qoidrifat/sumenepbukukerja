import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { vendors as seedVendors, vendorBySlug, type Vendor } from "./catalog";

export type VendorReview = {
  _id: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: number;
};

export type VendorRecord = Vendor & {
  _id: string;
  _creationTime: number;
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
  requesterId: string;
  requesterName: string;
  title: string;
  description: string;
  category: Vendor["category"];
  landmark: string;
  budget?: string;
  neededAt?: number;
  status: "open" | "claimed" | "completed" | "cancelled";
  vendorId?: string;
  vendorName?: string;
  createdAt: number;
  updatedAt: number;
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
const CATALOG_SEED_EVENT = "sumenep-catalog-seed-updated";
let catalogSeedState: "idle" | "requested" | "ready" = "idle";
let catalogSyncRequested = false;

type LocalCollections = Record<string, string>;

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

function useCatalogRemote() {
  const remote = useQuery(api.vendors.listActive, {});
  const ensureSeeded = useMutation(api.vendors.ensureCatalogSeeded);
  const [, setSeedRevision] = useState(0);

  useEffect(() => {
    const sync = () => setSeedRevision((revision) => revision + 1);
    window.addEventListener(CATALOG_SEED_EVENT, sync);
    return () => window.removeEventListener(CATALOG_SEED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (remote === undefined) return;
    if (remote.length > 0) catalogSeedState = "ready";
    if (catalogSyncRequested) return;

    catalogSyncRequested = true;
    catalogSeedState = remote.length === 0 ? "requested" : "ready";
    void ensureSeeded()
      .then((inserted) => {
        if (inserted === 0) catalogSeedState = "ready";
        window.dispatchEvent(new Event(CATALOG_SEED_EVENT));
      })
      .catch((error) => {
        if (remote.length === 0) catalogSeedState = "idle";
        console.warn("Catalog seed could not be created:", error);
      });
  }, [ensureSeeded, remote]);

  return remote;
}

export function useCatalogSeedBootstrap() {
  return useCatalogRemote();
}

export function useCatalogVendors() {
  const remote = useCatalogRemote();
  if (remote && remote.length > 0) return remote as Vendor[];
  if (remote && catalogSeedState === "ready") return [];
  return seedVendors;
}

export function useVendor(slug: string | undefined) {
  const remote = useQuery(api.vendors.getBySlug, { slug: slug ?? "" });

  if (remote === undefined) {
    const local = vendorBySlug(slug ?? "");
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
  const [collections, setCollections] = useState<LocalCollections>(readLocalCollections);

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

  return { local, collections, setLocalSaved, setLocalCollection, clearLocal } as const;
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
    if (!pendingSyncKey || attemptedSync.current.has(pendingSyncKey)) return;
    attemptedSync.current.add(pendingSyncKey);
    const items = pendingLocalItems.slice(0, 100);
    void syncLocalFavorites({ items })
      .then(() => clearLocal(items.map((item) => item.slug)))
      .catch(() => attemptedSync.current.delete(pendingSyncKey));
  }, [clearLocal, pendingLocalItems, pendingSyncKey, syncLocalFavorites]);

  const save = (slug: string, vendorId?: string, collection = "Tersimpan") => {
    const shouldSave = !slugs.has(slug);
    if (!isAuthenticated || !vendorId) {
      setLocalSaved(slug, shouldSave);
      if (shouldSave && collection !== "Tersimpan") setLocalCollection(slug, collection);
      return;
    }
    void favorite({
      vendorId: vendorId as never,
      collection,
      saved: shouldSave,
    }).catch(() => undefined);
  };

  const setCollection = (slug: string, vendorId: string | undefined, collection: string) => {
    setLocalSaved(slug, true);
    setLocalCollection(slug, collection);
    if (!isAuthenticated || !vendorId) return;
    void favorite({
      vendorId: vendorId as never,
      collection,
      saved: true,
    }).catch(() => undefined);
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
  const sendTestWhatsapp = useAction(api.whatsapp.sendTestWhatsapp);
  return {
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
    sendTestWhatsapp,
  };
}

export function useServiceRequests(args: {
  status?: "open" | "claimed" | "completed" | "cancelled";
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

export function useWhatsappStatus() {
  return useQuery(api.whatsapp.getWhatsappStatus, {});
}

export function useCommunityMetrics() {
  return useQuery(api.community.listCommunityMetrics, {});
}

export function useCurrentAccess() {
  return useQuery(api.users.currentAccess, {});
}

export function useOpenReports() {
  return useQuery(api.community.listReports, {});
}

export function useOwnerVendors() {
  return useQuery(api.vendors.listForOwner, {}) as VendorRecord[] | undefined;
}

export function useAdminVendors(status?: "draft" | "active" | "archived") {
  return useQuery(
    api.vendors.listForAdmin,
    status ? { status } : {},
  ) as VendorRecord[] | undefined;
}

export { readFavorites, persistFavorites };
