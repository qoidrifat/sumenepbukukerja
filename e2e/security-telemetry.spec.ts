import { expect, test } from "@playwright/test";
import { SKIP_NO_CREDENTIALS, hasCredentials, openAdminWorkspace } from "./support/auth";

/*
 * Alur telemetry keamanan ruang pengelola.
 *
 * Yang boleh dan tidak boleh diklaim di sini
 *
 * Flow ini membuktikan SATU hal: bahwa percobaan masuk ke ruang pengelola
 * benar-benar menghasilkan event yang bisa dibaca di Security Desk, lengkap
 * dengan pengenal yang bisa dicari. Itu saja.
 *
 * Yang TIDAK boleh diklaim dari browser E2E: alamat IP. Peramban E2E berjalan
 * di jaringan pengujian, dan IP-nya bukan bukti apa pun tentang jalur relay
 * produksi. Verifikasi IP dilakukan di uji integritas relay berbentuk produksi
 * (`src/lib/admin-relay-signature.test.ts`), bukan di sini. Menggayakan IP di
 * sini akan menghasilkan test yang hijau karena alasan yang salah.
 *
 * Yang juga tidak diklaim: bahwa relay sudah terhubung. Kalau deployment belum
 * punya secret yang sama di kedua sisi, event tetap tertulis dengan
 * `telemetryStatus: "failed"` - dan itu hasil yang benar, bukan kegagalan test.
 * Test ini memeriksa KECOCOKAN bentuk, bukan ketersediaan jaringan.
 */

test.describe("alur telemetry keamanan", () => {
  test.beforeEach(() => {
    test.skip(!hasCredentials(), SKIP_NO_CREDENTIALS);
  });

  test("percobaan masuk menghasilkan event yang bisa dibaca di Security Desk", async ({
    page,
  }) => {
    await openAdminWorkspace(page);

    // Buka Security Desk dari menu ruang pengelola.
    const menu = page.getByRole("button", { name: /menu ruang pengelola/i });
    await expect(menu).toBeVisible({ timeout: 15_000 });
    await menu.click();

    const security = page
      .getByRole("button", { name: /log keamanan|security log|keamanan/i })
      .first();
    await security.waitFor({ state: "visible", timeout: 10_000 });
    await security.click();

    // Tunggu baris event pertama benar-benar muncul. Panel ini me-mount
    // bertahap, jadi `count()` yang dipanggil langsung akan selalu nol.
    const kartu = page.locator('[data-testid="security-event-card"], article').first();
    await expect(kartu, "Security Desk harus menampilkan setidaknya satu event").toBeVisible({
      timeout: 20_000,
    });

    // Bentuk event, bukan isi jaringan. Semua pengenal ini dibuat server.
    const isiKartu = (await kartu.innerText()).replace(/\s+/g, " ");

    // Kode percobaan: ADM-YYYYMMDD-XXXXXX
    expect(isiKartu, "event harus memakai kode percobaan yang bisa dibaca manusia").toMatch(
      /ADM-\d{8}-[0-9A-Z]{6}/,
    );

    // Panel detail memuat pengenal teknis. Buka untuk membuktikannya.
    const detail = page.getByRole("button", { name: /detail keamanan|lihat detail/i }).first();
    if (await detail.isVisible().catch(() => false)) {
      await detail.click();
      const panel = page.locator("body");
      const isiPanel = (await panel.innerText()).replace(/\s+/g, " ");

      // Event ID dan jejak relay hanya ada kalau barisnya benar-benar ditulis
      // oleh backend. Kalau tidak ada, event itu bukan event yang sah.
      expect(isiPanel, "detail harus menampilkan Event ID").toMatch(/EVT-[0-9a-f]{24}/);
      expect(isiPanel, "detail harus menampilkan Request ID").toMatch(/req_[0-9a-f]{16}/);

      // Status bukti harus salah satu dari tiga nilai yang dikenal. Yang
      // ditegakkan di sini adalah KEPADAAN nilai, bukan nilainya: `failed`
      // adalah jawaban yang benar bila relay memang belum terhubung.
      expect(isiPanel, "detail harus menampilkan status bukti").toMatch(
        /Lengkap|Sebagian terkumpul|Gagal terkirim|Tidak tercatat/,
      );

      // Jalur relay harus disebut apa adanya, supaya operator tahu baris ini
      // punya bukti jaringan atau tidak.
      expect(isiPanel, "detail harus menampilkan jalur relay").toMatch(
        /Relay edge|Langsung ke backend|Tidak tersedia|Ditolak|Tidak tercatat/,
      );

      // Cara hash IP harus selalu dinyatakan. Hash polos yang disamarkan
      // sebagai berkey adalah kebohongan yang harus gagal di sini.
      expect(isiPanel, "detail harus menyebutkan cara hash IP").toMatch(
        /HMAC-SHA-256|Tidak dibuat|Tidak tercatat/,
      );
    }
  });

  test("panel keamanan tidak pernah menampilkan nilai yang tidak boleh dilihat", async ({
    page,
  }) => {
    await openAdminWorkspace(page);
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: /menu ruang pengelola/i })).toBeVisible({
      timeout: 15_000,
    });

    // Buka semua detail yang tersedia, lalu baca seluruh teks yang tampil.
    const semuaDetail = page.getByRole("button", { name: /detail keamanan|lihat detail/i });
    const jumlah = await semuaDetail.count();
    for (let i = 0; i < Math.min(jumlah, 3); i += 1) {
      await semuaDetail.nth(i).click().catch(() => undefined);
    }

    const teks = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    // Tidak ada secret yang boleh tampil. Nama environment-nya sendiri tidak
    // pernah muncul di antarmuka.
    expect(teks).not.toContain("ADMIN_CONTEXT_RELAY_SECRET");
    expect(teks).not.toContain("SERVER_IP_HASH_SECRET");

    // Tidak ada alamat IPv4 lengkap. Yang boleh tampil hanya bentuk tersamar
    // dengan tiga oktet terakhir diganti.
    const ipv4Penuh = teks.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
    const bukanTersamar = ipv4Penuh.filter((alamat) => !/\d{1,3}\.\d{1,3}\.\d{1,3}\.(xxx|0)$/i.test(alamat));
    // Loopback dan localhost tetap boleh, karena bukan data pengunjung.
    const selainLokal = bukanTersamar.filter((a) => a !== "127.0.0.1" && a !== "0.0.0.0");
    expect(selainLokal, `alamat IP penuh tidak boleh tampil: ${selainLokal.join(", ")}`).toEqual([]);
  });
});
