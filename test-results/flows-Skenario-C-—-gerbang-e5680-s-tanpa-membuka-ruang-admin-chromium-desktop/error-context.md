# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> Skenario C — gerbang passcode admin >> passcode salah ditolak dengan pesan yang jelas, tanpa membuka ruang admin
- Location: e2e/flows.spec.ts:170:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('alert').first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('alert').first() with timeout 8000ms
  - waiting for getByRole('alert').first()

```

```yaml
- main:
  - button "Kembali"
  - text: Akses pengelola
  - paragraph: Langkah 1 dari 2
  - text: Passcode pengelola Ruang /admin dikunci. Masukkan passcode 먼저, baru lanjut ke verifikasi email. Passcode
  - textbox "Passcode Tampilkan passcode" [disabled]:
    - /placeholder: ••••••••••••••••
    - text: 0000-salah-pasti
  - button "Tampilkan passcode"
  - button "Memeriksa..." [disabled]
  - button "Kembali ke katalog"
- region "Notifications alt+T"
```

# Test source

```ts
  79  |     });
  80  | 
  81  |     const dialog = page.getByRole("dialog").first();
  82  |     await expect(dialog).toBeVisible({ timeout: 15_000 });
  83  |     await expect(dialog).toContainText(/laporan|masalah|gangguan/i);
  84  | 
  85  |     // Popup harus bisa ditutup supaya pengguna tidak terjebak di layar ini.
  86  |     await dialog.getByRole("button", { name: /Tutup/i }).first().click();
  87  |     await expect(dialog).toBeHidden();
  88  |   });
  89  | 
  90  |   test("dialog pelaporan punya nama aksesibel dan bisa difokuskan", async ({ page }) => {
  91  |     await page.goto("/");
  92  |     await expect(page.locator("#katalog")).toBeAttached({ timeout: 30_000 });
  93  | 
  94  |     await page.evaluate(() => {
  95  |       setTimeout(() => {
  96  |         throw new Error("e2e: pemeriksa nama aksesibel dialog");
  97  |       }, 0);
  98  |     });
  99  | 
  100 |     const dialog = page.getByRole("dialog").first();
  101 |     await expect(dialog).toBeVisible({ timeout: 15_000 });
  102 |     const unnamedButtons = await dialog.locator("button").evaluateAll((buttons) =>
  103 |       buttons.filter(
  104 |         (button) =>
  105 |           !(button.textContent?.trim() || button.getAttribute("aria-label") || button.getAttribute("title")),
  106 |       ).length,
  107 |     );
  108 |     expect(unnamedButtons).toBe(0);
  109 |   });
  110 | });
  111 | 
  112 | test.describe("Skenario D — dua sesi", () => {
  113 |   const email = process.env.E2E_USER_EMAIL;
  114 |   const password = process.env.E2E_USER_PASSWORD;
  115 | 
  116 |   test("masuk di dua perangkat, lalu cabut satu sesi", async ({ page, browser }) => {
  117 |     test.skip(!email || !password, "Butuh E2E_USER_EMAIL dan E2E_USER_PASSWORD");
  118 |     // Dua konteks = dua perangkat. Sesi B dicabut dari perangkat B, lalu
  119 |     // perangkat A harus tetap sahih.
  120 |     const contextA = await browser.newContext();
  121 |     const contextB = await browser.newContext();
  122 |     try {
  123 |       for (const context of [contextA, contextB]) {
  124 |         const p = await context.newPage();
  125 |         await p.goto("/auth");
  126 |         await p.getByLabel(/email/i).fill(email!);
  127 |         await p.getByLabel(/sandi|password/i).fill(password!);
  128 |         await p.getByRole("button", { name: /Masuk/i }).first().click();
  129 |         await p.waitForURL(/dashboard|\/$/, { timeout: 20_000 });
  130 |       }
  131 | 
  132 |       const pageB = contextB.pages()[0]!;
  133 |       await pageB.goto("/dashboard");
  134 |       await expect(pageB.getByText(/Masuk untuk melanjutkan/i).first()).toBeHidden();
  135 | 
  136 |       // Cabut sesi B.
  137 |       const revoke = pageB.getByRole("button", { name: /Cabut|Akhiri sesi|Keluar/i }).first();
  138 |       if ((await revoke.count()) === 0) test.skip(true, "Tombol cabut sesi tidak tersedia di halaman ini");
  139 |       await revoke.click();
  140 | 
  141 |       // Sesi A harus tetap bisa masuk ke dashboard.
  142 |       const pageA = contextA.pages()[0]!;
  143 |       await pageA.goto("/dashboard");
  144 |       await expect(pageA.getByText(/Masuk untuk melanjutkan/i).first()).toBeHidden();
  145 |     } finally {
  146 |       await contextA.close();
  147 |       await contextB.close();
  148 |       void page;
  149 |     }
  150 |   });
  151 | });
  152 | 
  153 | test.describe("Skenario C — gerbang passcode admin", () => {
  154 |   test("halaman admin menampilkan gerbang passcode, bukan konten meja kerja", async ({ page }) => {
  155 |     await page.goto("/admin");
  156 |     // Tanpa passcode yang benar, meja kerja admin TIDAK boleh terender: yang
  157 |     // tampil adalah gerbang. Ini pemeriksaan keamanan yang paling penting
  158 |     // di seluruh E2E — kalau bocor, isi Security Desk terbuka untuk siapa pun
  159 |     // yang membuka /admin.
  160 |     const passcodeField = page.locator('input[name="passcode"]');
  161 |     if ((await passcodeField.count()) > 0) {
  162 |       await expect(passcodeField).toBeVisible();
  163 |     } else {
  164 |       // Alternatif: admin yang sudah punya sesi, atau akun yang belum menerima
  165 |       // undangan. Apa pun yang terjadi, passcode tidak boleh dilewati diam-diam.
  166 |       await expect(page.getByText(/passcode|Masuk|Undangan/i).first()).toBeVisible();
  167 |     }
  168 |   });
  169 | 
  170 |   test("passcode salah ditolak dengan pesan yang jelas, tanpa membuka ruang admin", async ({ page }) => {
  171 |     await page.goto("/auth?returnTo=/admin");
  172 |     const passcodeField = page.locator('input[name="passcode"]');
  173 |     test.skip((await passcodeField.count()) === 0, "Gerbang passcode tidak tampil (admin sudah masuk atau belum diaktifkan)");
  174 |     await passcodeField.fill("0000-salah-pasti");
  175 |     // Label tombol di halaman auth bukan "Masuk ke Buku Kerja" — itu judul
  176 |     // kartu, bukan kendali. Nama yang benar ada di `Auth.tsx`.
  177 |     await page.getByRole("button", { name: /Verifikasi passcode/i }).click();
  178 |     // Pesan error harus muncul (role=alert), dan URL tetap di /auth.
> 179 |     await expect(page.getByRole("alert").first()).toBeVisible();
      |                                                   ^ Error: expect(locator).toBeVisible() failed
  180 |     await expect(page).toHaveURL(/\/auth/);
  181 |   });
  182 | });
  183 | 
```