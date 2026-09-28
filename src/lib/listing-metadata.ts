/**
 * Metadata publik untuk halaman listing.
 *
 * Semua fungsi di sini MURNI dan bisa diuji tanpa DOM: yang membangun
 * judul/deskripsi/JSON-LD tidak boleh bergantung pada `document`, supaya
 * bentuk keluarannya bisa dikunci oleh tes.
 *
 * Yang boleh keluar ke halaman publik hanya data listing yang memang sudah
 * tampil untuk siapa pun. Data pemilik (`ownerId`), akun admin, email, dan
 * session TIDAK PERNAH masuk ke sini — JSON-LD dibaca mesin pencari, jadi satu
 * kebocoran di sini berarti kebocoran yang terindeks.
 */

/** Field listing yang boleh dipakai untuk metadata publik. */
export type PublicListing = {
  slug: string;
  name: string;
  category: string;
  description?: string;
  hours?: string;
  address?: string;
  landmark?: string;
  phone?: string;
  rating?: string;
  reviewsCount?: number;
  photoUrl?: string | null;
};

const AREA_LABELS: Record<string, string> = {
  all: "Kabupaten Sumenep",
  KotaSumenep: "Kota Sumenep",
  Kalianget: "Kalianget",
  Talango: "Talango",
  Pragaan: "Pragaan",
  Bluto: "Bluto",
  Rongga: "Rongga",
};

/** Nama area yang enak dibaca; nilai mentah tetap dipakai sebagai cadangan. */
export function areaLabel(landmark: string | undefined): string {
  if (!landmark) return "Kabupaten Sumenep";
  return AREA_LABELS[landmark] ?? landmark;
}

/**
 * Judul halaman: listing lebih dulu, karena itulah yang dicari orang.
 * Panjang dibatasi — judul yang terlalu panjang dipotong mesin pencari.
 */
export function listingTitle(listing: PublicListing): string {
  return `${listing.name} — ${listing.category} di ${areaLabel(listing.landmark)} | Buku Kerja`.slice(0, 70);
}

/** Deskripsi satu paragraf, TANPA harga dan tanpa data akun. */
export function listingDescription(listing: PublicListing): string {
  const base = listing.description?.trim() ?? "";
  const hours = listing.hours?.trim();
  // Nama listing selalu dibuka lebih dulu: metadata halaman yang tidak
  // menyebut nama usaha yang sedang dibuka kehilangan nilai iklannya, dan
  // beberapa crawler memotong deskripsi setelah 160 karakter pertama.
  const lead = `${listing.name} di ${areaLabel(listing.landmark)}.`;
  const parts = [lead, base, hours ? `Jam buka: ${hours}.` : "", listing.address?.trim() ?? ""].filter(Boolean);
  return `${parts.join(" ")}`.replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * JSON-LD `LocalBusiness`.
 *
 * Dibangun sebagai OBJEK, lalu diserialisasi di tempat pemakaian. Dengan begitu
 * karakter khusus di nama listing (kutip, `<`, `&`) tidak mungkin memutus
 * markup: `JSON.stringify` menutup semua karakter khusus sebagai escape, dan `</script>` tetap
 * dinetralkan di lapisan penerapannya.
 */
export function listingStructuredData(
  listing: PublicListing,
  origin: string,
): Record<string, unknown> {
  const canonical = `${origin.replace(/\/+$/, "")}/v/${encodeURIComponent(listing.slug)}`;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    url: canonical,
    description: listingDescription(listing),
    address: {
      "@type": "PostalAddress",
      addressLocality: areaLabel(listing.landmark),
      addressRegion: "Jawa Timur",
      addressCountry: "ID",
      ...(listing.address ? { streetAddress: listing.address } : {}),
    },
    areaServed: areaLabel(listing.landmark),
    ...(listing.hours ? { openingHours: listing.hours } : {}),
    // Nomor usaha memang sudah tampil publik di halaman listing, jadi
    // memuatnya di sini tidak menambah kebocoran. Email akun TIDAK pernah.
    ...(listing.phone ? { telephone: listing.phone } : {}),
    ...(listing.photoUrl ? { image: listing.photoUrl } : {}),
    ...(listing.reviewsCount && listing.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: listing.rating,
            reviewCount: listing.reviewsCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
  return data;
}

/**
 * Terjemahkan objek JSON-LD menjadi `<script type="application/ld+json">` yang
 * aman. `JSON.stringify` menutup kutip dan backslash; satu-satunya yang belum
 * tertutup adalah `</script>`, jadi itu dinetralkan di sini.
 */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
