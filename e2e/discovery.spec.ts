import { expect, test } from "@playwright/test";

/**
 * Penemuan listing.
 *
 * Halaman profil publik (`/v/:slug`) sudah ada di sitemap, tetapi sebelumnya
 * tidak bisa dijangkau dari katalog dalam satu klik: kartu katalog tidak punya
 * tautan ke profil, dan satu-satunya jalan adalah menyalakan peta lalu mengklik
 * pin. Test ini mengunci perilaku yang benar, termasuk navigasi balik.
 */

const APP_SIAP = 30_000;

test.describe("penemuan listing dari katalog", () => {
  test("setiap kartu katalog menautkan ke profil publiknya", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#katalog")).toBeVisible({ timeout: APP_SIAP });
    // Tunggu daftar benar-benar terisi, bukan hanya bagian "#katalog" terlihat.
    // Bagian itu sudah terlihat sebelum query Convex selesai; menghitung tautan
    // saat itu hanya mengukur waktu, bukan isi katalog.
    await page.waitForFunction(
      () => document.querySelectorAll("#katalog article").length > 0,
      undefined,
      { timeout: APP_SIAP },
    );

    const links = page.locator('#katalog a[href^="/v/"]');
    const count = await links.count();
    expect(count, "katalog harus punya tautan profil per kartu").toBeGreaterThan(0);

    // Semua tautan harus menuju rute publik yang valid, bukan ke tempat lain.
    for (let i = 0; i < count; i += 1) {
      const href = await links.nth(i).getAttribute("href");
      expect(href, `tautan ke-${i} harus /v/<slug>`).toMatch(/^\/v\/[a-z0-9-]+$/);
    }
  });

  test("klik tautan listing membuka profilnya, dan navigasi balik bekerja", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#katalog")).toBeVisible({ timeout: APP_SIAP });

    // Ambil satu listing dari data nyata yang sedang tampil.
    const link = page.locator('#katalog a[href^="/v/"]').first();
    const href = await link.getAttribute("href");
    const name = (await link.textContent())?.trim() ?? "";
    expect(href).toBeTruthy();
    expect(name.length).toBeGreaterThan(0);

    await link.click();

    // 1. URL berpindah ke rute profil listing yang sama.
    await expect(page).toHaveURL(new RegExp(`${href!.replace("/", "\\/")}$`));
    // 2. Profil benar-benar ter-render, bukan halaman kosong.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: APP_SIAP });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

    // 3. Navigasi balik mengembalikan katalog yang masih bisa dipakai.
    await page.goBack();
    await expect(page).toHaveURL(/\/$|\/#/);
    await expect(page.locator("#katalog")).toBeVisible({ timeout: APP_SIAP });
    const search = page.getByPlaceholder("Cari usaha atau jasa...");
    await expect(search).toBeVisible();
    await search.fill("laundry");
    await expect(page.getByText(/Laundry Bersih Terang/i).first()).toBeVisible();
  });

  test("tautan profil bisa dicapai dengan keyboard dan punya nama aksesibel", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#katalog")).toBeVisible({ timeout: APP_SIAP });

    const link = page.locator('#katalog a[href^="/v/"]').first();
    await link.focus();
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLAnchorElement | null;
      return {
        isAnchor: el?.tagName === "A",
        href: el?.getAttribute("href") ?? null,
        name: (el?.textContent ?? "").trim(),
        visible: !!el?.getClientRects().length,
      };
    });
    expect(focused.isAnchor, "fokus harus mendarat di tautan").toBe(true);
    expect(focused.href).toMatch(/^\/v\//);
    expect(focused.name.length, "tautan harus punya nama aksesibel").toBeGreaterThan(0);
    expect(focused.visible).toBe(true);

    // Enter harus benar-benar membuka profilnya.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/v\//);
  });

  test("sitemap hanya memuat listing publik", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    const body = await res.text();
    const isXml = (res.headers()["content-type"] ?? "").includes("xml");

    // Sitemap adalah route HTTP Convex (`/sitemap.xml` di http.ts), sedangkan
    // `vite preview` yang dipakai E2E hanya menyajikan SPA dan menjawab
    // fallback HTML. Jadi di lingkungan lokal isinya memang tidak XML.
    //
    // Exclusion rute privat diuji di tempat yang benar - pada builder sitemap
    // itu sendiri, di src/lib/listing-metadata.test.ts. Test ini hanya
    // memeriksa bentuk respons ketika sitemap benar-benar disajikan.
    test.skip(!isXml, "sitemap disajikan oleh origin Convex, bukan server statis");

    expect(body).toContain("<urlset");
    // Hanya listing publik: tidak boleh ada rute privat maupun tautan undangan.
    expect(body).not.toMatch(/\/admin(\/|<)/);
    expect(body).not.toMatch(/\/dashboard(\/|<)/);
    expect(body).not.toMatch(/\/auth(\/|<)/);
    expect(body).not.toMatch(/\/invite\//);
    const slugs = [...body.matchAll(/<loc>[^<]*\/v\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1]);
    expect(slugs.length, "sitemap harus memuat listing publik").toBeGreaterThan(0);
  });
});
