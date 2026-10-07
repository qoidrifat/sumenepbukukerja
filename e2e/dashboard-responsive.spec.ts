import { expect, test, type Page } from "@playwright/test";

import { SKIP_NO_SESSION, storageStatePath } from "./support/auth";

/**
 * Luapan horizontal di dasbor warga & mitra pada lebar 320px dan 390px.
 *
 * Alasan berkas ini ada: kedua dasbor memakai tabel, grid metrik, dan pil
 * status yang semuanya `nowrap`. Satu pil yang menyusut di bawah lebar teksnya
 * sudah cukup membuat halaman meluber - terukur 382px pada viewport 374px,
 * dan pil "Menunggu verifikasi" menyusut dari 157px jadi 112px sementara
 * teksnya menolak mengecil. Tidak ada assertion lama yang menangkapnya: build
 * hijau, typecheck hijau, unit test hijau, dan pemotongan itu hanya tampak di
 * perangkat sempit.
 *
 * Kenapa yang diukur `scrollWidth` versus `clientWidth`, bukan posisi elemen
 * terhadap tepi layar: `src/index.css` SENGAJA tidak menambahkan
 * `overflow-x: clip` pada `body` (lihat blok "Header publik dan perangkat yang
 * modelnya berbeda-beda" di sana), justru supaya luapan tetap terlihat dan bisa
 * diukur. Karena itu selisih `scrollWidth - clientWidth` pada
 * `documentElement` adalah sinyal yang sah untuk seluruh halaman - termasuk
 * isi yang meluber jauh melewati tepi kanan, yang tidak akan tertangkap oleh
 * pemeriksaan `getBoundingClientRect` karena tetap "di dalam layar".
 *
 * Halaman dasbor berada di balik `RequireAuth`, dan `signIn()` di
 * `support/auth.ts` memang berhenti di tahap kode OTP karena kotak masuknya
 * tidak bisa dibaca Playwright. Berkas ini karena itu memakai sesi jadi kalau
 * operator menyodorkannya lewat `E2E_STORAGE_STATE`, dan kalau tidak, test-nya
 * `skip` dengan pesan yang menyebut variabelnya - tidak pernah hijau palsu.
 *
 * Yang membuat berkas ini bukan penjaga kosong adalah test kalibrasi di
 * bagian akhir: ia berjalan TANPA kredensial sama sekali, menanam luapan
 * buatan ke halaman sungguhan, lalu menuntut penjaganya benar-benar melapor.
 * Tanpa itu, penjaga yang selalu hijau akan tampak sama dengan penjaga yang
 * bekerja.
 */

// Sesi tidak pernah ditulis di source (aturan 2 di `support/auth.ts`): berkas
// storageState hanya dipakai kalau operator yang menyebutkan lokasinya.
// Kalau tidak ada, `test.use({})` tidak mengubah apa pun.
const sesi = storageStatePath();
test.use(sesi ? { storageState: sesi } : {});

/** Dasbor perlu Convex + bundel untuk siap; `/` diukur dalam 6-7 detik. */
const JEDA_APP = 30_000;

/** Selisih 1px ditoleransi: itu pembulatan pecahan piksel, bukan luapan. */
const TOLERANSI = 1;

const SKIP_TAK_MENENTU =
  "Aplikasi belum sampai ke keadaan yang bisa diukur (`.dash-shell` atau kartu "
  + "'Masuk untuk melanjutkan' tidak pernah tampil). Bukan lulus: tidak ada "
  + "pengukuran sama sekali.";

type Luapan = {
  doc: number;
  body: number;
  /** `body`/`html` memotong sumbu X - kalau ya, angka di atas tidak bermakna. */
  terklip: boolean;
  baris: { sel: string; luap: number }[];
};

/**
 * Mengukur luapan halaman, plus luapan tiap baris di dalam `akar`.
 *
 * Elemen dengan `overflow-x` selain `visible` sengaja dilewati: `hidden`/`clip`
 * memang memotong (pola dekorasi lapisan premium), dan `auto`/`scroll` memang
 * wadah bergulir - keduanya bukan cacat tata letak. Elemen `display: inline`
 * juga dilewati karena tidak punya kotak sendiri untuk dibandingkan.
 */
async function ukurLuapan(page: Page, akar = "body"): Promise<Luapan> {
  return page.evaluate(
    ([akarSel, toleransi]) => {
      const nama = (el: HTMLElement) => {
        const kelas = (el.getAttribute("class") ?? "").trim().split(/\s+/).slice(0, 3).join(".");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${kelas ? `.${kelas}` : ""}`;
      };

      const baris: { sel: string; luap: number }[] = [];
      const akarEl = document.querySelector(akarSel);
      if (akarEl) {
        for (const el of [akarEl, ...akarEl.querySelectorAll("*")]) {
          if (!(el instanceof HTMLElement)) continue;
          const gaya = getComputedStyle(el);
          if (gaya.overflowX !== "visible") continue;
          if (gaya.display === "inline") continue;
          const luap = el.scrollWidth - el.clientWidth;
          if (luap > toleransi) baris.push({ sel: nama(el), luap });
        }
      }

      const de = document.documentElement;
      return {
        doc: de.scrollWidth - de.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
        terklip:
          getComputedStyle(de).overflowX !== "visible" ||
          getComputedStyle(document.body).overflowX !== "visible",
        baris: baris.slice(0, 12),
      };
    },
    [akar, TOLERANSI] as const,
  );
}

const RUANG = [
  { nama: "warga", path: "/warga/dashboard", label: "Ruang warga" },
  { nama: "mitra", path: "/mitra/dashboard", label: "Ruang mitra" },
];

/**
 * Dua lebar tersempit yang benar-benar dipakai orang: iPhone SE generasi awal
 * dan iPhone 12/13/14. Keduanya di bawah 640px, jadi aturan
 * `@media (max-width: 640px)` di `index.css` berlaku - termasuk
 * `:where(.grid, .flex) > * { min-width: 0 }` yang justru menjadi akar luapan
 * pil di atas.
 */
const LEBAR = [
  { nama: "iPhone SE", width: 320, height: 568 },
  { nama: "iPhone 14", width: 390, height: 844 },
];

for (const lebar of LEBAR) {
  test.describe(`lebar ${lebar.width}px (${lebar.nama})`, () => {
    // `isMobile` sekaligus membuat scrollbar jadi overlay, sehingga
    // `clientWidth` benar-benar sama dengan lebar viewport yang diminta.
    test.use({
      viewport: { width: lebar.width, height: lebar.height },
      isMobile: true,
      hasTouch: true,
    });

    for (const ruang of RUANG) {
      test(`dasbor ${ruang.nama} tidak meluber di ${lebar.width}px`, async ({ page }) => {
        await page.goto(ruang.path, { waitUntil: "domcontentloaded" });

        const shell = page.locator(".dash-shell").first();
        const terblokir = page.getByText("Masuk untuk melanjutkan");

        const menentu = await shell
          .or(terblokir)
          .waitFor({ state: "visible", timeout: JEDA_APP })
          .then(() => true)
          .catch(() => false);
        if (!menentu) test.skip(true, SKIP_TAK_MENENTU);

        if (await terblokir.isVisible().catch(() => false)) {
          test.skip(true, SKIP_NO_SESSION);
        }

        // Penjaga anti-vakum: yang diukur harus benar-benar dasbornya. Kerangka
        // kosong atau halaman lain yang kebetulan punya `.dash-shell` akan lolos
        // pengukuran luapan tanpa membuktikan apa pun, jadi isinya ikut dituntut.
        await expect(shell).toBeVisible();
        await expect(page.getByText(ruang.label, { exact: true }).first()).toBeVisible();

        // Lebar yang benar-benar dipakai tata letak, supaya hasilnya tidak
        // dilaporkan untuk lebar yang berbeda dari yang dimaksud.
        const lebarNyata = await page.evaluate(() => document.documentElement.clientWidth);
        expect(
          Math.abs(lebarNyata - lebar.width),
          `tata letak terukur di ${lebarNyata}px, bukan ${lebar.width}px`,
        ).toBeLessThanOrEqual(TOLERANSI);

        const hasil = await ukurLuapan(page, ".dash-shell");

        expect(
          hasil.terklip,
          "`body`/`html` memotong sumbu X, jadi pengukuran luapan tidak lagi bermakna di sini",
        ).toBe(false);

        expect(hasil.doc, `dokumen meluber ${hasil.doc}px di ${lebar.width}px`).toBeLessThanOrEqual(
          TOLERANSI,
        );
        expect(hasil.body, `body meluber ${hasil.body}px`).toBeLessThanOrEqual(TOLERANSI);
        expect(
          hasil.baris,
          `baris meluber di dasbor ${ruang.nama} pada ${lebar.width}px`,
        ).toEqual([]);
      });
    }
  });
}

/**
 * Kalibrasi: membuktikan penjaganya benar-benar bisa gagal.
 *
 * Menanam luapan buatan ke halaman SUNGGUHAN (`/`), bukan ke `about:blank`,
 * supaya CSS aplikasi tetap berlaku - termasuk aturan `@media` di `index.css`
 * yang justru menjadi akar masalahnya. Dijalankan di kedua lebar yang sama
 * dengan test dasbor, karena justru di bawah 640px aturan `min-width: 0`
 * itu berlaku.
 *
 * Test ini tidak butuh sesi, jadi ia tetap berjalan di runner yang tidak punya
 * kredensial apa pun; kalau penjaganya rusak sampai selalu melapor "aman",
 * inilah test yang merah.
 */
for (const lebar of LEBAR) {
  test.describe(`kalibrasi penjaga luapan di ${lebar.width}px (${lebar.nama})`, () => {
    test.use({
      viewport: { width: lebar.width, height: lebar.height },
      isMobile: true,
      hasTouch: true,
    });

    test("menanam luapan buatan membuat penjaganya melapor", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".site-header")).toBeVisible({ timeout: JEDA_APP });

      await page.evaluate(() => {
        const kotak = document.createElement("div");
        kotak.id = "fixture-lebar";
        kotak.style.width = "200px";
        kotak.innerHTML = '<div style="width: 3000px; height: 8px;"></div>';
        document.body.appendChild(kotak);

        // Cermin dari regresi yang sebenarnya: pil `nowrap` di dalam baris flex.
        // Kelas `flex` disengaja - itulah yang membuat aturan
        // `:where(.grid, .flex) > * { min-width: 0 }` di index.css (berlaku di
        // bawah 640px) memberi izin pil menyusut di bawah lebar teksnya.
        const baris = document.createElement("div");
        baris.id = "fixture-baris";
        baris.className = "flex";
        baris.style.width = "100px";
        const pil = document.createElement("span");
        pil.id = "fixture-pil";
        pil.textContent = "Menunggu verifikasi";
        pil.style.whiteSpace = "nowrap";
        pil.style.flex = "1";
        baris.appendChild(pil);
        document.body.appendChild(baris);
      });

      // Dua-duanya diukur, karena keduanya menangkap hal yang berbeda: yang
      // pertama meluber sampai ke luar dokumen, yang kedua meluber di dalam
      // barisnya sendiri tanpa pernah menyentuh tepi layar. Regresi pil di
      // dasbor adalah jenis yang kedua - karena itu pemeriksaan per baris ada.
      const lebar = await ukurLuapan(page, "#fixture-lebar");
      expect(lebar.doc, "luapan buatan tidak muncul di ukuran dokumen").toBeGreaterThan(TOLERANSI);
      expect(
        lebar.baris.map((b) => b.sel),
        "luapan buatan tidak muncul di pemeriksaan per baris",
      ).toContain("div#fixture-lebar");

      const pil = await ukurLuapan(page, "#fixture-baris");
      expect(
        pil.baris.map((b) => b.sel),
        "pil `nowrap` yang menyusut tidak tertangkap pemeriksaan per baris",
      ).toContain("span#fixture-pil");
    });
  });
}
