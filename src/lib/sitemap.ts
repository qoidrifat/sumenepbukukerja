/**
 * Pembangun sitemap XML.
 *
 * Sengaja MURNI: sitemap dibangun dari daftar slug yang sudah difilter di
 * server, ditambah dua dokumen hukum statis, lalu dirakit di sini.
 * Konsekuensinya, hal yang tidak boleh masuk sitemap tidak bisa "tidak
 * sengaja" masuk karena pemanggil keliru — `buildSitemapXml` hanya menerima
 * beranda, dokumen hukum, dan slug listing.
 *
 * Yang TIDAK pernah dimasukkan: `/admin`, `/dashboard`, `/auth`, `/invite/*`,
 * dan listing yang bukan `active`. Halaman-halaman itu butuh sesi atau
 * metabol passcode; memindainya di sini tidak akan menambah satu pun pengunjung
 * dan hanya menggerakkan tabel audit.
 */

export type SitemapVendor = { slug: string; updatedAt: number };

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const urlEntry = (loc: string, lastmod?: string) =>
  `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </url>`;

export function buildSitemapXml(input: {
  origin: string;
  vendors: SitemapVendor[];
}): string {
  const origin = input.origin.replace(/\/+$/, "");
  // Halaman konten publik yang stabil: beranda + dokumen hukum (dibutuhkan
  // dialog login dan rincian aplikasi). Rute sesi/admin/invite TIDAK pernah
  // masuk (lihat catatan modul).
  const entries = [
    urlEntry(`${origin}/`),
    urlEntry(`${origin}/kebijakan-privasi`),
    urlEntry(`${origin}/syarat-ketentuan`),
  ];
  for (const vendor of input.vendors) {
    if (!vendor.slug) continue;
    const loc = `${origin}/v/${encodeURIComponent(vendor.slug)}`;
    // `lastmod` hanya valid dalam format tanggal; nilai rusak lebih baik
    // dihilangkan daripada membuat crawler menolak seluruh dokumen.
    const lastmod = Number.isFinite(vendor.updatedAt) && vendor.updatedAt > 0
      ? new Date(vendor.updatedAt).toISOString().slice(0, 10)
      : undefined;
    entries.push(urlEntry(escapeXml(loc), lastmod));
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}

/** robots.txt: seluruh situs boleh diindeks, kecuali area pengelolaan dan sesi. */
export function buildRobotsTxt(origin: string): string {
  const clean = origin.replace(/\/+$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /dashboard",
    "Disallow: /warga/dashboard",
    "Disallow: /staff/dashboard",
    "Disallow: /auth",
    "Disallow: /invite/",
    `Sitemap: ${clean}/sitemap.xml`,
    "",
  ].join("\n");
}
