import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";

/**
 * Uji render statis untuk VendorActionArea.
 *
 * Komponen ini murni presentasi, jadi yang dijaga di sini adalah: setiap aksi
 * benar-benar punya target yang bisa diklik (href/label), tidak ada tombol
 * mati, dan status busy hanya mematikan aksi miliknya sendiri — bukan seluruh
 * baris. Logika mutasi tetap diuji lewat handler nyata di halaman Admin.
 */

vi.mock("@/lib/catalog-store", () => ({
  useCatalogActions: () => ({}),
  useVendorPackages: () => [],
}));

const { AdminMetricsBoard, VendorActionArea } = await import("./admin-workspace");

const item = {
  _id: "v1",
  name: "Warung Bu Imas",
  slug: "warung-bu-imas",
  phone: "081234567890",
  featured: false,
  status: "active" as const,
};

const noop = () => {};

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(VendorActionArea, {
        item,
        waHref: "https://wa.me/6281234567890",
        isActive: true,
        busyAction: null,
        itemBusyPrefix: "v1:",
        onApprove: noop,
        onToggleActive: noop,
        onToggleFeatured: noop,
        onRequestDestructive: noop,
        onEdit: noop,
        ...props,
      } as never),
    ),
  );

/** Tag pembuka (`<button>`/`<a>`) yang menaungi sebuah label. */
const tagFor = (html: string, label: string, tag: "a" | "button" = "button") => {
  const at = html.indexOf(label);
  if (at < 0) return "";
  const before = html.slice(0, at);
  const start = before.lastIndexOf(`<${tag} `);
  if (start < 0) return "";
  return html.slice(start, before.indexOf(">", start) + 1);
};

/** Tag pembuka toggle Aktif (role="switch"). */
const switchTag = (html: string) =>
  /<button[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? "";

test("sembilan aksi vendor tersedia sebagai target nyata", () => {
  const html = render();

  for (const label of ["Cek WA", "Setujui", "Tolak", "Lihat", "Sunting", "Jadikan unggulan"]) {
    expect(html).toContain(label);
  }
  expect(html).toContain("Aktif");
  expect(switchTag(html)).toContain('role="switch"');
  expect(html).toContain('aria-label="Hapus Warung Bu Imas"');
});

test("Cek WA membuka wa.me di tab baru, dan mati bila nomor tidak valid", () => {
  const html = render();
  expect(tagFor(html, "Cek WA", "a")).toContain('href="https://wa.me/6281234567890"');
  expect(tagFor(html, "Cek WA", "a")).toContain('target="_blank"');
  expect(tagFor(html, "Cek WA", "a")).toContain('rel="noreferrer"');

  const tanpaNomor = render({ waHref: undefined });
  expect(tanpaNomor).not.toContain("wa.me");
  expect(tagFor(tanpaNomor, "Cek WA")).toContain('disabled=""');
});

test("Lihat menuju halaman publik listing, dan hilang saat listing tidak tayang", () => {
  expect(tagFor(render(), "Lihat", "a")).toContain('href="/v/warung-bu-imas"');

  const nonaktif = render({ isActive: false });
  expect(nonaktif).toContain("Tidak tayang");
  expect(nonaktif).not.toContain('href="/v/warung-bu-imas"');
  expect(switchTag(nonaktif)).toContain('aria-label="Aktifkan Warung Bu Imas"');
  expect(switchTag(render())).toContain('aria-label="Nonaktifkan Warung Bu Imas"');
});

test("hapus tetap ikon-only dengan aria-label dan tooltip", () => {
  const html = render();

  expect(html).toContain('aria-label="Hapus Warung Bu Imas"');
  expect(html).toContain('data-slot="tooltip-trigger"');
  // Tombol hapus tidak boleh jadi tombol biasa tanpa nama yang bisa dibacakan.
  expect(tagFor(html, "Sunting")).not.toContain("aria-label");
});

test("status busy hanya mematikan aksi yang sedang berjalan", () => {
  const approve = render({ busyAction: "v1:approve" });
  expect(tagFor(approve, "Setujui")).toContain('disabled=""');
  expect(tagFor(approve, "Tolak")).not.toContain('disabled=""');
  expect(tagFor(approve, "Cek WA", "a")).not.toContain('disabled=""');
  expect(tagFor(approve, "Jadikan unggulan")).not.toContain('disabled=""');
  expect(switchTag(approve)).not.toContain('disabled=""');

  const featured = render({ busyAction: "v1:featured" });
  expect(tagFor(featured, "Jadikan unggulan")).toContain('disabled=""');
  expect(tagFor(featured, "Setujui")).not.toContain('disabled=""');
  expect(switchTag(featured)).not.toContain('disabled=""');

  const arsip = render({ busyAction: "v1:archive" });
  expect(switchTag(arsip)).toContain('aria-checked="true"');
  expect(switchTag(arsip)).toContain('disabled=""');
});

test("Setujui mati bila nomor WhatsApp belum diisi", () => {
  const html = render({ item: { ...item, phone: "  " } });

  expect(tagFor(html, "Setujui")).toContain('disabled=""');
});

test("grid baris aksi mencegah label panjang membungkus di kolom sempit", () => {
  const html = render();

  // Baris 1: di `lg` tombol tengah (Setujui) memakai track 1fr, dua lainnya
  // ikut konten, supaya "Setujui" tidak terpampatkan di kolom aksi yang sempit.
  expect(html).toContain("sm:grid-cols-3");
  expect(html).toContain("lg:grid-cols-[auto_minmax(0,1fr)_auto]");
  // Baris 2: dua baris saat sempit (mobile dan kolom `lg`), satu baris saat
  // area aksi memakai lebar penuh kartu.
  expect(html).toContain("sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]");
  expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_auto]");
  // Label status (hanya saat listing tidak tayang) tetap satu baris.
  expect(render({ isActive: false })).toContain("Tidak tayang");
});

test("label unggulan berubah mengikuti status featured", () => {
  expect(render()).toContain("Jadikan unggulan");

  const unggulan = render({ item: { ...item, featured: true } });
  expect(unggulan).toContain("Jadikan biasa");
  expect(unggulan).toContain("admin-btn-highlight");
  expect(unggulan).not.toContain("Jadikan unggulan");
});

/* ------------------------------------------------------------------ */
/* Papan metrik: category count + maskot kategori                      */
/* ------------------------------------------------------------------ */

const renderMetrics = (categoryCounts: Record<string, number>) =>
  renderToStaticMarkup(
    createElement(AdminMetricsBoard, {
      metrics: [],
      impactMetrics: [],
      categoryCounts,
      areaCounts: {},
      loadingBreakdown: false,
    }),
  );

test("papan metrik: angka kategori tetap utuh dan didesain dengan maskot", () => {
  const counts = { Kuliner: 12, Transportasi: 5, "Jasa Umum": 0 };
  const html = renderMetrics(counts);

  // Angka dan nama kategori tidak berubah - maskot hanya tambahan visual.
  for (const [label, count] of Object.entries(counts)) {
    expect(html).toContain(`${label}: ${count}`);
  }
  // Tiga kategori = tiga maskot (viewBox 120), masing-masing memakai palet admin.
  expect((html.match(/viewBox="0 0 120 120"/g) ?? []).length).toBe(3);
  expect(html).toContain("#121212");
  expect(html).not.toContain("#FDE68A");
  // Judul seksi dan breakdown area tidak hilang.
  expect(html).toContain("Listing aktif per kategori");
  expect(html).toContain("Listing aktif per area");
});
