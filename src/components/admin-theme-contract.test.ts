import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak tema ruang pengelola.
 *
 * Test ini lahir dari audit, bukan dari tebakan. Temuannya: sebagian fitur di
 * meja kerja admin terlihat seperti sisipan dari aplikasi lain, dan penyebabnya
 * hanya ada dua -
 *
 *  1. Portal Radix. Dialog dan konfirmasi dirender ke `document.body`, jadi
 *     berada DI LUAR `.admin-workspace` dan kehilangan seluruh token admin.
 *     Gejalanya nyata: dialog "Cabut akses sesi" menampilkan tombol merah dan
 *     tombol batal tanpa gaya admin sama sekali, dengan kotak melengkung di
 *     tengah panel kuning.
 *  2. Penulisan ulang warna dan sudut secara ad-hoc. Sebagian komponen memakai
 *     palet aplikasi (`text-red-700`, `rounded-lg`) atau menyalin hex admin di
 *     tempat yang berbeda-beda, sehingga warna yang "seharusnya sama" punya
 *     beberapa versi.
 *
 * Yang dikunci di sini adalah batas yang bisa diuji dari teks sumber. Tidak
 * ada yang diukur dari browser; itu tetap butuh pemeriksaan visual.
 */

const ADMIN_SOURCES = [
  "../components/admin-access-gate.tsx",
  "../components/admin-audit-log.tsx",
  "../components/admin-empty-mascot.tsx",
  "../components/admin-error-reports.tsx",
  "../components/admin-governance.tsx",
  "../components/admin-invite-link.tsx",
  "../components/admin-loading-skeleton.tsx",
  "../components/admin-logout-button.tsx",
  "../components/admin-metrics-board.tsx",
  "../components/admin-package-manager.tsx",
  "../components/admin-profile.tsx",
  "../components/admin-report-review.tsx",
  "../components/admin-security-log.tsx",
  "../components/admin-session-actions.tsx",
  "../components/admin-session-revoke.tsx",
  "../components/admin-workspace-hero.tsx",
  "../components/admin-workspace.tsx",
  "../components/auth-admin-panel.tsx",
  "../pages/Admin.tsx",
];

const source = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const css = source("../index.css");

/**
 * Sudut yang TIDAK boleh muncul. `rounded-full` dikecualikan: bentuk pil
 * dipakai untuk titik status dan pil peran, itu bahasa bentuknya sendiri,
 * bukan sisa gaya aplikasi.
 */
const APP_ROUNDING = /rounded-(lg|xl|2xl|3xl)\b/;

/**
 * Palet Tailwind bawaan. Satu-satunya pengecualian yang sah adalah gradien
 * aksen kartu listing di `Admin.tsx`, karena itu data listing yang sedang
 * dipratinjau, bukan gaya meja kerja.
 */
const APP_PALETTE =
  /\b(?:slate|gray|zinc|neutral|stone|indigo|blue|red|green|emerald|amber|yellow|purple|violet|cyan|sky)-\d{2,3}\b/g;

test("tidak ada sudut membulat gaya aplikasi di ruang pengelola", () => {
  const offenders = ADMIN_SOURCES.filter((file) => APP_ROUNDING.test(source(file)));
  expect(offenders).toEqual([]);
});

test("tidak ada warna palet aplikasi di ruang pengelola", () => {
  const offenders: string[] = [];
  for (const file of ADMIN_SOURCES) {
    for (const line of source(file).split("\n")) {
      // Aksen kartu listing adalah data, bukan gaya.
      if (line.includes("from-blue-600 to-cyan-400")) continue;
      const found = line.match(APP_PALETTE);
      if (found) offenders.push(`${file}: ${found.join(", ")}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("hex yang dipakai di luar palet admin sudah habis", () => {
  // Palet Warm Brutalism yang sah. Satu-satunya warna di luar daftar ini
  // pernah muncul adalah Hijau/Oranye turunan yang tidak punya padanan, dan
  // keempat warna logo Google di bawah. Logo itu merek dagang, bukan pilihan
  // gaya: warna yang diubah membuat orang mengira tombol itu bukan Google.
  const allowed = new Set([
    "121212", "525252", "1A1A1A", "FFE662", "7C2D12", "FF5A26", "F1EDE3",
    "24533A", "DCEBD7", "F5F0E5", "E9B4A7", "FAF7EE", "D6D3D1", "E7E5E4",
    "EDEAE0", "FDFBF7", "FFFCF5", "FFFFFF",
    "4285F4", "34A853", "FBBC05", "EA4335",
  ]);
  const offenders: string[] = [];
  for (const file of ADMIN_SOURCES) {
    for (const match of source(file).matchAll(/#[0-9A-Fa-f]{6}/g)) {
      const hex = match[0].slice(1).toUpperCase();
      if (!allowed.has(hex)) offenders.push(`${file}: #${hex}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("semua dialog admin melewati satu komponen", () => {
  // Dialog tanpa scope admin adalah temuan audit yang paling jelas: isinya
  // berada di luar `.admin-workspace`, jadi setiap kelas admin di dalamnya
  // tidak punya aturan yang berlaku.
  for (const file of ADMIN_SOURCES) {
    const text = source(file);
    expect(text, file).not.toContain("<DialogContent");
  }
  // Semua pemakai wajib ambil dari modul bersama.
  for (const file of [
    "../components/admin-profile.tsx",
    "../components/admin-logout-button.tsx",
    "../components/admin-session-actions.tsx",
    "../components/admin-session-revoke.tsx",
  ]) {
    expect(source(file), file).toContain("<AdminDialogContent");
    expect(source(file), file).toContain('from "@/components/admin-dialog"');
  }
});

test("dialog admin tidak bisa menutup dirinya sendiri di Android", () => {
  // Bug yang nyata hanya di Android: Radix memfokuskan isian pertama, keyboard
  // muncul, dan pergeseran fokus itu dibaca Radix sebagai interaksi luar.
  const wrapper = source("../components/admin-dialog.tsx");
  expect(wrapper).toContain("onOpenAutoFocus");
  expect(wrapper).toContain("onFocusOutside");
  expect(wrapper).toContain("onInteractOutside");
  // Ketiganya harus membatalkan perilaku bawaan, bukan hanya ada.
  expect((wrapper.match(/event\.preventDefault\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  // Fokus diarahkan ke panel dialog, bukan ke isian: kalau ke isian, keyboard
  // tetap muncul otomatis dan bugnya kembali.
  expect(wrapper).toContain("panel?.focus({ preventScroll: true })");
});

test("scope portal membawa token dan primitive yang sebelumnya hilang", () => {
  // Tanpa blok ini, dialog kehilangan `--admin-*` dan `admin-btn-danger`.
  for (const scope of [".admin-dialog-overlay", ".admin-dialog-content", ".admin-confirm-overlay", ".admin-confirm-content"]) {
    expect(css).toContain(`${scope},`);
  }
  expect(css).toContain(".admin-dialog-content .admin-btn-danger");
  expect(css).toContain(".admin-confirm-content .admin-input");
  // Status pill dipakai di dalam dialog juga.
  expect(css).toContain(".admin-dialog-content .admin-status");
});

test("dialog admin memusatkan dirinya sendiri, bukan lewat overlay", () => {
  // Radix merender Overlay dan Content sebagai SAUDARA di dalam portal yang
  // sama:
  //
  //   <div data-slot="dialog-portal">
  //     <div data-slot="dialog-overlay" />     <-- self-closing
  //     <div data-slot="dialog-content">...</div>
  //   </div>
  //
  // Jadi overlay tidak PERNAH bisa menjadi wadah flex bagi dialog. Pola yang
  // pernah dipakai di sini (overlay jadi `display: flex`, dialog jadi
  // `position: relative`) akibatnya tidak memusatkan apa pun dan
  // menjatuhkan dialog ke alur normal dokumen, yaitu anak terakhir <body>.
  const primitive = source("../components/ui/dialog.tsx");
  expect(primitive).toContain("<DialogOverlay className={overlayClassName} />");
  expect(primitive).not.toMatch(
    /<DialogOverlay[^>]*>[\s\S]*?<\/DialogOverlay>/,
  );

  const block = css.slice(
    css.indexOf(".admin-dialog-content {"),
    css.indexOf("}", css.indexOf(".admin-dialog-content {")),
  );
  expect(block).toContain("position: fixed");
  expect(block).toContain("inset: 0");
  expect(block).toContain("margin: auto");
  // Tanpa ini, `translate-x-[-50%]` bawaan shadcn menggeser dialog sebesar
  // setengah ukuran itself, dan transform animasi menimpa pemusatan.
  expect(block).toContain("translate: none");
  expect(block).toContain("transform: none");
  expect(block).not.toContain("transform: translate(-50%");

  // Aturan yang benar-benar menentukan: `height` yang definite membuat margin
  // auto dihitung nol pada positioning absolut, dan dialog menempel di atas.
  expect(block).not.toMatch(/^\s*height:/m);

  // Overlay sekarang hanya latar. Kalau suatu saat kembali jadi wadah, tiga
  // hal di bawah harus ikut hilang, karena tidak ada yang memusatkannya lagi.
  const overlay = css.slice(
    css.indexOf(".admin-dialog-overlay {"),
    css.indexOf("}", css.indexOf(".admin-dialog-overlay {")),
  );
  expect(overlay).not.toContain("display: flex");
  expect(overlay).not.toContain("align-items");
});

test("tinggi dialog mengikuti viewport yang terlihat, bukan layout viewport", () => {
  // Urutan itu penting dan mudah terbalik. `max-height: 100%` yang ditulis
  // setelah `calc(100dvh - ...)` menang dan mematikan aturan yang justru kita
  // inginkan: pada Android yang keyboardnya naik, 100% tetap mengacu ke layout
  // viewport yang tidak menyusut, sehingga dialog lebih tinggi dari area yang
  // terlihat dan tombolnya tertutup keyboard.
  for (const selector of [".admin-dialog-content {", ".admin-confirm-content {"]) {
    // `.admin-confirm-content {` muncul dua kali: satu untuk scope portal dan
    // satu untuk layout. Yang diuji adalah yang terakhir.
    const start = css.lastIndexOf(selector);
    const block = css.slice(start, css.indexOf("}", start));
    const fallback = block.indexOf("max-height: 100%");
    const dynamic = block.indexOf("max-height: calc(100dvh");
    expect(fallback, selector).toBeGreaterThan(-1);
    expect(dynamic, selector).toBeGreaterThan(-1);
    // Fallback ditulis lebih dulu, aturan dvh menimpanya belakangan.
    expect(dynamic, selector).toBeGreaterThan(fallback);
  }
});

test("meta viewport memberi tahu peramban agar keyboard menyusutkan layout", () => {
  // Tanpa `interactive-widget=resizes-content`, `position: fixed` plus
  // `100dvh` tetap mengacu ke layar penuh ketika keyboard Android naik, dan
  // dialog yang terpusat setengahnya tidak terlihat.
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  expect(html).toContain("interactive-widget=resizes-content");
  // Dan baris aman untuk bilah gestur harus ada di dalam dialog.
  const block = css.slice(
    css.indexOf(".admin-dialog-content {"),
    css.indexOf("}", css.indexOf(".admin-dialog-content {")),
  );
  expect(block).toContain("env(safe-area-inset-bottom");
});

test("animasi masuk dialog halus, bertahap, dan hormati reduced motion", () => {
  expect(css).toContain("@keyframes admin-dialog-in");
  expect(css).toContain("@keyframes admin-dialog-out");
  expect(css).toContain("@keyframes admin-overlay-in");
  expect(css).toContain("@keyframes admin-overlay-out");
  // Isi dialog menyusul panelnya secara berurutan.
  expect(css).toContain("@keyframes admin-dialog-part-in");
  expect(css).toContain('.admin-dialog-content[data-state="open"] > *:nth-child(1)');
  expect(css).toContain(".admin-dialog-content[data-state=\"open\"] > *:nth-child(3)");
  // Jeda stagger berada di dalam blok no-preference, jadi tidak pernah jalan
  // untuk pengguna yang meminta gerakan minimal.
  const stagger = css.slice(
    css.indexOf("@media (prefers-reduced-motion: no-preference)"),
  );
  expect(stagger).toContain("admin-dialog-part-in");
  // `both` menahan transform hasil animasi dan menang atas `admin-btn:hover`.
  // `backwards` tidak: gaya natural tombol kembali berlaku setelah animasi.
  const open = css.slice(
    css.indexOf('.admin-dialog-content[data-state="open"] {'),
    css.indexOf("}", css.indexOf('.admin-dialog-content[data-state="open"] {')),
  );
  expect(open).toContain("backwards");
  expect(open).not.toContain("both");
});

test("token baru dipakai di markup, bukan hanya ada di CSS", () => {
  // Token yang hanya ada di stylesheet tidak memperbaiki apa pun.
  const governance = source("../components/admin-governance.tsx");
  expect(governance).toContain("admin-btn-success");
  expect(governance).toContain("admin-btn-highlight");
  expect(governance).toContain("admin-link");
  expect(governance).toContain("admin-disclosure");
  // Peran pengelola hanya untuk akun pemilik.
  expect(governance).toContain("{access.isOwner ? (");
});

test("tombol keluar dari daftar undangan memakai tombol admin, bukan tautan merah", () => {
  const governance = source("../components/admin-governance.tsx");
  expect(governance).toContain(
    'className="admin-btn admin-btn-danger px-2 py-1 text-xs"',
  );
  expect(governance).not.toContain("text-red-700");
});

test("dialog cabut sesi memakai tema admin, termasuk tombol danger", () => {
  const revoke = source("../components/admin-session-revoke.tsx");
  expect(revoke).toContain("<AdminDialogContent");
  expect(revoke).toContain('from "@/components/admin-dialog"');
  // Detail perangkat tidak boleh memakai kotak melengkung gaya aplikasi.
  expect(revoke).not.toContain("rounded-xl");
});

test("halaman akses ditolak memakai admin, bukan gaya aplikasi", () => {
  const gate = source("../components/admin-access-gate.tsx");
  expect(gate).not.toContain("rounded-lg");
  expect(gate).not.toContain("rounded-2xl");
  expect(gate).not.toContain("text-red-700");
});

test("menu header punya isi yang lengkap dan bisa diakses", () => {
  const workspace = source("../components/admin-workspace.tsx");
  // Tombol Beranda tidak lagi memenuhi header: ia pindah ke menu.
  expect(workspace).not.toContain("Kembali ke katalog");
  expect(workspace).toContain('role="menu"');
  expect(workspace).toContain('role="menuitem"');
  expect(workspace).toContain('aria-haspopup="menu"');
  expect(workspace).toContain("aria-expanded={menuOpen}");
  expect(workspace).toContain('id="admin-workspace-menu"');
  for (const label of ["Beranda", "Profil", "Keluar"]) {
    expect(workspace, label).toContain(label);
  }
  // Ketiganya harus punya ikon, dan Keluar harus memakai ikon pintu keluar.
  expect(workspace).toContain("<LogOut");
  expect(workspace).toContain("<ArrowLeft");
  // Ikon digambar sendiri, bukan aset eksternal.
  expect(workspace).toContain("admin-menu-icon");
  expect(workspace).not.toMatch(/https?:\/\/[^"']*menu[^"']*\.(svg|png)/);
  // Keluar lewat modul bersama, bukan implementasi kedua. Item menunya cuma
  // membuka konfirmasi; dialognya dipasang di luar panel menu supaya tidak
  // ikut terlepas bersama panel yang menutupi dirinya.
  expect(workspace).toContain("AdminLogoutConfirm");
  expect(workspace).toContain("setLogoutOpen(true)");
});

test("alur keluar punya satu implementasi saja", () => {
  const sessionActions = source("../components/admin-session-actions.tsx");
  const workspace = source("../components/admin-workspace.tsx");
  const logoutButton = source("../components/admin-logout-button.tsx");
  const logoutModule = source("../lib/admin-logout.ts");
  // Hanya modul bersama yang boleh menyentuh `logoutAdmin`, dan hanya satu
  // komponen yang boleh memanggilnya. Dua tempat memang memanggil keluar
  // (menu header dan panel Sesi), tapi keduanya lewat komponen yang sama.
  expect(sessionActions).toContain("AdminLogoutButton");
  expect(workspace).toContain("AdminLogoutConfirm");
  expect(logoutButton).toContain("useAdminLogout");
  for (const file of [sessionActions, workspace]) {
    expect(file).not.toContain("useAdminLogout");
    expect(file).not.toContain("api.adminGate.logoutAdmin");
  }
  expect(logoutModule).toContain("api.adminGate.logoutAdmin");
});

test("keluar dari ruang admin selalu ditanyakan lebih dulu", () => {
  const logoutButton = source("../components/admin-logout-button.tsx");
  // Tanpa konfirmasi, satu getar tidak sengaja di menu header langsung menutup
  // ruang kerja, dan sesi yang sudah dicabut di server tidak bisa dikembalikan.
  expect(logoutButton).toContain("Anda yakin ingin mengakhiri sesi ini?");
  expect(logoutButton).toContain("Batal, lanjut bekerja");
  // Konfirmasi memakai dialog admin: terpusat, animasi masuk, dan tidak
  // menutup dirinya sendiri di Android saat keyboard naik.
  expect(logoutButton).toContain("<AdminDialogContent");
  expect(logoutButton).not.toContain("<DialogContent");
  // Peringatan kehilangan isian harus ada, karena itu alasan sebenarnya
  // orang menyesal menekan "Keluar".
  expect(logoutButton).toContain("belum disimpan");
});

test("tampilan panel Sesi dan menu header memakai komponen keluar yang sama", () => {
  // Dua tombol keluar dengan dua konfirmasi berbeda pasti akan berbeda pada
  // suatu saat. Yang dijaga adalah keduanya memanggil BERKAS yang sama.
  const logoutButton = source("../components/admin-logout-button.tsx");
  expect(logoutButton).toContain("export function AdminLogoutButton");
  expect(logoutButton).toContain("export function AdminLogoutConfirm");
  // Hanya satu tempat yang benar-benar memanggil keluar.
  expect(logoutButton.split("logoutAdmin()").length - 1).toBe(1);
});

test("layar masuk ruang pengelola memakai tema ruang kerja", () => {
  const panel = source("../components/auth-admin-panel.tsx");
  const auth = source("../pages/Auth.tsx");
  // Primitive admin saja. Kartu, isian, dan tombol aplikasi tidak boleh masuk.
  expect(panel).toContain("admin-workspace");
  expect(panel).toContain("admin-panel");
  expect(panel).toContain("admin-input");
  expect(panel).toContain("admin-btn");
  expect(panel).not.toContain("notebook-paper");
  for (const component of ["Card", "Input", "Button"]) {
    expect(panel, component).not.toContain(`from "@/components/ui/${component.toLowerCase()}"`);
  }
  // Halaman publik dan halaman admin tidak boleh saling menimpa: dasar
  // kuskus admin adalah tujuan, bukan sekadar URL yang sedang dibuka.
  expect(auth).toContain("isAdminDestination(redirect)");
  expect(auth).toContain("if (adminGateRequired) {");
  // Layar buat sandi baru ikut bertema, termasuk lewat tautan email yang
  // tidak membawa `returnTo`.
  expect(auth).toContain("variant={adminGateRequired || adminIntent ?");
  expect(auth).toContain("rememberAdminAuthIntent(redirect)");
  expect(auth).toContain("consumeAdminAuthIntent()");
});

test("gelar pemilik hanya boleh ditulis di modulnya", () => {
  // Aturan ini sudah ada; di sini dijaga ulang karena header baru memakai
  // gelar singkat yang berbeda dan bisa ditulis ulang di tempat lain.
  for (const file of ADMIN_SOURCES) {
    if (file.includes("owner-account")) continue;
    expect(source(file), file).not.toContain("SuperAdmin");
  }
  const ownerModule = source("../lib/owner-account.ts");
  expect(ownerModule).toContain("OWNER_SHORT_TITLE");
});