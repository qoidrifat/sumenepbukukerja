import { expect, test, type Page } from "@playwright/test";

/**
 * Autentikasi untuk E2E (Fase 9.5).
 *
 * Pintu sandi dihapus total, jadi tidak ada lagi `E2E_USER_PASSWORD`:
 * satu-satunya jalan non-Google adalah kode OTP, dan kodenya hanya ada
 * di kotak masuk akun uji yang tidak bisa dibaca Playwright. Helper di
 * sini karena itu membuktikan alur SAMPAI tahap kode (halaman OTP terbuka,
 * kode diminta, tahap kode tampil), lalu skip eksplisit - bukan hijau
 * palsu, bukan kegagalan misterius.
 *
 * Tiga aturan yang tidak boleh dilanggar di berkas ini:
 *
 *  1. Tidak ada kredensial yang ditulis di source. Email akun uji dibaca
 *     dari environment (`E2E_USER_EMAIL`). Kalau environment-nya kosong,
 *     test di-skip dengan pesan yang menyebut nama variabelnya - bukan
 *     gagal, dan bukan diam-diam lolos tanpa pemeriksaan apa pun.
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
const adminPasscode = process.env.E2E_ADMIN_PASSCODE;
const storageStateFile = process.env.E2E_STORAGE_STATE;

/**
 * Alasan skip kalau email akun uji belum diisi.
 *
 * Dipisah jadi konstanta supaya pesan yang sama tidak ditulis ulang di lima
 * tempat dengan lima kalimat berbeda.
 */
export const SKIP_NO_CREDENTIALS =
  "Butuh E2E_USER_EMAIL untuk akun uji nyata "
  + "(Fase 9.5: E2E_USER_PASSWORD sudah pensiun bersama pintu sandi)";

/** Alasan skip kalau kode OTP tidak bisa dibaca dari kotak masuk. */
export const SKIP_NO_INBOX =
  "Menyelesaikan OTP butuh kode 6 digit dari kotak masuk akun uji, yang "
  + "tidak bisa dibaca Playwright. Halaman OTP + permintaan kode terbukti di "
  + "atas; sisanya OPEN - TEST INFRASTRUCTURE GAP (penerus F-17).";

/**
 * Alasan skip kalau tidak ada sesi yang bisa dipakai sama sekali.
 *
 * Beda dari `SKIP_NO_INBOX`: yang itu berhenti di tahap kode karena kotak
 * masuknya tidak terbaca. Di sini yang dibutuhkan bukan kode, melainkan sesi
 * yang SUDAH jadi - hasil login OTP sungguhan yang disimpan operator sebagai
 * `storageState`, dan berkasnya wajib berada di luar version control
 * (aturan 2 di atas). Tanpa sesi itu Playwright berhenti di gerbang
 * `RequireAuth` dan hanya melihat kartu "Masuk untuk melanjutkan"; mengukur
 * kartu itu bukan berarti mengukur halaman di baliknya.
 */
export const SKIP_NO_SESSION =
  "Butuh E2E_STORAGE_STATE yang menunjuk berkas storageState sesi sungguhan "
  + "di luar version control; tanpa itu Playwright tidak bisa melewati "
  + "RequireAuth dan halaman yang diukur hanya kartu 'Masuk untuk melanjutkan'.";

/** Alasan skip kalau gerbang passcode admin aktif tapi passcode-nya belum diisi. */
export const SKIP_NO_PASSCODE =
  "Gerbang passcode admin aktif, tapi E2E_ADMIN_PASSCODE belum diisi. "
  + "Dialog profil hidup DI BALIK gerbang itu, jadi tanpa passcode test "
  + "hanya bisa memastikan gerbangnya ada - bukan menguji dialognya.";

export function hasCredentials(): boolean {
  return Boolean(authEmail);
}

/**
 * Path berkas `storageState` yang disodorkan operator, kalau ada.
 *
 * Tidak ada nilai bawaan dan tidak ada path yang ditulis di source: berkas
 * kredensial hanya dibaca dari disk kalau pemanggil yang menyebutkan
 * lokasinya (aturan 2 di atas). Pemanggil yang tidak menyodorkannya tetap
 * bisa menjalankan berkas spec-nya - bagian yang butuh sesi akan `skip`
 * dengan pesan yang menyebut nama variabelnya.
 */
export function storageStatePath(): string | undefined {
  return storageStateFile;
}

/**
 * Minta kode OTP memakai akun uji — SAMPAI tahap kode, bukan sampai dialog.
 *
 * Fase 9.5+: pintu email adalah halaman penuh `/auth/email`, bukan popup.
 * Yang diuji adalah konsekuensinya: setelah "Masuk dengan Email", URL pindah
 * ke `/auth/email`, dan setelah "Kirim OTP", tahap kode tampil. Kalau
 * pengiriman gagal, kegagalan muncul sebagai timeout yang menunjuk halaman
 * auth - jauh lebih berguna daripada test yang hijau karena hanya memeriksa
 * tombolnya diklik.
 *
 * Kode-nya sendiri TIDAK dimasukkan: ia hanya ada di kotak masuk akun uji.
 * Pemanggil yang butuh sesi penuh harus skip dengan SKIP_NO_INBOX.
 */
export async function requestOtpCode(page: Page, returnTo = "/dashboard"): Promise<void> {
  await page.goto(`/auth?returnTo=${encodeURIComponent(returnTo)}`);

  // Sejak Fase 9.5+, dua pintu yang tersisa adalah Google dan tombol
  // "Masuk dengan Email" di bawah ini. Halaman OTP baru ada setelah tombolnya
  // ditekan; tahap kode baru ada setelah kode diminta.
  await page.getByRole("button", { name: /Masuk dengan Email/i }).click();
  await expect(page).toHaveURL(/\/auth\/email/);
  await page.getByLabel(/email/i).fill(authEmail!);
  await page.getByRole("button", { name: /Kirim OTP/i }).click();
  await expect(page.getByText(/Kode 6 digit/i)).toBeVisible({ timeout: 20_000 });
}

/**
 * Masuk ke aplikasi memakai akun uji — SAMPAI tahap kode, lalu skip.
 *
 * Lihat `requestOtpCode`: sesi penuh butuh kode dari kotak masuk yang
 * tidak bisa dibaca Playwright. Helper ini membuktikan semua yang bisa
 * dibuktikan peramban, lalu skip eksplisit supaya tidak ada yang
 * mengira sesi penuh sudah teruji E2E.
 */
export async function signIn(page: Page, returnTo = "/dashboard"): Promise<void> {
  await requestOtpCode(page, returnTo);
  test.skip(true, SKIP_NO_INBOX);
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
  await page.goto(`/auth?returnTo=${encodeURIComponent("/admin")}`);

  const passcodeField = page.locator('input[name="passcode"]');
  const emailButton = page.getByRole("button", {
    name: /Masuk dengan Email/i,
  });

  // Urutan gerbang ditentukan aplikasi, bukan asumsi test. Di konteks
  // peramban yang bersih, `/auth?returnTo=/admin` menampilkan gerbang passcode
  // LEBIH DULU, dan pilihan pintu masuk baru muncul setelah passcode lolos
  // (Skenario C di flows.spec.ts mengunci urutan itu). Kalau sesi sudah ada,
  // urutannya terbalik. Jadi tunggu salah satunya benar-benar tampil - jangan
  // mengisi form yang belum ada.
  await expect(passcodeField.or(emailButton)).toBeVisible({ timeout: 20_000 });

  if (await passcodeField.isVisible().catch(() => false)) {
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
    await page.getByRole("button", { name: /Verifikasi passcode/i }).click();
  }

  // Fase 9.5+: tidak ada lagi form sandi maupun dialog OTP di balik passcode.
  // Yang dibuktikan adalah halaman `/auth/email` terbuka dan kode bisa
  // diminta; sesi penuh butuh kotak masuk, jadi skip eksplisit setelah tahap
  // kode tampil.
  await expect(emailButton).toBeVisible({ timeout: 15_000 });
  await emailButton.click();
  await expect(page).toHaveURL(/\/auth\/email/);
  await page.getByLabel(/email/i).fill(authEmail!);
  await page.getByRole("button", { name: /Kirim OTP/i }).click();
  await expect(page.getByText(/Kode 6 digit/i)).toBeVisible({ timeout: 20_000 });
  test.skip(true, SKIP_NO_INBOX);
}
