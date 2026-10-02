import type { Category, Vendor } from "./catalog";
import { landmarks } from "./catalog";

export const needSuggestions = ["servis pompa air", "buat dekorasi acara", "catering untuk warga", "bawa repair motor", "laundry kiloan"];

export const categoryActionLabel: Record<Category, string> = {
  "Servis Teknik": "Tanya harga",
  "Hajatan & Acara": "Tanya paket",
  Kuliner: "Tanya ketersediaan",
  Transportasi: "Cek jadwal",
  "Jasa Umum": "Tanya layanan",
};

export const isOpenNow = (
  hours: string,
  availability: "available" | "busy" | "closed" = "available",
) => {
  if (availability === "closed") return false;
  const normalized = hours.toLowerCase();
  if (normalized.includes("24 jam")) return true;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const match = hours.match(/(\d{2})\.(\d{2})[–-](\d{2})\.(\d{2})/);
  if (!match) return true;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return minutes >= start && minutes <= end;
};

/**
 * Apakah listing punya kontak yang bisa dihubungi.
 *
 * FASE 10: dulu ini `Boolean(vendor.phone)`. Sekarang peramban publik tidak
 * pernah menerima nomor, jadi yang dicek adalah ADA atau TIDAKNYA pegangan
 * kontak - bentuk yang sama secara makna ("nomor ini bisa dihubungi") tanpa
 * pernah memegang digitnya.
 *
 * Dipakai bersama untuk data publik (memakai `contactRef`) dan data
 * pemilik/pengelola (memakai `phone`), jadi kedua jalur stays konsisten.
 */
export const hasContact = (vendor: Vendor) =>
  Boolean(vendor.contactRef) || Boolean(vendor.phone?.replace(/\D/g, "").length);

export const profileCompleteness = (vendor: Vendor) => {
  const fields = [vendor.name, vendor.category, vendor.description, vendor.address, vendor.landmark, vendor.price, vendor.hours, hasContact(vendor) ? "contact" : "", vendor.tags.length ? "tags" : "", vendor.availability ?? "available"];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
};

export const qualityIssues = (vendor: Vendor) => {
  const issues: string[] = [];
  if (!hasContact(vendor)) issues.push("Nomor WhatsApp belum valid");
  if (!vendor.address.trim()) issues.push("Alamat belum lengkap");
  if (!vendor.price.trim()) issues.push("Harga awal belum diisi");
  if (vendor.description.trim().length < 40) issues.push("Deskripsi terlalu pendek");
  if (!vendor.tags.length) issues.push("Tag pencarian belum diisi");
  if ((vendor.availability === "busy" || vendor.availability === "closed") && !vendor.availabilityNote?.trim()) issues.push("Catatan ketersediaan belum diisi");
  if (vendor.availability && !vendor.responseMinutes) issues.push("Perkiraan waktu balas belum diisi");
  return issues;
};

export const duplicateScore = (a: Vendor, b: Vendor) => {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = normalize(a.name) === normalize(b.name) ? 0.6 : 0;
  // FASE 10: nomor tidak lagi bisa dibandingkan di peramban karena tidak pernah
  // dikirim ke sana. Skor ini sekarang hanya memakai nama dan alamat, jadi
  // bobotnya dijumlahkan ulang ke 0,7 supaya rentang tetap 0..1.
  const phone = 0;
  const address = a.address.toLowerCase() === b.address.toLowerCase() ? 0.1 : 0;
  return name + phone + address;
};

export const searchByNeed = (vendors: Vendor[], query: string) => {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return vendors;
  const synonyms: Record<string, string[]> = { pompa: ["pompa air", "listrik", "servis"], dekorasi: ["hajatan", "acara", "tenda"], catering: ["kuliner", "katering", "nasi kotak"], repair: ["servis", "motor", "teknik"], laundry: ["laundry", "cuci", "jasa umum"] };
  const terms = normalized.split(/\s+/).flatMap((term) => synonyms[term] ?? [term]);
  return vendors.filter((vendor) => { const haystack = [vendor.name, vendor.description, vendor.category, ...vendor.tags].join(" ").toLowerCase(); return terms.every((term) => haystack.includes(term)); });
};

export const landmarkCoordinates: Record<string, { lat: number; lng: number }> = { adipura: { lat: -7.005, lng: 113.862 }, trunojoyo: { lat: -7.009, lng: 113.868 }, anom: { lat: -7.015, lng: 113.86 }, keraton: { lat: -7.019, lng: 113.857 }, jamik: { lat: -7.011, lng: 113.858 }, "kota-lama": { lat: -7.005, lng: 113.861 }, kalianget: { lat: -7.0552167, lng: 113.9419448 }, bluto: { lat: -7.1046076, lng: 113.8112876 }, pragaan: { lat: -7.1118904, lng: 113.6558819 } };

export const distanceKmBetween = (from: { lat: number; lng: number }, to: { lat?: number; lng?: number }) => {
  if (to.lat === undefined || to.lng === undefined) return undefined;
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2));
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const distanceLabel = (distanceKm: number | undefined) => distanceKm === undefined ? "Jarak belum tersedia" : distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
export const distanceFilterOptions = [1, 3, 5, 10] as const;
export const landmark = (id: string) => landmarks.find((item) => item.id === id)?.label ?? "Sumenep";
