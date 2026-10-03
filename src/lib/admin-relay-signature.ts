/*
 * Tanda tangan relay admin.
 *
 * Secret bersama yang dikirim polos sebagai header Authorization sudah
 * bekerja, tapi hanya membuktikan "pemilik secret sedang bicara". Yang tidak
 * dibuktikan adalah dua hal:
 *
 *  - Apakah isi yang dikirim masih yang dimaksud. Secret yang bocor satu kali
 *    membuat siapa pun bisa menyuntik IP palsu ke audit ruang pengelola.
 *  - Apakah permintaan itu hasil penangkapan ulang. Secret yang tertangkap di
 *    log proxy bisa dipakai ulang, dan karena tidak ada penanda waktu,
 *    permintaan lama tetap dianggap sah.
 *
 * Yang ditambahkan di sini menjawab keduanya. Setiap permintaan membawa
 * timestamp dan nonce, lalu ditandatangani dengan HMAC-SHA-256 atas
 * timestamp, nonce, dan digest badan. Perubahan satu byte di badan, waktu
 * yang digeser, atau nonce yang dipakai ulang akan gagal diverifikasi.
 *
 * Yang sengaja tidak ada: tidak ada peramban, tidak ada penyimpanan di
 * browser, dan tidak ada penghitungan di luar server. Peramban tidak pernah
 * memegang kunci, jadi tidak ada rahasia yang perlu disembunyikan dari bundel.
 */

// Nama header kustom. Kredensial tidak ada di badan: badan ikut ditandatangani,
// jadi isinya mengikat diri sendiri.
export const RELAY_SIGNATURE_HEADER_TIMESTAMP = "x-admin-relay-timestamp";
export const RELAY_SIGNATURE_HEADER_NONCE = "x-admin-relay-nonce";
export const RELAY_SIGNATURE_HEADER_SIGNATURE = "x-admin-relay-signature";

/** Selisih waktu yang masih diterima antara cap waktu relay dan jam server. */
export const RELAY_TIMESTAMP_WINDOW_MS = 5 * 60_000;

/** Panjang nonce: 16 byte acak = 128 bit. */
export const RELAY_NONCE_BYTES = 16;

/**
 * Pengenal satu perjalanan relay, dari edge Vercel sampai baris audit.
 *
 * Dipakai untuk korelasi log di kedua sisi. Berbeda dari `requestId`:
 * `requestId` dibuat backend saat baris ditulis, sedangkan yang ini dibuat
 * di tepi sebelum perjalanan dimulai, jadi tetap ada walau permintaan gagal
 * di tengah jalan.
 */
export function newRelayTraceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `rly_${hex}`;
}

export type RelaySignatureFailure =
  | "missing_secret"
  | "missing_headers"
  | "invalid_timestamp"
  | "expired_timestamp"
  | "invalid_signature";

export type RelaySignatureResult =
  | { ok: true; timestamp: number; nonce: string }
  | { ok: false; reason: RelaySignatureFailure };

const textEncoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const importSecret = async (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

/** SHA-256 dari badan, dalam heksa. Menyatukan isi ke dalam tanda tangan. */
export async function relayBodyDigest(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(body));
  return toHex(digest);
}

/** Hash berkey. Dipakai untuk IP agar tidak bisa ditebak dari daftar alamat. */
export async function keyedHash(value: string, secret: string): Promise<string> {
  const key = await importSecret(secret);
  return toHex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

/**
 * Versi skema tanda tangan.
 *
 * Bagian dari string yang ditandatangani, bukan hiasan. Tanda tangan yang
 * dibuat dengan skema lama punya awalan berbeda, jadi tidak akan cocok dengan
 * verifikasi yang sekarang. Itu disengaja: lebih baik satu jendela produksi
 * ditutup begitu saja daripada menerima dua skema sekaligus.
 */
export const RELAY_SIGNING_VERSION = "v2";

/**
 * String yang benar-benar ditandatangani.
 *
 * Pemisah titik itu penting. Tanpa pemisah, timestamp 123 dengan nonce 45 dan
 * timestamp 12 dengan nonce 345 menghasilkan string yang sama persis, jadi
 * satu permintaan bisa diubah timestep-nya tanpa membuat tanda tangan gagal.
 *
 * `method` dan `path` ikut diikat sejak awal, bukan ditambahkan belakangan.
 * Tanpa keduanya, satu tanda tangan yang sah untuk `/admin-gate/context-relay`
 * juga sah untuk route lain yang kebetulan memakai secret yang sama, karena
 * isinya sama persis. Mengikatnya ke endpoint membuat secret relay tidak lagi
 * menjadi kunci yang terlalu umum: satu kebocoran tidak lagi membuka semua
 * route yang memakainya.
 *
 * `method` dinormalisasi ke huruf besar supaya `post` dan `POST` tidak bisa
 * jadi dua bentuk yang berbeda untuk permintaan yang sama.
 */
export function relaySigningString(
  timestamp: string,
  nonce: string,
  method: string,
  path: string,
  bodyDigest: string,
) {
  return [
    RELAY_SIGNING_VERSION,
    timestamp,
    nonce,
    method.trim().toUpperCase(),
    path,
    bodyDigest,
  ].join(".");
}

async function signSigningString(secret: string, value: string): Promise<string> {
  const key = await importSecret(secret);
  return toHex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

/**
 * Bandingkan dua string waktu-tetap.
 *
 * Panjang yang berbeda langsung ditolak, tapi perbandingan byte tetap
 * dijalankan atas seluruh masukan. Keluar lebih awal begitu byte pertama beda
 * adalah peta secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  let diff = left.length === right.length ? 0 : 1;
  const panjang = Math.max(left.length, right.length);
  for (let index = 0; index < panjang; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

/**
 * Tanda tangan badan oleh sisi pengirim, yaitu fungsi Vercel.
 *
 * Timestamp dan nonce dikembalikan ikut supaya pemanggil bisa memasangnya
 * sebagai header. Kalau tidak, keduanya hanya ada di dalam HMAC dan penerima
 * tidak punya apa pun untuk dibandingkan.
 */
export async function signRelayRequest(input: {
  secret: string;
  body: string;
  method: string;
  path: string;
  timestamp?: number;
  nonce?: string;
}): Promise<{ timestamp: string; nonce: string; signature: string }> {
  const timestamp = String(input.timestamp ?? Date.now());
  const nonce =
    input.nonce ?? toHex(crypto.getRandomValues(new Uint8Array(RELAY_NONCE_BYTES)));
  const digest = await relayBodyDigest(input.body);
  const signature = await signSigningString(
    input.secret,
    relaySigningString(timestamp, nonce, input.method, input.path, digest),
  );
  return { timestamp, nonce, signature };
}

/**
 * Verifikasi tanda tangan di sisi penerima, yaitu action Convex.
 *
 * Urutan pemeriksaan penting. Cap waktu dan bentuknya diperiksa lebih dulu
 * karena keduanya murah dan tidak bergantung pada rahasia. Baru sesudah itu
 * HMAC dihitung, sehingga permintaan yang kedaluwarsa tidak pernah menyentuh
 * jalur kripto.
 *
 * `nowMs` dikirim sebagai argumen supaya fungsi ini murni dan bisa diuji tanpa
 * memalsukan jam.
 */
export async function verifyRelayRequest(input: {
  secret: string | null | undefined;
  body: string;
  method: string;
  path: string;
  timestamp: string | null | undefined;
  nonce: string | null | undefined;
  signature: string | null | undefined;
  nowMs?: number;
}): Promise<RelaySignatureResult> {
  const secret = (input.secret ?? "").trim();
  if (!secret) return { ok: false, reason: "missing_secret" };

  const timestamp = (input.timestamp ?? "").trim();
  const nonce = (input.nonce ?? "").trim();
  const signature = (input.signature ?? "").trim();
  if (!timestamp || !nonce || !signature) return { ok: false, reason: "missing_headers" };

  if (!/^\d{1,15}$/.test(timestamp)) return { ok: false, reason: "invalid_timestamp" };
  const stamp = Number(timestamp);
  if (!Number.isSafeInteger(stamp)) return { ok: false, reason: "invalid_timestamp" };

  const now = input.nowMs ?? Date.now();
  // Selisih dua arah: jam server boleh sedikit meleset, tapi permintaan yang
  // benar-benar jauh, ke depan maupun ke belakang, tetap ditolak.
  if (Math.abs(now - stamp) > RELAY_TIMESTAMP_WINDOW_MS) {
    return { ok: false, reason: "expired_timestamp" };
  }

  // Nonce harus berbentuk heksa dengan panjang yang sudah ditentukan. Tanpa
  // pemeriksaan ini, nonce sepanjang 1 MB akan membuat HMAC ikut sebesar itu.
  if (!/^[0-9a-f]{32}$/.test(nonce)) return { ok: false, reason: "missing_headers" };
  // Tanda tangan HMAC-SHA-256 adalah 32 byte, jadi 64 karakter heksa. Bentuknya
  // diperiksa sebelum HMAC dihitung ulang, supaya masukan sembarang tidak
  // pernah sampai ke jalur kripto.
  if (!/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: "invalid_signature" };

  const digest = await relayBodyDigest(input.body);
  const expected = await signSigningString(
    secret,
    relaySigningString(timestamp, nonce, input.method, input.path, digest),
  );
  if (!constantTimeEqual(expected, signature)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true, timestamp: stamp, nonce };
}