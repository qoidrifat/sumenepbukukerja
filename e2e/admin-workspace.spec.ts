import { expect, test, type Page } from "@playwright/test";

/**
 * Dialog profil di menu ruang pengelola.
 *
 * Berkas ini lahir dari satu bug yang lolos DUA kali, dan alasannya sekarang
 * jelas. Dialog profil pernah dirender DI DALAM panel menu, sementara panel
 * itu dibungkus `AnimatePresence` yang mencabut seluruh anaknya begitu panel
 * menutup - dan klik pada pemicunya sendiri yang menutup panel, di handler
 * yang sama yang membuka dialog.
 *
 * Gejalanya berbeda di dua perangkat, padahal sebabnya satu:
 *
 * - Desktop: dialog hanya hidup selama animasi keluar panel (spring
 * `stiffness 420, damping 32, mass 0.7`, sekitar 150-250 ms), sementara
 * animasi MASUK dialog sendiri berdurasi 200 ms. Durasinya nyaris sama,
 * jadi dialog mati tepat di detik ia baru selesai memudar masuk. Mata
 * sudah terikat di tombolhamburger: hasilnya "tidak muncul sama sekali".
 * - Pixel 5: siklus sentuh dan kompositor lebih lambat, jadi beberapa frame
 * sempat ter-render. Hasilnya "terbuka sebentar, lalu menutup sendiri" -
 * tanpa pengguna menyentuh Tutup, Escape, maupun latarnya.
 *
 * Kenapa test di dalam `src/` tidak pernah menangkapnya: proyek ini tidak
 * punya @testing-library/react maupun jsdom, dan `vitest.config.ts` memakai
 * `environment: "edge-runtime"`. Semua 74 berkas test di `src/` karena itu
 * hanya MEMBACA TEKS sumber - termasuk test posisi untuk dialog ini, yang
 * membandingkan posisi string di dalam berkas dan tidak pernah menjalankan
 * React sama sekali. Test posisi itu berguna, tapi ia tidak bisa menyentuh
 * yang justru patah di sini: urutan waktu antara animasi keluar panel dan
 * proses unmount.
 *
 * Berkas ini menutup celah itu. Yang diuji adalah PERILAKU, di dua perangkat
 * yang memang berbeda (lihat `projects` di `playwright.config.ts`):
 * `chromium-desktop` dan `chromium-android` (Pixel 5).
 *
 * Kredensial TIDAK pernah ditulis di sini. Skenario yang butuh akun nyata
 * membaca dari environment (`E2E_*`) dan dilewati dengan pesan jelas kalau
 * kredensialnya belum diisi, supaya `test:e2e` tetap bisa dijalankan di
 * lingkungan tanpa secret. Konvensinya sama dengan `flows.spec.ts`.
 *
 * CATATAN Jujur soal batasnya: tanpa kredensial dan passcode admin, test ini
 * DILEWATI, jadi di CI tanpa secret ia tidak melindungi apa pun. Yang
 *Mélindungi tanpa kredensial adalah test posisi di `admin-profile.test.ts`.
 * Keduanya sengaja ada: yang satu menangkap urutan waktu, yang satu menangkap
 * perubahan struktur.
 */

const authEmail = process.env.E2E_USER_EMAIL;
const authPassword = process.env.E2E_USER_PASSWORD;
const adminPasscode = process.env.E2E_ADMIN_PASSCODE;

/**
 * Berapa lama dialog harus bertahan tanpaTnganpa campur tangan.
 *
 * Nilainya sengaja jauh lebih besar dari durasi animasi yang tersangkut
 * (~250 ms). Kalau nilainya kecil, `toBeVisible()` pertama bisa menangkap
 * kilatan yang memang salah - dialog terlihat selama beberapa frame, lalu
 * hilang. Test yang hanya memeriksa "dialog terlihat" akan hijau persis di
 * device yang rusak. Yang diuji justru KETAHUANNYA: dialog harus masih
 * ada jauh setelah semua animasi selesai.
 */
const SETTLE_MS = 1_500;

/** Dialog profil, diidentifikasi lewat penanda yang dipakai penjaga pointerdown. */
const profileDialog = (page: Page) => page.locator("[data-admin-dialog]");

/** Menu ruang pengelola. */
const workspaceMenu = (page: Page) => page.getByRole("menu", { name: "Menu ruang pengelola" });

async function signIn(page: Page): Promise<void> {
 await page.goto("/auth");
 await page.getByPlaceholder("nama@email.com").fill(authEmail!);
 // Kolom password memakai `type` bergantian, jadi labelnya yang dipakai -
 // bukan placeholder - supaya tidak ikut berubah saat komponennya berubah.
 await page.locator('input[type="password"]').first().fill(authPassword!);
 await page.getByRole("button", { name: /Masuk ke Buku Kerja/i }).click();
 await expect(page).toHaveURL(/\/(dashboard|admin)/);
}

/**
 * Buka ruang pengelola sampai panel header benar-benar ada.
 *
 * Gerbang passcode diperiksa dengan menunggu, bukan dengan `count()`.Jmban
 * `count()` dibaca seketika setelah `goto`, padahal `AnimatedContent` belum
 * sempat me-mount elemennya - di Desktop kebetulan sudah ada, di Pixel 5 belum.
 * Persis	 ketidakkonsistenan perangkat itu yang membuat test yang sama PASS
 * di satu perangkat dan SKIP di perangkat lain, dan skip seperti itu menghapus
 * seluruh pemeriksaan tanpa ada yang gagal. unpaid Lihat catatan panjang di
 * `flows.spec.ts`, "Skenario C".
 */
async function openAdminWorkspace(page: Page): Promise<void> {
 await signIn(page);
 await page.goto("/admin");

 const passcodeField = page.locator('input[name="passcode"]');
 const passcodeVisible = await passcodeField
 .waitFor({ state: "visible", timeout: 5_000 })
 .then(() => true)
 .catch(() => false);

 if (passcodeVisible) {
 test.skip(
 !adminPasscode,
 "Gerbang passcode admin aktif, tapi E2E_ADMIN_PASSCODE belum diisi. "
 + "Dialog profil ada DI BALIK gerbang ini, jadi tanpa passcode test ini "
 + "hanya bisa memastikan gerbangnya ada - bukan menguji dialognya.",
 );
 await passcodeField.fill(adminPasscode!);
 await page.getByRole("button", { name: /Masuk|Buka/i }).first().click();
 }

 // Membuktikan ruang pengelola benar-benar terbuka. Header adalah tempat
 // menu dan dialog-nya hidup, jadi tanpa ini test bisa "hijau" hanya karena
 // sedang melihat halaman yang salah.
 await expect(
 page.getByRole("button", { name: /menu ruang pengelola/i }),
 "ruang pengelola harus terbuka sampai tombol menunya terlihat",
 ).toBeVisible({ timeout: 15_000 });
}

test.describe("Dialog profil di menu ruang pengelola", () => {
 test.beforeEach(async ({ page }) => {
 test.skip(
 !authEmail || !authPassword,
 "Butuh E2E_USER_EMAIL + E2E_USER_PASSWORD (akun uji nyata di Keys/deployment)",
 );
 await openAdminWorkspace(page);
 });

 test("dialog profil bertahan jauh setelah menu ditutup", async ({ page }) => {
 // PEMBUKA menu. Labelnya berubah jadi "Tutup ..." saat terbuka, jadi
 // pemangkalnya tidak boleh menyertakan kata itu.
 await page.getByRole("button", { name: /Buka menu ruang pengelola/i }).click();
 await expect(workspaceMenu(page)).toBeVisible();

 // PEMICU yang jadiIRESponsible atas bug ini.
 await page.getByRole("menuitem", { name: "Atur profil" }).click();

 // (1) Dialog harus benar-benar muncul. Ini yang gagal di desktop.
 await expect(
 profileDialog(page),
 "dialog profil harus muncul setelah menuitem Profil diklik",
 ).toBeVisible({ timeout: 5_000 });

 // (2) Menu harus ikut tertutup. Ini perilaku yang disengaja: panelnya
 // dicabut, dan itu aman HANYA karena dialognya hidup di luar
 // `AnimatePresence`. Kalau panel tetap terbuka, ia muncul lagi begitu
 // dialog ditutup dan menutupi layar.
 await expect(workspaceMenu(page)).toBeHidden();

 // (3) Pemeriksaan yang benar-benar menangkap bug. `toBeVisible()` di (1)
 // bisa sah-sah hijau selama kilatan 200 ms; di sinilah kilatannya habis
 // dan kebenaranell's terlihat.
 await page.waitForTimeout(SETTLE_MS);
 await expect(
 profileDialog(page),
 "dialog profil harus masih ada 1,5 detik setelah dibuka. Kalau hilang "
 + "di sini, dialog masih ikut tercabut bersama panel menu.",
 ).toBeVisible();
 });

 test("ketukan di dalam dialog tidak menutupnya", async ({ page }) => {
 // Jalur kedua yang reported user sebagai "menutup dengan sendirinya".
 //
 // Penutup menu adalah `document.addEventListener("pointerdown")` milik
 // `admin-workspace.tsx`, sedangkan dialog dirender lewat PORTAL ke
 // `document.body` - sehingga isinya berada DI LUAR header dan setiap
 // ketukan di dalamnya terbaca sebagai "di luar". Perhatikan bahwa
 // `preventDefault` milik Radix di `admin-dialog.tsx` tidak akan pernah
 // mencegah listener milik komponen lain: keduanya independen.
 //
 // Di Android, menyentuh isian adalah gesture paling natural kedua setelah
 // membuka dialog, jadi kalau jalur ini bocor, produk ini rusak di tangan
 // setiap pengguna ponsel.
 await page.getByRole("button", { name: /Buka menu ruang pengelola/i }).click();
 await page.getByRole("menuitem", { name: "Atur profil" }).click();
 await expect(profileDialog(page)).toBeVisible({ timeout: 5_000 });
 await page.waitForTimeout(SETTLE_MS);

 // Ketuk isian nama - sentuhan nyata, bukan klik sintetis. Di Pixel 5
 // inilah yang memunculkan keyboard.
 const nameField = page.locator("#admin-profile-name");
 await expect(nameField).toBeVisible();
 await nameField.click();
 await nameField.fill("");

 // Ketuk lagi di area dialog yang bukan isian, untuk membuktikan bukan
 // cuma isian yang aman.
 await page.getByRole("heading", { name: "Atur profil" }).click();
 await page.waitForTimeout(500);

 await expect(
 profileDialog(page),
 "ketukan di dalam dialog tidak boleh menutupnya. Dialognya masih hidup, "
 + "jadi yang menutup pastilah penutup menu milik header.",
 ).toBeVisible();
 });

 test("tombol Tutup tetap menutup dialog", async ({ page }) => {
 // Penjaga terhadap perbaikan yang berlebihan. Salah satu cara "memperbaiki"
 // gejala di atas adalah membuat dialog tidak bisa ditutup sama sekali -
 // dan itu produk yang lebih buruk, karena pengguna kehilangan jalan keluar
 // yang sengaja disediakan.
 await page.getByRole("button", { name: /Buka menu ruang pengelola/i }).click();
 await page.getByRole("menuitem", { name: "Atur profil" }).click();
 await expect(profileDialog(page)).toBeVisible({ timeout: 5_000 });
 await page.waitForTimeout(SETTLE_MS);

 await profileDialog(page).getByRole("button", { name: "Tutup" }).click();
 await expect(
 profileDialog(page),
 "tombol Tutup harus menutup dialog",
 ).toBeHidden({ timeout: 5_000 });
 });
});
