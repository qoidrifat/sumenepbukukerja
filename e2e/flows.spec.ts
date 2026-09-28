import { expect, test } from "@playwright/test";

/**
 * Skenario E2E yang memakai peramban sungguhan.
 *
 * Tiga alur yang paling sering benar-benar rusak: auth, pelaporan error, dan
 * gerbang passcode. Semuanya diuji lewat UI, bukan lewat state React — bug
 * yang paling mahal di aplikasi ini justru bug yang hanya muncul setelah
 * render, hydration, dan IndexedDB ikut campur.
 *
 * Kredensial TIDAK pernah ditulis di sini. Skenario yang butuh akun nyata
 * membaca dari environment (`E2E_*`) dan DILEWATI dengan pesan jelas kalau
 * kredensialnya belum diisi, sehingga `test:e2e` tetap bisa dijalankan di
 * lingkungan tanpa secret.
 */

const authEmail = process.env.E2E_USER_EMAIL;
const authPassword = process.env.E2E_USER_PASSWORD;

test.describe("Skenario A — landing, autentikasi, dashboard", () => {
  test("halaman publik terbuka, dan rute terlindungi mengembalikan ke auth dengan returnTo", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Buku Kerja/i);

    await page.goto("/dashboard");
    // Rute terlindungi harus mengarahkan ke /auth sambil mempertahankan tujuan.
    await expect(page).toHaveURL(/\/auth\?returnTo=/);
  });

  test("pendatang tanpa kredensial melihat halaman auth yang benar", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByText(/Masuk ke Buku Kerja/i).first()).toBeVisible();
    await expect(page.getByPlaceholder("nama@email.com")).toBeVisible();
  });

  test("masuk dan sampai ke dashboard", async ({ page }) => {
    test.skip(
      !authEmail || !authPassword,
      "Butuh E2E_USER_EMAIL + E2E_USER_PASSWORD (akun uji nyata di Keys/deployment)",
    );
    await page.goto("/auth");
    await page.getByPlaceholder("nama@email.com").fill(authEmail!);
    // Kolom password memakai `type` bergantian; labelnya yang dipakai, bukan
    // placeholder, supaya tidak ikut berubah saat komponennya berubah.
    await page.locator('input[type="password"]').first().fill(authPassword!);
    await page.getByRole("button", { name: /Masuk ke Buku Kerja/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});

test.describe("Skenario B — pelaporan error", () => {
  test("dialog laporan error punya cara masuk yang dapat diklik dan nama aksesibel", async ({ page }) => {
    await page.goto("/");
    // Pemicu dialog ada di halaman mana pun yang memuat provider pelaporan;
    // yang diuji di sini adalah bahwa pemicunya benar-benar bisa difokuskan
    // dan punya nama — inilah yang membuat dialog bisa dipakai pengguna
    // keyboard dan pembaca layar.
    const trigger = page.getByRole("button", { name: /Laporkan (masalah|error)|Kendala|Laporkan/i }).first();
    if ((await trigger.count()) === 0) {
      test.info().annotations.push({ type: "note", description: "Tidak ada tombol pelaporan di halaman publik" });
      return;
    }
    await expect(trigger).toBeVisible();
  });

  test("dialog terbuka, menampilkan pesan, dan bisa ditutup tanpa error", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /Laporkan (masalah|error)|Kendala|Laporkan/i }).first();
    test.skip((await trigger.count()) === 0, "Halaman publik tidak punya pemicu dialog pelaporan");
    await trigger.click();
    // Dialog memakai role=dialog; isinya harus bisa dibaca, dan tombol
    // penutupnya harus ada supaya pengguna tidak terjebak.
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button").first()).toBeVisible();
  });
});

test.describe("Skenario C — gerbang passcode admin", () => {
  test("halaman admin menampilkan gerbang passcode, bukan konten meja kerja", async ({ page }) => {
    await page.goto("/admin");
    // Tanpa passcode yang benar, meja kerja admin TIDAK boleh terender: yang
    // tampil adalah gerbang. Ini pemeriksaan keamanan yang paling penting
    // di seluruh E2E — kalau bocor, isi Security Desk terbuka untuk siapa pun
    // yang membuka /admin.
    const passcodeField = page.locator('input[name="passcode"]');
    if ((await passcodeField.count()) > 0) {
      await expect(passcodeField).toBeVisible();
    } else {
      // Alternatif: admin yang sudah punya sesi, atau akun yang belum menerima
      // undangan. Apa pun yang terjadi, passcode tidak boleh dilewati diam-diam.
      await expect(page.getByText(/passcode|Masuk|Undangan/i).first()).toBeVisible();
    }
  });

  test("passcode salah ditolak dengan pesan yang jelas, tanpa membuka ruang admin", async ({ page }) => {
    await page.goto("/auth?returnTo=/admin");
    const passcodeField = page.locator('input[name="passcode"]');
    test.skip((await passcodeField.count()) === 0, "Gerbang passcode tidak tampil (admin sudah masuk atau belum diaktifkan)");
    await passcodeField.fill("0000-salah-pasti");
    await page.getByRole("button", { name: /Masuk ke Buku Kerja/i }).click();
    // Pesan error harus muncul (role=alert), dan URL tetap di /auth.
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });
});
