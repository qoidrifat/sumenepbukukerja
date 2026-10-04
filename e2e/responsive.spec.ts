import { expect, test, type Page } from "@playwright/test";

/**
 * Regresi responsif header dan halaman utama.
 *
 * Alasan file ini ada: kolom pencarian di katalog memakai lebar penuh
 * sementara dua tombol di sebelahnya `shrink-0`. Di lebar antara 640 dan
 * sekitar 1300 piksel, total lebar baris melebihi wadahnya, sehingga tombol
 * "Peta" terdorong keluar wadahnya dan dipotong shell. Tidak ada satu pun
 * assertion lama yang menangkapnya: build hijau, unit test hijau, dan
 * halaman hanya terlihat salah di lebar perangkat antara.
 *
 * Pengukuran di sini sengaja mengukur `scrollWidth` versus `clientWidth` pada
 * baris yang memang tidak boleh meluber. Mengukur posisi elemen terhadap tepi
 * layar tidak akan berhasil: akar aplikasi memakai `overflow-x-hidden`, jadi
 * apa pun yang meluber tetap terlihat "di dalam layar" dan test-nya lulus
 * padahal barisnya benar-benar meluber.
 */

type Profil = { nama: string; width: number; height: number };

/**
 * Sebelas profil: iPhone SE dan Android kecil di 320, iPhone 12/13 mini, 14,
 * 15 Pro, 16 Pro Max, iPad mini, iPad Pro 11 inci, tablet landscape, desktop,
 * dan ponsel yang diputar ke landscape.
 */
const PROFIL: Profil[] = [
  { nama: "iPhone SE", width: 320, height: 568 },
  { nama: "Android kecil", width: 360, height: 740 },
  { nama: "iPhone 12 mini", width: 375, height: 812 },
  { nama: "iPhone 14", width: 390, height: 844 },
  { nama: "iPhone 15 Pro", width: 393, height: 852 },
  { nama: "iPhone 16 Pro Max", width: 430, height: 932 },
  { nama: "iPad mini", width: 744, height: 1133 },
  { nama: "iPad Pro 11 inci", width: 1133, height: 834 },
  { nama: "tablet landscape", width: 1024, height: 768 },
  { nama: "ponsel landscape", width: 740, height: 360 },
  { nama: "desktop", width: 1280, height: 800 },
];

const APP_SIAP = 30_000;

/** Menunggu katalog selesai dirender; sebelum itu yang diukur baru placeholder. */
async function tungguKatalog(page: Page) {
  await expect(page.locator("#katalog")).toBeVisible({ timeout: APP_SIAP });
  await page.waitForFunction(
    () => {
      const katalog = document.querySelector("#katalog");
      if (!katalog) return false;
      return (
        katalog.querySelectorAll("article").length > 0 ||
        katalog.textContent?.includes("Belum ada") === true
      );
    },
    undefined,
    { timeout: APP_SIAP },
  );
}

/** Baris yang tidak boleh meluber, dan namanya untuk pesan kegagalan. */
const BARIS: [string, string][] = [
  [".site-header > div", "baris header"],
  ["#katalog div.sm\\:flex-wrap", "baris kolom pencarian"],
  ["#katalog div.flex.flex-col.gap-5", "bilah katalog"],
];

async function ukur(page: Page) {
  return page.evaluate((baris) => {
    const doc = document.documentElement;
    const melebar: { nama: string; detail: string }[] = [];
    for (const [sel, nama] of baris) {
      document.querySelectorAll(sel).forEach((el) => {
        // Selisih 1px ditoleransi: itu pembulatan pecahan piksel, bukan luapan.
        const luap = el.scrollWidth - el.clientWidth;
        if (luap > 1) melebar.push({ nama, detail: `melebar ${luap}px` });
      });
    }

    const header = document.querySelector(".site-header");
    const brand = document.querySelector(".brand-name");
    const cta = document.querySelector(".header-cta");
    const nav = document.querySelector(".site-header nav");
    const kotakCta = cta?.getBoundingClientRect();

    const sentuh = [...(header?.querySelectorAll("a, button") ?? [])].map((el) => {
      const k = el.getBoundingClientRect();
      return {
        label: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "?",
        w: Math.round(k.width),
        h: Math.round(k.height),
      };
    });

    return {
      gulirDokumen: doc.scrollWidth - doc.clientWidth,
      lebarLayar: doc.clientWidth,
      melebar,
      adaHeader: Boolean(header),
      brandTerpotong: brand ? brand.scrollWidth - brand.clientWidth > 1 : false,
      ctaDiDalamLayar: kotakCta ? kotakCta.right <= doc.clientWidth + 1 : false,
      navDesktopTampil: nav ? getComputedStyle(nav).display !== "none" : false,
      sentuh,
    };
  }, BARIS);
}

test.describe("regresi responsif", () => {
  test("sebelas profil perangkat: tidak ada luapan, tidak ada kontrol yang gepeng", async ({
    browser,
  }, testInfo) => {
    const masalah: string[] = [];

    for (const profil of PROFIL) {
      const konteks = await browser.newContext({
        viewport: { width: profil.width, height: profil.height },
        deviceScaleFactor: 2,
        isMobile: profil.width < 700,
        hasTouch: profil.width < 700,
      });
      const page = await konteks.newPage();
      await page.goto("/");
      await tungguKatalog(page);

      // Potret header pada setiap profil. Alat bantu mata ketika ada yang
      // gagal; penegasannya tetap angka di bawah.
      await page
        .locator(".site-header")
        .screenshot({ path: testInfo.outputPath(`header-${profil.nama.replace(/\s+/g, "-")}.png`) })
        .catch(() => undefined);

      const h = await ukur(page);

      if (h.gulirDokumen > 1) {
        masalah.push(`${profil.nama} ${profil.width}px: dokumen melebar ${h.gulirDokumen}px`);
      }
      for (const b of h.melebar) {
        masalah.push(`${profil.nama}: ${b.nama} ${b.detail}`);
      }
      if (!h.adaHeader) masalah.push(`${profil.nama}: header .site-header tidak ada`);
      if (h.brandTerpotong) {
        masalah.push(`${profil.nama}: nama brand terpotong di ${h.lebarLayar}px`);
      }
      if (!h.ctaDiDalamLayar) masalah.push(`${profil.nama}: tombol "Cari jasa" keluar dari layar`);
      if (h.navDesktopTampil !== profil.width >= 1024) {
        masalah.push(
          `${profil.nama}: navigasi desktop ${h.navDesktopTampil ? "tampil" : "tersembunyi"}`,
        );
      }
      for (const s of h.sentuh) {
        if (s.w > 0 && (s.w < 44 || s.h < 44)) {
          masalah.push(`${profil.nama}: kontrol "${s.label}" ${s.w}x${s.h}`);
        }
      }

      await konteks.close();
    }

    testInfo.attach("hasil", { body: masalah.join("\n"), contentType: "text/plain" });
    expect(masalah, "tata letak tidak rapi di salah satu profil").toEqual([]);
  });
});