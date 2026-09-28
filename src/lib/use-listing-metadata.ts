import { useEffect } from "react";
import {
  jsonLdScript,
  listingDescription,
  listingStructuredData,
  listingTitle,
  type PublicListing,
} from "@/lib/listing-metadata";

/**
 * Metadata per-listing untuk `<head>`.
 *
 * Aplikasi ini dirender di peramban, jadi tag `<head>` tidak bisa ditulis di
 * server. Yang bisa dilakukan — dan yang dilakukan di sini — adalah menulisnya
 * saat data listing sudah ada, sehingga mesin pencari yang menjalankan
 * JavaScript (Googlebot, Bingbot) membaca judul dan deskripsi yang benar per
 * listing, bukan judul generik seluruh situs.
 *
 * TAG TIDAK PERNAH IKUT "dibersihkan" dengan menghapus(meta) yang bukan milik
 * aplikasi: setiap tag yang ditulis di sini memakai `data-listing-meta`, jadi efek samping pada halaman lain mustahil terjadi.
 */
const MANAGED = "data-listing-meta";

const upsertMeta = (name: string, content: string, attr: "name" | "property") => {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    tag.setAttribute(MANAGED, "true");
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

export function useListingMetadata(
  listing: PublicListing | null | undefined,
  photoUrl?: string | null,
) {
  useEffect(() => {
    if (!listing) return;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const canonical = `${origin}/v/${encodeURIComponent(listing.slug)}`;
    const title = listingTitle(listing);
    const description = listingDescription(listing);
    const image = photoUrl ?? undefined;

    document.title = title;
    upsertMeta("description", description, "name");
    upsertMeta("og:title", title, "property");
    upsertMeta("og:description", description, "property");
    upsertMeta("og:type", "website", "property");
    upsertMeta("og:url", canonical, "property");
    if (image) upsertMeta("og:image", image, "property");
    upsertMeta("twitter:card", image ? "summary_large_image" : "summary", "name");
    upsertMeta("twitter:title", title, "name");
    upsertMeta("twitter:description", description, "name");

    let link = document.head.querySelector<HTMLLinkElement>(`link[rel="canonical"]`);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute(MANAGED, "true");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonical);

    const structured = listingStructuredData(listing, origin);
    const scriptId = "listing-jsonld";
    const previous = document.getElementById(scriptId);
    previous?.remove();
    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    script.textContent = jsonLdScript(structured);
    document.head.appendChild(script);
  }, [listing?.slug, listing?.name, listing?.rating, listing?.reviewsCount, photoUrl]);
}
