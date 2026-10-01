/**
 * Katalog aturan deteksi serangan (FASE 7).
 *
 * KENAPA ATURANNYA DI BERKAS BIASA, BUKAN DI DALAM FUNGSI CONVEX:
 *
 * Keputusan "apakah ini serangan" adalah logika murni: ambang, jendela waktu,
 * tingkat keparahan, dan apa yang boleh disimpan sebagai bukti. Kalau logika
 * itu ditulis di dalam handler Convex, satu-satunya cara mengujinya adalah
 * menjalankan deployment sungguhan. Dengan dipisahkan, seluruh matriks ambang
 * bisa diuji tanpa database - dan yang paling penting, aturan yang salah bisa
 * ketahuan SEBELUM ia mulai membuang-buang tulis di tabel insiden.
 *
 * KENAPA HARUS BERKAS INI YANG MEMUTUSKAN, BUKAN PEMANGGILNYA:
 *
 * Kalau setiap tempat pemanggil boleh memilih tingkat keparahannya sendiri,
 * dua jalur berbeda akan memberi tingkat berbeda untuk kejadian yang sama, dan
 * Security Desk berhenti bisa dipercaya. Pemanggil hanya melaporkan FAKTA
 * ("passcode salah", "tanda tangan webhook tidak cocok"); berkas ini yang
 * memutuskan artinya.
 *
 * YANG TIDAK BOLEH MASUK BUKTI:
 *
 * Aturan pertama keamanan insiden adalah insiden itu sendiri tidak boleh
 * menjadi kebocoran baru. Tabel insiden dibaca manusia di panel, jadi ia
 * TIDAK PERNAH boleh memuat password, passcode, token, cookie, header
 * Authorization, nomor telepon mentah, secret provider, atau kunci privat.
 * `sanitizeEvidence` di bawah menegakkan itu secara mekanis, dan
 * `assertSafeEvidence` membuat pelanggarannya menjadi error saat pengembangan
 * - bukan diam-diam tersimpan.
 */

export const INCIDENT_SEVERITIES = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
  "suppressed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Tingkat keparahan yang masih dianggap "perlu ditangani". */
export const ACTIVE_STATUSES: IncidentStatus[] = ["open", "acknowledged"];

export type SecurityRuleKey =
  | "admin_passcode_failures"
  | "admin_lockout_threshold"
  | "storage_reference_invalid"
  | "privileged_call_denied"
  | "public_mutation_rate"
  | "webhook_signature_failure"
  | "invite_token_invalid"
  | "session_device_change"
  | "endpoint_error_burst";

export type SecurityRule = {
  /** Kalimat pendek untuk kolom "aturan" di Security Desk. */
  label: string;
  /**
   * Tingkat keparahan DASAR. `decideIncident` bisa menaikkannya saat hitungan
   * sudah jauh melewati ambang, tapi tidak pernah menurunkannya.
   */
  severity: IncidentSeverity;
  /**
   * Jumlah minimum kejadian di dalam `windowMs` sebelum insiden dicatat.
   *
   * Angka 1 berarti satu kejadian sudah cukup. Itu hanya dipakai untuk sinyal
   * yang memang tidak ambigu (lockout penuh, tanda tangan webhook tidak
   * cocok): satu kali pun sudah membuktikan ada yang mencoba.
   */
  threshold: number;
  /** Jendela pengamatan, dalam milidetik. */
  windowMs: number;
  /**
   * Batas tingginya keparahan saat hitungan berlipat. Dipakai supaya lonjakan
   * besar tidak otomatis menjadi `critical` kalau sinyalnya sendiri memang
   * sering muncul secara wajar (misalnya 404).
   */
  maxSeverity: IncidentSeverity;
  /** Unit subjek, supaya insiden dari sumber berbeda tidak saling menimpa. */
  subjectType: "ip" | "user" | "session" | "endpoint" | "webhook" | "invite" | "storage";
  /** Respons otomatis yang diizinkan setelah insiden tercatat. */
  response: "record" | "audit" | "alert" | "rate_limit" | "block_suspect" | "revoke_session";
  /** Alasan singkat, ditampilkan di panel supaya operator tahu harus apa. */
  rationale: string;
};

/**
 * Sembilan aturan wajib. Ambangnya dipilih supaya pengguna sah tidak pernah
 * kena: jendelanya pendek dan angkanya jauh di atas perilaku manusia normal di
 * aplikasi sekecil ini, tetapi masih cukup rendah untuk menangkap percobaan
 * otomatis.
 */
export const SECURITY_RULES: Record<SecurityRuleKey, SecurityRule> = {
  admin_passcode_failures: {
    label: "Passcode admin salah berulang",
    severity: "high",
    threshold: 5,
    windowMs: 15 * 60 * 1000,
    maxSeverity: "critical",
    subjectType: "ip",
    response: "rate_limit",
    rationale:
      "Lima kegagalan dalam lima belas menit bukan salah ketik. Gerbang passcode sudah punya kunci sendiri; insiden ini yang memberi tahu manusia bahwa kuncinya sedang diuji.",
  },
  admin_lockout_threshold: {
    label: "Ambang kunci gerbang admin tercapai",
    severity: "critical",
    threshold: 1,
    windowMs: 60 * 60 * 1000,
    maxSeverity: "critical",
    subjectType: "ip",
    response: "alert",
    rationale:
      "Kunci penuh berarti percobaan sudah melewati batas yang ditetapkan. Satu kejadian sudah cukup untuk dicatat: tidak ada alasan sah untuk mencapai titik ini.",
  },
  storage_reference_invalid: {
    label: "Rujukan penyimpanan tidak dikenal berulang",
    severity: "medium",
    threshold: 10,
    windowMs: 10 * 60 * 1000,
    maxSeverity: "high",
    subjectType: "user",
    response: "record",
    rationale:
      "Storage id acak yang ditebak satu per satu. Satu tebakan salah wajar terjadi; sepuluh dalam sepuluh menit berarti ada yang menyisir.",
  },
  privileged_call_denied: {
    label: "Panggilan berhak istimewa ditolak berulang",
    severity: "high",
    threshold: 5,
    windowMs: 10 * 60 * 1000,
    maxSeverity: "high",
    subjectType: "user",
    response: "record",
    rationale:
      "Menembak pintu pengelola berulang kali dari akun yang sama. Penolakannya sudah benar; yang perlu terlihat adalah polanya.",
  },
  public_mutation_rate: {
    label: "Laju mutation publik tidak wajar",
    severity: "medium",
    threshold: 60,
    windowMs: 60 * 1000,
    maxSeverity: "high",
    subjectType: "ip",
    response: "rate_limit",
    rationale:
      "Enam puluh tulisan dalam satu menit jauh di atas manusia. Ini pengaman umum untuk endpoint yang memang harus terbuka untuk pengunjung tanpa akun.",
  },
  webhook_signature_failure: {
    label: "Tanda tangan webhook tidak cocok berulang",
    severity: "critical",
    threshold: 3,
    windowMs: 10 * 60 * 1000,
    maxSeverity: "critical",
    subjectType: "webhook",
    response: "alert",
    rationale:
      "Tiga tanda tangan palsu berarti ada yang memanggil endpoint webhook tanpa memegang secret provider. Ini sinyal paling keras di seluruh katalog, karena tidak ada klien sah yang gagal tiga kali.",
  },
  invite_token_invalid: {
    label: "Token undangan tidak dikenal berulang",
    severity: "medium",
    threshold: 10,
    windowMs: 15 * 60 * 1000,
    maxSeverity: "high",
    subjectType: "invite",
    response: "rate_limit",
    rationale:
      "Token undangan ber-entropi tinggi tidak bisa ditebak; sepuluh tebakan berarti ada yang mencoba. Yang diserang adalah jalur yang memberi peran pengelola, jadi ambangnya rendah.",
  },
  session_device_change: {
    label: "Perpindahan sesi atau perangkat yang mencurigakan",
    severity: "medium",
    threshold: 2,
    windowMs: 30 * 60 * 1000,
    maxSeverity: "high",
    subjectType: "session",
    response: "revoke_session",
    rationale:
      "Satu sesi yang berpindah sidik perangkat dua kali dalam setengah jam bisa berarti token dicuri. Sinyalnya ambigu, jadi yang ditawarkan adalah pencabutan sesi - bukan blokir akun.",
  },
  endpoint_error_burst: {
    label: "Ledakan error pada satu endpoint",
    severity: "high",
    threshold: 20,
    windowMs: 5 * 60 * 1000,
    maxSeverity: "high",
    subjectType: "endpoint",
    response: "alert",
    rationale:
      "Dua puluh error di satu endpoint dalam lima menit biasanya berarti ada yang menyisir parameter, bukan sekadar satu peramban yang rusak.",
  },
};

export const SECURITY_RULE_KEYS = Object.keys(SECURITY_RULES) as SecurityRuleKey[];

export function isSecurityRuleKey(value: string): value is SecurityRuleKey {
  return Object.prototype.hasOwnProperty.call(SECURITY_RULES, value);
}

/** Urutan tingkat keparahan, untuk membandingkan dan menaikkan. */
const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const severityRank = (severity: IncidentSeverity) => SEVERITY_ORDER[severity];

/** Tingkat tertinggi di antara dua tingkat. */
export const worseSeverity = (a: IncidentSeverity, b: IncidentSeverity): IncidentSeverity =>
  SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;

export type IncidentDecision =
  | { action: "ignore" }
  | {
      action: "record";
      ruleKey: SecurityRuleKey;
      severity: IncidentSeverity;
      /** Respons yang boleh dijalankan setelah insiden tercatat. */
      response: SecurityRule["response"];
      /** Naik saat hitungan sudah berlipat, supaya panel bisa menyorotnya. */
      escalated: boolean;
      label: string;
      rationale: string;
    };

/**
 * Memutuskan apakah sekumpulan sinyal di dalam satu jendela layak menjadi
 * insiden.
 *
 * `count` adalah jumlah kejadian yang SUDAH termasuk yang terbaru, dihitung
 * pemanggil dari tabel yang relevan. Berkas ini tidak menghitung apa pun dari
 * database: kalau ia juga membaca database, ia berhenti bisa diuji tanpa
 * deployment - dan itulah satu-satunya alasan berkas ini ada.
 *
 * AGREGASI. Yang dikembalikan adalah keputusan untuk SATU baris insiden, bukan
 * satu baris per kejadian. Insiden di bawah ambang tidak menghasilkan apa pun,
 * jadi percobaan yang gagal terus tidak pernah membuat tabel tumbuh.
 */
export function decideIncident(
  ruleKey: SecurityRuleKey,
  count: number,
): IncidentDecision {
  const rule = SECURITY_RULES[ruleKey];
  if (!Number.isFinite(count) || count < rule.threshold) {
    return { action: "ignore" };
  }

  // Pelipatan: ambang dasar, 2x ambang, dan 4x ambang masing-masing menaikkan
  // satu langkah. Yang membatasi tetap `maxSeverity`, jadi sinyal yang memang
  // sering muncul wajar tidak pernah berubah menjadi `critical`.
  const ratio = count / rule.threshold;
  const steps = ratio >= 4 ? 2 : ratio >= 2 ? 1 : 0;
  let severity = rule.severity;
  for (let step = 0; step < steps; step += 1) {
    severity = bumpSeverity(severity, rule.maxSeverity);
  }

  return {
    action: "record",
    ruleKey,
    severity,
    response: rule.response,
    escalated: steps > 0,
    label: rule.label,
    rationale: rule.rationale,
  };
}

const SEVERITY_LADDER: IncidentSeverity[] = ["info", "low", "medium", "high", "critical"];

function bumpSeverity(current: IncidentSeverity, ceiling: IncidentSeverity): IncidentSeverity {
  if (severityRank(current) >= severityRank(ceiling)) return current;
  return SEVERITY_LADDER[Math.min(severityRank(current) + 1, SEVERITY_LADDER.length - 1)];
}

/* ------------------------------------------------------------------ */
/* Bukti yang aman disimpan                                            */
/* ------------------------------------------------------------------ */

/**
 * Pola yang TIDAK PERNAH boleh masuk tabel insiden.
 *
 * Diperiksa sebagai daftar, bukan satu regex raksasa, supaya pesan errornya
 * bisa menyebut pola mana yang kena - dan supaya menambah pola baru tidak
 * memaksa menulis ulang seluruh ekspresi.
 */
const FORBIDDEN_EVIDENCE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "passcode", pattern: /\bpasscode\b\s*[:=]\s*\S+/i },
  { name: "password", pattern: /\bpassword\b\s*[:=]\s*\S+/i },
  { name: "access token", pattern: /\b(access|refresh|id)[_-]?token\b\s*[:=]\s*\S+/i },
  { name: "bearer", pattern: /\bbearer\s+[A-Za-z0-9._-]{8,}/i },
  { name: "cookie", pattern: /\b(cookie|set-cookie)\b\s*[:=]\s*\S+/i },
  { name: "authorization header", pattern: /\bauthorization\b\s*[:=]\s*\S+/i },
  // Nomor telepon mentah: 10-15 digit berurutan, dengan atau tanpa spasi.
  { name: "nomor telepon mentah", pattern: /(?:\+?62|0)\d[\d\s-]{8,14}\d/ },
  { name: "secret provider", pattern: /\b(sk|pk|whsec|EAAG|vcp)_[A-Za-z0-9._-]{8,}/ },
  { name: "kunci privat", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "alamat email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
];

/**
 * Mengganti bagian yang berbahaya dengan penanda tetap.
 *
 * Bukti yang sudah dibersihkan tetap berguna untuk investigasi ("gagal di
 * cabang tanda tangan") tanpa membawa nilai rahasianya. Kalau sebuah baris
 * SELURUHNYA berbahaya, hasilnya adalah penanda, bukan baris kosong - supaya
 * operator tahu ada sesuatu yang disembunyikan, bukan mengira tidak ada apa-apa.
 */
export function sanitizeEvidence(values: readonly string[], limit = 20): string[] {
  const cleaned: string[] = [];
  for (const raw of values) {
    if (cleaned.length >= limit) break;
    if (typeof raw !== "string") continue;
    let value = raw.slice(0, 300);
    for (const { pattern } of FORBIDDEN_EVIDENCE_PATTERNS) {
      value = value.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), "[disunting]");
    }
    // Baris kosong tidak memberi informasi apa pun; marker tetap dibiarkan.
    const trimmed = value.trim();
    if (trimmed) cleaned.push(trimmed);
  }
  return cleaned;
}

/**
 * Versi yang MELEMPAR, untuk dipakai di jalur tulis.
 *
 * `sanitizeEvidence` dipanggil lebih dulu, jadi kegagalan di sini berarti ada
 * pola berbahaya yang TIDAK tertangkap daftar. Itu bug di daftarnya, bukan bug
 * di pemanggil, dan lebih baik terlihat saat test daripada tersimpan diam-diam.
 */
export function assertSafeEvidence(values: readonly string[]): void {
  for (const value of values) {
    for (const { name, pattern } of FORBIDDEN_EVIDENCE_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(
          `Bukti insiden memuat ${name} setelah disanitasi. Tambahkan polanya ke FORBIDDEN_EVIDENCE_PATTERNS, jangan kirim nilainya.`,
        );
      }
    }
  }
}

/** Menyamarkan IP supaya bisa dikenali manusia tanpa bisa dipakai ulang. */
export function maskIp(ip: string | undefined | null): string | undefined {
  if (!ip) return undefined;
  const value = ip.trim();
  if (!value) return undefined;
  if (value.includes(":")) {
    // IPv6: sisakan dua kelompok pertama, sisanya hilang.
    const groups = value.split(":").filter(Boolean);
    return groups.length <= 2 ? `${groups.join(":")}::x` : `${groups.slice(0, 2).join(":")}::x`;
  }
  const octets = value.split(".");
  if (octets.length !== 4) return undefined;
  return `${octets[0]}.${octets[1]}.x.x`;
}

/**
 * Kunci pengelompokan insiden.
 *
 * Dua kejadian dengan aturan dan subjek yang sama dianggap SATU insiden yang
 * bertambah, bukan dua baris. Tanpa ini, percobaan beruntun 10.000 kali akan
 * membuat 10.000 baris - dan tabel yang seharusnya memberi tahu justru
 * menenggelamkan sinyalnya sendiri.
 */
export function incidentAggregateKey(input: {
  ruleKey: SecurityRuleKey;
  subjectType: SecurityRule["subjectType"];
  subjectRef: string;
}): string {
  return `${input.ruleKey}|${input.subjectType}|${input.subjectRef}`;
}

/**
 * Apakah insiden yang sudah ada masih boleh dipertambah, atau harus dibuka
 * sebagai baris baru.
 *
 * Aturannya: insiden yang sudah `resolved`/`suppressed` TIDAK dihidupkan lagi.
 * Kalau kejadian yang sama terulang setelah ditutup, itu memang insiden baru -
 * dan menandainya sebagai baru adalah satu-satunya cara operator tahu bahwa
 * masalah yang dikira selesai ternyata kembali.
 */
export function shouldAggregate(existing: {
  status: IncidentStatus;
  lastSeenAt: number;
  now: number;
  windowMs: number;
}): boolean {
  if (!ACTIVE_STATUSES.includes(existing.status)) return false;
  return existing.now - existing.lastSeenAt <= existing.windowMs;
}
