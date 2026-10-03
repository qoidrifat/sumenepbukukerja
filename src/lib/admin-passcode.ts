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

/**
 * Passcode ini menambah gesekan di depan gerbang admin, bukan rahasia utama —
 * peran tetap diputuskan server dari `staffMembers`. Karena itu kebijakannya
 * dibuat tetap wajar dan tidak ekstrem: yang dicek adalah panjang, variasi, dan
 * nilai yang jelas-jelas sudah dipakai orang lain. Aturan yang lebih ketat
 * hanya akan mendorong admin menulis passcode yang lebih mudah ditebak.
 */
export const PASSCODE_MIN_LENGTH = 8;

/** Nilai yang jelas sudah dipakai orang lain di dunia nyata. */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "admin123", "administrator",
  "12345678", "123456789", "1234567890", "qwerty123", "abc12345",
  "adminadmin", "passcode", "bukukerja", "sumenep", "sumenep123",
  "iloveyou", "letmein", "welcome", "welcome1", "changeme",
]);

export type PasscodeAssessment = {
  ok: boolean;
  level: "weak" | "fair" | "strong";
  label: string;
  issues: string[];
};

/**
 * Nilai kecocokan passcode, murni supaya bisa diuji tanpa menjalankan action.
 * Server tetap jadi otoritas: assessment ini hanya untuk memberi umpan balik
 * sebelum dikirim, bukan untuk menggantikan pemeriksaan di server.
 */
export function assessPasscode(passcode: string, current?: string): PasscodeAssessment {
  const value = normalizePasscode(passcode);
  const issues: string[] = [];
  if (value.length < PASSCODE_MIN_LENGTH) {
    issues.push(`Pakai minimal ${PASSCODE_MIN_LENGTH} karakter.`);
  }
  if (value.length > PASSCODE_MAX_LENGTH) {
    issues.push(`Maksimal ${PASSCODE_MAX_LENGTH} karakter.`);
  }
  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    issues.push("Passcode ini terlalu umum dan mudah ditebak.");
  }
  if (current !== undefined && value === normalizePasscode(current)) {
    issues.push("Passcode baru harus berbeda dari passcode lama.");
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  if (value.length >= 8 && classes < 2) {
    issues.push("Campurkan huruf, angka, atau simbol agar lebih sulit ditebak.");
  }

  const level: PasscodeAssessment["level"] =
    issues.length === 0 && classes >= 3 && value.length >= 12
      ? "strong"
      : issues.length === 0
        ? "fair"
        : "weak";
  return {
    ok: issues.length === 0,
    level,
    label: level === "strong" ? "Kuat" : level === "fair" ? "Cukup" : "Lemah",
    issues,
  };
}
export const MAX_ATTEMPTS = 3;
export const LOCKOUT_MS = 60 * 60_000;
/**
 * Plafon global per jam. Rate limit per kunci bisa dilewati dengan menghapus
 * penyimpanan lokal, jadi jumlah seluruh percobaan gagal juga ikut dibatasi.
 * Angkanya longgar supaya admin yang sedang salah ketik tidak ikut terkunci.
 */
export const GLOBAL_ATTEMPT_CEILING = 60;
/**

/**
 * Alfabet tanpa huruf yang mudah tertukar saat dibaca atau diketik ulang:
 * tidak ada 0/O, 1/I/L, atau U/V. Kode ini sering dibacakan lewat telepon atau
 * disalin manual ke tiket insiden, jadi keraguan saat dibaca di situ mahal.
 */
const ATTEMPT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";

/**
 * Kode unik untuk SATU percobaan masuk ruang pengelola.
 *
 * Kenapa ini perlu ada: Security Desk tadinya hanya bisa menunjuk sebuah
 * percobaan lewat waktu dan sidik jari perangkat. Waktu bisa berdekatan, dan
 * sidik jari bisa kosong ketika beacon gagal. Needed kode yang bisa dibaca
 * manusia dan disebut langsung di laporan.
 *
 * Kode ini SELALU ada, bukan hanya ketika konteks server masuk. Dihasilkan di
 * server dari sumber acak kriptografis, jadi tidak bisa ditebak dan tidak
 * bergantung pada apa pun yang dikirim browser. Enam karakter dengan alfabet
 * 31 memberi sekitar 30 bit - cukup untuk membedakan percobaan di dalam
 * jendela lockout, dan sama sekali bukan pengenal yang boleh dipakai sebagai
 * kunci keputusan keamanan apa pun.
 */
export function newAttemptCode(at: number = Date.now()): string {
  const date = new Date(at).toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let suffix = "";
  for (const byte of bytes) {
    suffix += ATTEMPT_CODE_ALPHABET[byte % ATTEMPT_CODE_ALPHABET.length];
  }
  return `ADM-${date}-${suffix}`;
}