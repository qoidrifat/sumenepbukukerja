// Relay konteks admin: jembatan antara edge Vercel dan backend Convex.
//
// KENAPA BERKAS INI ADA
//
// Jejak audit ruang pengelola sejak awal memang mau mencatat alamat IP.
// `resolveClientIp()` di `security-context.ts` sudah benar dan sudah dijaga
// test — masalahnya ada di PLATFORM. Diperiksa langsung ke produksi
// `focused-lemur-389`:
//
//   curl -X POST .../admin-gate/context -H "X-Forwarded-For: 1.2.3.4"
//   -> {"ipMasked":null,"ipSource":"Unknown","chainLength":0}
//
// Header yang disuntik itu tidak sampai ke action. `httpAction` Convex tidak
// mengekspos header proxy, jadi seluruh alur `captureSecurityContext` yang
// sudah ada tidak PERNAH bisa menerima IP asli. Ini bukan masalah environment
// — tidak ada satu pun pengaturan yang bisa memperbaikinya.
//
// Satu-satunya pihak dalam rantai ini yang melihat klien adalah Vercel. Tetapi
// Vercel hanya menyertakan `x-forwarded-for` dan header geo `x-vercel-ip-*`
// untuk permintaan yang MELEWATI Vercel. Beacon sekarang meluncur langsung ke
// `*.convex.site` dan melewati Vercel sama sekali — itulah sebabnya Security
// Desk selalu berbunyi "IP tidak terdeteksi".
//
// Jadi: satu fungsi kecil di `/api/admin-context` pada Vercel membaca header
// yang dipegang Vercel, lalu meneruskan IP mentah ke backend lewat route yang
// dijaga shared secret. Backend meng-hash dan menyimpannya seperti sebelumnya.
//
// PRIVASI
//
// IP mentah hanya berpindah di kabel antara fungsi Vercel kita sendiri dan
// backend Convex kita sendiri. IP itu TIDAK PERNAH ditulis ke tabel mana pun:
// backend langsung menurunkan `ipHash` (untuk korelasi) dan `ipMasked` (untuk
// dibaca manusia), lalu membuang alamat aslinya — perlakuan yang sama seperti
// sebelumnya. Geo berasal dari header milik Vercel sendiri, BUKAN dari layanan
// geolokasi pihak ketiga, jadi tidak ada alamat IP yang keluar dari Vercel dan
// Convex hanya untuk memetakan lokasi.
//
// Ini pencatatan untuk investigasi insiden di ruang pengelola sendiri. Bukan
// pelacakan pengunjung, dan tidak ada data yang dikirim ke pihak ketiga mana pun.

import { maskIpForDisplay, normalizeIpDetailed } from "./security-context";

/** Path yang dipanggil browser. Same-origin, jadi CORS tidak ikut campur. */
export const RELAY_PATH = "/api/admin-context";

/** Route backend yang menerima IP. Dijaga shared secret. */
export const RELAY_ROUTE = "/admin-gate/context-relay";

/**
 * Nama shared secret. Nilainya harus SAMA di environment Vercel dan Convex.
 * Kosong berarti relay belum dikonfigurasi dan tetap tertutup: relay yang
 * jalan tanpa secret akan membiarkan siapa pun menyuntip IP palsu ke audit.
 */
export const RELAY_SECRET_ENV = "ADMIN_CONTEXT_RELAY_SECRET";

/** Geo dari Vercel. Negara jadi kode huruf besar, kota/wilayah apa adanya. */
export type RelayGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** Hasil pembacaan IP yang diamati Vercel. */
export type RelayIp = {
  ip: string;
  family: "IPv4" | "IPv6" | "unknown";
  source: string;
};

const EMPTY_GEO: RelayGeo = {
  country: null,
  region: null,
  city: null,
  latitude: null,
  longitude: null,
};

const clip = (value: string | null | undefined, max: number) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/**
 * Baca alamat IP dari header yang dipegang Vercel.
 *
 * Urutan prioritas itu penting, dan alasannya soal pemalsuan:
 *
 *  - `x-vercel-forwarded-for` adalah catatan Vercel sendiri tentang alamat
 *    yang ia sambungkan. Ini paling dipercaya.
 *  - `x-real-ip` juga ditulis oleh edge.
 *  - `x-forwarded-for` adalah RANTAI. Pengunjung bisa menyisipkan entri
 *    sendiri di ujung kiri sebelum request sampai, jadi entri paling KIRI -
 *    yang paling sering diberi utamakan orang - justru yang paling mudah
 *    dipalsukan. Entri paling KANAN ditulis oleh edge terdekat dengan kita,
 *    jadi itu yang dipakai di sini.
 *
 * Null adalah hasil normal, bukan error. Relay route tetap menyimpan satu baris
 * audit tanpa IP dan melanjutkan — metadata yang lebih tipis jauh lebih baik
 * daripada login yang macet.
 */
export function readRelayIp(headers: { get(name: string): string | null }): RelayIp | null {
  const langsung = [headers.get("x-vercel-forwarded-for"), headers.get("x-real-ip")];
  for (const kandidat of langsung) {
    const resolved = normalizeIpDetailed(kandidat);
    if (resolved.ip) {
      return { ip: resolved.ip, family: resolved.family, source: "Vercel Edge" };
    }
  }
  const rantai = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => normalizeIpDetailed(entry))
    .filter((entry): entry is { ip: string; family: "IPv4" | "IPv6"; mappedFromIpv6: boolean } =>
      Boolean(entry.ip),
    );
  const terdekat = rantai[rantai.length - 1];
  if (terdekat) {
    return { ip: terdekat.ip, family: terdekat.family, source: "X-Forwarded-For" };
  }
  return null;
}

/**
 * Baca header geolokasi yang menempel pada Vercel.
 *
 * Bukan pencarian pihak ketiga: nilai-nilai ini diturunkan Vercel dari alamat
 * yang memang sudah dipegangnya, jadi tidak ada permintaan yang keluar dari
 * infrastruktur hanya untuk bertanya "di mana IP ini".
 */
export function readRelayGeo(headers: { get(name: string): string | null }): RelayGeo {
  const coordinate = (value: string | null): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
  };
  const city = clip(headers.get("x-vercel-ip-city"), 80);
  const region = clip(headers.get("x-vercel-ip-country-region"), 80);
  const country = clip(headers.get("x-vercel-ip-country"), 8);
  if (!city && !region && !country) return EMPTY_GEO;
  return {
    country: country ? country.toUpperCase() : null,
    // Vercel menulis "ID-JB"; kode negara di depan sudah ada di field sendiri.
    region:
      region && country ? region.replace(new RegExp(`^${country}-`, "i"), "") || region : region,
    city,
    latitude: coordinate(headers.get("x-vercel-ip-latitude")),
    longitude: coordinate(headers.get("x-vercel-ip-longitude")),
  };
}

/**
 * Badan yang diterima backend. IP opsional: kalau Vercel gagal membacanya,
 * baris tetap dicatat, hanya tanpa alamat.
 */
export type RelayPayload = {
  ip?: string;
  ipSource?: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  userAgent?: string | null;
  referrer?: string | null;
  acceptLanguage?: string | null;
};

/**
 * Bersihkan badan masuk sebelum disimpan.
 *
 * Relay itu fungsi kita sendiri, tapi "milik kita sendiri" bukan alasan
 * melewati validasi: endpoint-nya bisa-dihubungi siapa pun yang tahu URL-nya.
 * Setiap field dipangkas panjangnya, dan IP dinormalkan ulang. Nilai yang tidak
 * bisa dibuat valid menjadi null, bukan disimpan apa adanya.
 */
export function normalizeRelayPayload(input: unknown): RelayPayload {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const asString = (value: unknown, max: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  const coordinate = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
  };

  const ip = normalizeIpDetailed(typeof raw.ip === "string" ? raw.ip : null).ip;
  return {
    ...(ip ? { ip } : {}),
    ipSource: ip ? (asString(raw.ipSource, 40) ?? "Vercel Edge") : undefined,
    country: asString(raw.country, 8)?.toUpperCase() ?? null,
    region: asString(raw.region, 80),
    city: asString(raw.city, 80),
    latitude: coordinate(raw.latitude),
    longitude: coordinate(raw.longitude),
    userAgent: asString(raw.userAgent, 400),
    referrer: asString(raw.referrer, 300),
    acceptLanguage: asString(raw.acceptLanguage, 80),
  };
}

/**
 * Verifikasi shared secret. Panjang tetap dan waktu-tetap, supaya panjang maupun
 * isi secret yang salah tidak bocor lewat waktu respons.
 *
 * `expected` yang kosong selalu gagal. Relay tanpa secret harus tertutup, bukan
 * terbuka.
 */
export function verifyRelaySecret(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const a = (provided ?? "").trim();
  const b = (expected ?? "").trim();
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * Hanya bentuk tersamar yang sampai ke browser dan ke database. Dipakai kedua
 * sisi supaya bentuk yang tersimpan sama, siapa pun yang menulisnya.
 */
export function relayDisplayIp(ip: string | null | undefined): string | null {
  return maskIpForDisplay(ip ?? null);
}

/**
 * Origin router HTTP Convex, diturunkan dari cloud URL kalau tidak diisi
 * eksplisit.
 *
 * Router hanya dilayani di domain `.convex.site`; `.convex.cloud` membalas
 * 404. Ini koreksi yang sama dengan yang dilakukan `admin-gate-client.ts` di
 * sisi browser, diekstrak supaya kedua sisi tidak bisa melenceng.
 */
export function convexSiteUrl(cloudUrl: string): string {
  return cloudUrl.replace(/\.convex\.cloud(?=\/|$)/, ".convex.site");
}