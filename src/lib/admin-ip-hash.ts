/*
 * Pemilihan kunci hash IP. Hanya boleh dipakai di server.
 *
 * Modul ini sengaja terpisah dari `admin-telemetry.ts`. Yang kedua ikut
 * masuk ke bundel peramban lewat Security Desk, sedangkan nama environment
 * dan logika pemilihan kunci tidak perlu diketahui peramban.
 *
 * Nilai rahasianya sendiri tetap tidak mungkin bocor ke sini, karena ada di
 * environment server. Tapi nama environment yang muncul di bundel peramban
 * adalah tanda bahwa batas modul salah, dan pemeriksaan kebocoran tidak
 * bisa memakai ambang nol. Karena itu modul ini tidak boleh diimpor dari
 * komponen apa pun.
 */

/** Dari kunci mana `ipHash` dibentuk. */
export type IpHashSecretSource = "dedicated" | "relay-fallback" | "none";

/**
 * Hasil pemilihan kunci, beserta alasan kalau tidak ada kunci.
 *
 * `missing_dedicated` sengaja dibedakan dari `missing_all`: yang pertama
 * berarti `SERVER_IP_HASH_SECRET` belum diisi di produksi, dan itu memang
 * harus diperbaiki. Yang kedua berarti tidak ada environment hash sama
 * sekali, dan itu juga harus diperbaiki, tapi masalahnya berbeda.
 */
export type IpHashSecretResult = {
  secret: string | null;
  source: IpHashSecretSource;
  reason: "ok" | "missing_dedicated" | "missing_all";
};

/** Nama environment yang dipakai untuk kunci hash IP, urutan prioritas. */
export const IP_HASH_SECRET_ENV = "SERVER_IP_HASH_SECRET";
export const IP_HASH_FALLBACK_SECRET_ENV = "ADMIN_CONTEXT_RELAY_SECRET";
/**
 * Kunci hash IP.
 *
 * Urutannya: kunci khusus dulu, baru secret relay. Tapi urutan kedua hanya
 * berlaku di luar produksi.
 *
 * Kenapa produksi menutup diri di sini: `ADMIN_CONTEXT_RELAY_SECRET` sudah ada
 * di dua tempat (Vercel dan Convex) dan tugasnya satu, yaitu membuktikan
 * identitas pengirim. `SERVER_IP_HASH_SECRET` tugasnya berbeda, yaitu menjaga
 * hash IP tidak bisa ditebak. Dua tugas, dua kunci. Kalau satu kunci dipakai
 * untuk dua hal, kebocoran di satu tempat langsung membuka yang lain, dan tidak
 * ada cara mengetahui kunci mana yang bocor.
 *
 * Jadi kalau produksi tanpa kunci khusus, jawabannya bukan "pakai saja yang
 * ada", melainkan `null` dengan alasan `missing_dedicated`. Baris auditnya
 * tetap ditulis: lebih baik tidak punya hash daripada punya hash yang kunci
 * rahasianya bocor ke tempat lain. `ipHashMethod` mencatat
 * `missing-in-production` supaya operator tahu apa yang harus diisi, bukan
 * mengira relaynya yang mati.
 *
 * `production` sengaja diteruskan oleh pemanggil, bukan dibaca di sini.
 * Modul ini ikut masuk ke bundel peramban lewat Security Desk, dan menarik
 * `resolveEnvironment` ke sini akan menyeret modul error-reporting beserta
 * dependensinya ke bundel itu. Server yang memutuskan, modul ini mengikutinya.
 */
export function resolveIpHashSecret(
  env: Record<string, string | undefined>,
  options: { production?: boolean } = {},
): IpHashSecretResult {
  const khusus = (env[IP_HASH_SECRET_ENV] ?? "").trim();
  if (khusus) return { secret: khusus, source: "dedicated", reason: "ok" };

  if (options.production) {
    return { secret: null, source: "none", reason: "missing_dedicated" };
  }

  // Di luar produksi secret relay boleh dipakai sebagai cadangan supaya
  // `ipHash` tidak hilang hanya karena satu environment belum diisi.
  // Hasilnya ditandai `hmac-sha256-fallback`, jadi kalau bocor ke produksi
  // terbaca sebagai penyimpangan, bukan konfigurasi yang wajar.
  const relay = (env[IP_HASH_FALLBACK_SECRET_ENV] ?? "").trim();
  return relay ? { secret: relay, source: "relay-fallback", reason: "ok" }
    : { secret: null, source: "none", reason: "missing_all" };
}