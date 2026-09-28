import { test, expect } from "@playwright/test";

/** Probe "sebelum": dampak nyata duplikasi shell pada perilaku pengguna. */
test("probe: anchor dan CTA hero di desktop", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);

  const before = await page.evaluate(() => {
    const first = document.getElementById("katalog");
    const cs = first ? getComputedStyle(first) : null;
    return {
      firstIsVisible: !!first && !!first.getClientRects().length,
      firstDisplay: cs?.display ?? "(tidak ada)",
      totalNodes: document.querySelectorAll("*").length,
    };
  });

  // CTA utama hero: "Mulai cari jasa"
  const y0 = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: /Mulai cari jasa/i }).click();
  await page.waitForTimeout(1200);
  const y1 = await page.evaluate(() => window.scrollY);

  // Anchor nav: "Cara kerjanya" -> #cara-pakai
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const anchorTargetVisible = await page.evaluate(() => {
    const el = document.getElementById("cara-pakai");
    return !!el && !!el.getClientRects().length;
  });

  console.log(
    "BEFORE_REPORT " +
      JSON.stringify(
        { ...before, scrollBefore: y0, scrollAfterHeroCta: y1, scrolled: y1 > y0 + 50, anchorTargetVisible },
        null,
        2,
      ),
  );
  expect(true).toBe(true);
});
