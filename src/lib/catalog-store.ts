import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { vendors as seedVendors, type Vendor } from "./catalog";

export type VendorRecord = Vendor & { _id: string; _creationTime: number; status: "draft" | "active" | "archived"; featured?: boolean; verified?: boolean; reviewsCount?: number; whatsappClicks?: number; shareClicks?: number; updatedAt: number; createdAt: number; reviews?: Array<{ _id: string; authorName: string; rating: number; body: string; createdAt: number }> };

const STORAGE_KEY = "sumenep-buku-kerja-favorites";

function readFavorites(): string[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[]; } catch { return []; } }
function persistFavorites(ids: string[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); window.dispatchEvent(new Event("sumenep-favorites-updated")); }

export function useCatalogVendors() {
  const remote = useQuery(api.vendors.listActive, {});
  return (remote ?? seedVendors) as Vendor[];
}

export function useVendor(slug: string | undefined) {
  return useQuery(api.vendors.getBySlug, { slug: slug ?? "" });
}

export function useFavorites() {
  const remote = useQuery(api.vendors.listFavorites, {});
  const [local, save] = useStoredFavorites();
  const ids = new Set((remote ?? []).map((item) => String(item.vendorId)));
  local.forEach((id) => ids.add(id));
  return { ids, isSaved: (id: string) => ids.has(id), local, save };
}

function useStoredFavorites() {
  const [local, setLocal] = useState(readFavorites);
  useEffect(() => { const sync = () => setLocal(readFavorites()); window.addEventListener("sumenep-favorites-updated", sync); return () => window.removeEventListener("sumenep-favorites-updated", sync); }, []);
  const save = (slug: string) => { const next = local.includes(slug) ? local.filter((item) => item !== slug) : [...local, slug]; persistFavorites(next); setLocal(next); };
  return [local, save] as const;
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
  return { create, update, archive, click, favorite, review, feedback, subscription };
}

export function useAdminVendors(status?: "draft" | "active" | "archived") { return useQuery(api.vendors.listForAdmin, status ? { status } : {}); }

export { readFavorites, persistFavorites };
