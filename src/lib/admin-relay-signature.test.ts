import { describe, expect, test } from "vitest";
import {
  RELAY_NONCE_BYTES,
  RELAY_SIGNATURE_HEADER_NONCE,
  RELAY_SIGNATURE_HEADER_SIGNATURE,
  RELAY_SIGNATURE_HEADER_TIMESTAMP,
  RELAY_TIMESTAMP_WINDOW_MS,
  constantTimeEqual,
  keyedHash,
  relayBodyDigest,
  relaySigningString,
  signRelayRequest,
  verifyRelayRequest,
} from "./admin-relay-signature";
import { readRelayGeo, readRelayIp } from "./admin-context-relay";
import { RELAY_SECRET_ENV } from "./admin-context-relay";

const SECRET = "rahasia-relay-yang-panjang-sekali";
const BODY = JSON.stringify({
  ip: "203.0.113.45",
  country: "ID",
  relayTraceId: "rly_0123456789abcdef",
});

/** Path dan metode yang dipakai seluruh uji, sama dengan yang di produksi. */
const METHOD = "POST";
const PATH = "/admin-gate/context-relay";

/** Permintaan bertanda tangan, dengan penyesuaian per kasus. */
async function tandatangani(
  ubah: { body?: string; secret?: string; now?: number; method?: string; path?: string } = {},
) {
  const body = ubah.body ?? BODY;
  const secret = ubah.secret ?? SECRET;
  const now = ubah.now ?? 1_700_000_000_000;
  const method = ubah.method ?? METHOD;
  const path = ubah.path ?? PATH;
  const signed = await signRelayRequest({ secret, body, method, path, timestamp: now });
  return {
    body,
    secret,
    now,
    method,
    path,
    signed,
    // `null` ikut diterima karena memang ada kasus secret yang null.
    verify: (
      secretOverride?: string | null,
      bodyOverride?: string,
      nowOverride?: number,
      methodOverride?: string,
      pathOverride?: string,
    ) =>
      verifyRelayRequest({
        // `undefined` berarti "pakai bawaan". `??` tidak bisa dipakai di
        // sini karena `null` justru nilai yang sedang diuji.
        secret: secretOverride === undefined ? secret : secretOverride,
        body: bodyOverride === undefined ? body : bodyOverride,
        method: methodOverride === undefined ? method : methodOverride,
        path: pathOverride === undefined ? path : pathOverride,
        timestamp: signed.timestamp,
        nonce: signed.nonce,
        signature: signed.signature,
        nowMs: nowOverride === undefined ? now : nowOverride,
      }),
  };
}

describe("tanda tangan relay", () => {
  test("permintaan bertanda tangan yang sah diterima", async () => {
    const { verify } = await tandatangani();
    const hasil = await verify();
    expect(hasil.ok).toBe(true);
  });

  test("tanpa secret relay tetap MATI, bukan terbuka tanpa password", async () => {
    const { verify } = await tandatangani();
    // `undefined` tidak ikut di sini: di helper, `undefined` berarti "pakai
  // secret bawaan. Secret yang benar-benar kosong sudah
  // teruji oleh "", "   ", dan null.
  for (const kosong of ["", "   ", null]) {
      const hasil = await verify(kosong);
      expect(hasil.ok).toBe(false);
      if (!hasil.ok) expect(hasil.reason).toBe("missing_secret");
    }
  });

  test("header yang hilang ditolak", async () => {
    const signed = await signRelayRequest({ secret: SECRET, body: BODY, method: METHOD, path: PATH });
    const penuh = {
      method: METHOD,
      path: PATH,
      secret: SECRET,
      body: BODY,
      timestamp: signed.timestamp,
      nonce: signed.nonce,
      signature: signed.signature,
    };
    for (const hilang of ["timestamp", "nonce", "signature"] as const) {
      const hasil = await verifyRelayRequest({ ...penuh, [hilang]: null });
      expect(hasil.ok).toBe(false);
      if (!hasil.ok) expect(hasil.reason).toBe("missing_headers");
    }
  });

  test("tanda tangan salah ditolak", async () => {
    // Jam dijepit supaya pemeriksaan tanda tangan yang diuji, bukan sekadar
    // penolakan karena cap waktu dianggap basi.
    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret: SECRET,
      body: BODY,
      timestamp: "1700000000000",
      nonce: "0123456789abcdef0123456789abcdef",
      signature: "f".repeat(64),
      nowMs: 1_700_000_000_000,
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.reason).toBe("invalid_signature");
  });

  test("secret yang berbeda ditolak walau bentuk tanda tangan benar", async () => {
    const { signed, body, now } = await tandatangani();
    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret: "secret-yang-berbeda-tapi-sama-panjangnya",
      body,
      timestamp: signed.timestamp,
      nonce: signed.nonce,
      signature: signed.signature,
      nowMs: now,
    });
    expect(hasil.ok).toBe(false);
  });

  test("badan yang diubah satu byte saja ditolak", async () => {
    const { verify } = await tandatangani();
    const diubah = BODY.replace("203.0.113.45", "203.0.113.46");
    expect(diubah).not.toBe(BODY);
    const hasil = await verify(undefined, diubah);
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.reason).toBe("invalid_signature");
  });

  test("cap waktu yang sudah basi ditolak", async () => {
    const { signed, body, secret } = await tandatangani();
    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret,
      body,
      timestamp: signed.timestamp,
      nonce: signed.nonce,
      signature: signed.signature,
      nowMs: Number(signed.timestamp) + RELAY_TIMESTAMP_WINDOW_MS + 1_000,
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.reason).toBe("expired_timestamp");
  });

  test("cap waktu yang terlalu ke depan juga ditolak", async () => {
    const { signed, body, secret } = await tandatangani();
    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret,
      body,
      timestamp: signed.timestamp,
      nonce: signed.nonce,
      signature: signed.signature,
      nowMs: Number(signed.timestamp) - RELAY_TIMESTAMP_WINDOW_MS - 1_000,
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.reason).toBe("expired_timestamp");
  });

  test("cap waktu tepat di tepi jendela masih diterima", async () => {
    const { signed, body, secret } = await tandatangani();
    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret,
      body,
      timestamp: signed.timestamp,
      nonce: signed.nonce,
      signature: signed.signature,
      nowMs: Number(signed.timestamp) + RELAY_TIMESTAMP_WINDOW_MS,
    });
    expect(hasil.ok).toBe(true);
  });

  test("cap waktu yang bukan angka ditolak sebelum menyentuh HMAC", async () => {
    for (const buruk of ["abc", "17e10", "", " 1700000000000 x", "1.5"]) {
      const hasil = await verifyRelayRequest({
        method: METHOD,
        path: PATH,
        secret: SECRET,
        body: BODY,
        timestamp: buruk,
        nonce: "0123456789abcdef0123456789abcdef",
        signature: "a".repeat(64),
      });
      expect(hasil.ok).toBe(false);
      if (!hasil.ok) {
        expect(["invalid_timestamp", "missing_headers"]).toContain(hasil.reason);
      }
    }
  });

  test("nonce dengan bentuk salah ditolak", async () => {
    // Nonce 1 MB akan membuat HMAC ikut sebesar itu, jadi bentuknya wajib dicek.
    for (const buruk of ["pendek", "z".repeat(32), "0".repeat(31), "0".repeat(33)]) {
      const hasil = await verifyRelayRequest({
        method: METHOD,
        path: PATH,
        secret: SECRET,
        body: BODY,
        timestamp: "1700000000000",
        nonce: buruk,
        signature: "a".repeat(64),
        nowMs: 1_700_000_000_000,
      });
      expect(hasil.ok).toBe(false);
      if (!hasil.ok) expect(hasil.reason).toBe("missing_headers");
    }
  });

  test("nonce yang ditandatangani tidak bisa ditukar dengan timestamp lain", async () => {
    // Yang dihitung adalah timestamp + pemisah + nonce + pemisah + digest.
    // Kalau pemisahnya hilang, pasangan ini bertabrakan dan request bisa
    // diputar ulang dengan cap waktu berbeda.
    const digest = await relayBodyDigest(BODY);
    expect(relaySigningString("123", "45", METHOD, PATH, digest)).not.toBe(
      relaySigningString("12", "345", METHOD, PATH, digest),
    );
  });

  test("nonce acak punya panjang yang ditentukan", async () => {
    const a = await signRelayRequest({ secret: SECRET, body: BODY, method: METHOD, path: PATH });
    const b = await signRelayRequest({ secret: SECRET, body: BODY, method: METHOD, path: PATH });
    expect(a.nonce).toHaveLength(RELAY_NONCE_BYTES * 2);
    expect(a.nonce).not.toBe(b.nonce);
  });

  test("nama header tidak bertabrakan dengan header otorisasi", () => {
    // Kalau salah satu ketuker jadi `authorization`, relay lama bisa menerima
    // secret polos lagi lewat jalur yang sudah ditinggalkan.
    const semua = [
      RELAY_SIGNATURE_HEADER_TIMESTAMP,
      RELAY_SIGNATURE_HEADER_NONCE,
      RELAY_SIGNATURE_HEADER_SIGNATURE,
    ];
    expect(new Set(semua).size).toBe(3);
    expect(semua.some((nama) => nama === "authorization")).toBe(false);
  });

  test("digest badan stabil dan berubah saat isinya berubah", async () => {
    expect(await relayBodyDigest(BODY)).toBe(await relayBodyDigest(BODY));
    expect(await relayBodyDigest(BODY)).not.toBe(await relayBodyDigest(`${BODY} `));
  });
});

describe("perbandingan waktu-tetap", () => {
  test("string sama dianggap sama, berbeda dianggap berbeda", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("ABC123", "abc123")).toBe(true);
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  test("panjang berbeda ditolak", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("hash IP berkey", () => {
  test("hash yang sama untuk input dan kunci yang sama", async () => {
    expect(await keyedHash("203.0.113.45", SECRET)).toBe(await keyedHash("203.0.113.45", SECRET));
  });

  test("kunci berbeda memberi hash berbeda untuk IP yang sama", async () => {
    // Inilah alasan hash polos tidak cukup: dengan kunci berbeda, hash yang
    // sama untuk IP yang sama tidak bisa dibuat/dicocokkan di luar sistem ini.
    const a = await keyedHash("203.0.113.45", SECRET);
    const b = await keyedHash("203.0.113.45", `${SECRET}-lain`);
    expect(a).not.toBe(b);
  });

  test("IP berbeda memberi hash berbeda dengan kunci yang sama", async () => {
    expect(await keyedHash("203.0.113.45", SECRET)).not.toBe(
      await keyedHash("203.0.113.46", SECRET),
    );
  });

  test("hash tidak pernah memuat IP asalnya di dalamnya", async () => {
    const hash = await keyedHash("203.0.113.45", SECRET);
    expect(hash).not.toContain("203.0.113.45");
    expect(hash).toHaveLength(64);
  });
});

/*
 * Bentuk produksi: header yang benar-benar menempel pada permintaan Vercel,
 * dibaca, ditandatangani, lalu diverifikasi ulang. Alamat di sini dari
 * rentang TEST-NET-3 RFC 5737, bukan alamat orang sungguhan.
 */
describe("bentuk produksi, dari header Vercel sampai verifikasi", () => {
  const HEADER = new Map<string, string>([
    ["x-vercel-forwarded-for", "203.0.113.45"],
    ["x-real-ip", "203.0.113.45"],
    ["x-forwarded-for", "198.51.100.7, 203.0.113.45"],
    ["x-vercel-ip-country", "ID"],
    ["x-vercel-ip-country-region", "ID-JT"],
    ["x-vercel-ip-city", "Bangkalan"],
    ["x-vercel-ip-timezone", "Asia/Jakarta"],
    ["user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"],
  ]);
  const headers = { get: (name: string) => HEADER.get(name) ?? null };

  test("IP dan geo terbaca dari header edge", () => {
    const ip = readRelayIp(headers);
    expect(ip?.ip).toBe("203.0.113.45");
    expect(ip?.source).toBe("Vercel Edge");

    const geo = readRelayGeo(headers);
    expect(geo.country).toBe("ID");
    // Vercel menulis "ID-JT"; kode negara punya kolomnya sendiri.
    expect(geo.region).toBe("JT");
    expect(geo.city).toBe("Bangkalan");
    expect(geo.timezone).toBe("Asia/Jakarta");
  });

  test("permintaan yang dibangun dari header itu dan ditandatangani, diterima backend", async () => {
    const ip = readRelayIp(headers);
    const geo = readRelayGeo(headers);
    const body = JSON.stringify({
      ip: ip?.ip,
      ipSource: ip?.source,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      timezone: geo.timezone,
      userAgent: HEADER.get("user-agent"),
      relayTraceId: "rly_0011223344556677",
    });

    const now = Date.now();
    const signed = await signRelayRequest({ secret: SECRET, body, method: METHOD, path: PATH, timestamp: now });

    // Cermin ulang pakai header yang benar-benar dikirim fungsi Vercel.
    const terkirim = new Map(HEADER);
    terkirim.set(RELAY_SIGNATURE_HEADER_TIMESTAMP, signed.timestamp);
    terkirim.set(RELAY_SIGNATURE_HEADER_NONCE, signed.nonce);
    terkirim.set(RELAY_SIGNATURE_HEADER_SIGNATURE, signed.signature);

    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret: SECRET,
      body,
      timestamp: terkirim.get(RELAY_SIGNATURE_HEADER_TIMESTAMP),
      nonce: terkirim.get(RELAY_SIGNATURE_HEADER_NONCE),
      signature: terkirim.get(RELAY_SIGNATURE_HEADER_SIGNATURE),
      nowMs: now,
    });

    expect(hasil.ok).toBe(true);
    if (hasil.ok) expect(hasil.nonce).toBe(signed.nonce);
  });

  test("badan yang disisipkan di tengah jalan ditolak", async () => {
    const ip = readRelayIp(headers);
    const bodyAsli = JSON.stringify({ ip: ip?.ip, relayTraceId: "rly_0011223344556677" });
    const now = Date.now();
    const signed = await signRelayRequest({ secret: SECRET, body: bodyAsli, method: METHOD, path: PATH, timestamp: now });

    // Penyerang menandatangani badan asli, lalu mengirim badan lain.
    const bodyPalsu = bodyAsli.replace("203.0.113.45", "198.51.100.200");
    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret: SECRET,
      body: bodyPalsu,
      timestamp: signed.timestamp,
      nonce: signed.nonce,
      signature: signed.signature,
      nowMs: now,
    });
    expect(hasil.ok).toBe(false);
  });

  test("IP yang tidak ada di header edge tidak dikarang jadi ada", () => {
    const kosong = { get: () => null };
    expect(readRelayIp(kosong)).toBeNull();
    const geo = readRelayGeo(kosong);
    expect(geo.country).toBeNull();
    expect(geo.city).toBeNull();
    expect(geo.timezone).toBeNull();
  });

  test("zona waktu dari header berbentuk bebas ditolak", () => {
    for (const buruk of ["</script>", "Asia/Jakarta'", "Asia Jakarta", "javascript:alert(1)"]) {
      const geo = readRelayGeo({ get: (n: string) => (n === "x-vercel-ip-timezone" ? buruk : null) });
      expect(geo.timezone).toBeNull();
    }
  });

  test("nama environment untuk secret relay tetap terkunci di satu tempat", () => {
    expect(RELAY_SECRET_ENV).toBe("ADMIN_CONTEXT_RELAY_SECRET");
  });
});

describe("pemisahan domain tanda tangan", () => {
  test("tanda tangan sah ditolak begitu path-nya diganti", async () => {
    // Kalau tanda tangan tidak mengikat path, satu tanda tangan yang sah untuk
    // route ini juga sah untuk route lain yang kebetulan memakai secret sama.
    // Itu sebabnya satu secret yang bocor membuka banyak pintu sekaligus.
    const { verify } = await tandatangani();
    const hasil = await verify(undefined, undefined, undefined, undefined, "/admin-gate/lain");
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.reason).toBe("invalid_signature");
  });

  test("tanda tangan sah ditolak begitu metodenya diganti", async () => {
    const { verify } = await tandatangani();
    const hasil = await verify(undefined, undefined, undefined, "GET");
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.reason).toBe("invalid_signature");
  });

  test("huruf besar-kecil metode tidak membuka celah baru", async () => {
    // `post` dan `POST` menunjuk permintaan yang sama. Kalau keduanya jadi
    // string tanda tangan yang berbeda, hanya satu yang bisa lolos, dan
    // penandatangan harus menebak-nebak bentuk yang mana yang benar.
    const digest = await relayBodyDigest(BODY);
    expect(relaySigningString("1", "2", "post", PATH, digest)).toBe(
      relaySigningString("1", "2", "POST", PATH, digest),
    );

    // Pengirim menulis huruf kecil, penerima melihat huruf besar dari
    // `request.method`. Tetap harus cocok.
    const { signed, now } = await tandatangani({ method: "post" });
    const hasil = await verifyRelayRequest({
      method: "POST",
      path: PATH,
      secret: SECRET,
      body: BODY,
      timestamp: signed.timestamp,
      nonce: signed.nonce,
      signature: signed.signature,
      nowMs: now,
    });
    expect(hasil.ok).toBe(true);
  });

  test("tanda tangan skema lama ditolak, bukan diterima diam-diam", async () => {
    // Skema sebelumnya hanya mengikat timestamp, nonce, dan digest badan.
    // Kalau skema lama masih diterima, seluruh pengikatan endpoint yang baru
    // ini tidak berarti apa-apa.
    const sekarang = await tandatangani();
    const digest = await relayBodyDigest(BODY);
    const kunci = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const lama = Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          kunci,
          new TextEncoder().encode(
            `${sekarang.signed.timestamp}.${sekarang.signed.nonce}.${digest}`,
          ),
        ),
      ),
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const hasil = await verifyRelayRequest({
      method: METHOD,
      path: PATH,
      secret: SECRET,
      body: BODY,
      timestamp: sekarang.signed.timestamp,
      nonce: sekarang.signed.nonce,
      signature: lama,
      nowMs: sekarang.now,
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.reason).toBe("invalid_signature");
  });
});