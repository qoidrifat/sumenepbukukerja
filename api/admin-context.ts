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
// bersama di `src/lib/admin-context-relay.ts` aman karena isinya murni fungsi
// header tanpa efek samping.
//

import { contextCorsHeaders } from "../src/lib/admin-context-cors";
import {
  RELAY_ROUTE,
  RELAY_SECRET_ENV,
  convexSiteUrl,
  readRelayGeo,
  readRelayIp,
} from "../src/lib/admin-context-relay";

/** Batas keras. Timeout yang lebih panjang tidak pernah membantu. */
const BACKEND_TIMEOUT_MS = 3_000;

/** Bentuk jawaban netral, sama untuk semua kegagalan. */
const KOSONG = {
  contextId: null,
  requestId: null,
  ipMasked: null,
  ipSource: "Unknown",
  ipFamily: "unknown",
  ipTrust: "unknown",
  proxyDetected: false,
  chainLength: 0,
  geoResolved: false,
  relay: "unavailable",
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

export default async function handler(request: Request): Promise<Response> {
  const cors = contextCorsHeaders(request.headers.get("origin"), process.env);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, cors, 405);

  // Secret kosong berarti relay belum dikonfigurasi di environment Vercel.
  // Route ditutup, bukan dibuka tanpa password.
  const secret = process.env[RELAY_SECRET_ENV];
  if (!secret?.trim()) return json(KOSONG, cors);

  const origin = backendOrigin();
  if (!origin) return json(KOSONG, cors);

  const ip = readRelayIp(request.headers);
  const geo = readRelayGeo(request.headers);

  try {
    const response = await fetch(`${origin}${RELAY_ROUTE}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        ip: ip?.ip,
        ipSource: ip?.source,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        latitude: geo.latitude,
        longitude: geo.longitude,
        userAgent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer"),
        acceptLanguage: request.headers.get("accept-language"),
      }),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    if (!response.ok) return json(KOSONG, cors);
    // `relay` menandai bahwa data ini datang lewat edge, bukan terusan langsung
    // ke Convex. Security Desk memakainya untuk membedakan sumbernya.
    return json({ ...(await response.json()), relay: "vercel-edge" }, cors);
  } catch {
    // Backend tidak hidup, timeout, atau berubah bentuk jawabannya. Penamaan
    // tidak boleh berbeda antara "secret salah" dan "backend mati" - kalau
    // begitu, endpoint ini berubah jadi probe.
    return json(KOSONG, cors);
  }
}