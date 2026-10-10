import { expect, test } from "@playwright/test";
import { ADMIN_WHATSAPP_BASE_URL } from "../src/lib/admin-whatsapp";

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

test.describe("Skenario A — landing, autentikasi, dashboard", () => {
  test("halaman publik terbuka, dan rute terlindungi menawarkan masuk sambil mempertahankan tujuan", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Buku Kerja/i);

    await page.goto("/dashboard");
    // `/dashboard` redirect (preservasi-hash) ke kanonis `/warga/dashboard`;
    // `RequireAuth` di sana menampilkan kartu "Masuk", dan tujuan yang terbawa
    // ke /auth adalah rute kanonisnya — bukan lagi `/dashboard` mentah.
    const signIn = page.getByRole("button", { name: /^Masuk$/ }).first();
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(page).toHaveURL(/\/auth\?returnTo=%2Fwarga%2Fdashboard/);
  });

  test("pendatang tanpa kredensial melihat halaman auth yang benar", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByText(/Masuk ke Buku Kerja/i).first()).toBeVisible();
    // Fase 9.5: dua pintu yang tersisa adalah Google dan tombol di bawah
    // ini; dialog OTP baru ada setelah tombolnya ditekan.
    await expect(page.getByRole("button", { name: /Masuk dengan Google/i })).toBeVisible();
    // Fase 9.5+: pintu email adalah halaman penuh `/auth/email`, bukan dialog.
    await page.getByRole("button", { name: /Masuk dengan Email/i }).click();
    await expect(page).toHaveURL(/\/auth\/email/);
    await expect(page.getByText(/Masuk ke Buku Kerja/i).first()).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Kirim OTP/i }),
    ).toBeVisible();
  });

  test("masuk dan sampai ke dashboard", async ({ page }) => {
    // Fase 9.5: pintu sandi dihapus, jadi tidak ada lagi kredensial yang
    // bisa diisi Playwright. Menyelesaikan OTP butuh kode dari kotak masuk
    // akun uji. Yang dibuktikan di sini: kode bisa diminta sampai tahap
    // kode tampil. Sisanya OPEN - TEST INFRASTRUCTURE GAP (penerus F-17).
    test.skip(
      !authEmail,
      "Butuh E2E_USER_EMAIL (akun uji nyata di Keys/deployment) untuk meminta kode OTP",
    );
    await page.goto("/auth");
    await page.getByRole("button", { name: /Masuk dengan Email/i }).click();
    await expect(page).toHaveURL(/\/auth\/email/);
    await page.getByLabel(/email/i).fill(authEmail!);
    await page.getByRole("button", { name: /Kirim OTP/i }).click();
    await expect(page.getByText(/Kode 6 digit/i)).toBeVisible({ timeout: 20_000 });
    test.skip(
      true,
      "Kode OTP hanya ada di kotak masuk akun uji; Playwright tidak bisa membacanya",
    );
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
   * yang sedang diuji. Server menandai baris-artefak ini `ignored`
   * (`isE2eTestMessage`), jadi tidak pernah mengisi antrean `open` dan tidak
   * menjadwalkan alert — tetapi tetap ada di tabel sebagai jejak audit.
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
    // Dialog BARU mengunci penutupan sampai laporan diteruskan via tautan
    // admin ("Kirim ke admin"): X/Esc/klik-luar dimatikan dan tombol Tutup
    // polos disembunyikan selama tautan belum ditekan (lihat `locked` di
    // error-report-dialog.tsx — keputusan desain yang disengaja, bukan bug).
    // Alur yang diuji: tautan ada -> klik (onClick mencatat adminShared) ->
    // "Tutup Pesan" muncul -> tutup -> hilang.
    await expect(
      dialog.getByRole("button", { name: /^Tutup Pesan$/ }),
    ).toBeHidden();
    const waLink = dialog.getByRole("link", { name: /Kirim ke admin/i });
    await expect(waLink).toBeVisible({ timeout: 15_000 });
    await waLink.click();
    const tutupPesan = dialog.getByRole("button", { name: /Tutup Pesan/i });
    await expect(tutupPesan).toBeVisible({ timeout: 15_000 });
    await tutupPesan.click();
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

  test("masuk di dua perangkat, lalu cabut satu sesi", async ({ page, browser }) => {
    // CATATAN FASE 9.5.
    //
    // Pintu sandi dihapus total, jadi tidak ada lagi kredensial yang bisa
    // diisi Playwright: Google butuh interaksi, OTP butuh kotak masuk.
    // Statusnya tetap `OPEN - TEST INFRASTRUCTURE GAP` (penerus F-17):
    // yang dibutuhkan sekarang adalah akses baca ke kotak masuk akun uji
    // (atau hook kode-uji), dan test di bawah harus diisi lewat dialog OTP -
    // bukan form sandi yang sudah tidak ada.
    //
    // Test ini sengaja TIDAK diubah sekarang. Menghijaukan test dengan
    // menebak-nebak alur login baru akan menghasilkan test yang lulus tanpa
    // pernah menguji apa yang seharusnya diuji.
    test.skip(
      !email,
      "Butuh E2E_USER_EMAIL + akses kotak masuk akun uji; alur test belum ditulis ulang untuk OTP",
    );
    // Dua konteks = dua perangkat. Masing-masing meminta kode OTP; sesi
    // penuh butuh kode dari kotak masuk (lihat skip di bawah), lalu sesi B
    // dicabut dari perangkat B dan perangkat A harus tetap sahih.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      for (const context of [contextA, contextB]) {
        const p = await context.newPage();
        await p.goto("/auth");
        await p.getByRole("button", { name: /Masuk dengan Email/i }).click();
        await expect(p).toHaveURL(/\/auth\/email/);
        await p.getByLabel(/email/i).fill(email!);
        await p.getByRole("button", { name: /Kirim OTP/i }).click();
        await expect(p.getByText(/Kode 6 digit/i)).toBeVisible({ timeout: 20_000 });
      }
      test.skip(
        true,
        "Kode OTP hanya ada di kotak masuk akun uji; pencabutan sesi belum bisa diuji E2E",
      );

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

    // DULU test ini memakai `test.skip((await passcodeField.count()) === 0, ...)`.
    // Itu keliru karena gerbang ini HANYA bergantung URL: `needsPasscode =
    // adminGateRequired && passcodeGranted === null` (`Auth.tsx:78`), dan
    // pengunjung yang belum masuk tidak punya tiket passcode. Jadi di
    // konteks peramban yang bersih, form ini WAJIB muncul.
    //
    // Yang sebenarnya terjadi: `count()` dicek seketika setelah `goto`,
    // padahal `AnimatedContent` (Framer Motion) belum sempat me-mount
    // elemennya. Di Desktop kebetulan sudah ada, di Pixel 5 belum - jadi
    // test yang sama PASS di satu perangkat dan SKIP di perangkat lain.
    // Skip itu bukan pengecualian lingkungan yang sah: ia menghapus seluruh
    // pemeriksaan gerbang admin di perangkat mobile tanpa ada yang gagal.
    //
    // Jadi sekarang test ini MENUNGGU gerbangnya. Kalau gerbang benar-benar
    // tidak muncul, test gagal keras - bukan menghilang dari laporan.
    await expect(passcodeField, "gerbang passcode harus muncul di /auth?returnTo=/admin").toBeVisible({
      timeout: 15_000,
    });
    // Tombol masih berbunyi "Memeriksa..." selama gerbang mengecek ke server,
    // lalu berubah jadi "Verifikasi passcode". Menunggu label yang benar
    // juga menunggu gerbang selesai checking.
    const verify = page.getByRole("button", { name: /Verifikasi passcode/i });
    await expect(verify).toBeVisible({ timeout: 15_000 });

    await passcodeField.fill("0000-salah-pasti");
    // Label tombol di halaman auth bukan "Masuk ke Buku Kerja" — itu judul
    // kartu, bukan kendali. Nama yang benar ada di `Auth.tsx`.
    await verify.click();
    // Pesan error harus muncul (role=alert), dan URL tetap di /auth.
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });
});

/**
 * Skenario E — handoff WhatsApp admin.
 *
 * Yang DAPAT dan TIDAK DAPAT dibuktikan di sini harus dibedakan sejak awal:
 *
 *   HANDOFF VERIFIED
 *     - URL handoff dibangun dengan benar (test unit, `src/lib/admin-whatsapp.test.ts`)
 *     - isi pesan ter-encode dan pulih utuh setelah di-decode (test unit)
 *     - penerima valid dan tidak dikarang di mana pun (test unit + cek source)
 *
 *   NOT VERIFIED
 *     - CTA benar-benar ter-render di panel admin (butuh akses pengelola)
 *     - klik CTA membuka aplikasi WhatsApp (butuh perangkat dengan WhatsApp)
 *
 * Kalau blokir di bawah berubah someday, test ini otomatis berubah dari
 * skip terlasifikasi menjadi pemeriksaan sungguhan — bukan test yang diam-diam
 * hilang dari laporan.
 */
test.describe("Skenario E — handoff WhatsApp admin", () => {
  // Diambil dari sumber kebenaran yang sama dengan server. Kalau konstanta
  // berubah, test ini ikut berubah -- bukan diam-diam menguji angka basi.
  const HANDOFF_BASE = ADMIN_WHATSAPP_BASE_URL;

  test("CTA handoff di panel admin sesuai kontrak wa.me", async ({ page }) => {
    await page.goto("/admin");
    const cta = page.getByTestId("admin-handoff-cta");
    const gate = page.locator('input[name="passcode"]');
    const teksGerbang = page.getByText(/passcode|Masuk|Undangan/i).first();

    // `/admin` menyiapkan catatan lokal dulu ("Menyiapkan catatan lokal...")
    // sebelum meja kerja atau gerbangnya ter-render. Menghitung elemen
    // seketika setelah goto karena itu selalu nol, dan dulu disalahartikan
    // sebagai "tidak ada apa-apa" padahal halamannya cuma belum selesai.
    // Tunggu dulu sampai salah satu bentuknya benar-benar muncul.
    await expect(cta.or(teksGerbang)).toBeVisible({ timeout: 30_000 });

    if ((await cta.count()) === 0) {
      // Gerbang passcode masih menutupi meja kerja: ini kondisi yang diharapkan
      // di lingkungan tanpa kredensial pengelola. Skip-nya EKSPLISIT, dengan
      // klasifikasi yang tercatat di laporan, bukan `test.skip()` telanjang.
      test.info().annotations.push({
        type: "handoff-evidence",
        description: "HANDOFF VERIFIED (unit): URL, encoding, dan penerima. NOT VERIFIED (E2E): CTA di panel dan navigation ke WhatsApp.",
      });
      expect(
        (await gate.count()) > 0 || (await page.getByText(/passcode|Masuk|Undangan/i).count()) > 0,
        "CTA handoff tidak terlihat DAN gerbang passcode juga tidak ada — ini bug, bukan ketiadaan akses",
      ).toBe(true);
      // Dicetak ke log CI, bukan hanya disimpan di laporan HTML: skip tanpa
      // jejak di stdout adalah skip senyap.
      console.warn(
        "[handoff-evidence] HANDOFF VERIFIED (unit test): URL wa.me, recipient, encoding, determinisme. " +
          "NOT VERIFIED (E2E): CTA di panel admin dan navigation ke WhatsApp. " +
          "EXTERNAL WHATSAPP DELIVERY NOT VERIFIED.",
      );
      test.skip(
        true,
        "EXTERNAL WHATSAPP DELIVERY NOT VERIFIED — panel admin terkunci passcode di lingkungan ini; CTA handoff tidak bisa di-render peramban tanpa kredensial pengelola.",
      );
    }

    // Jika someday gerbangnya bisa dilewati, seluruh pemeriksaan di bawah
    // langsung berjalan. Tidak ada jalur yang "kebetulan hijau".
    const href = await cta.getAttribute("href");
    expect(href).not.toBeNull();
    expect(href!.startsWith(`${HANDOFF_BASE}?text=`)).toBe(true);

    const parsed = new URL(href!);
    expect(parsed.origin + parsed.pathname).toBe(HANDOFF_BASE);
    const message = parsed.searchParams.get("text");
    expect(message).not.toBeNull();
    expect(message!.length).toBeGreaterThan(0);
    // Karakter khusus harus pulih utuh: kalau tidak, isi yang sampai ke
    // WhatsApp bukan isi yang ditulis server.
    expect(message).toContain("Ringkasan Harian");
    // Tidak ada yang boleh mencium secret di URL yang tampil di layar.
    expect(href).not.toMatch(/WHATSAPP_ACCESS_TOKEN|EAAG|ownerId|businessId/);
  });
});
