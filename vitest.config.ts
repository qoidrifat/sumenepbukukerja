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
  },
});
