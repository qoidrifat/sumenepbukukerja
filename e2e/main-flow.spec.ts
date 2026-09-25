import { expect, test } from "@playwright/test";

test.describe("Sumenep Buku Kerja resident flow", () => {
  test("katalog, profil, dan pencarian dapat diakses tanpa refresh", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#katalog")).toBeVisible();
    await expect(page.getByPlaceholder("Cari usaha atau jasa...")).toBeVisible();

    await page.getByPlaceholder("Cari usaha atau jasa...").fill("pompa");
    const listingLink = page.locator('a[href^="/v/"]').first();
    await expect(listingLink).toBeVisible();
    await listingLink.click();
    await expect(page).toHaveURL(/\/v\//);
    await expect(page.getByRole("heading", { name: /Karya Jaya|Bengkel/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Simpan listing|Hapus dari tersimpan/ }).first()).toBeVisible();
  });

  test("posting request Masuk Protected preserves return path", async ({ page }) => {
    await page.goto("/#permintaan");
    const protectedButton = page.getByRole("button", { name: /Masuk untuk memposting/ });
    await expect(protectedButton).toBeVisible();
    await protectedButton.click();
    await expect(page).toHaveURL(/\/auth\?returnTo=/);
    await expect(page.getByText(/Masuk|Sign in/i).first()).toBeVisible();
  });

  test("public pages show keyboard-visible focus and accessible names", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
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
