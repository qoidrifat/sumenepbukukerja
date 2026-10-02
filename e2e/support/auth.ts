import { expect, test, type Page } from "@playwright/test";

/**
 * Autentikasi untuk E2E.
 *
 * Tiga aturan yang tidak boleh dilanggar di berkas ini:
 *
 *  1. Tidak ada kredensial yang ditulis di source. Semuanya dibaca dari
 *     environment (`E2E_*`), persis seperti yang sudah dipakai `flows.spec.ts`
 *     sebelum helper ini ada. Kalau environment-nya kosong, test di-skip
 *     dengan pesan yang menyebut nama variabelnya - bukan gagal, dan bukan
 *     diam-diam lolos tanpa pemeriksaan apa pun.
 *
 *  2. Tidak ada token, cookie, atau storageState yang di-hardcode, dan
 *     tidak ada yang menulis ke dalam repo. Berkas kredensial hanya dibaca
 *     dari disk kalau pemanggil menyodorkan path-nya, dan path itu harus
 *     berada di luar version control.
 *
 *  3. Peran pengelola di frontend tidak pernah ditentukan di sisi klien.
 *     Sesi yang dipakai di sini adalah sesi akun uji yang sungguhan, dengan
 *     peran yang benar-benar diberikan server. Tidak ada jalan pintas.
 */

const authEmail = process.env.E2E_USER_EMAIL;
const authPassword = process.env.E2E_USER_PASSWORD;
const adminPasscode = process.env.E2E_ADMIN_PASSCODE;

/**
 * Alasan skip kalau kredensial akun uji belum diisi.
 *
 * Dipisah jadi konstanta supaya pesan yang sama tidak ditulis ulang di lima
 * tempat dengan lima kalimat berbeda.
 */
export const SKIP_NO_CREDENTIALS =
  "Butuh E2E_USER_EMAIL + E2E_USER_PASSWORD untuk akun uji nyata "
  + "(akunnya ada di Keys/deployment, bukan di repo ini)";

/** Alasan skip kalau gerbang passcode admin aktif tapi passcode-nya belum diisi. */
export const SKIP_NO_PASSCODE =
  "Gerbang passcode admin aktif, tapi E2E_ADMIN_PASSCODE belum diisi. "
  + "Dialog profil hidup DI BALIK gerbang itu, jadi tanpa passcode test "
  + "hanya bisa memastikan gerbangnya ada - bukan menguji dialognya.";

export function hasCredentials(): boolean {
  return Boolean(authEmail && authPassword);
}

/**
 * Masuk ke aplikasi memakai akun uji.
 *
 * Yang diuji adalah konsekuensinya, bukan hanya klik tombolnya: setelah
 * `click`, assertion waits pada URL tujuan. Kalau sesi tidak terbentuk,
 * kegagalan muncul sebagai timeout yang menunjuk halaman auth - jauh lebih
 * berguna daripada test yang hijau karena hanya memeriksa tombolnya diklik.
 */
export async function signIn(page: Page, returnTo = "/dashboard"): Promise<void> {
  await page.goto(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByPlaceholder("nama@email.com").fill(authEmail!);
  // Kolom password memakai `type` yang berganti-ganti antara "text" dan
  // "password", jadi labelnya yang dipakai - bukan placeholder - supaya test
  // ini tidak ikut pecah saat komponennya diubah.
  await page.locator('input[type="password"]').first().fill(authPassword!);
  await page.getByRole("button", { name: /Masuk ke Buku Kerja/i }).click();
  await expect(page).toHaveURL(new RegExp(returnTo.replace("/", "\\/")), {
    timeout: 20_000,
  });
}

/**
 * Buka Ruang Pengelola sampai tombol menu di header benar-benar terlihat.
 *
 * Gerbang passcode diperiksa dengan MENUNGGU, bukan dengan `count()`.
 * `count()` dibaca seketika setelah `goto`, sementara `AnimatedContent`
 * (Framer Motion) belum sempat me-mount elemennya - di Desktop kebetulan
 * sudah ada, di Pixel 5 belum. Persis ketidakkonsistenan perangkat itu yang
 * membuat test yang sama lulus di satu perangkat dan skip di perangkat lain,
 * dan skip seperti itu menghapus seluruh pemeriksaan tanpa ada yang gagal.
 * Catatan yang sama sudah ada di `flows.spec.ts`, "Skenario C".
 */
export async function openAdminWorkspace(page: Page): Promise<void> {
  await signIn(page, "/admin");

  const passcodeField = page.locator('input[name="passcode"]');
  const passcodeVisible = await passcodeField
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (passcodeVisible) {
    // Gerbangnya nyata. Tanpa passcode yang benar, isi meja kerja TIDAK BOLEH
    // pernah terlihat - jadi test di-lewati, bukan diteruskan. Yang sudah
    // dipastikan di sini adalah jeratnya tetap ada, karena itu pemeriksaan
    // keamanan yang paling penting di halaman admin.
    await expect(
      passcodeField,
      "gerbang passcode harus tetap menutupi isi meja kerja",
    ).toBeVisible();
    test.skip(!adminPasscode, SKIP_NO_PASSCODE);
    await passcodeField.fill(adminPasscode!);
    await page.getByRole("button", { name: /Buka|Masuk/i }).first().click();
  }

  // Membuktikan ruang pengelola benar-benar terbuka. Tanpa ini, test bisa
  // hijau hanya karena sedang melihat halaman yang salah - misalnya panel
  // passcode yang belum pernah ditembus.
  await expect(
    page.getByRole("button", { name: /menu ruang pengelola/i }),
    "ruang kelola harus terbuka sampai tombol menunya terlihat",
  ).toBeVisible({ timeout: 15_000 });
}
