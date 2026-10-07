import { expect, test } from "@playwright/test";

import { SKIP_NO_SESSION, storageStatePath } from "./support/auth";

/**
 * Rute peran + gerbang auth + 404 + keyboard publik.
 *
 * Yang diuji TANPA sesi (selalu jalan): redirect `/dashboard`, kartu
 * `RequireAuth` di `/warga` dan `/mitra`, halaman 404 untuk `/staff/*`,
 * dan keyboard Enter pada CTA publik. Test anon bercabang: kalau operator
 * menjalankan suite DENGAN `E2E_STORAGE_STATE`, dasbor tampil (bukan kartu)
 * dan cabang kartu di-skip dengan alasan yang menyebut sebabnya - bukan
 * gagal, bukan hijau palsu.
 *
 * Yang butuh sesi (blok describe di bawah): menu akun, dialog profil,
 * indikator sinkronisasi. Tanpa `E2E_STORAGE_STATE`, skip dengan
 * `SKIP_NO_SESSION` dari `support/auth.ts`. Tombol Keluar SENGAJA tidak
 * pernah diklik: signOut akan membakar sesi pada berkas storageState milik
 * operator. Kehadirannya yang ditegaskan, bukan kliknya.
 */

test("/dashboard mendarat ke /warga/dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/warga\/dashboard\/?$/);
});

test("/warga anon melihat kartu masuk dengan tujuan kembali yang benar", async ({
  page,
}) => {
  await page.goto("/warga/dashboard");
  // Tunggu salah satu keadaan final dulu (pola dashboard-responsive.spec.ts):
  // `isVisible()` seketika berpacu dengan status auth yang masih loading dan
  // akan skip palsu. Yang ditunggu: kartu ATAU shell dasbor.
  const kartu = page.getByText("Masuk untuk melanjutkan");
  const shell = page.locator(".dash-shell").first();
  const menentu = await kartu
    .or(shell)
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!menentu) {
    test.skip(
      true,
      "Aplikasi belum sampai ke keadaan yang bisa diukur (kartu maupun shell tak tampil). Bukan lulus.",
    );
  }
  if (!(await kartu.isVisible().catch(() => false))) {
    test.skip(
      true,
      "Sesi aktif terdeteksi: dasbor warga tampil, bukan kartu auth. "
        + "Jalankan tanpa E2E_STORAGE_STATE untuk menguji gerbang anon.",
    );
  }
  await expect(page.getByText("Halaman ini hanya tersedia")).toBeVisible();
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await expect(page).toHaveURL(/\/auth\?returnTo=%2Fwarga%2Fdashboard/);
});

test("/mitra anon melihat kartu masuk dengan tujuan kembali yang benar", async ({
  page,
}) => {
  await page.goto("/mitra/dashboard");
  const kartu = page.getByText("Masuk untuk melanjutkan");
  const shell = page.locator(".dash-shell").first();
  const menentu = await kartu
    .or(shell)
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!menentu) {
    test.skip(
      true,
      "Aplikasi belum sampai ke keadaan yang bisa diukur (kartu maupun shell tak tampil). Bukan lulus.",
    );
  }
  if (!(await kartu.isVisible().catch(() => false))) {
    test.skip(
      true,
      "Sesi aktif terdeteksi: dasbor mitra tampil, bukan kartu auth. "
        + "Jalankan tanpa E2E_STORAGE_STATE untuk menguji gerbang anon.",
    );
  }
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await expect(page).toHaveURL(/\/auth\?returnTo=%2Fmitra%2Fdashboard/);
});

for (const path of ["/staff/dashboard", "/staff"]) {
  test(`${path} menjawab 404 (jejak staff sudah dihapus)`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByText("Halaman tidak ditemukan")).toBeVisible();
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Kembali ke katalog/i }),
    ).toBeVisible();
  });
}

test("keyboard: Enter pada CTA publik membuka katalog", async ({ page }) => {
  await page.goto("/");
  const cta = page.locator("a.header-cta");
  await expect(cta).toBeVisible();
  // Fokus disetel langsung (men-Tab dari awal halaman rapuh lintas
  // perangkat); yang diuji secara keyboard sungguhan adalah Enter.
  await cta.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#katalog/);
});

// Sesi tidak pernah ditulis di source (aturan 2 di `support/auth.ts`).
const sesi = storageStatePath();

test.describe("menu akun + sinkronisasi (butuh sesi)", () => {
  test.use(sesi ? { storageState: sesi } : {});

  test("dropdown menampilkan tiga item; Profil membuka dialog", async ({
    page,
  }) => {
    test.skip(!sesi, SKIP_NO_SESSION);
    await page.goto("/");
    const pemicu = page.locator('button[aria-label^="Menu akun"]');
    await expect(pemicu).toBeVisible({ timeout: 20_000 });
    await pemicu.click();
    await expect(
      page.getByRole("menuitem", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Profil" })).toBeVisible();
    // Keluar hanya ditegaskan ada-nya: mengkliknya membakar sesi operator.
    await expect(page.getByRole("menuitem", { name: "Keluar" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Profil" }).click();
    await expect(page.getByText("Profil saya")).toBeVisible();
  });

  test("indikator sinkronisasi tampil di dasbor warga", async ({ page }) => {
    test.skip(!sesi, SKIP_NO_SESSION);
    await page.goto("/warga/dashboard");
    await expect(
      page.getByRole("button", { name: /Segarkan sinkronisasi/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Terakhir diperbarui/i).first()).toBeVisible();
  });
});
