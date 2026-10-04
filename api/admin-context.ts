// Relay IP untuk audit ruang pengelola - fungsi server Vercel.
//
// Berkas ini adalah satu-satunya bagian dari stack yang benar-benar melihat
// alamat IP pengunjung. Permintaan ke `*.convex.site` melewati Vercel tanpa
// satu pun header IP, jadi alamat yang Security Desk ambil dari sana selalu
// kosong.
//
// Tugas fungsi ini sempit dan tidak menyentuh keputusan keamanan apa pun: baca
// header yang dipegang Vercel, teruskan ke backend Convex yang ber-secret, lalu
// kirim balik apa yang backend balas. Kode passcode tidak pernah melewati sini,
// dan backend tidak pernah mengirim apa pun ke fungsi ini selain token konteks
// yang sudah disamarkan.
//
// CATATAN KEAMANAN. Fungsi ini dipanggil BROWSER, jadi ia tidak boleh meminta
// secret: peramban tidak bisa memegang rahasia, dan rahasia yang dibaca
// peramban bukan rahasia. Yang dijaga dari sisi masuk hanyalah CORS allowlist,
// supaya situs lain tidak bisa membaca jawaban fungsi ini dari peramban
// pengunjung. Secret hanya berpindah di dalam fungsi ini, dari Vercel ke
// backend Convex.
//
// CATATAN RUNTIME: kode ini berjalan di runtime server Vercel, bukan di browser.
// Jangan mengimpor apa pun yang menarik React atau Convex client, dan jangan
// membaca process.env di modul yang bisa ikut masuk ke bundel browser. Modul
// bersama di src/lib/admin-context-relay.ts dan src/lib/admin-relay-signature.ts
// aman karena isinya murni fungsi tanpa efek samping.
//
// CATATAN EKSTENSI IMPOR. Setiap impor relatif di sini WAJIB memakai ekstensi
// `.js` eksplisit, walau berkas sumbernya `.ts`. Vercel mengompilasi fungsi ini
// per-berkas menjadi ESM dan TIDAK menggabungkannya, lalu menjalankannya di Node
// yang mensyaratkan ekstensi pada resolusi ESM. Tanpanya, setiap permintaan
// gagal sebelum handler berjalan:
//
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find module
//   '/var/task/src/lib/admin-context-cors' imported from
//   '/var/task/api/admin-context.js'
//
// Gejalanya 500 pada SEMUA metode, bukan 405 pada GET - karena modulnya gagal
// dimuat sebelum pemeriksaan metode. Penjaganya ada di
// `src/lib/deploy-config.test.ts`.
//

import { contextCorsHeaders } from "../src/lib/admin-context-cors.js";
import {
  RELAY_ROUTE,
  RELAY_SECRET_ENV,
  convexSiteUrl,
  readRelayGeo,
  readRelayIp,
} from "../src/lib/admin-context-relay.js";
import {
  RELAY_SIGNATURE_HEADER_NONCE,
  RELAY_SIGNATURE_HEADER_SIGNATURE,
  RELAY_SIGNATURE_HEADER_TIMESTAMP,
  newRelayTraceId,
  signRelayRequest,
} from "../src/lib/admin-relay-signature.js";

/**
 * Metode yang dipakai relay. Disatukan di sini supaya penandatangan dan
 * pengiriman tidak bisa berbeda diam-diam.
 */
export const RELAY_METHOD = "POST";

/** Batas keras. Timeout yang lebih panjang tidak pernah membantu. */
const BACKEND_TIMEOUT_MS = 3_000;

/**
 * Bentuk jawaban netral, sama untuk semua kegagalan.
 *
 * `telemetryStatus: "failed"` di sini disengaja. Relay yang tidak hidup berarti
 * tidak ada bukti jaringan sama sekali, dan Security Desk harus bisa membedakan
 * itu dari baris yang benar-benar terkirim tanpa lokasi. Mengembalikan bentuk
 * kosong tanpa statusnya akan membuat keduanya terlihat sama persis.
 */
const KOSONG = {
  contextId: null,
  requestId: null,
  relayTraceId: null,
  ipMasked: null,
  ipSource: "Unknown",
  ipFamily: "unknown",
  ipTrust: "unknown",
  proxyDetected: false,
  chainLength: 0,
  geoResolved: false,
  timezone: null,
  relay: "unavailable",
  telemetryStatus: "failed",
};

const json = (body: unknown, headers: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Asal backend. Cloud URL cukup, asalannya dikoreksi ke `.convex.site`. */
function backendOrigin(): string | null {
  const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
  if (site) return site;
  const cloud = process.env.VITE_CONVEX_URL?.trim();
  if (!cloud) return null;
  try {
    return convexSiteUrl(new URL(cloud).origin);
  } catch {
    return null;
  }
}

/**
 * Kontrak ekspor: SATU NAMA PER METODE, bukan `export default`.
 *
 * Runtime Node Vercel memperlakukan `export default function` sebagai handler
 * gaya lama `(request, response)` dan menyodorkan `IncomingMessage`. Akibatnya
 * `request.headers.get(...)` bukan fungsi, dan SEMUA permintaan dijawab 500:
 *
 *   TypeError: request.headers.get is not a function
 *   at handler (/vercel/path0/api/admin-context.ts:111:51)
 *
 * Ekspor bernama (`POST`, `GET`, `OPTIONS`) memakai "Web Handler" Vercel yang
 * menerima `Request` standar dan mengembalikan `Response` - sama seperti yang
 * diuji unit. Penjaganya ada di `src/lib/deploy-config.test.ts`.
 */
export async function POST(request: Request): Promise<Response> {
  const cors = contextCorsHeaders(request.headers.get("origin"), process.env);

  // Secret kosong berarti relay belum dikonfigurasi di environment Vercel.
  // Route ditutup, bukan dibuka tanpa password.
  const secret = process.env[RELAY_SECRET_ENV];
  if (!secret?.trim()) return json(KOSONG, cors);

  const origin = backendOrigin();
  if (!origin) return json(KOSONG, cors);

  const ip = readRelayIp(request.headers);
  const geo = readRelayGeo(request.headers);
  const relayTraceId = newRelayTraceId();

  // Badan ditulis sekali, lalu ditandatangani atas byte yang sama persis. Kalau
  // badan dirakit ulang sesudah ditandatangani, tandatangannya tidak akan cocok
  // dan backend menolak - itu memang tujuannya, bukan cacat.
  const body = JSON.stringify({
    ip: ip?.ip,
    ipSource: ip?.source,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    timezone: geo.timezone,
    latitude: geo.latitude,
    longitude: geo.longitude,
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
    acceptLanguage: request.headers.get("accept-language"),
    relayTraceId,
  });

  try {
    // `method` dan `path` yang ditandatangani harus sama dengan yang benar-benar
    // dikirim. Kalau berbeda, backend menolak, dan itu memang tujuannya:
    // tanda tangan hanya berlaku untuk endpoint ini, tidak bisa dipindah ke
    // route lain yang kebetulan memakai secret yang sama.
    const signature = await signRelayRequest({
      secret,
      body,
      method: RELAY_METHOD,
      path: RELAY_ROUTE,
    });
    const response = await fetch(`${origin}${RELAY_ROUTE}`, {
      method: RELAY_METHOD,
      headers: {
        "content-type": "application/json",
        [RELAY_SIGNATURE_HEADER_TIMESTAMP]: signature.timestamp,
        [RELAY_SIGNATURE_HEADER_NONCE]: signature.nonce,
        [RELAY_SIGNATURE_HEADER_SIGNATURE]: signature.signature,
      },
      body,
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    // Jejak relay dikembalikan walau backend menolak. Tanpa itu, kegagalan
    // sama sekali tidak punya pengenal yang bisa dicari di log.
    if (!response.ok) return json({ ...KOSONG, relayTraceId }, cors);
    // `relay` menandai bahwa data ini datang lewat edge, bukan terusan langsung
    // ke Convex. Security Desk memakainya untuk membedakan sumbernya.
    return json({ ...(await response.json()), relay: "vercel-edge" }, cors);
  } catch {
    // Backend tidak hidup, timeout, atau berubah bentuk jawabannya. Penamaan
    // tidak boleh berbeda antara "tanda tangan salah" dan "backend mati" - kalau
    // begitu, endpoint ini berubah jadi probe.
    return json({ ...KOSONG, relayTraceId }, cors);
  }
}

/** Metode selain POST dijawab 405 dengan bentuk dan header yang sama seperti dulu. */
export async function GET(request: Request): Promise<Response> {
  return json(
    { error: "method_not_allowed" },
    contextCorsHeaders(request.headers.get("origin"), process.env),
    405,
  );
}

/**
 * Preflight CORS dijawab eksplisit supaya pemanggilan lintas origin dari
 * allowlist benar-benar mungkin; sebelumnya OPTIONS ikut 405, dan preflight
 * non-2xx selalu ditolak peramban. Mode "closed" tetap tidak mengirim header
 * izin apa pun, jadi endpoint ini tidak pernah terbuka untuk origin asing.
 */
export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: contextCorsHeaders(request.headers.get("origin"), process.env),
  });
}
