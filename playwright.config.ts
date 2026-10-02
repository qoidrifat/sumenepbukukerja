import { defineConfig, devices } from "@playwright/test";

/**
 * Konfigurasi E2E.
 *
 * `E2E_BASE_URL` menunjuk ke deployment yang sudah berjalan (misalnya situs
 * produksi). Kalau tidak diisi, Playwright membangun dan menyajikan build
 * produksi LOKAL sendiri lewat `webServer`, lalu menutupnya lagi setelah
 * selesai. Jadi `bun run test:e2e` selalu menjalankan peramban sungguhan
 * terhadap build sungguhan — tanpa perlu menjalankan dev server secara manual,
 * dan tanpa proses latar yang tertinggal.
 */
const externalBaseUrl = process.env.E2E_BASE_URL;
const localBaseUrl = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  // Diukur: halaman publik butuh 6,3-7,0 detik untuk merender `#katalog`
  // pada muat dingin ketika empat halaman dibuka bersamaan (query Convex
  // sungguhan + bundel 538 kB). Dengan satu worker, satu test yang melakukan
  // beberapa navigasi bisa melewati 30 detik hanya karena lambat, bukan
  // karena salah. Anggaran dinaikkan ke 60 detik; assertion-nya tetap
  // memakai tenggat sendiri yang jauh lebih ketat.
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  // Satu worker. Dengan dua worker, suite yang sudah tumbuh (4 berkas spec,
  // 2 perangkat) kadang membuat Chromium "Page crashed" - kehabisan memori,
  // bukan bug aplikasi. Menambah worker di sini terlalu berat; satu worker
  // membuat hasilnya dapat direproduksi.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          // Build dulu supaya E2E tidak pernah menguji bundel development yang
          // tidak sama dengan yang akan dideploy.
          command: "vite build && vite preview --port 4173 --strictPort",
          url: localBaseUrl,
          timeout: 240_000,
          reuseExistingServer: false,
          stdout: "ignore",
        },
      }),
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-android", use: { ...devices["Pixel 5"] } },
    // reducedMotion: "reduce" bukan sekadar pengulangan project desktop.
    // Audit produksi menunjukkan kondisi ini membuat useReducedMotion()
    // mengembalikan { duration: 0 }, sehingga AnimatePresence mencabut dialog
    // dalam hitungan milidetik - 23 ms, hasil ukur langsung di halaman yang
    // benar-benar berjalan. Bug yang sama karena itu bisa muncul SEPENUHNYA
    // di desktop dan nyaris tak terlihat di Android, dan sebaliknya.
    //
    // testMatch sengaja membatasi project ini ke spec ruang kelola, supaya
    // spec publik yang lain tidak ikut dijalankan tiga kali.
    {
      name: "chromium-desktop-reduced-motion",
      testMatch: /admin-workspace.spec.ts/,
      use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" },
    },
  ],
});
