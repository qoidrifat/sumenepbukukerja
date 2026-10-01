import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Tombol profil di header ruang pengelola dan audit field tanggal/waktu.
 *
 * Dua hal di sini yang tidak bisa dibuktikan dari sisi server:
 *  1. Ikon orang benar-benar ada di sebelah label peran, dan dialognya
 *     memakai scope admin yang sama dengan form passcode. Tanpa scope itu,
 *     seluruh kelas admin di dalam dialog tidak akan cocok sama sekali.
 *  2. Field tanggal/waktu di tiap permukaan memakai kelas yang sesuai dengan
 *     tema halaman itu - dan TIDAK memakai kelas milik tema yang lain. Ikon
 *     kalender digambar sistem operasi, jadi satu-satunya kendali kita adalah
 *     selector yang tepat sasaran.
 */

const workspace = readFileSync(
  new URL("./admin-workspace.tsx", import.meta.url),
  "utf8",
);
const profile = readFileSync(new URL("./admin-profile.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../pages/Admin.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
const community = readFileSync(
  new URL("./community-widgets.tsx", import.meta.url),
  "utf8",
);

test("ikon orang ada di sebelah label peran di header", () => {
  // `shrink-0` pada kotak peran adalah load-bearing: header ini memakai
  // `justify-between` di dalam grup kiri yang boleh menyusut, jadi tanpa itu
  // kotak peran ikut gepeng persis di layar ponsel yang paling menyebalkan.
  const roleIndex = workspace.indexOf("admin-status admin-status-confirmed ml-1 shrink-0");
  // Pemicunya pindah ke menu header (Fase 9.2), jadi yang dicari di
  // `admin-workspace.tsx` adalah pemanggilan dengan variant menu. Yang tetap
  // dijaga: panel peran dan pemicu profil ada di header yang sama, dan
  // keduanya bukan sekadar teks.
  const profileIndex = workspace.indexOf("<AdminProfile variant=\"menu\"");
  expect(roleIndex).toBeGreaterThan(-1);
  expect(profileIndex).toBeGreaterThan(-1);
  // Aksesibel lewat nama, bukan hanya ikon.
  expect(profile).toContain('aria-label="Atur profil"');
  expect(profile).toContain("<UserRound");
  // Bentuk menu harus menyamar sebagai baris menu, bukan tombol avatar.
  expect(profile).toContain('className="admin-menu-item"');
});

test("tombol profil memakai token admin, bukan gaya tombol generik", () => {
  expect(profile).toContain("border-2 border-[#121212]");
  expect(profile).toContain("rounded-[2px]");
  expect(profile).toContain("shadow-[2px_2px_0_0_#121212]");
  expect(profile).toContain("hover:bg-[#FFE662]");
  // `shrink-0` wajib: header memakai justify-between, tanpa itu target
  // sentuhnya ikut gepeng.
  expect(profile).toMatch(/className="flex shrink-0 items-center/);
});

test("dialog profil memakai scope admin-dialog yang sama dengan form passcode", () => {
  // Semua dialog admin lewat SATU komponen. Scope admin melekat pada
  // komponennya, jadi tidak ada dialog yang bisa lupa memakainya - dan test
  // cukup memeriksa satu import, bukan tiga penulisan className.
  expect(profile).toContain('from "@/components/admin-dialog"');
  expect(profile).toContain("<AdminDialogContent");
  // `DialogContent` polos tidak boleh langsung dipakai di mana pun.
  expect(profile).not.toContain("<DialogContent");
  expect(profile).toContain("admin-input");
  expect(profile).toContain("admin-btn admin-btn-primary");
  // Warnanya memakai token admin, bukan palet baru.
  expect(profile).not.toMatch(/from "@\/components\/ui\/button"/);
});

test("tombol tutup bawaan disembunyikan supaya tidak menimpa header", () => {
  // `DialogContent` merender tombol X `absolute top-4 right-4`. Di dialog ini
  // isi paling atas adalah header kuning setinggi belasan baris, sehingga X
  // itu mendarat di atas judul dan teksnya. Footer sudah punya tombol "Tutup",
  // jadi tombol kedua hanya menambah satu jalan keluar yang tidak perlu, dan
  // membuat header terlihat berantakan.
  //
  // Nilai defaultnya sekarang ada di `AdminDialogContent`, jadi tidak ada satu
  // pun dialog admin yang perlu mengingatinya.
  const wrapper = readFileSync(
    new URL("./admin-dialog.tsx", import.meta.url),
    "utf8",
  );
  expect(wrapper).toContain("showCloseButton = false");
  expect(profile).not.toContain("showCloseButton");
});

test("dialog profil memusatkan dirinya sendiri, bukan lewat overlay", () => {
  // Dua pola lama keduanya salah, dan alasannya berbeda.
  //
  //   a) `transform: translate(-50%,-50%)` bersama utility translate shadcn
  //      memakai property yang sama, jadi dialog bergeser dua kali.
  //   b) `position: fixed; inset: 0; height: max-content; margin: auto`:
  //      untuk abspos yang sepenuhnya ter-constraint, margin `auto` dihitung
  //      nol, dialog menempel di `top: 0`, dan pita judulnya terpotong.
  //   c) Overlay dijadikan wadah flex dengan dialog `position: relative`:
  //      Radix merender overlay dan content sebagai SAUDARA, jadi dialog
  //      bukan anak flex itu dan jatuh ke alur normal dokumen.
  //
  // Yang benar: dialog memusatkan diri sendiri lewat `inset: 0` + `margin:
  // auto` dengan `height` yang tetap auto.
  const overlay = css.slice(
    css.indexOf(".admin-dialog-overlay {"),
    css.indexOf("}", css.indexOf(".admin-dialog-overlay {")),
  );
  // Overlay sekarang hanya latar, jadi tidak boleh punya sifat wadah.
  expect(overlay).not.toContain("display: flex");
  expect(overlay).not.toContain("align-items");

  const block = css.slice(
    css.indexOf(".admin-dialog-content {"),
    css.indexOf("}", css.indexOf(".admin-dialog-content {")),
  );
  expect(block).toContain("position: fixed");
  expect(block).toContain("inset: 0");
  expect(block).toContain("margin: auto");
  expect(block).toContain("translate: none");
  // Inilah yang menentukan: `height` yang definite membuat margin auto nol.
  expect(block).not.toMatch(/^\s*height:/m);
  // Bilah gestur Android tidak boleh menimpa baris tombol paling bawah.
  expect(block).toContain("env(safe-area-inset-bottom");
  // Tinggi mengikuti viewport yang benar-benar terlihat: keyboard Android
  // yang naik harus ikut memperkecil area dialog. Fallback ditulis lebih dulu
  // supaya aturan dvh yang menimpanya belakangan.
  const fallback = block.indexOf("max-height: 100%");
  const dynamic = block.indexOf("max-height: calc(100dvh");
  expect(fallback).toBeGreaterThan(-1);
  expect(dynamic).toBeGreaterThan(fallback);
});

test("email sengaja tidak bisa diedit di panel profil", () => {
  // Email ditampilkan, tapi tidak pernah jadi isian yang bisa diubah.
  expect(profile).toContain("{profile?.email}");
  expect(profile).not.toMatch(/value=\{profile\?\.email\}/);
  expect(profile).toContain("Email tidak bisa diubah di sini.");
});

test("id berkas dibaca dari jawaban unggah, bukan dari seluruh jawabannya", () => {
  // Ini error yang benar-benar terjadi: `setPending((await response.json()) as
  // string)` membuat `imageStorageId` berisi `{ storageId: "..." }`, dan server
  // menolaknya dengan ArgumentValidationError karena validatornya `v.string()`.
  // `as` mematikan pemeriksaan tipe, jadi tidak ada satu pun peringatan dari
  // TypeScript sebelum kejadian itu.
  //
  // Pembacaan jawaban jawaban sekarang TIDAK ditulis di komponen ini lagi:
  // seluruh alur unggah melewati `uploadWithDedup`, satu-satunya tempat yang
  // boleh menyentuh `response.json()`.
  expect(profile).toContain("uploadWithDedup(");
  expect(profile).not.toMatch(/response\.json\(\)\)\s*as\s+string/);
  expect(profile).not.toContain("await response.json()");
  // Semua situs unggah lain di aplikasi memakai modul yang sama, jadi panel
  // profil dan galeri listing tidak bisa lagi berbeda.
  expect(profile).toContain("setPending(result.storageId)");
});

test("aturan ukuran dan jenis foto diambil dari modul bersama, bukan ditulis ulang", () => {
  // Dua salinan aturan berarti dua kesempatan untuk berbeda pendapat - dan
  // yang paling sering terjadi adalah pesannya berbeda untuk berkas yang sama.
  // Validasi sekarang tinggal di dalam `uploadWithDedup`; komponen ini
  // tidak boleh menulis ulang aturan maupun batasnya sendiri.
  expect(profile).toContain('from "@/lib/image-upload"');
  expect(profile).not.toContain("imageRejection(");
  expect(profile).not.toContain("MAX_IMAGE_BYTES");
  // Teks batasnya pun dari modul itu, jadi tidak bisa lagi berbunyi "1 MB" di
  // UI sementara aturannya 1 MiB di server.
  expect(profile).toContain("Maksimal {MAX_IMAGE_LABEL}");
  expect(profile).toContain("formatBytes(picked.size)");
});

test("dedup dan downscale dilewati lewat satu alur unggah bersama", () => {
  // Tiga jalur unggah (profil, galeri listing, bukti klaim) memakai helper
  // yang sama. Kalau panel profil kembali mengunggah sendiri lewat `fetch`,
  // foto profil berhenti ikut downscale dan dedup - dua keunggulan yang
  // justru paling besar di byte yang terkirim ke storage.
  expect(profile).toContain("uploadWithDedup(file, {");
  expect(profile).toContain("lookupBlobBySha");
  expect(profile).toContain("recordUploadedBlob");
  // Tidak ada unggahan yang menentukan storageId di tempat lain.
  expect(profile).not.toMatch(/fetch\(uploadUrl/);
});

test("menghapus foto adalah niat eksplisit, bukan kesimpulan dari keadaan", () => {
  // Kalau `removeImage` disimpulkan dari `!pending && profile?.hasImage`, maka
  // setelah foto baru tersimpan `hasImage` menjadi true sementara `pending`
  // sudah null - dan menekan "Simpan profil" untuk kedua kalinya menghapus
  // foto yang baru saja disimpan.
  expect(profile).toContain("removeImage: removePhoto ? true : undefined");
  expect(profile).not.toContain("removeImage: !pending");
  expect(profile).toContain("setRemovePhoto(true)");
});

test("field tanggal publik memakai varian publik, bukan varian admin", () => {
  expect(community).toContain("field-date field-date--public");
  expect(community).not.toContain("field-date--admin");
  expect(dashboard).toContain("field-datetime field-datetime--public");
  expect(dashboard).not.toContain("field-datetime--admin");
});

test("field tanggal admin memakai scope admin, bukan varian publik", () => {
  expect(adminPage).toContain('className="field-datetime"');
  expect(adminPage).not.toContain("field-datetime--public");
  // Scope admin di CSS yang membuat ikon kalender ikut tema Warm Brutalism.
  expect(css).toContain(".admin-workspace .field-datetime");
  expect(css).toContain(".admin-dialog-content .field-datetime");
});

test("indicators kalender diberi gaya untuk kedua tema", () => {
  // Tanpa ini, ikon bawaan sistem operasi tetap abu-abu di dalam form admin
  // yang semuanya bergaris 2px dan ber-shadow offset.
  expect(css).toContain("::-webkit-calendar-picker-indicator");
  expect(css).toContain("filter: invert(1)");
  expect(css).toContain("color-scheme: light");
  // Varian publik tidak membalikkan ikon, karena surface publik sudah terang
  // dan ikon system-nya juga gelap.
  expect(css).toContain(".field-date--public::-webkit-calendar-picker-indicator");
});

test("semua field tanggal punya batas bawah dan balikan bahasa Indonesia", () => {
  // Tanpa batas bawah, "dibutuhkan kapan" dan "perkiraan tersedia lagi" bisa
  // diisi masa lalu - yang tidak pernah masuk akal untuk keduanya.
  expect(community).toContain("min={todayISODate()}");
  expect(dashboard).toContain("min={minAvailableAtLocal()}");
  expect(adminPage).toContain("min={minNextAvailableAtLocal()}");
  // Kontrol native memakai lokalitas perangkat; baris balikan menutup celah
  // salah baca 09/10/2026.
  expect(community).toContain("formatNeededAt(neededAt)");
  expect(dashboard).toContain("formatDraftAvailability(draft.nextAvailableAt)");
  expect(adminPage).toContain("Tersimpan:");
});

test("batas bawah dihitung dari waktu lokal, bukan UTC", () => {
  // `toISOString()` selalu UTC: di WIB sebelum pukul 07.00 itu menghasilkan
  // tanggal KEMARIN, dan batas bawahnya ikut bergeser.
  for (const file of [community, dashboard, adminPage]) {
    expect(file).toContain("getTimezoneOffset()");
  }
});