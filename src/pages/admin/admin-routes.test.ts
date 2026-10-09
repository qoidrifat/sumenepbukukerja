import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("route /admin/sistem terdaftar dan sidebar memuat 5 item", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="sistem"');
  const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");
  for (const label of ["Ringkasan", "Katalog", "Moderasi", "Keamanan", "Sistem"]) {
    expect(shell).toContain(label);
  }
});

test("route /admin/keamanan me-render panel sesi, security log, error, dan audit", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="keamanan"');
  const page = readFileSync("src/pages/admin/KeamananPage.tsx", "utf8");
  for (const name of ["AdminSessionActions", "AdminSecurityLog", "AdminErrorReports", "AdminAuditLog"]) {
    expect(page).toContain(name);
  }
});

test("route /admin/moderasi me-render antrean review dan review laporan", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="moderasi"');
  const page = readFileSync("src/pages/admin/ModerasiPage.tsx", "utf8");
  expect(page).toContain("AdminReportReview");
  expect(page).toContain("useReviewQueue");
});

test("route /admin/katalog dan overview terdaftar dengan isi yang benar", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="katalog"');
  expect(readFileSync("src/pages/admin/KatalogPage.tsx", "utf8")).toContain("AdminPackageManager");
  expect(readFileSync("src/pages/admin/OverviewPage.tsx", "utf8")).toContain("AdminWorkspaceHero");
});

test("ruling T4: Peran keluar sidebar dan masuk Sistem; shell live lewat Outlet", () => {
  // Item "Peran" tidak punya halaman di IA — peran/undangan hidup di Sistem.
  const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");
  expect(shell).not.toContain('to: "/admin/peran"');
  expect(shell).toContain("<Outlet context={{ reviewQueue }} />");
  // Gate me-render Outlet supaya rute anak hidup; tiap halaman me-render
  // AdminHeader sendiri dengan antrean dari konteks shell.
  const gate = readFileSync("src/pages/Admin.tsx", "utf8");
  expect(gate).toContain("<Outlet />");
  const sistem = readFileSync("src/pages/admin/SistemPage.tsx", "utf8");
  expect(sistem).toContain("Peran pengelola");
  expect(sistem).not.toContain('main className="admin-shell-frame');
  for (const page of ["KatalogPage", "OverviewPage", "ModerasiPage", "KeamananPage", "SistemPage"]) {
    expect(
      readFileSync(`src/pages/admin/${page}.tsx`, "utf8"),
      `${page} me-render AdminHeader dari konteks Outlet`,
    ).toContain("useOutletContext");
  }
  // Badge antrean menaut ke /admin/moderasi, bukan anchor governance lama.
  const workspace = readFileSync("src/components/admin-workspace.tsx", "utf8");
  expect(workspace).toContain('to="/admin/moderasi"');
  expect(workspace).not.toContain('href="#governance-title"');
});

test("fix(T4): hero shortcut carries queueFilter via router state; KatalogPage uses it as initial filter", () => {
  const hero = readFileSync("src/components/admin-workspace-hero.tsx", "utf8");
  expect(hero).toContain('to="/admin/katalog"');
  expect(hero).toContain("state={{ queueFilter:");
  const katalog = readFileSync("src/pages/admin/KatalogPage.tsx", "utf8");
  expect(katalog).toContain("useLocation");
  expect(katalog).toMatch(/useState<QueueFilter>\(\s*initialQueueFilter\s*\)/);
});

test("fix(T4): Tambah listing passes createNew state; KatalogPage auto-opens editor", () => {
  const overview = readFileSync("src/pages/admin/OverviewPage.tsx", "utf8");
  expect(overview).toContain("createNew: true");
  const katalog = readFileSync("src/pages/admin/KatalogPage.tsx", "utf8");
  expect(katalog).toContain("createNew");
  expect(katalog).toContain("startNew()");
});

test("fix(T4): no inner shell frame in Moderasi/Keamanan pages", () => {
  for (const page of ["ModerasiPage", "KeamananPage"]) {
    expect(
      readFileSync(`src/pages/admin/${page}.tsx`, "utf8"),
      `${page} tanpa bingkai dalam`,
    ).not.toContain('main className="admin-shell-frame');
  }
});

test("fix(T4): single main landmark lives in shell; pages return div", () => {
  const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");
  expect(shell.match(/<main/g)?.length ?? 0).toBe(1);
  for (const page of ["KatalogPage", "OverviewPage", "ModerasiPage", "KeamananPage", "SistemPage"]) {
    expect(
      readFileSync(`src/pages/admin/${page}.tsx`, "utf8"),
      `${page} tanpa <main>`,
    ).not.toContain("<main");
  }
});

test("sidebar responsif dan aksesibel", () => {
  const sidebar = readFileSync("src/components/admin-sidebar.tsx", "utf8");
  expect(sidebar).toContain("aria-expanded");
  expect(sidebar).toContain("NavLink");
  // Item navigasi = link asli (keyboard-native); hanya tombol hamburger
  // yang boleh punya onClick, dan ia wajib berpasangan dengan aria-expanded.
  expect(sidebar).toContain("<button");
  const navBlock = sidebar.slice(sidebar.indexOf("<nav"), sidebar.indexOf("</nav>"));
  expect(navBlock).not.toContain("onClick");
  // NavBlock hanya memotong call site `{renderLinks(...)}`; markup NavLink
  // ada di fungsi renderLinks. Kunci keduanya: hanya satu handler onClick
  // di seluruh file (punya tombol), dan blok tombol memakainya berpasangan
  // dengan aria-expanded.
  const linksBlock = sidebar.slice(sidebar.indexOf("const renderLinks"), sidebar.indexOf("if (isMobile)"));
  expect(linksBlock).not.toContain("onClick");
  const buttonBlock = sidebar.slice(sidebar.indexOf("<button"), sidebar.indexOf("</button>"));
  expect(buttonBlock).toContain("onClick");
  expect(buttonBlock).toContain("aria-expanded");
  expect(sidebar.match(/onClick=\{/g)?.length ?? 0, "hanya tombol hamburger dengan onClick").toBe(1);
});

test("shell selaras useIsMobile: baris flex hanya mulai 768px", () => {
  // `useIsMobile` memakai <=767px. Kalau shell tetap berbaris lewat `sm`
  // (>=640), wrapper mobile `w-full shrink-0` memakan seluruh baris dan
  // `main` menyusut ke 0px pada 640-767px — hanya tombol "Buka menu" yang
  // terlihat (termasuk potret iPad mini 744px).
  const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");
  expect(shell).not.toContain("sm:flex-row");
  expect(shell).not.toContain("sm:items-start");
  expect(shell).toContain("min-[768px]:flex-row");
  expect(shell).toContain("min-[768px]:items-start");
});

test("shell mempertahankan pagar ruang kerja lama", () => {
  // Pembungkus `Admin.tsx` sebelum shell membawa tinggi viewport minimum dan
  // ruang aman bawah; tanpa keduanya, isi menempel di tepi gesture ponsel.
  const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");
  expect(shell).toContain("min-h-[100svh]");
  expect(shell).toContain("pb-[calc(2rem+env(safe-area-inset-bottom))]");
});

test("route indeks /admin terdaftar sebagai Ringkasan", () => {
  // Satu-satunya pendaftaran rute baru yang belum dikunci kontrak.
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('<Route index element={<OverviewPage />} />');
});

test("aria-controls tombol menu menunjuk id hanya saat drawer terbuka", () => {
  // `id="navigasi-pengelola"` hanya dirender saat drawer terbuka, jadi
  // aria-controls yang menggantung saat tertutup menunjuk ke id tak ada.
  const sidebar = readFileSync("src/components/admin-sidebar.tsx", "utf8");
  expect(sidebar).toContain(
    'aria-controls={open ? "navigasi-pengelola" : undefined}',
  );
  expect(sidebar).not.toContain('aria-controls="navigasi-pengelola"');
});
