# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: main-flow.spec.ts >> Sumenep Buku Kerja resident flow >> halaman katalog punya tepat satu #katalog dan anchor di dalamnya hidup
- Location: e2e/main-flow.spec.ts:21:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#katalog')
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('#katalog') with timeout 8000ms
  - waiting for locator('#katalog')

```

```yaml
- text: Menyiapkan catatan lokal...
- region "Notifications alt+T"
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Alur warga di halaman publik.
  5   |  *
  6   |  * Setiap assertion di sini dikunci ke perilaku yang benar-benar terverifikasi
  7   |  * di aplikasi (bukan ke tebakan tentang fixture lama):
  8   |  *
  9   |  * - Katalog di-backend berisi enam listing nyata; pencarian memakai kata yang
  10  |  *   benar-benar ada di sana ("laundry" -> "Laundry Bersih Terang").
  11  |  * - Form "Butuh bantuan?" punya `required` di judul dan cerita. Tanpa
  12  |  *   pengisian, validasi HTML5 menahan submit dan `submit()` tidak pernah
  13  |  *   jalan - jadi pengujian kontrak "tamu diarahkan ke /auth" WAJIB mengisi
  14  |  *   form lebih dulu, persis seperti pengguna sungguhan.
  15  |  * - Fokus keyboard diperiksa lewat `document.activeElement`, bukan selektor
  16  |  *   CSS `:focus`. Selektor itu bergantung pada halaman memegang fokus
  17  |  *   peramban, sehingga gagal acak saat beberapa konteks browser hidup
  18  |  *   bersamaan - itu cacat pengujian, bukan cacat aplikasi.
  19  |  */
  20  | test.describe("Sumenep Buku Kerja resident flow", () => {
  21  |   test("halaman katalog punya tepat satu #katalog dan anchor di dalamnya hidup", async ({ page }) => {
  22  |     await page.goto("/");
  23  |     const katalog = page.locator("#katalog");
> 24  |     await expect(katalog).toBeVisible();
      |                           ^ Error: expect(locator).toBeVisible() failed
  25  | 
  26  |     // Regresi: halaman pernah merender DirectoryContent dua kali (shell
  27  |     // mobile + shell desktop). ID jadi ganda dan navigasi fragment selalu
  28  |     // mendarat di salinan yang `display:none`, sehingga semua anchor dalam
  29  |     // halaman mati di lebar desktop.
  30  |     expect(await page.locator("#katalog").count()).toBe(1);
  31  | 
  32  |     // Anchor harus mendarat pada elemen yang benar-benar terlihat.
  33  |     const targetVisible = await page.evaluate(() => {
  34  |       const el = document.getElementById("katalog");
  35  |       return !!el && !!el.getClientRects().length;
  36  |     });
  37  |     expect(targetVisible).toBe(true);
  38  | 
  39  |     // CTA utama hero harus benar-benar menggulir ke katalog.
  40  |     await page.getByRole("button", { name: /Mulai cari jasa/i }).click();
  41  |     await expect
  42  |       .poll(async () => page.evaluate(() => window.scrollY), { timeout: 8000 })
  43  |       .toBeGreaterThan(100);
  44  |   });
  45  | 
  46  |   test("pencarian katalog memfilter, dan profil usaha bisa dibuka tanpa refresh", async ({ page }) => {
  47  |     await page.goto("/");
  48  |     await expect(page.locator("#katalog")).toBeVisible();
  49  | 
  50  |     const search = page.getByPlaceholder("Cari usaha atau jasa...");
  51  |     await expect(search).toBeVisible();
  52  | 
  53  |     // Kartu katalog di landing memang tidak punya tautan profil: konversi
  54  |     // utamanya adalah tombol WhatsApp. Satu-satunya jalan dari katalog ke
  55  |     // halaman profil publik adalah pin peta, dan petanya opt-in.
  56  |     const beforeFilter = await page.locator('a[href^="/v/"]').count();
  57  |     expect(beforeFilter).toBe(0);
  58  | 
  59  |     await search.fill("laundry");
  60  |     await expect(page.getByText(/Laundry Bersih Terang/i).first()).toBeVisible();
  61  | 
  62  |     // Nyalakan peta, lalu klik pin listing yang muncul.
  63  |     await page.getByRole("button", { name: /^Peta$/ }).click();
  64  |     const pin = page.locator('a[href^="/v/"]').first();
  65  |     await expect(pin).toBeVisible();
  66  |     await pin.click();
  67  | 
  68  |     await expect(page).toHaveURL(/\/v\//);
  69  |     // `h1` di halaman profil berisi nama listing.
  70  |     await expect(page.getByRole("heading", { level: 1, name: /Laundry Bersih Terang/i })).toBeVisible();
  71  |     await expect(page.getByRole("button", { name: /Simpan listing|Hapus dari tersimpan/ }).first()).toBeVisible();
  72  |   });
  73  | 
  74  |   test("posting request tamu mengarahkan ke auth dengan returnTo", async ({ page }) => {
  75  |     await page.goto("/#permintaan");
  76  |     await expect(page.locator("#permintaan")).toBeVisible();
  77  | 
  78  |     // Kolom wajib harus diisi dulu: tanpa ini validasi HTML5 menahan submit
  79  |     // dan handler tidak pernah dipanggil.
  80  |     await page.getByLabel("Judul kebutuhan").fill("Butuh tukang listrik dekat Kalianget");
  81  |     await page.getByLabel("Ceritakan kebutuhan").fill(
  82  |       "Lampu ruang tamu mati sejak kemarin, mohon dibantu datang pagi hari.",
  83  |     );
  84  | 
  85  |     const protectedButton = page.getByRole("button", { name: /Masuk untuk memposting/ });
  86  |     await expect(protectedButton).toBeVisible();
  87  |     await protectedButton.click();
  88  | 
  89  |     await expect(page).toHaveURL(/\/auth\?returnTo=/);
  90  |     await expect(page.getByText(/Masuk|Sign in/i).first()).toBeVisible();
  91  |   });
  92  | 
  93  |   test("public pages show keyboard-visible focus and accessible names", async ({ page }) => {
  94  |     await page.goto("/");
  95  |     // Tunggu aplikasi benar-benar ter-render sebelum menekan Tab, kalau tidak
  96  |     // belum ada elemen fokusibl yang bisa diterima.
  97  |     await expect(page.locator("#katalog")).toBeAttached();
  98  |     await page.keyboard.press("Tab");
  99  | 
  100 |     const focused = await page.evaluate(() => {
  101 |       const el = document.activeElement as HTMLElement | null;
  102 |       if (!el || el === document.body) return null;
  103 |       return {
  104 |         tag: el.tagName,
  105 |         name: (el.textContent ?? "").trim().slice(0, 60),
  106 |         visible: !!el.getClientRects().length,
  107 |       };
  108 |     });
  109 |     expect(focused, "Tab harus memindahkan fokus ke elemen interaktif yang terlihat").not.toBeNull();
  110 |     expect(focused?.visible).toBe(true);
  111 |     expect(focused?.tag).not.toBe("BODY");
  112 | 
  113 |     const unnamedButtons = await page.locator("button").evaluateAll((buttons) =>
  114 |       buttons.filter((button) => !(button.textContent?.trim() || button.getAttribute("aria-label") || button.getAttribute("title"))).length,
  115 |     );
  116 |     expect(unnamedButtons).toBe(0);
  117 |   });
  118 | 
  119 |   test("protected dashboard never renders blank for signed-out users", async ({ page }) => {
  120 |     await page.goto("/dashboard");
  121 |     await expect(page.getByText(/Masuk untuk melanjutkan|Halaman ini hanya tersedia/i).first()).toBeVisible();
  122 |   });
  123 | });
  124 | 
```