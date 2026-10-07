// Pusat observability aplikasi.
//
// Semua error yang layak dilaporkan melewati modul ini: dinormalisasi,
// disanitasi, diklasifikasi, diberi sidik jari, lalu diteruskan ke tabel
// `errorReports` di Convex. Tidak ada modul lain yang boleh memanggil WhatsApp
// untuk pelaporan bug -- itu jalur tunggal supaya tidak ada spam, tidak ada
// duplikasi, dan tidak ada rekursi.
//
// Modul ini murni: tanpa React, tanpa Convex, tanpa akses jaringan. Semua
// keputusan bisa diuji tanpa browser dan tanpa deployment.

import { formatConvexError } from "./whatsapp";

/* ------------------------------------------------------------------ */
/* Tipe dasar                                                          */
/* ------------------------------------------------------------------ */

export const ERROR_SEVERITIES = ["info", "warning", "error", "critical"] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_REPORT_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
  "ignored",
] as const;
export type ErrorReportStatus = (typeof ERROR_REPORT_STATUSES)[number];

/**
 * Status alert ke admin.
 *
 * `handoff` berarti tautan `wa.me` sudah disiapkan dan siap dibuka pengelola.
 * Status ini BUKAN bukti pengiriman: `wa.me` tidak punya endpoint, tidak punya
 * balasan, dan tidak punya webhook. `sent` dan `delivered` tidak lagi dipakai
 * untuk jalur admin karena tidak ada yang bisa membuktikannya.
 *
 * `blocked` berarti sistem tahu alert layak disampaikan, tapi tautan handoff
 * tidak bisa dibuat. Laporan errornya tetap tersimpan utuh dan tetap terlihat
 * di panel pengelola.
 */
export const ERROR_ALERT_STATUSES = [
  "skipped",
  "queued",
  "handoff",
  "sent",
  "blocked",
  "failed",
] as const;
export type ErrorAlertStatus = (typeof ERROR_ALERT_STATUSES)[number];

export const ERROR_SOURCES = ["client", "server", "webhook"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

/**
 * Kelas operasi. Ini yang menentukan apakah sebuah kegagalan layak
 * dilaporkan, jauh lebih andal daripada membaca teks pesan error.
 */
export const ERROR_KINDS = [
  "validation",
  "permission",
  "auth",
  "notFound",
  "operation",
  "integration",
  "critical",
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

/** Kode stabil yang dibaca mesin, bukan kalimat yang berubah-ubah. */
export const ERROR_CODES = {
  validation: "VALIDATION_FAILED",
  permission: "PERMISSION_DENIED",
  auth: "AUTH_REQUIRED",
  notFound: "RESOURCE_NOT_FOUND",
  operation: "OPERATION_FAILED",
  runtime: "RUNTIME_ERROR",
  network: "NETWORK_ERROR",
  convex: "CONVEX_FUNCTION_ERROR",
  storage: "STORAGE_UPLOAD_FAILED",
  whatsappSend: "WHATSAPP_SEND_FAILED",
  whatsappWebhook: "WHATSAPP_WEBHOOK_FAILED",
  reportFailed: "REPORT_FAILED",
  adminLogout: "ADMIN_LOGOUT_FAILED",
  adminLogoutAudit: "ADMIN_LOGOUT_AUDIT",
  adminPasscodeChange: "ADMIN_PASSCODE_CHANGE_FAILED",
  unknown: "UNKNOWN_ERROR",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const REDACTED = "[redacted]";
export const MASKED = "[masked]";

/** Periode agregasi. Kesalahan yang sama dalam rentang ini jadi satu laporan. */
export const DEDUPE_WINDOW_MS = 10 * 60_000;
/** Jeda minimal dua alert untuk satu sidik jari. Anti-spam terakhir. */
export const ALERT_COOLDOWN_MS = 10 * 60_000;
/**
 * Di luar cooldown, alert hanya diulang saat jumlah kejadian melewati ambang
 * ini. Perubahan kecil tidak perlu diberi tahu admin, masalah yang meluas tetap
 * kelihatan.
 */
export const ALERT_OCCURRENCE_MILESTONES = [5, 25, 100, 500];
/** Setelah jendela ini, sidik jari yang sama boleh jadi laporan baru. */
export const REPORT_REUSE_WINDOW_MS = 24 * 60 * 60_000;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LENGTH = 2000;

/* ------------------------------------------------------------------ */
/* Sanitasi                                                            */
/* ------------------------------------------------------------------ */

/**
 * Urutan itu penting. Rahasia disamarkan lebih dulu supaya token yang
 * berbentuk panjang tidak ikut disamarkan sebagai nomor telepon, lalu data
 * pribadi dimasking belakangan.
 */
const REDACTION_RULES: Array<[RegExp, string]> = [
  // Header otentikasi dan cookie, apa pun isinya.
  [/\b(authorization|proxy-authorization)\s*[:=]\s*\S+(\s+\S+)?/gi, `$1: ${REDACTED}`],
  [/\b(set-)?cookie\s*[:=]\s*[^\n]*/gi, `$1cookie: ${REDACTED}`],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  // Token akses Meta (prefix EA) dan SID Twilio (AC/SM/AP).
  [/\bEA[A-Za-z0-9]{20,}/g, REDACTED],
  [/\b(AC|SM|AP)[a-f0-9]{32}\b/gi, REDACTED],
  // JWT.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  // Parameter query yang namanya berarti rahasia.
  [
    /([?&](?:token|secret|key|api[_-]?key|auth|signature|sig|access[_-]?token|refresh[_-]?token|password|passcode|code)=)[^&\s"'<>]+/gi,
    `$1${REDACTED}`,
  ],
  // Assignment di dalam teks dump env, log, atau pesan provider. Nilai dihentikan
  // di `]`, `}`, dan `&` supaya placeholder yang sudah disamarkan tidak ikut
  // memakan parameter berikutnya.
  [
    /((?:access[_-]?token|auth[_-]?token|api[_-]?key|client[_-]?secret|secret|password|passcode|token)\s*[:=]\s*"?)[^\s"',;)\]}]+/gi,
    `$1${REDACTED}`,
  ],
  // Blob opaque panjang: hash, base64, kunci. Aman disamarkan penuh.
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, REDACTED],
];

/** Nomor telepon Indonesia dan internasional, disamarkan jadi empat digit akhir. */
const maskPhone = (digits: string) => {
  const compact = digits.replace(/[^\d]/g, "");
  if (compact.length < 9) return MASKED;
  return `${compact.slice(0, 2)}****${compact.slice(-4)}`;
};

const EMAIL_RULE = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PHONE_RULE = /(?:\+?62|0)[\s-]?(?:\d[\s-]?){7,13}\d/g;

/**
 * Bersihkan satu string dari rahasia dan data pribadi.
 *
 * Dipakai untuk apa pun yang bisa sampai ke admin lewat WhatsApp: pesan
 * provider, stack trace, URL, dan teks yang diketik pengguna.
 */
export const redactText = (value: string): string => {
  let output = value;
  for (const [rule, replacement] of REDACTION_RULES) {
    output = output.replace(rule, replacement);
  }
  output = output.replace(
    EMAIL_RULE,
    (_match, local: string, domain: string) => `${local.slice(0, 1)}***@${domain}`,
  );
  output = output.replace(PHONE_RULE, (match) => maskPhone(match));
  return output;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Sanitasi struktural untuk nilai yang bentuknya tidak diketahui (payload
 * provider, objek error dari SDK, body request). Kunci yang namanya sensitif
 * dibuang isinya, bukan hanya disamarkan, karena sering kali isinya justru
 * yang paling berbahaya.
 */
export const redactValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return REDACTED;
  if (typeof value === "string") return redactText(value).slice(0, MAX_MESSAGE_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => redactValue(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 30)) {
      if (SENSITIVE_KEYS.test(key)) {
        output[key] = REDACTED;
        continue;
      }
      output[key] = redactValue(item, depth + 1);
    }
    return output;
  }
  return REDACTED;
};

const SENSITIVE_KEYS =
  /(token|secret|password|passcode|authorization|cookie|api[_-]?key|auth|signature|credential|session)/i;

/** Ambil hanya sebagian pertama stack trace, sudah disanitasi. */
export const redactStack = (stack: unknown): string | undefined => {
  if (typeof stack !== "string" || !stack.trim()) return undefined;
  return redactText(stack).slice(0, MAX_STACK_LENGTH);
};

/* ------------------------------------------------------------------ */
/* Identitas yang aman                                                 */
/* ------------------------------------------------------------------ */

/**
 * Pengenal pengguna untuk laporan. Sengaja memakai awalan Id, bukan email,
 * nama, atau nomor: laporan bisa jatuh di tangan pengelola yang tidak
 * seharusnya, dan debugging tidak butuh identitas lengkap.
 */
export const safeUserRef = (userId?: string | null): string | undefined => {
  if (!userId) return undefined;
  return `user:${String(userId).slice(0, 12)}`;
};

/* ------------------------------------------------------------------ */
/* Sidik jari dan ID laporan                                           */
/* ------------------------------------------------------------------ */

/** FNV-1a. Sama dengan yang dipakai komponen maskot, jadi satu gaya. */
export const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(7, "0");
};

/**
 * Sidik jari yang menentukan apakah dua kegagalan itu masalah yang sama.
 *
 * Yang SENGAJA tidak dimasukkan: timestamp, reportId, requestId, dan id
 * acak. Kalau ikut dihitung, setiap kejadian jadi "masalah baru" dan
 * dedup tidak pernah bekerja. Yang dihitung hanya bentuk kesalahannya.
 */
export const errorFingerprint = (input: {
  errorCode: string;
  feature: string;
  operation: string;
  providerCode?: string;
  message: string;
}): string => {
  const message = input.message
    .toLowerCase()
    // Request ID, trace ID, dan id acak apa pun harus hilang dari sidik jari:
    // kalau ikut dihitung, tiap kejadian jadi "masalah baru".
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/[0-9a-f]{8,}/g, "<id>")
    .replace(/\b[a-z0-9]*\d[a-z0-9-]{9,}\b/g, "<id>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/[^a-z<> ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return fnv1a(
    [input.errorCode, input.feature, input.operation, input.providerCode ?? "-", message].join("|"),
  );
};

const yyyymmdd = (epochMs: number) => {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
};

/**
 * ID laporan yang bisa dibaca manusia: tanggal hari ini plus sidik jari.
 * Kalau sidik jari yang sama muncul lagi setelah jendela reuse, suffiks
 * infarction naik supaya ID lama tidak tertimpa.
 */
export const reportIdFor = (occurredAt: number, fingerprint: string, sequence = 0): string => {
  const base = `ERR-${yyyymmdd(occurredAt)}-${fingerprint.slice(0, 8)}`;
  return sequence > 0 ? `${base}-${sequence + 1}` : base;
};

/* ------------------------------------------------------------------ */
/* Waktu                                                               */
/* ------------------------------------------------------------------ */

const pad = (value: number) => String(value).padStart(2, "0");

/** Waktu lokal aplikasi. Indonesia operate di WIB (UTC+7) tanpa DST. */
export const WIB_OFFSET_MINUTES = 7 * 60;

export const formatUtc = (epochMs: number) => {
  const date = new Date(epochMs);
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
};

export const formatWib = (epochMs: number) => {
  const shifted = new Date(epochMs + WIB_OFFSET_MINUTES * 60_000);
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())} WIB`
  );
};

const MONTHS_WIB = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export const formatWibLong = (epochMs: number) => {
  const shifted = new Date(epochMs + WIB_OFFSET_MINUTES * 60_000);
  return (
    `${shifted.getUTCDate()} ${MONTHS_WIB[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()} ` +
    `${pad(shifted.getUTCHours())}.${pad(shifted.getUTCMinutes())} WIB`
  );
};

/* ------------------------------------------------------------------ */
/* Normalisasi                                                         */
/* ------------------------------------------------------------------ */

export type ErrorReportInput = {
  kind: ErrorKind;
  feature: string;
  operation: string;
  message: string;
  title?: string;
  code?: ErrorCode;
  /** Menaikkan atau menurunkan severity bawaan dari kelas operasi. */
  severity?: ErrorSeverity;
  source?: ErrorSource;
  route?: string;
  component?: string;
  requestId?: string;
  provider?: string;
  providerCode?: string;
  providerMessage?: string;
  userId?: string;
  browser?: string;
  os?: string;
  stack?: unknown;
  retryable?: boolean;
  recommendedAction?: string;
  /** Kalimat yang sudah tampil ke pengguna, untuk disimpan terpisah. */
  userMessage?: string;
  context?: Record<string, unknown>;
};

export type NormalizedErrorReport = {
  reportId: string;
  fingerprint: string;
  severity: ErrorSeverity;
  status: ErrorReportStatus;
  errorCode: ErrorCode;
  title: string;
  message: string;
  userMessage?: string;
  feature: string;
  operation: string;
  source: ErrorSource;
  route?: string;
  component?: string;
  requestId?: string;
  provider?: string;
  providerCode?: string;
  providerMessage?: string;
  userRef?: string;
  browser?: string;
  os?: string;
  stack?: string;
  retryable: boolean;
  recommendedAction: string;
  context?: Record<string, unknown>;
};

/**
 * Policy severity dan kelayakan laporan per kelas operasi.
 *
 * `validation`, `permission`, `auth`, dan `notFound` TIDAK pernah dikirim ke
 * admin. Bukan karena tidak penting, tapi karena itu kesalahan pengoperasian normal pengguna,
 * bukan cacat sistem. Kalau dilaporkan, admin akan dibanjiri oleh orang yang
 * salah ketik email.
 */
const KIND_POLICY: Record<
  ErrorKind,
  { reportable: boolean; severity: ErrorSeverity; code: ErrorCode }
> = {
  validation: { reportable: false, severity: "info", code: ERROR_CODES.validation },
  permission: { reportable: false, severity: "info", code: ERROR_CODES.permission },
  auth: { reportable: false, severity: "info", code: ERROR_CODES.auth },
  notFound: { reportable: false, severity: "info", code: ERROR_CODES.notFound },
  operation: { reportable: true, severity: "error", code: ERROR_CODES.operation },
  integration: { reportable: true, severity: "error", code: ERROR_CODES.convex },
  critical: { reportable: true, severity: "critical", code: ERROR_CODES.unknown },
};

/**
 * Jaring pengaman kedua. Policy di atas berbasis kelas operasi; ini berbasis
 * teks pesan, untuk menangkap jalur yang salah klasifikasi dan pesan dari
 * provider yang gagal menyamar jadi error biasa.
 */
const EXPECTED_MESSAGE_RULES: RegExp[] = [
  /masuk (untuk|terlebih dahulu)/i,
  /hanya (pengelola|admin|pemilik listing|mitra)/i,
  /wajib diisi|tidak boleh kosong/i,
  /(tidak|belum) (dapat )?valid\b/i,
  /tidak dikenali/i,
  /terlalu pendek|terlalu panjang|minimal \d+/i,
  /sudah dikirim hari ini/i,
  /viewer hanya/i,
  /masukkan\b|perlu (memilih|menyimpan|menuliskan)/i,
];

export const isExpectedMessage = (message: string): boolean =>
  EXPECTED_MESSAGE_RULES.some((rule) => rule.test(message));

/*
 * Fungsi yang HANYA menolak ketika sesi tidak ada atau sudah kedaluwarsa.
 *
 * Kenapa daftar ini perlu, dan kenapa tidak bisa pakai teks pesan:
 *
 * Di deployment produksi Convex SENGAJA tidak mengirim pesan error yang
 * tidak tertangkap ke klien. Yang sampai hanya amplopnya:
 *
 *   [CONVEX Q(vendors:listForAdmin)] [Request ID: ...] Server Error
 *
 * Kalimat aslinya - "Masuk untuk menggunakan fitur Buku Kerja" - tidak
 * pernah ada di sisi peramban. Akibatnya `isExpectedMessage` di atas tidak
 * PERNAH bisa cocok untuk error Convex: masalahnya bukan filter yang
 * salah, tapi filter yang dijalankan pada teks yang isinya sudah dibuang.
 *
 * Konsekuensinya nyata dan sudah terjadi: setiap sesi yang kedaluwarsa -
 * hal yang wajar pada halaman yang butuh login - dilaporkan sebagai
 * `critical` "Gangguan sistem", dan pengguna melihat "gangguan total"
 * padahal yang terjadi cuma perlu masuk lagi.
 *
 * Yang boleh masuk ke daftar ini HANYA fungsi yang butuh sesi. Fungsi yang
 * bisa gagal karena alasan lain (validasi, database, provider) TIDAK boleh
 * masuk, karena penyimpangan seperti itu ikut hilang dari dashboard.
 */
const SESSION_GATE_UDFS = new Set([
  "vendors:listForOwner",
  "vendors:listForAdmin",
  "adminGate:currentAdminSession",
  "adminGate:currentAdminSessionStatus",
]);

/**
 * Apakah error ini adalah penolakan sesi biasa, bukan gangguan sistem?
 *
 * Mengembalikan nama funksinya supaya pemanggil bisa menyimpannya di konteks
 * laporan tanpa perlu mengulangi parsing amplop.
 */
export const sessionGateFailure = (message: string): string | null => {
  const udf = convexErrorEnvelope(message).udf;
  if (!udf || !SESSION_GATE_UDFS.has(udf)) return null;
  if (!/server error/i.test(message)) return null;
  return udf;
};

const DEFAULT_ACTIONS: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.whatsappSend]:
    "Periksa template WhatsApp yang disetujui dan WHATSAPP_TEMPLATE_NAME, lalu baca kode provider pada laporan.",
  [ERROR_CODES.whatsappWebhook]:
    "Cocokkan callback URL di dashboard provider dengan /webhook/whatsapp dan pastikan secret penandatanganannya cocok.",
  [ERROR_CODES.network]: "Periksa koneksi server ke provider atau klien ke server sebelum mencoba ulang.",
  [ERROR_CODES.storage]: "Periksa kuota penyimpanan dan hak akses file sebelum mengunggah ulang.",
  [ERROR_CODES.operation]:
    "Baca konteks pada laporan ini, reproduksi di akun penguji, lalu periksa mutasi terkait.",
};

const TITLES: Record<ErrorSeverity, string> = {
  info: "Catatan sistem",
  warning: "Perlu perhatian",
  error: "Terjadi kendala",
  critical: "Gangguan sistem",
};

const shortText = (value: string, limit = MAX_MESSAGE_LENGTH) => {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
};

/** Ambil kode provider dari error apa pun yang bentuknya mirip. */
const providerFields = (input: ErrorReportInput) => ({
  provider: input.provider ? shortText(input.provider, 40) : undefined,
  providerCode: input.providerCode ? shortText(input.providerCode, 40) : undefined,
  providerMessage: input.providerMessage
    ? shortText(redactText(input.providerMessage), 300)
    : undefined,
});

/**
 * Bongkar amplop error Convex: nama fungsi dan Request ID.
 *
 * Di deployment produksi, Convex TIDAK mengirim pesan error yang tidak
 * tertangkap ke klien. Yang tersisa hanya amplopnya:
 *
 *   [CONVEX Q(vendors:listForAdmin)] [Request ID: fdef7197fd99914a] Server Error
 *     Called by client
 *
 * `formatConvexError` membuang amplop itu — memang benar untuk pesan yang
 * ditujukan ke pengguna, tapi salah untuk laporan error: setelah dibersihkan,
 * seluruh isi pesannya tinggal "Called by client", dan nama fungsi serta
 * Request ID yang justru satu-satunya petunjuk hilang. Karena sidik jari
 * laporan ikut memakai pesan, kegagalan dari fungsi mana pun menyusut jadi
 * kalimat yang sama dan MENGGUMPAL menjadi satu laporan.
 *
 * Fungsi ini mengembalikan bagian yang berguna itu supaya bisa disimpan utuh.
 */
export const convexErrorEnvelope = (message: string) => {
  const udf = /\[CONVEX\s+[A-Za-z]+\(([^)\]]+)\)\]/.exec(message)?.[1]?.trim();
  const requestId = /\[Request ID:\s*([A-Za-z0-9_-]+)\s*\]/i.exec(message)?.[1]?.trim();
  return { udf: udf || undefined, requestId: requestId || undefined };
};

/**
 * Label lingkungan untuk laporan error.
 *
 * Sebelumnya cuma `process.env.CONVEX_DEPLOYMENT ?? "development"`. Di
 * deployment produksi variabel itu tidak diset, jadi SETIAP laporan produksi
 * dicap "development" — dan gangguan produksi terbaca seperti artefak lokal.
 * Operator yang memercayai label itu bisa mengabaikan insiden sungguhan.
 *
 * Urutannya sekarang: `APP_ENV` kalau operator menyetelnya secara eksplisit,
 * lalu awalan `CONVEX_DEPLOYMENT`, lalu `CONVEX_SITE_URL` (Convex selalu
 * menyetelnya; jalur auth aplikasi ini memang bergantung padanya). Kalau tidak
 * ada satu pun yang bisa dipercaya, jawabannya "unknown" — bukan menebak
 * "development".
 */
export const resolveEnvironment = (env: Record<string, string | undefined>): string => {
  const explicit = env.APP_ENV?.trim();
  if (explicit) return explicit;

  // Urutan di sini penting dan bukan soal selera. `CONVEX_SITE_URL` dibaca
  // SEBELUM `CONVEX_DEPLOYMENT` karena keduanya tidak setara credibilitasnya:
  // yang pertama diisi sengaja oleh operator, yang kedua disuntikkan platform
  // dan bisa tertinggal - deployment yang awal dibuat sebagai dev lalu
  // dipakai untuk produksi, misalnya. Kalau urplandanya dibalik, nilai
  // platform itu menang dan SETIAP laporan produksi dicap "development".
  // Gejalanya nyata: laporan dari `sumenepbukukerja.com` yang sebenarnya
  // berjalan di deployment produksi muncul di Security Desk sebagai
  // "development", sehingga tidak terbaca sebagai masalah produksi.
  const site = env.CONVEX_SITE_URL?.trim() ?? "";
  if (/^https:\/\/[a-z0-9-]+\.convex\.site\/?$/i.test(site)) return "production";
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(site)) return "development";

  const deployment = env.CONVEX_DEPLOYMENT?.trim();
  if (deployment) {
    const prefix = deployment.split(":")[0]?.toLowerCase();
    if (prefix === "prod") return "production";
    if (prefix === "dev" || prefix === "local") return "development";
    if (prefix === "staging" || prefix === "preview") return prefix;
  }

  return "unknown";
};

/**
 * Satu-satunya pintu masuk pelaporan. Semua sumber error -- klien, server,
 * webhook -- dinormalisasi di sini supaya tidak ada dua definisi "apa itu
 * laporan bug" di dalam kode.
 */
export const normalizeErrorReport = (
  input: ErrorReportInput,
  now: number = Date.now(),
): NormalizedErrorReport | null => {
  const envelope = convexErrorEnvelope(input.message);
  const cleaned = formatConvexError(input.message, "");
  // Sisa pembersihan yang isinya cuma penanda amplop Convex tidak memberi tahu
  // apa pun. Kalau begitu, sebutkan fungsi yang gagal dan Request ID-nya,
  // supaya laporannya bisa ditindaklanjuti alih-alih terbaca "Called by client".
  const informative = cleaned.length > 0 && !/^called by client$/i.test(cleaned);
  const message = shortText(
    redactText(
      informative
        ? cleaned
        : envelope.udf
          ? `Error server pada ${envelope.udf} tanpa pesan${envelope.requestId ? ` (Request ID ${envelope.requestId})` : ""}`
          : "Terjadi kesalahan.",
    ),
  );
  const policy = KIND_POLICY[input.kind] ?? KIND_POLICY.operation;
  if (!policy.reportable) return null;
  // Penolakan sesi adalah keadaan normal, bukan gangguan. Amannya sudah
  // kedaluwarsa beberapa kali di lapangan: setiap kejadiannya masuk ke sini
  // sebagai `critical` dan menutupi masalah yang benar-benar perlu
  // ditindak. Ditutup di sini, BUKAN hanya diturunkan ke `warning` -
  // laporan yang tidak perlu ditindaklanjuti tidak boleh memenuhi antrean.
  if (sessionGateFailure(input.message)) return null;
  // Jaring pengaman teks: kalau kalimatnya jelas merupakan error yang
  // diharapkan, jangan sampai jadi laporan meski kelasnya salah.
  if (isExpectedMessage(message)) return null;

  const errorCode = input.code ?? policy.code;
  const severity = input.severity ?? policy.severity;
  const provider = providerFields(input);
  const fingerprint = errorFingerprint({
    errorCode,
    feature: input.feature,
    operation: input.operation,
    providerCode: provider.providerCode,
    message,
  });

  return {
    reportId: reportIdFor(now, fingerprint),
    fingerprint,
    severity,
    status: "open",
    errorCode,
    title: input.title ? shortText(input.title, 90) : TITLES[severity],
    message,
    userMessage: input.userMessage ? shortText(redactText(input.userMessage), 300) : undefined,
    feature: shortText(input.feature, 60),
    operation: shortText(input.operation, 80),
    source: input.source ?? "client",
    route: input.route ? shortText(input.route, 120) : undefined,
    component: input.component ? shortText(input.component, 60) : undefined,
    requestId: input.requestId
      ? shortText(input.requestId, 40)
      : envelope.requestId
        ? shortText(envelope.requestId, 40)
        : undefined,
    ...provider,
    userRef: safeUserRef(input.userId),
    browser: input.browser ? shortText(input.browser, 60) : undefined,
    os: input.os ? shortText(input.os, 60) : undefined,
    stack: redactStack(input.stack),
    retryable: input.retryable ?? true,
    recommendedAction:
      input.recommendedAction ?? DEFAULT_ACTIONS[errorCode] ?? DEFAULT_ACTIONS[ERROR_CODES.operation]!,
    context: input.context ? (redactValue(input.context) as Record<string, unknown>) : undefined,
  };
};

/* ------------------------------------------------------------------ */
/* Policy alert                                                        */
/* ------------------------------------------------------------------ */

/**
 * Kapan satu laporan deserves alert WhatsApp.
 *
 * `info` dan `warning` tidak pernah dikirim otomatis. `error` dikirim saat
 * sidik jarinya baru, lalu diulang hanya saat jumlah kejadian melewati
 * ambang. `critical` selalu dikirim saat pertama muncul dan diulang pada
 * ambang yang sama.
 */
export const shouldAlert = (input: {
  severity: ErrorSeverity;
  occurrences: number;
  lastAlertAt?: number;
  now: number;
}): boolean => {
  if (input.severity === "info" || input.severity === "warning") return false;
  const { lastAlertAt } = input;
  if (lastAlertAt === undefined) return true;
  if (input.now - lastAlertAt < ALERT_COOLDOWN_MS) return false;
  return ALERT_OCCURRENCE_MILESTONES.includes(input.occurrences);
};

/* ------------------------------------------------------------------ */
/* Pesan alert admin                                                   */
/* ------------------------------------------------------------------ */

const providerLabel = (provider?: string) => {
  if (!provider) return undefined;
  if (provider === "meta") return "Meta WhatsApp Cloud API";
  if (provider === "twilio") return "Twilio WhatsApp";
  return provider;
};

/**
 * Sanitasi terakhir sebelum pesan masuk WhatsApp.
 *
 * Jalur normal sudah menyanitasi lebih awal, tapi ini adalah gerbang
 * terakhir menuju nomor admin: kalau ada pemanggil di masa depan yang
 * lupa menyanitasi, nilai rahasianya tetap tidak akan keluar.
 */
const safe = (value?: string | number) =>
  value === undefined || value === null || value === ""
    ? undefined
    : redactText(String(value)).slice(0, 400);

const line = (label: string, value?: string | number) => {
  const cleaned = safe(value);
  return cleaned === undefined ? undefined : `${label}${cleaned}`;
};

/**
 * Pesan alert untuk admin. Disusun di sini, bukan di adapter WhatsApp,
 * supaya isinya bisa diuji tanpa provider apa pun.
 *
 * Format disengaja ramah WhatsApp: tanpa emoji (banyak perangkat penerima
 * menampilkannya sebagai kotak), hanya *bold* dan garis ━ yang terbukti
 * tampil utuh di aplikasi. Label Indonesia, nilai kode apa adanya.
 */
export const buildAdminAlertMessage = (report: {
  reportId: string;
  severity: ErrorSeverity;
  errorCode: string;
  title: string;
  message: string;
  userMessage?: string;
  feature: string;
  operation: string;
  route?: string;
  component?: string;
  source: string;
  environment: string;
  occurredAt: number;
  requestId?: string;
  provider?: string;
  providerCode?: string;
  providerMessage?: string;
  userRef?: string;
  browser?: string;
  os?: string;
  retryable: boolean;
  recommendedAction: string;
  occurrences: number;
  firstSeenAt: number;
  lastSeenAt: number;
}): string => {
  const providerRows = report.provider
    ? [
        line(`*Provider:* `, providerLabel(report.provider)),
        line(`*Kode provider:* `, report.providerCode),
        line(`*Detail provider:* `, report.providerMessage),
      ]
    : [];
  const rows = [
    `*LAPORAN ERROR — BUKU KERJA*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    line(`*ID:* `, report.reportId),
    line(`*Waktu:* `, formatWibLong(report.occurredAt)),
    line(`*Keparahan:* `, report.severity.toUpperCase()),
    line(`*Fitur:* `, report.feature),
    line(`*Operasi:* `, report.operation),
    line(`*Rute:* `, report.route ?? "-"),
    line(`*Lingkungan:* `, report.environment),
    ``,
    `*Pesan:*`,
    safe(report.userMessage ?? report.message),
    ``,
    line(`*Kode:* `, report.errorCode),
    `*Dapat diulang:* ${report.retryable ? "Ya" : "Tidak"}`,
    ...providerRows,
    line(`*Request ID:* `, report.requestId),
    line(`*Pengguna:* `, report.userRef),
    line(
      `*Perangkat:* `,
      [report.browser, report.os].filter(Boolean).join(" / ") || undefined,
    ),
    line(`*Konteks:* `, report.component),
    report.occurrences > 1
      ? `*Terjadi:* ${report.occurrences}× · pertama ${formatWibLong(report.firstSeenAt)} · terakhir ${formatWibLong(report.lastSeenAt)}`
      : undefined,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*Tindak lanjut:*`,
    safe(report.recommendedAction),
    `━━━━━━━━━━━━━━━━━━━━`,
    `Status: OPEN`,
  ];
  return rows.filter((row): row is string => row !== undefined).join("\n");
};

/* ------------------------------------------------------------------ */
/* Saran tindakan untuk operator                                       */
/* ------------------------------------------------------------------ */

/** Kode provider yang berarti template belum ada / bahasa tidak cocok. */
const TEMPLATE_LOOKUP_CODES = new Set(["132001", "133000"]);
/** Kode provider yang berarti kredensial mati, bukan isi pesan salah. */
const AUTH_FAILURE_CODES = new Set(["190", "0"]);

/** Petunjuk yang bisa ditindaklanjuti untuk kegagalan integrasi WhatsApp. */
export const whatsappRecommendedAction = (input: {
  providerCode?: string;
  templateConfigured: boolean;
  providerIssue?: string;
}): string => {
  if (input.providerCode && AUTH_FAILURE_CODES.has(input.providerCode)) {
    return `Access token Meta tidak sah (kode ${input.providerCode}). Buat token baru di Meta App Dashboard — disarankan System User token yang tidak kedaluwarsa — lalu perbarui WHATSAPP_ACCESS_TOKEN di tab Keys/API keys. Template tidak terkait dengan kegagalan ini.`;
  }
  if (input.providerIssue) {
    return `${input.providerIssue} Alert admin tidak dapat dikirim sampai konfigurasi provider diperbaiki.`;
  }
  if (input.providerCode && TEMPLATE_LOOKUP_CODES.has(input.providerCode)) {
    return `Meta tidak menemukan template "WHATSAPP_TEMPLATE_NAME" untuk bahasa yang diminta (kode ${input.providerCode}). Periksa nama persis dan bahasa persetujuan template di WhatsApp Manager, lalu set WHATSAPP_TEMPLATE_LANGUAGE (contoh: en_US bila disetujui sebagai en_US) di tab Keys/API keys.`;
  }
  if (!input.templateConfigured) {
    return "Buat dan setujui template kategori UTILITY di WhatsApp Manager, lalu isi WHATSAPP_TEMPLATE_NAME. Tanpa template, Meta menolak pesan dari server di luar jendela layanan 24 jam (kode 131008).";
  }
  return "Baca kode provider di atas, cocokkan dengan dokumentasi provider, lalu uji ulang dari dashboard.";
};

/**
 * Ambil pesan provider dari error apa pun. Bermirror dengan versi di
 * `convex/whatsapp.ts`, tapi bentuknya dibuat datar supaya bisa dipakai di
 * sisi klien tanpa mengimpor kode server.
 */
export const providerErrorFields = (caught: unknown): {
  providerCode?: string;
  providerMessage?: string;
} => {
  if (!caught || typeof caught !== "object") return {};
  const candidate = caught as { providerCode?: unknown; providerText?: unknown };
  return {
    providerCode:
      typeof candidate.providerCode === "string" ? candidate.providerCode : undefined,
    providerMessage:
      typeof candidate.providerText === "string" ? candidate.providerText : undefined,
  };
};
