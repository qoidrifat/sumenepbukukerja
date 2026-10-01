import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";

/**
 * Uji render statis untuk VendorActionArea dan header ruang pengelola.
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

// Header memanggil dua hal yang butuh konteks: profil (query Convex) dan
// alur keluar (mutasi + router). Keduanya dimock supaya yang diuji benar-benar
// markup header, bukan integrasi jaringan.
vi.mock("@/components/admin-profile", () => ({
  AdminProfile: () =>
    createElement("button", { type: "button", role: "menuitem" }, "Profil"),
}));
vi.mock("@/lib/admin-logout", () => ({
  useAdminLogout: () => ({ logoutAdmin: () => {}, logoutBusy: false }),
}));

// `AdminMetricsBoard` pindah ke berkasnya sendiri pada Fase 9.1 Pekerjaan 6.
// Yang diuji tetap sama: render papan metrik dan breakdown per area.
const { AdminHeader, VendorActionArea } = await import("./admin-workspace");
const { AdminMetricsBoard } = await import("./admin-metrics-board");

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

/* ------------------------------------------------------------------ */
/* Header ruang pengelola                                              */
/* ------------------------------------------------------------------ */

const renderHeader = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(AdminHeader, { role: "admin", ...props } as never),
    ),
  );

test("header tidak lagi memakai tombol Beranda yang memenuhi layar", () => {
  const html = renderHeader();
  // Ini keluhan yang jadi pemicu perubahan: di Android, tombol ini memakan
  // hampir separuh lebar header dan mendorong kotak peran sampai gepeng.
  expect(html).not.toContain("Kembali ke katalog");
  // Identitas tetap di kiri, mepet.
  expect(html.indexOf("Sumenep Buku Kerja")).toBeGreaterThan(-1);
  expect(html.indexOf("Ruang MANAGER")).toBe(-1);
  expect(html.indexOf("Ruang pengelola")).toBeGreaterThan(-1);
  expect(html.indexOf("logo-mark.svg")).toBeGreaterThan(-1);
});

test("kotak peran ada di sisi kiri dan tidak pernah gepeng", () => {
  const html = renderHeader({ role: "staff" });
  expect(html).toContain("admin-status");
  expect(html).toContain("Staff");
  // `shrink-0` adalah penjaga yang sebenarnya: tanpa itu kotak peran ikut
  // menyusut bersama judul pada layar sempit.
  expect(html).toContain("shrink-0");
  // Urutan di DOM: peran muncul sebelum tombol menu di kanan.
  expect(html.indexOf("admin-status")).toBeLessThan(html.indexOf("admin-menu-icon"));
});

test("ikon menu dibuat sendiri dan punya kontrak aksesibilitas", () => {
  const html = renderHeader();
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Buka menu ruang pengelola");
  // Tiga garis, bukan aset eksternal. State `data-open` inilah yang dipakai CSS
  // untuk mengubahnya menjadi tanda silang.
  expect(html).toContain('data-open="false"');
  expect((html.match(/<span><\/span>/g) ?? []).length).toBe(3);
});

test("menu tertutup sampai tombol ditekan", () => {
  // State awal harus benar-benar tertutup: panel yang ikut ter-render sejak
  // awal akan menutupi konten di ponsel.
  const html = renderHeader();
  expect(html).not.toContain("Keluar");
  expect(html).not.toContain('role="menu"');
});

test("akun pemilik memakai gelar singkatnya, bukan gelar lengkap", () => {
  // Gelar lengkap terlalu panjang untuk chip 48px dan akan mendorong ikon
  // menu ke luar layar.
  expect(renderHeader({ isOwner: true })).toContain("SuperAdmin");
  expect(renderHeader()).not.toContain("SuperAdmin");
  expect(renderHeader()).toContain("Admin");
});

test("antrean review tetap terlihat meski dipersempit di ponsel", () => {
  const html = renderHeader({
    reviewQueue: { claims: 1, photos: 2, reports: 3, total: 6 },
  });
  expect(html).toContain("6");
  expect(html).toContain("perlu direview");
  // Angka rinci hanya untuk pembaca layar, bukan teks yang menumpuk.
  expect(html).toContain("klaim listing");
});
