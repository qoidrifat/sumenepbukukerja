// Gerbang passcode untuk ruang /admin.
//
// Passcode tidak pernah disimpan apa adanya dan tidak pernah masuk bundel
// browser. Yang ada di environment hanya hash PBKDF2-SHA256; kode asli hanya
// hidup di memory server selama satu request, lalu dibuang.
//
// Modul ini dipisah dari src/convex/adminGate.ts supaya derivasi kunci, format
// hash, dan penyamaran IP bisa diuji tanpa menjalankan action Convex.

const ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/** Derive PBKDF2-SHA256 dari passcode dengan salt dan iterasi tertentu. */
export async function derivePasscodeHash(
  passcode: string,
  salt: Uint8Array,
  iterations = ITERATIONS,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Format env: `pbkdf2-sha256$<iterasi>$<salt-base64>$<hash-base64>`.
 * Disimpan sebagai string supaya bisa ditempel lewat `convex env set`.
 */
export async function encodePasscodeHash(passcode: string, salt?: Uint8Array) {
  const usedSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasscodeHash(passcode, usedSalt);
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64(usedSalt)}$${toBase64(hash)}`;
}

export type ParsedPasscodeHash = {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
};

export function parsePasscodeHash(encoded: string): ParsedPasscodeHash | null {
  const [algorithm, iterationsText, saltText, hashText] = encoded.trim().split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationsText || !saltText || !hashText) return null;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 1) return null;
  try {
    return { iterations, salt: fromBase64(saltText), hash: fromBase64(hashText) };
  } catch {
    return null;
  }
}

/**
 * Perbandingan waktu-tetap. Panjang berbeda langsung ditolak, tetapi itu tidak
 * membocorkan apa pun karena panjang hash sudah diketahui dari format env.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

/** Normalisasi input sebelum dihitung ulang, supaya spasi ganda dan aksen Unicode tidak mengubah hasil. */
export function normalizePasscode(value: string) {
  return value.normalize("NFKC").trim();
}

/**
 * Kunci rate limit = hash dari deviceId + IP + email lowercase. Hash supaya
 * indeks database tidak menyimpan identitas mentah, dan supaya orang yang
 * hanya mengganti email tidak otomatis dapat jatah percobaan baru.
 */
export async function deriveAttemptKey(input: {
  deviceId: string;
  reportedIp?: string;
  email?: string;
}) {
  const material = [
    input.deviceId.trim().toLowerCase(),
    (input.reportedIp ?? "").trim().toLowerCase(),
    (input.email ?? "").trim().toLowerCase(),
  ].join("|");
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material)));
}

/**
 * IP yang dilaporkan perangkat tidak bisa dipercaya sebagai bukti, jadi hanya
 * dipakai untuk rate limit. Untuk ditampilkan, bagian host disembunyikan:
 * `192.168.1.24` → `192.168.1.xxx`, `2001:db8::1` → `2001:db8::…`.
 */
export function maskIp(value?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const groups = trimmed.split(":");
    return groups.length > 2 ? `${groups.slice(0, 2).join(":")}::…` : `${trimmed}…`;
  }
  const octets = trimmed.split(".");
  return octets.length === 4 ? `${octets.slice(0, 3).join(".")}.xxx` : `${trimmed.slice(0, 6)}…`;
}

/** Email cukup ditampilkan seperempat awal supaya logger tetap berguna tanpa menyimpan alamat penuh. */
export function maskEmail(value?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(2, local.length - head.length))}@${domain}`;
}

/** User agent dipangkas supaya tidak membengkakkan baris tabel audit. */
export function trimUserAgent(value?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 180);
}

export const PASSCODE_MAX_LENGTH = 200;
export const MAX_ATTEMPTS = 3;
export const LOCKOUT_MS = 60 * 60_000;
/**
 * Plafon global per jam. Rate limit per kunci bisa dilewati dengan menghapus
 * penyimpanan lokal, jadi jumlah seluruh percobaan gagal juga ikut dibatasi.
 * Angkanya longgar supaya admin yang sedang salah ketik tidak ikut terkunci.
 */
export const GLOBAL_ATTEMPT_CEILING = 60;
