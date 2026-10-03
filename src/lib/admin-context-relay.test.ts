import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { newAttemptCode } from "./admin-passcode";
import {
  RELAY_PATH,
  RELAY_ROUTE,
  RELAY_SECRET_ENV,
  convexSiteUrl,
  normalizeRelayPayload,
  readRelayGeo,
  readRelayIp,
  verifyRelaySecret,
} from "./admin-context-relay";

/**
 * Header yang dibaca relay IP.
 *
 * Kenapa test ini ada: `resolveClientIp()` di `security-context.ts` sudah benar
 * sejak dulu, tapi tidak pernah menerima apa pun. Diperiksa langsung ke produksi
 * `focused-lemur-389`:
 *
 *   curl -X POST .../admin-gate/context -H "X-Forwarded-For: 1.2.3.4"
 *   -> {"ipMasked":null,"ipSource":"Unknown","chainLength":0}
 *
 * `httpAction` Convex membuang header proxy, jadi jalur lama tidak akan pernah
 * punya IP - dengan atau tanpa konfigurasi. Yang membuat IP bisa didapat
 * sekarang adalah edge Vercel, dan Hanya reading header yang benar yang
 * menjaga nilainya tetap jujur.
 */

const headers = (peta: Record<string, string>) => ({
  get: (name: string) => peta[name] ?? null,
});

test("IP diambil dari catatan edge Vercel, bukan dari rantai proxy", () => {
  const dariVercel = readRelayIp(headers({ "x-vercel-forwarded-for": "203.0.113.9" }));
  expect(dariVercel).toEqual({ ip: "203.0.113.9", family: "IPv4", source: "Vercel Edge" });

  const dariXRealIp = readRelayIp(headers({ "x-real-ip": "198.51.100.4" }));
  expect(dariXRealIp?.source).toBe("Vercel Edge");
  expect(dariXRealIp?.ip).toBe("198.51.100.4");
});

test("sisi paling kiri rantai tidak dipakai karena bisa dipalsukan", () => {
  // Pengunjung boleh menyisipkan `X-Forwarded-For` sendiri sebelum request
  // sampai. Edge menambahkan alamat sebenarnya di sebelah kanan, jadi entri
  // paling kanan adalah satu-satunya yang tidak dikendalikan penyerang.
  const dipalsukan = readRelayIp(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }));
  expect(dipalsukan).toEqual({
    ip: "203.0.113.9",
    family: "IPv4",
    source: "X-Forwarded-For",
  });
});

test("header edge menang atas rantai, dan tidak ada header berarti null", () => {
  const dua = readRelayIp(
    headers({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }),
  );
  expect(dua?.ip).toBe("203.0.113.9");
  expect(dua?.source).toBe("Vercel Edge");
  expect(readRelayIp(headers({}))).toBeNull();
  expect(readRelayIp(headers({ "x-forwarded-for": "bukan-ip" }))).toBeNull();
});

test("IPv6 dari edge tetap dibaca sebagai IPv6", () => {
  const ipv6 = readRelayIp(headers({ "x-vercel-forwarded-for": "2001:db8::1" }));
  expect(ipv6?.family).toBe("IPv6");
  expect(ipv6?.ip).toBe("2001:db8::1");
});

test("geo dibaca dari header Vercel tanpa memanggil pihak ketiga", () => {
  const geo = readRelayGeo(
    headers({
      "x-vercel-ip-country": "id",
      "x-vercel-ip-country-region": "ID-JB",
      "x-vercel-ip-city": "Sumenep",
      "x-vercel-ip-latitude": "-6.9277",
      "x-vercel-ip-longitude": "113.8600",
    }),
  );
  expect(geo.country).toBe("ID");
  // Kode negara sudah ada di field sendiri, jadi awalan `ID-` dibuang.
  expect(geo.region).toBe("JB");
  expect(geo.city).toBe("Sumenep");
  expect(geo.latitude).toBeCloseTo(-6.9277);
  expect(geo.longitude).toBeCloseTo(113.86);
});

test("tanpa header geo, hasilnya null semua dan bukan nol palsu", () => {
  const geo = readRelayGeo(headers({}));
  expect(geo.country).toBeNull();
  expect(geo.city).toBeNull();
  // `0` adalah koordinat yang sah secara geografis tetapi berarti "tidak
  // diketahui" di header Vercel. Membacanya sebagai lokasi akan menandai
  // percobaan dari Samudra Atlantik sebagai terlihat.
  const nol = readRelayGeo(headers({ "x-vercel-ip-latitude": "0", "x-vercel-ip-longitude": "0" }));
  expect(nol.latitude).toBeNull();
  expect(nol.longitude).toBeNull();
});

test("badan relay dibersihkan dan nilai tak valid dibuang", () => {
  expect(normalizeRelayPayload(null)).toEqual({});
  expect(normalizeRelayPayload("bukan objek")).toEqual({});

  const bersih = normalizeRelayPayload({
    ip: "  203.0.113.9  ",
    ipSource: "Vercel Edge",
    country: "id",
    city: "x".repeat(400),
    userAgent: "Chrome",
  });
  expect(bersih.ip).toBe("203.0.113.9");
  expect(bersih.country).toBe("ID");
  expect(bersih.city?.length).toBe(80);

  // IP yang tidak bisa dinormalkan TIDAK boleh ikut tersimpan: lebih baik baris
  // tanpa IP daripada baris dengan IP palsu yang dipakai sebagai kunci rate limit.
  const rusak = normalizeRelayPayload({ ip: "999.999.999.999", ipSource: "dipalsukan" });
  expect(rusak.ip).toBeUndefined();
  expect(rusak.ipSource).toBeUndefined();
});

test("secret relay diverifikasi waktu-tetap dan menolak yang kosong", () => {
  expect(verifyRelaySecret("rahasia-sama", "rahasia-sama")).toBe(true);
  expect(verifyRelaySecret("rahasia-salah", "rahasia-sama")).toBe(false);
  // Panjang berbeda tidak boleh bocor lewat perbandingan waktu.
  expect(verifyRelaySecret("pendek", "rahasia-sama")).toBe(false);
  // Secret kosong berarti relay MATI, bukan terbuka tanpa password.
  expect(verifyRelaySecret("", "rahasia-sama")).toBe(false);
  expect(verifyRelaySecret("rahasia-sama", "")).toBe(false);
  expect(verifyRelaySecret(null, "rahasia-sama")).toBe(false);
});

test("router Convex hanya dilayani di origin .convex.site", () => {
  expect(convexSiteUrl("https://deployment.convex.cloud")).toBe("https://deployment.convex.site");
  expect(convexSiteUrl("https://deployment.convex.site")).toBe("https://deployment.convex.site");
  // Tidak boleh mengubah subdomain yang kebetulan mengandung tulisan itu.
  expect(convexSiteUrl("https://convex.cloud.example.test")).toBe("https://convex.cloud.example.test");
});

test("nama environment dan path relay dikunci di satu tempat", () => {
  // Fungsi Vercel, route Convex, dan beacon browser semuanya mengimpor dari
  // sini. Kalau satu nama berubah sendiri, relay akan gagal diam-diam dengan
  // jawaban netral - gejalanya persis "IP tidak terdeteksi" yang sedang dicari.
  expect(RELAY_SECRET_ENV).toBe("ADMIN_CONTEXT_RELAY_SECRET");
  expect(RELAY_PATH).toBe("/api/admin-context");
  expect(RELAY_ROUTE).toBe("/admin-gate/context-relay");
});

/*
 * Kode percobaan.
 *
 * Security Desk tadinya hanya bisa menunjuk sebuah baris lewat waktu dan sidik
 * jari perangkat. Waktu bisa berdekatan, dan sidik jari bisa kosong tepat
 * ketika beacon gagal - yaitu pada percobaan yang paling perlu ditelusuri.
 */

test("kode percobaan punya bentuk tetap dan selalu ada", () => {
  const kode = newAttemptCode(Date.UTC(2026, 9, 3, 12, 0, 0));
  expect(kode).toMatch(/^ADM-\d{8}-[23456789ABCDEFGHJKMNPQRSTWXYZ]{6}$/);
  expect(kode.startsWith("ADM-20261003-")).toBe(true);
});

test("kode percobaan tidak memakai huruf yang mudah tertukar", () => {
  // 0/O, 1/I/L, dan U/V dikeluarkan supaya kode yang dibacakan lewat telepon
  // tidak berubah artinya.
  // Bagian tanggal memang memakai angka, jadi yang diperiksa hanya sufiks acak.
  for (let i = 0; i < 200; i += 1) {
    const sufiks = newAttemptCode().split("-")[2] ?? "";
    expect(sufiks).not.toMatch(/[01OILUV]/);
  }
});

test("kode percobaan berbeda tiap panggilan", () => {
  const banyak = new Set(Array.from({ length: 500 }, () => newAttemptCode()));
  // Enam karakter base32 dari alfabet 31 memberi sekitar 30 bit. 500 sampel
  // secara praktis harus selalu unik; kalau tidak, tabrakannya nyata.
  expect(banyak.size).toBe(500);
});
test("secret kosong di kedua sisi tetap ditolak", () => {
  // Dua sisi yang sama-sama kosong menghasilkan `diff === 0` dan akan lolos
  // kalau penjaga panjangnya dilewati. Justru kasus inilah yang berbahaya:
  // relay yang jalan tanpa secret berubah jadi endpoint yang bisa diisi IP
  // palsu oleh siapa pun.
  expect(verifyRelaySecret("", "")).toBe(false);
  expect(verifyRelaySecret("   ", "   ")).toBe(false);
});

test("route relay di backend menolak tanpa secret yang cocok", () => {
  // Dijaga di level sumber, bukan lewat pemanggilan: `httpAction` tidak bisa
  // diuji tanpa database, dan pemeriksaan yang hilang di sini berarti Security
  // Desk kembali ke `IP tidak terdeteksi` tanpa satu pun error.
  const http = readFileSync("src/convex/http.ts", "utf8");
  const awal = http.indexOf("const adminContextRelay");
  const akhir = http.indexOf("http.route({ path: RELAY_ROUTE");
  expect(awal).toBeGreaterThan(-1);
  expect(akhir).toBeGreaterThan(awal);
  const route = http.slice(awal, akhir);
  expect(route).toContain("verifyRelaySecret(provided, secret)");
  expect(route).toContain("if (!secret?.trim()) return netral();");
  // IP mentah tidak boleh ikut ke tabel: yang disimpan hanya hash dan masker.
  expect(route).toContain("relayDisplayIp(payload.ip)");
  expect(route).toContain("sha256Hex(payload.ip)");
});

test("fungsi Vercel tidak pernah meminta secret dari browser", () => {
  // Relay dipanggil peramban, jadi satu-satunya gerbangnya adalah CORS.
  // Fungsi yang menolak permintaan tanpa `Authorization` akan mematikan beacon
  // sepenuhnya, dan gejalanya sama persis dengan allowlist CORS lupa diisi.
  const relay = readFileSync("api/admin-context.ts", "utf8");
  expect(relay).not.toMatch(/request\.headers\.get\("authorization"\)/);
  expect(relay).toContain("process.env[RELAY_SECRET_ENV]");
  // Secret hanya boleh dipakai untuk menandatangani permintaan ke backend,
  // bukan untuk menolak pemanggil.
  expect(relay).toContain("signRelayRequest({ secret, body })");
  expect(relay).not.toMatch(/authorization:\s*`Bearer/);
});