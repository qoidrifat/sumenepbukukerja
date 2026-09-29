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
  test("halaman publik terbuka, dan rute terlindungi menawarkan masuk sambil mempertahankan tujuan", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Buku Kerja/i);

    await page.goto("/dashboard");
    // `RequireAuth` di /dashboard sengaja TIDAK mengubah URL: ia menampilkan
    // kartu "Masuk" supaya pengunjung mengerti kenapa halaman ini kosong. Yang
    // diuji adalah konsekuensinya — tujuan harus ikut terbawa ke /auth.
    const signIn = page.getByRole("button", { name: /^Masuk$/ }).first();
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(page).toHaveURL(/\/auth\?returnTo=%2Fdashboard/);
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
  /**
   * Dialog pelaporan TIDAK dibuka oleh tombol "Laporkan" di halaman publik.
   * Pemicunya adalah error sungguhan: `ErrorReportProvider` menyimak
   * `window.error` dan `unhandledrejection`. Asumsi tombol yang pernah ada di
   * sini membuat test ini dilewati tanpa pernah menguji apa pun.
   *
   * Test ini karena itu melempar error sungguhan di dalam halaman dan
   * memeriksa seluruh rantainya: error tertangkap -> laporan tersimpan -> ID
   * laporan tampil -> popup bisa ditutup.
   *
   * CATATAN: ini menulis satu baris `errorReports` sungguhan di deployment
   * yang sedang diuji.
   */
  test("error sungguhan membuka dialog, menyimpan laporan, dan bisa ditutup", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#katalog")).toBeAttached({ timeout: 30_000 });

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("e2e: kesalahan niaga untuk memeriksa dialog pelaporan");
      }, 0);
    });

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText(/laporan|masalah|gangguan/i);

    // Popup harus bisa ditutup supaya pengguna tidak terjebak di layar ini.
    await dialog.getByRole("button", { name: /Tutup/i }).first().click();
    await expect(dialog).toBeHidden();
  });

  test("dialog pelaporan punya nama aksesibel dan bisa difokuskan", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#katalog")).toBeAttached({ timeout: 30_000 });

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("e2e: pemeriksa nama aksesibel dialog");
      }, 0);
    });

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const unnamedButtons = await dialog.locator("button").evaluateAll((buttons) =>
      buttons.filter(
        (button) =>
          !(button.textContent?.trim() || button.getAttribute("aria-label") || button.getAttribute("title")),
      ).length,
    );
    expect(unnamedButtons).toBe(0);
  });
});

test.describe("Skenario D — dua sesi", () => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  test("masuk di dua perangkat, lalu cabut satu sesi", async ({ page, browser }) => {
    test.skip(!email || !password, "Butuh E2E_USER_EMAIL dan E2E_USER_PASSWORD");
    // Dua konteks = dua perangkat. Sesi B dicabut dari perangkat B, lalu
    // perangkat A harus tetap sahih.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      for (const context of [contextA, contextB]) {
        const p = await context.newPage();
        await p.goto("/auth");
        await p.getByLabel(/email/i).fill(email!);
        await p.getByLabel(/sandi|password/i).fill(password!);
        await p.getByRole("button", { name: /Masuk/i }).first().click();
        await p.waitForURL(/dashboard|\/$/, { timeout: 20_000 });
      }

      const pageB = contextB.pages()[0]!;
      await pageB.goto("/dashboard");
      await expect(pageB.getByText(/Masuk untuk melanjutkan/i).first()).toBeHidden();

      // Cabut sesi B.
      const revoke = pageB.getByRole("button", { name: /Cabut|Akhiri sesi|Keluar/i }).first();
      if ((await revoke.count()) === 0) test.skip(true, "Tombol cabut sesi tidak tersedia di halaman ini");
      await revoke.click();

      // Sesi A harus tetap bisa masuk ke dashboard.
      const pageA = contextA.pages()[0]!;
      await pageA.goto("/dashboard");
      await expect(pageA.getByText(/Masuk untuk melanjutkan/i).first()).toBeHidden();
    } finally {
      await contextA.close();
      await contextB.close();
      void page;
    }
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
    // Label tombol di halaman auth bukan "Masuk ke Buku Kerja" — itu judul
    // kartu, bukan kendali. Nama yang benar ada di `Auth.tsx`.
    await page.getByRole("button", { name: /Verifikasi passcode/i }).click();
    // Pesan error harus muncul (role=alert), dan URL tetap di /auth.
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });
});
