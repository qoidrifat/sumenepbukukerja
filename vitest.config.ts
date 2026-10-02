import path from "node:path";
import { defineConfig } from "vitest/config";

// Sama dengan alias di vite.config.ts supaya test memakai konvensi import yang
// sama dengan aplikasi (`@/lib/...`), termasuk untuk uji render komponen.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "edge-runtime",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
    // FASE 16 - kunci enkripsi nomor untuk seluruh suite, supaya test yang
    // menyentuh data warga tidak gagal karena konfigurasi, bukan karena logika.
    // Nilainya kunci UJI yang terlihat jelas; lihat berkasnya.
    setupFiles: ["./src/test-setup.ts"],
  },
});
