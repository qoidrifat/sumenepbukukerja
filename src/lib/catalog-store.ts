import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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

const STORAGE_KEY = "sumenep-buku-kerja-favorites";
const CATALOG_SEED_EVENT = "sumenep-catalog-seed-updated";
let catalogSeedState: "idle" | "requested" | "ready" = "idle";
let catalogSyncRequested = false;

function readFavorites(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function persistFavorites(slugs: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // A blocked storage API must not prevent browsing or contacting a vendor.
  }
  window.dispatchEvent(new Event("sumenep-favorites-updated"));
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

  useEffect(() => {
    const sync = () => setLocal(readFavorites());
    window.addEventListener("sumenep-favorites-updated", sync);
    return () => window.removeEventListener("sumenep-favorites-updated", sync);
  }, []);

  const toggleLocal = (slug: string) => {
    setLocal((current) => {
      const next = current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug];
      persistFavorites(next);
      return next;
    });
  };

  return [local, toggleLocal] as const;
}

export function useVendorPhoto(photoId: string | undefined) {
  return useQuery(api.vendors.getImageUrl, { storageId: photoId ?? "" });
}

export function useFavorites() {
  const remote = useQuery(api.vendors.listFavorites, {});
  const favorite = useMutation(api.vendors.toggleFavorite);
  const [local, toggleLocal] = useStoredFavorites();
  const slugs = new Set(remote?.map((item) => item.slug) ?? []);

  local.forEach((slug) => slugs.add(slug));

  const save = (slug: string, vendorId?: string) => {
    toggleLocal(slug);
    if (vendorId) {
      void favorite({ vendorId: vendorId as never }).catch(() => {
        // Anonymous visitors keep the local favorite; signed-in users sync remotely.
      });
    }
  };

  return {
    slugs,
    isSaved: (slug: string) => slugs.has(slug),
    local,
    save,
  };
}

export function useCatalogActions() {
  const create = useMutation(api.vendors.createVendor);
  const update = useMutation(api.vendors.updateVendor);
  const archive = useMutation(api.vendors.archiveVendor);
  const click = useMutation(api.vendors.incrementClick);
  const favorite = useMutation(api.vendors.toggleFavorite);
  const review = useMutation(api.vendors.addReview);
  const feedback = useMutation(api.vendors.submitFeedback);
  const subscription = useMutation(api.vendors.setSubscription);
  const generateUploadUrl = useMutation(api.vendors.generateUploadUrl);
  return {
    create,
    update,
    archive,
    click,
    favorite,
    review,
    feedback,
    subscription,
    generateUploadUrl,
  };
}

export function useAdminVendors(status?: "draft" | "active" | "archived") {
  return useQuery(
    api.vendors.listForAdmin,
    status ? { status } : {},
  ) as VendorRecord[] | undefined;
}

export { readFavorites, persistFavorites };
