import { expect, test } from "@playwright/test";

/**
 * Halaman publik menunggu query Convex sungguhan sebelum katalog muncul.
 * Diukur: 6,3-7,0 detik untuk muat dingin saat empat halaman dibuka
 * bersamaan. Bawaan `expect.timeout` 8 detik jadi rapuh di bawah beban,
 * jadi PROCESS_TERSEDIA dipakai untuk Assertion "aplikasi sudah ter-render".
 * Ini meny accommodating lingkungan, bukan menutupi bug: halamannya benar-
 * benar muncul, hanya butuh waktu lebih lama di bawah beban.
 */
const APP_SIAP = 30_000;

/**
 * Alur warga di halaman publik.
 *
 * Setiap assertion di sini dikunci ke perilaku yang benar-benar terverifikasi
 * di aplikasi (bukan ke tebakan tentang fixture lama):
 *
 * - Katalog di-backend berisi enam listing nyata; pencarian memakai kata yang
 *   benar-benar ada di sana ("laundry" -> "Laundry Bersih Terang").
 * - Form "Butuh bantuan?" punya `required` di judul dan cerita. Tanpa
 *   pengisian, validasi HTML5 menahan submit dan `submit()` tidak pernah
 *   jalan - jadi pengujian kontrak "tamu diarahkan ke /auth" WAJIB mengisi
 *   form lebih dulu, persis seperti pengguna sungguhan.
 * - Fokus keyboard diperiksa lewat `document.activeElement`, bukan selektor
 *   CSS `:focus`. Selektor itu bergantung pada halaman memegang fokus
 *   peramban, sehingga gagal acak saat beberapa konteks browser hidup
 *   bersamaan - itu cacat pengujian, bukan cacat aplikasi.
 */
test.describe("Sumenep Buku Kerja resident flow", () => {
  test("halaman katalog punya tepat satu #katalog dan anchor di dalamnya hidup", async ({ page }) => {
    await page.goto("/");
    const katalog = page.locator("#katalog");
    await expect(katalog).toBeVisible({ timeout: APP_SIAP });

    // Regresi: halaman pernah merender DirectoryContent dua kali (shell
    // mobile + shell desktop). ID jadi ganda dan navigasi fragment selalu
    // mendarat di salinan yang `display:none`, sehingga semua anchor dalam
    // halaman mati di lebar desktop.
    expect(await page.locator("#katalog").count()).toBe(1);

    // Anchor harus mendarat pada elemen yang benar-benar terlihat.
    const targetVisible = await page.evaluate(() => {
      const el = document.getElementById("katalog");
      return !!el && !!el.getClientRects().length;
    });
    expect(targetVisible).toBe(true);

    // CTA utama hero harus benar-benar menggulir ke katalog.
    await page.getByRole("button", { name: /Mulai cari jasa/i }).click();
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 8000 })
      .toBeGreaterThan(100);
  });

  test("pencarian katalog memfilter, dan profil usaha bisa dibuka tanpa refresh", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#katalog")).toBeVisible({ timeout: APP_SIAP });

    const search = page.getByPlaceholder("Cari usaha atau jasa...");
    await expect(search).toBeVisible();

    // Kartu katalog di landing memang tidak punya tautan profil: konversi
    // utamanya adalah tombol WhatsApp. Satu-satunya jalan dari katalog ke
    // halaman profil publik adalah pin peta, dan petanya opt-in.
    const beforeFilter = await page.locator('a[href^="/v/"]').count();
    expect(beforeFilter).toBe(0);

    await search.fill("laundry");
    await expect(page.getByText(/Laundry Bersih Terang/i).first()).toBeVisible();

    // Nyalakan peta, lalu klik pin listing yang muncul.
    await page.getByRole("button", { name: /^Peta$/ }).click();
    const pin = page.locator('a[href^="/v/"]').first();
    await expect(pin).toBeVisible();
    await pin.click();

    await expect(page).toHaveURL(/\/v\//);
    // `h1` di halaman profil berisi nama listing.
    await expect(page.getByRole("heading", { level: 1, name: /Laundry Bersih Terang/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Simpan listing|Hapus dari tersimpan/ }).first()).toBeVisible();
  });

  test("posting request tamu mengarahkan ke auth dengan returnTo", async ({ page }) => {
    await page.goto("/#permintaan");
    await expect(page.locator("#permintaan")).toBeVisible();

    // Kolom wajib harus diisi dulu: tanpa ini validasi HTML5 menahan submit
    // dan handler tidak pernah dipanggil.
    await page.getByLabel("Judul kebutuhan").fill("Butuh tukang listrik dekat Kalianget");
    await page.getByLabel("Ceritakan kebutuhan").fill(
      "Lampu ruang tamu mati sejak kemarin, mohon dibantu datang pagi hari.",
    );

    const protectedButton = page.getByRole("button", { name: /Masuk untuk memposting/ });
    await expect(protectedButton).toBeVisible();
    await protectedButton.click();

    await expect(page).toHaveURL(/\/auth\?returnTo=/);
    await expect(page.getByText(/Masuk|Sign in/i).first()).toBeVisible();
  });

  test("public pages show keyboard-visible focus and accessible names", async ({ page }) => {
    await page.goto("/");
    // Tunggu aplikasi benar-benar ter-render sebelum menekan Tab, kalau tidak
    // belum ada elemen fokusibl yang bisa diterima.
    await expect(page.locator("#katalog")).toBeAttached({ timeout: APP_SIAP });
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName,
        name: (el.textContent ?? "").trim().slice(0, 60),
        visible: !!el.getClientRects().length,
      };
    });
    expect(focused, "Tab harus memindahkan fokus ke elemen interaktif yang terlihat").not.toBeNull();
    expect(focused?.visible).toBe(true);
    expect(focused?.tag).not.toBe("BODY");

    const unnamedButtons = await page.locator("button").evaluateAll((buttons) =>
      buttons.filter((button) => !(button.textContent?.trim() || button.getAttribute("aria-label") || button.getAttribute("title"))).length,
    );
    expect(unnamedButtons).toBe(0);
  });

  test("protected dashboard never renders blank for signed-out users", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/Masuk untuk melanjutkan|Halaman ini hanya tersedia/i).first()).toBeVisible();
  });
});
