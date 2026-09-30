import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      /*
       * Larangan mengimpor barrel `@/components/ui`.
       *
       * ALASAN (F-15, Fase 9.2): `src/components/ui/index.ts:90` adalah
       * re-export AKTIF dari `./chart`, dan berkas itu satu-satunya pemakai
       * `recharts` sekaligus satu-satunya `dangerouslySetInnerHTML` di repo.
       * Jalur itu sekarang mati bukan karena re-export-nya tidak ada, tapi
       * karena tidak ada berkas aplikasi yang mengimpor barrel-nya.
       *
       * Meaning: satu baris `import { Card } from "@/components/ui"` di berkas
       * mana pun akan menarik `recharts` ke dalam bundle secara diam-diam,
       * tanpa error build, tanpa review yang akan menangkapnya. Bundel 538 kB
       * untuk warga Sumenep yang buka dari HP dengan paket data adalah angka
       * yang dijaga dengan sengaja.
       *
       * Aturan ini mengubah $"harapan konvensi" menjadi "build gagal". Path
       * persis per komponen (`@/components/ui/button`) tetap boleh dipakai -
       * itu bentuk yang benar dan yang dipakai seluruh repo.
       */
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/components/ui",
              message:
                "Impor per komponen, bukan barrel: `import { Card } from \"@/components/ui/card\"`. Barrel itu menarik recharts ke bundle (F-15).",
            },
          ],
          patterns: [
            {
              group: ["@/components/ui$", "@/components/ui/index"],
              message:
                "Impor per komponen, bukan barrel: `@/components/ui/<nama>`. Barrel itu menarik recharts ke bundle (F-15).",
            },
          ],
        },
      ],
    },
  },
);
