/*
 * Kebijakan CORS untuk route tangkapan konteks admin.
 *
 * FASE 9.1 - F-11: CORS route konteks, dipersempit tanpa merusak beacon.
 *
 * UKURAN PADA DEPLOYMENT YANG DIUJI (`tmp/qa-p91-http-evidence.json`):
 * `POST /admin-gate/context` dijawab `access-control-allow-origin: *` dan TIDAK
 * pernah mengirim `access-control-allow-credentials`. Jadi risikonya bukan
 * pencurian cookie - tidak ada kredensial sama sekali. Risikonya: situs mana
 * pun bisa memanggil route ini dari peramban pengunjung dan membaca
 * jawabannya, yaitu masked IP, kota/negara, dan token konteks milik
 * pengunjung itu sendiri.
 *
 * YANG SENGAJA TIDAK DIPAKAI SEBAGAI ALLOWLIST: `SITE_URL`. Buktinya ada di
 * `tmp/qa-p91-cors-allowlist-evidence.json`: pada deployment yang diuji,
 * `SITE_URL` menunjuk origin `.convex.site` itu sendiri, bukan origin frontend.
 * Memakainya sebagai allowlist sempat membuat beacon Security Desk kehilangan
 * akses begitu kode baru berjalan - frontend tidak pernah dibaca peramban pada
 * origin itu. `SITE_URL` menjelaskan "alamat situs untuk sitemap", bukan "asal
 * aplikasi ini dipanggil", jadi tidak boleh dipakai untuk mempersempit CORS.
 *
 * YANG DIGUNAKAN: `ADMIN_CONTEXT_ALLOWED_ORIGINS`, daftar origin dipisah koma.
 *  - Terisi: hanya origin di daftar itu yang mendapat
 *    `access-control-allow-origin`. Asing tidak mendapat apa pun.
 *  - Kosong: TUTUP, bukan wildcard. Tanpa header sama sekali, preflight dan
 *    pembacaan lintas origin sama-sama ditolak peramban - Security Desk hanya
 *    kehilangan metadata IP, bukan kebocorannya. Penjatahan metadata jauh lebih
 *    murah daripada mengaktifkan kebocoran.
 *
 * DUA LARANGAN YANG TIDAK PERNAH DILANGGAR, berapa pun konfigurasinya:
 *  - `access-control-allow-credentials` tidak pernah dikirim. Wildcard bersama
 *    credentials ditolak browser dan juga tidak dipakai di sini.
 *  - Dengan allowlist terisi, origin asing tidak pernah mendapat `*`.
 *
 * Wildcard hanya boleh muncul kalau operator MEMILIHNYA lewat
 * `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS`, dan tetap tanpa credentials.
 *
 * Penegakan tidak bergantung pada `NODE_ENV` atau tebakan lain tentang
 * lingkungan. Kegagalan mendeteksi "ini produksi" adalah cara yang rapi untuk
 * tidak menegakkan apa pun.
 *
 * BERKAS INI ADA KARENA PIHAK KETIGA MEMBUTUHKANNYA. Fungsi Vercel di
 * `api/admin-context.ts` menjalankan runtime server dan tidak boleh mengimpor
 * `convex/server`, jadi aturan ini harus hidup di modul murni yang bisa diimpor
 * kedua sisi. `src/convex/http.ts` meng-ekspor ulang semua nama di bawah supaya
 * test yang sudah ada tidak perlu tahu file mana yang memegang kebenaran.
 *
 * Isi modul ini murni fungsi header tanpa efek samping.
 */

export const CONTEXT_CORS_METHODS = "POST, OPTIONS";
export const CONTEXT_CORS_REQUEST_HEADERS =
  "content-type, x-forwarded-for, x-real-ip, cf-connecting-ip, true-client-ip";

export type ContextCorsMode = "allowlist" | "wildcard" | "closed";

/**
 * Mode wildcard harus diminta tertulis, bukan terjadi karena allowlist lupa diisi.
 */
export function allowWildcardContextCors(env: Record<string, string | undefined>) {
  return (env.ADMIN_CONTEXT_ALLOW_WILDCARD_CORS ?? "").trim().toLowerCase() === "true";
}

/** Origin yang boleh memanggil route tangkapan konteks. */
export function allowedContextOrigins(env: Record<string, string | undefined>) {
  return (env.ADMIN_CONTEXT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function resolveContextCorsMode(
  allowedOrigins: string[],
  options: { allowWildcard?: boolean } = {},
): ContextCorsMode {
  // Normalisasi ulang di sini, bukan hanya di pembaca env. Kalau ada satu
  // spasi di environment, allowlist "terisi" menurut hitungan panjang tapi
  // anggotanya sama sekali kosong - wildcard yang lebih buruk.
  const usable = allowedOrigins.map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  if (usable.length > 0) return "allowlist";
  return options.allowWildcard ? "wildcard" : "closed";
}

export function buildContextCorsHeaders(
  requestOrigin: string | null,
  allowedOrigins: string[],
  options: { allowWildcard?: boolean } = {},
) {
  const headers: Record<string, string> = {
    "access-control-allow-methods": CONTEXT_CORS_METHODS,
    "access-control-allow-headers": CONTEXT_CORS_REQUEST_HEADERS,
    "access-control-max-age": "600",
    "cache-control": "no-store",
    // Wajib: respons memakai Origin pada allowlist, jadi cache bersama tidak
    // boleh memakai satu jawaban untuk origin lain.
    vary: "Origin",
    "x-content-type-options": "nosniff",
  };
  const mode = resolveContextCorsMode(allowedOrigins, options);
  if (mode === "wildcard") {
    headers["access-control-allow-origin"] = "*";
    return headers;
  }
  // Mode "closed" sengaja tidak mengirim apa pun. Preflight dan pembacaan lintas
  // origin sama-sama ditolak peramban, jadi yang hilang cuma metadata IP - bukan
  // kebocorannya. Penjatahan metadata jauh lebih murah daripada membuka
  // endpoint yang bisa dipanggil situs mana pun dari peramban pengunjung.
  if (mode === "closed") return headers;
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers["access-control-allow-origin"] = requestOrigin;
  }
  return headers;
}

/** Header CORS untuk satu request, lengkap dengan pembacaan env. */
export function contextCorsHeaders(
  requestOrigin: string | null,
  env: Record<string, string | undefined>,
) {
  return buildContextCorsHeaders(requestOrigin, allowedContextOrigins(env), {
    allowWildcard: allowWildcardContextCors(env),
  });
}