import { expect, test } from "@playwright/test";

/**
 * SEO nyata: apa yang benar-benar ada di HTML awal, dan apa yang ditimpa
 * runtime setelah hidrasi.
 *
 *这两个 Dua hal sengaja dipisah supaya tidak ada klaim yang Samar:
 * - HTML awal hanya boleh berisi metadata dasar SITUS.
 * - Metadata per-listing hanya boleh muncul setelah React berjalan, dan
 *   hanya berisi data publik.
 */
test.describe("SEO publik", () => {
  test("HTML awal punya canonical dan Open Graph dasar", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const html = await res.text();
    const head = html.slice(0, html.indexOf("</head>") + 7);

    expect(head).toMatch(/<link[^>]+rel=["']canonical["']/i);
    expect(head).toMatch(/<meta[^>]+property=["']og:title["']/i);
    expect(head).toMatch(/<meta[^>]+property=["']og:description["']/i);
    expect(head).toMatch(/<meta[^>]+property=["']og:type["']/i);
  });

  test("halaman katalog tidak pernah membocorkan rute privat", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).not.toMatch(/\/admin(\/|<|$)/);
    expect(xml).not.toMatch(/\/dashboard(\/|<|$)/);
    expect(xml).not.toMatch(/\/auth(\/|<|$)/);
    // Tidak ada URL ber-token (undangan) yang bocor lewat sitemap.
    expect(xml).not.toMatch(/\/invite\//);
  });

  test("metadata per-listing menimpa metadata dasar setelah hidrasi", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Peta$/ }).click();
    const pin = page.locator('a[href^="/v/"]').first();
    await expect(pin).toBeVisible();
    await pin.click();

    await expect(page).toHaveURL(/\/v\//);
    // Tunggu hidrasi selesai: judul dokumen ditulis oleh useEffect.
    await expect
      .poll(async () => page.evaluate(() => document.title), { timeout: 15_000 })
      .not.toBe("Sumenep Buku Kerja — Katalog lokal untuk warga Sumenep");

    const head = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null,
      ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      jsonLd: document.getElementById("listing-jsonld")?.textContent ?? null,
    }));

    expect(head.title.length).toBeGreaterThan(0);
    expect(head.description).toBeTruthy();
    expect(head.ogTitle).toBe(head.title);
    expect(head.canonical).toMatch(/\/v\//);
    expect(head.ogUrl).toMatch(/\/v\//);
    // JSON-LD wajib LocalBusiness dan tidak boleh membawa data privat.
    expect(head.jsonLd).toContain("LocalBusiness");
    expect(head.jsonLd).not.toMatch(/ownerId|sessionReference|adminId/i);
  });
});
