import { useEffect, useState } from "react";
import { vendors as seedVendors, type Vendor } from "./catalog";

const STORAGE_KEY = "sumenep-buku-kerja-catalog";

function readVendors(): Vendor[] {
  if (typeof window === "undefined") return seedVendors;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return seedVendors;
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as Vendor[]) : seedVendors;
  } catch {
    return seedVendors;
  }
}

function persistVendors(next: Vendor[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("sumenep-catalog-updated"));
}

export function useCatalogVendors() {
  const [items, setItems] = useState<Vendor[]>(readVendors);

  useEffect(() => {
    const sync = () => setItems(readVendors());
    window.addEventListener("storage", sync);
    window.addEventListener("sumenep-catalog-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("sumenep-catalog-updated", sync);
    };
  }, []);

  return items;
}

export function saveVendor(next: Vendor[]) {
  persistVendors(next);
}

export function createSlug(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "usaha";
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

export function getVendorFromCatalog(slug: string) {
  return readVendors().find((vendor) => vendor.slug === slug);
}
