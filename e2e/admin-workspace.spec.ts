import { expect, test, type Page } from "@playwright/test";
import { SKIP_NO_CREDENTIALS, hasCredentials, openAdminWorkspace } from "./support/auth";

/**
 * Dialog profil di menu ruang pengelola.
 *
 * Bug yang diuji di sini sudah lolos DUA kali, dan sekarang alasannya bisa
 * dibuktikan. Dialog profil pernah dirender DI DALAM panel menu, sementara
 * panel itu dibungkus `AnimatePresence` yang mencabut seluruh anaknya begitu
 * panel menutup. Klik pada pemicunya sendiri yang menutup panel, di handler
 * yang sama yang membuka dialog. Dialog karena itu hanya hidup selama
 * animasi keluar panel.
 *
 * Pengukuran langsung di produksi, memakai MutationObserver pada halaman
 * yang benar-benar berjalan:
 *
 *     dialog MASUK DOM  :  ~72 ms
 *     dialog DICABUT    :  ~95 ms
 *     umur dialog       :  ~23 ms
 *
 * 23 ms itu SEPERTINGYA tidak cukup untuk animasi masuk dialog sendiri yang
 * berdurasi 200 ms. Dialog mati pada sekitar 11 persen pertama animasinya,
 * sehingga di desktop ia terlihat tidak pernah muncul sama sekali, dan di
 * Android beberapa frame sempat terlihat lalu hilang sendiri.
 *
 * Angka 23 ms itu muncul karena `AdminHeader` memakai `useReducedMotion()`.
 * Saat `prefers-reduced-motion: reduce` aktif, transition menjadi
 * `{ duration: 0 }` sehingga `AnimatePresence` mencabut tanpa menunggu sama
 * sekali. Observatory `chromium-desktop-reduced-motion` di
 * `playwright.config.ts` sengaja mengunci kondisi itu.
 *
 * Test-test di bawah menguji PRINSIP, bukan tampilan: menu boleh menutup,
 * animasi boleh selesai, reduced-motion boleh aktif, dan dialog tetap harus
 * hidup sampai pengguna yang menutupnya. Tidak ada satupun test di sini yang
 * membaca teks source, dan tidak ada yang menunggu angka milidetik tertentu
 * agar lolos - semuanya menunggu yang JELAS: dialog masih ada.
 */

/**
 * Berapa lama dialog harus bertahan tanpa campur tangan.
 *
 * Jauh lebih besar dari durasi animasi yang tersangkut (sekitar 250 ms).
 * Kalau nilainya kecil, pemeriksaan pertama bisa sah-sah menangkap kilatan
 * yang memang salah - dialog terlihat beberapa frame lalu hilang. Yang
 * diuji adalah KETAHUANNYA, bukan kemunculan pertamanya.
 */
const SETTLE_MS = 1_500;

/** Jendela pengamatan untuk MutationObserver. */
const WATCH_MS = 2_000;

/** Dialog profil, diidentifikasi lewat penanda yang dipakai penjaga pointerdown. */
const profileDialog = (page: Page) => page.locator("[data-admin-dialog]");

const workspaceMenu = (page: Page) =>
  page.getByRole("menu", { name: "Menu ruang pengelola" });

/** Buka panel menu ruang pengelola. */
async function openWorkspaceMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Buka menu ruang pengelola/i }).click();
  await expect(workspaceMenu(page)).toBeVisible({ timeout: 10_000 });
}

/** Klik item "Profil" di dalam dropdown. */
async function clickProfileItem(page: Page): Promise<void> {
  await page.getByRole("menuitem", { name: "Atur profil" }).click();
}

test.describe("Dialog profil di menu ruang pengelola", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCredentials(), SKIP_NO_CREDENTIALS);
    await openAdminWorkspace(page);
  });

  test("dialog terbuka dan bertahan jauh setelah animasi menu selesai", async ({ page }) => {
    await openWorkspaceMenu(page);
    await clickProfileItem(page);

    // Keberadaan pertama. Di desktop inilah yang gagal pada bug lama.
    await expect(
      profileDialog(page),
      "dialog profil harus muncul setelah item Profil diklik",
    ).toBeVisible({ timeout: 5_000 });

    // Keberadaan setelah semua animasi selesai. Inilah yang membedakannya
    // dari kilatan 23 ms.
    await page.waitForTimeout(SETTLE_MS);
    await expect(
      profileDialog(page),
      "dialog profil harus masih ada 1,5 detik setelah dibuka",
    ).toBeVisible();
  });

  test("dialog tidak pernah dicabut dari DOM setelah masuk", async ({ page }) => {
    // MutationObserver dipasang DI HALAMAN, lalu aksi dijalankan, lalu
    // hasilnya dikembalikan ke test. Dengan begitu rentang pengamatannya
    // mencakup kliknya sendiri - yang justru titik dialog lahir.
    await openWorkspaceMenu(page);

    const hasil = await page.evaluate(async (waitMs) => {
      const events: { t: number; type: string }[] = [];
      const t0 = performance.now();
      const isDialog = (node: Element) =>
        node.matches("[data-admin-dialog]") || !!node.querySelector("[data-admin-dialog]");
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1 && isDialog(node as Element)) {
              events.push({ t: Math.round(performance.now() - t0), type: "added" });
            }
          }
          for (const node of record.removedNodes) {
            if (node.nodeType === 1 && isDialog(node as Element)) {
              events.push({ t: Math.round(performance.now() - t0), type: "removed" });
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const profil = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
        (el) => el.getAttribute("aria-label") === "Atur profil",
      );
      if (profil) (profil as HTMLElement).click();

      await new Promise((done) => setTimeout(done, waitMs));
      observer.disconnect();
      return { events, stillPresent: !!document.querySelector("[data-admin-dialog]") };
    }, WATCH_MS);

    const removals = hasil.events.filter((e) => e.type === "removed");
    expect(
      removals,
      "dialog dicabut dari DOM: " + JSON.stringify(hasil.events)
        + ". Urutan masuk-lalu-keluar seperti inilah bug aslinya - dialog "
        + "masuk sebentar lalu ikut tercabut bersama panel menu.",
    ).toEqual([]);
    expect(hasil.stillPresent, "dialog harus masih ada di DOM saat pengamatan berakhir").toBe(true);
  });

  test("menu menutup tanpa ikut menutup dialog", async ({ page }) => {
    // Dua keadaan yang harus berdiri sendiri. Yang diuji bukan "dialog ada",
    // tapi bahwa keduanya benar-benar independen: menu BOLEH menutup.
    await openWorkspaceMenu(page);
    await clickProfileItem(page);
    await expect(profileDialog(page)).toBeVisible({ timeout: 5_000 });

    await expect(
      workspaceMenu(page),
      "menu harus menutup saat profil dibuka, supaya tidak muncul lagi "
        + "sendiri begitu dialog ditutup",
    ).toBeHidden({ timeout: 5_000 });
    await expect(
      profileDialog(page),
      "menutup menu tidak boleh ikut menutup dialog",
    ).toBeVisible();
  });

  test("ketukan di dalam dialog tidak menutupnya", async ({ page }) => {
    // Jalur kedua dari laporan user. Penutup menu adalah
    // `document.addEventListener("pointerdown")` milik header, sedangkan
    // dialog dirender lewat portal ke `document.body` - isinya berada DI LUAR
    // header, jadi setiap ketukan di dalamnya bisa terbaca sebagai ketukan
    // di luar. Perhatikan bahwa `preventDefault` milik Radix tidak akan
    // pernah mencegah listener milik komponen lain.
    await openWorkspaceMenu(page);
    await clickProfileItem(page);
    await expect(profileDialog(page)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(SETTLE_MS);

    // Empat target yang berbeda, bukan cuma isian nama.
    await page.getByRole("heading", { name: "Atur profil" }).click();
    await expect(profileDialog(page)).toBeVisible();

    await profileDialog(page).getByRole("button", { name: /Pilih foto/i }).click();
    await expect(profileDialog(page)).toBeVisible();

    await page.locator("#admin-profile-name").click();
    await expect(profileDialog(page)).toBeVisible();

    // Pilih foto memunculkan dialog pilihan berkas native, jadi di sebagian
    // peramban ia memblokir interaksi berikutnya.PAREN karena itu berkas
    // native itu sengaja ditutup di sini, dan kelanjutannya memakai
    // penginstalan ulang.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);

    await page.locator("#admin-profile-name").click();
    await page.waitForTimeout(500);
    await expect(
      profileDialog(page),
      "ketukan di dalam dialog tidak boleh menutupnya. Dialognya masih hidup, "
        + "jadi yang menutup pastilah penutup menu milik header.",
    ).toBeVisible();
  });

  test("mengetik di isian nama tidak menutup dialog", async ({ page }) => {
    // Di Android, menyentuh isian memunculkan keyboard. Itu gesture paling
    // natural kedua setelah membuka dialog, jadi kalau jalur ini bocor,
    // produk ini rusak di tangan setiap pengguna ponsel.
    await openWorkspaceMenu(page);
    await clickProfileItem(page);
    await expect(profileDialog(page)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(SETTLE_MS);

    const nameField = page.locator("#admin-profile-name");
    await expect(nameField).toBeVisible();
    const nilaiAwal = await nameField.inputValue();
    await nameField.click();
    await nameField.fill(`${nilaiAwal} X`);
    await expect(nameField).toHaveValue(`${nilaiAwal} X`);
    await expect(profileDialog(page)).toBeVisible();
  });

  test("tombol Tutup tetap menutup dialog", async ({ page }) => {
    // Penjaga terhadap perbaikan yang berlebihan. Salah satu cara "memperbaiki"
    // gejala di atas adalah membuat dialog tidak bisa ditutup sama sekali,
    // dan itu produk yang lebih buruk: pengguna kehilangan jalan keluar yang
    // sengaja disediakan.
    await openWorkspaceMenu(page);
    await clickProfileItem(page);
    await expect(profileDialog(page)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(SETTLE_MS);

    await profileDialog(page).getByRole("button", { name: "Tutup" }).click();
    await expect(profileDialog(page), "tombol Tutup harus menutup dialog").toBeHidden({
      timeout: 5_000,
    });
  });
});
