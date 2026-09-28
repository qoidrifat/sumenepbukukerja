// Metadata keamanan yang bisa dihitung tanpa layanan eksternal.
//
// Semua fungsi di sini murni: tidak ada fetch, tidak ada akses jaringan, tidak
// ada ketergantungan browser. Karena itu aman dipanggil dari action Convex,
// dari unit test, maupun dari sisi klien.
//
// Prinsipnya satu: kalau datanya tidak ada, kembalikan `null`. Tidak pernah
// mengarang IP, lokasi, atau klasifikasi. UI yang berubah "Tidak tersedia"
// jauh lebih berguna daripada angka yang terlihat lengkap tetapi palsu.

export type DeviceType = "Desktop" | "Mobile" | "Tablet" | "Unknown";

export type ParsedUserAgent = {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: DeviceType;
};

export const UNKNOWN_LABEL = "Tidak terdeteksi";

/** Sumber IP, diurutkan dari header paling tepercaya. */
export type IpSource =
  | "CF-Connecting-IP"
  | "True-Client-IP"
  | "X-Real-IP"
  | "Fastly-Client-IP"
  | "Fly-Client-IP"
  | "Provider Header"
  | "X-Forwarded-For"
  | "Unknown";

export type IpFamily = "IPv4" | "IPv6" | "unknown";

/**
 * Seberapa yakin resolver bahwa nilai itu benar-benar alamat klien.
 *
 * - `edge`    : ditulis oleh edge/CDN tepercaya yang menimpanya di setiap
 *               request, jadi klien tidak bisa menirunya (Cloudflare hanya
 *               menyalin `CF-Connecting-IP` dari koneksi aslinya).
 * - `chain`   : berasal dari `X-Forwarded-For`, jadi hanya sekuat proxy yang
 *               berada di depan origin. Nilai paling kanan dipakai, bukan
 *               paling kiri — klien hanya bisa menambah entri di sebelah kiri.
 * - `unknown` : tidak ada sumber yang bisa dipercaya. Nilai dikembalikan null
 *               supaya UI menulis "Tidak terdeteksi", bukan mengarang angka.
 */
export type IpTrust = "edge" | "chain" | "unknown";

export type ResolvedClientIp = {
  ip: string | null;
  family: IpFamily;
  source: IpSource;
  trust: IpTrust;
  /** Ada proxy/CDN di jalur request ini. */
  proxyDetected: boolean;
  /** `X-Forwarded-For` tersedia, jadi rantai proxy bisa dihitung. */
  chainAvailable: boolean;
  chainLength: number;
  /** IPv6 bentuk `::ffff:a.b.c.d` dinormalkan menjadi IPv4 biasa. */
  mappedFromIpv6: boolean;
};

/** Header yang ditulis ulang oleh edge/CDN tepercaya. Urutan = prioritas. */
const IP_HEADER_PRIORITY: Array<{ header: string; source: IpSource }> = [
  { header: "cf-connecting-ip", source: "CF-Connecting-IP" },
  { header: "true-client-ip", source: "True-Client-IP" },
  { header: "x-real-ip", source: "X-Real-IP" },
  { header: "fastly-client-ip", source: "Fastly-Client-IP" },
  { header: "fly-client-ip", source: "Fly-Client-IP" },
  { header: "x-client-ip", source: "Provider Header" },
];

/** Ringkasan sumber IP untuk UI, supaya operator tidak perlu tebak. */
export const describeIpSource = (source: string | null | undefined): string => {
  switch (source) {
    case "CF-Connecting-IP":
      return "Header edge (Cloudflare)";
    case "True-Client-IP":
      return "Header edge (Akamai)";
    case "X-Real-IP":
      return "Header proxy (X-Real-IP)";
    case "Fastly-Client-IP":
      return "Header edge (Fastly)";
    case "Fly-Client-IP":
      return "Header platform (Fly)";
    case "Provider Header":
      return "Header platform";
    case "X-Forwarded-For":
      return "Rantai proxy (X-Forwarded-For)";
    default:
      return UNKNOWN_LABEL;
  }
};

type IpDetails = { ip: string | null; family: IpFamily; mappedFromIpv6: boolean };

const NO_IP: IpDetails = { ip: null, family: "unknown", mappedFromIpv6: false };

/** Buang tanda kutip dan port, lalu cek bentuk IPv4/IPv6 yang masuk akal. */
export function normalizeIp(value?: string | null): string | null {
  return normalizeIpDetailed(value).ip;
}

/**
 * Sama seperti `normalizeIp`, tetapi sekaligus memberi tahu keluarga IP-nya.
 * Audit keamanan butuh membedakan IPv4 dan IPv6, jadi keduanya dihitung di satu
 * tempat supaya tidak pernah berbeda isi antara penyimpanan dan tampilan.
 */
export function normalizeIpDetailed(value?: string | null): IpDetails {
  const trimmed = (value ?? "").trim().replace(/^"|"$/g, "").trim();
  if (!trimmed || trimmed.length > 45) return NO_IP;

  // IPv6 dengan port selalu ditulis dalam kurung: [::1]:443
  const candidate = trimmed.startsWith("[")
    ? (trimmed.match(/^\[([^\]]+)\]/) ?? [])[1]?.trim()
    : trimmed;
  if (!candidate) return NO_IP;

  // Zone id (fe80::1%eth0) hanya bermakna di dalam satu mesin, tidak pernah di
  // header HTTP, jadi dibuang daripada diterima.
  const zoneless = candidate.split("%")[0].trim().toLowerCase();
  if (!zoneless) return NO_IP;

  const v4 = zoneless.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?$/);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    return octets.every((octet) => octet >= 0 && octet <= 255)
      ? { ip: octets.join("."), family: "IPv4", mappedFromIpv6: false }
      : NO_IP;
  }

  // ::ffff:192.0.2.1 adalah alamat IPv4 yang melintasi jalur dual-stack.
  // Dinormalkan ke IPv4 supaya satu address tidak dihitung dua kali saat
  // agregasi per IP.
  const mapped = zoneless.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    const octets = mapped[1].split(".").map(Number);
    return octets.every((octet) => octet >= 0 && octet <= 255)
      ? { ip: mapped[1], family: "IPv4", mappedFromIpv6: true }
      : NO_IP;
  }

  return isIpv6(zoneless)
    ? { ip: zoneless, family: "IPv6", mappedFromIpv6: false }
    : NO_IP;
}

/**
 * Validator IPv6 yang benar-benar memeriksa jumlah grup, bukan sekadar
 * "ada tanda titik dua". Regex longgar pernah menerima `gg::1` atau
 * `1:2:3:4:5:6:7` yang bukan alamat, sehingga audit log menyimpan sampah.
 */
function isIpv6(value: string) {
  if (!value.includes(":") || !/^[0-9a-f:]+$/.test(value)) return false;
  // "::" hanya boleh muncul satu kali.
  if (value.split("::").length - 1 > 1) return false;
  const groups = value.split(":");
  // Bentuk terkompresi tidak boleh menggantung di satu sisi ("1:2:3:4:5:6:7:")
  // kecuali memang seluruhnya "::".
  if (groups.length > 2 && (groups[0] === "" || groups[groups.length - 1] === "")) return false;
  if (value.includes("::")) return groups.filter((group) => group !== "").every((group) => group.length <= 4);
  return groups.length === 8 && groups.every((group) => group.length === 4);
}

/**
 * Ambil IP klien dari header yang benar-benar ada di request.
 *
 * Hanya `httpAction` Convex yang menerima objek `Request`, jadi ini hanya
 * berarti di lapisan itu. Di lapisan action biasa tidak ada akses header sama
 * sekali — dan itu alasan `ipSource` bisa bernilai "Unknown".
 */
export function resolveClientIp(
  headers: { get(name: string): string | null },
): ResolvedClientIp {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map(normalizeIpDetailed)
    .filter((entry): entry is { ip: string; family: IpFamily; mappedFromIpv6: boolean } => entry.ip !== null);
  const chainAvailable = chain.length > 0;

  for (const { header, source } of IP_HEADER_PRIORITY) {
    const resolved = normalizeIpDetailed(headers.get(header));
    if (resolved.ip) {
      return {
        ip: resolved.ip,
        family: resolved.family,
        source,
        trust: "edge",
        proxyDetected: true,
        chainAvailable,
        chainLength: chain.length,
        mappedFromIpv6: resolved.mappedFromIpv6,
      };
    }
  }

  // Tanpa header edge tepercaya, satu-satunya sisa adalah rantai proxy. Entri
  // paling KANAN yang dipakai: klien hanya bisa menambah entri di sebelah
  // kiri, jadi sisi kiri justru yang paling mudah dipalsukan.
  const nearest = chain[chain.length - 1];
  if (nearest) {
    return {
      ip: nearest.ip,
      family: nearest.family,
      source: "X-Forwarded-For",
      trust: "chain",
      proxyDetected: true,
      chainAvailable,
      chainLength: chain.length,
      mappedFromIpv6: nearest.mappedFromIpv6,
    };
  }

  return {
    ip: null,
    family: "unknown",
    source: "Unknown",
    trust: "unknown",
    proxyDetected: false,
    chainAvailable: false,
    chainLength: 0,
    mappedFromIpv6: false,
  };
}

/**
 * Samarkan IP untuk ditampilkan. Dua oktet terakhir disembunyikan supaya
 * jaringan lokal (/24) masih terbaca, tapi alamat lengkapnya tidak terekspos
 * di layar yang bisa difoto.
 */
export function maskIpForDisplay(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const groups = trimmed.split(":").filter(Boolean);
    return groups.length > 2 ? `${groups.slice(0, 2).join(":")}::…` : `${trimmed}…`;
  }
  const octets = trimmed.split(".");
  return octets.length === 4 ? `${octets.slice(0, 3).join(".")}.xxx` : `${trimmed.slice(0, 6)}…`;
}

/**
 * Buang query string dan fragment sebelum disimpan. `/auth?token=...` tidak
 * boleh masuk audit log, karena URL bisa saja memuat sekali pakai token.
 */
export function sanitizeReferrer(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed.length > 300) return null;
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

const WINDOWS_NAMES: Record<string, string> = {
  "10.0": "10/11",
  "6.3": "8.1",
  "6.2": "8",
  "6.1": "7",
  "6.0": "Vista",
  "5.1": "XP",
};

/**
 * Pecah user agent menjadi bagian yang bisa dibaca manusia: browser, versi,
 * OS, dan jenis perangkat. Sengaja konservatif — kalau tidak dikenali, null.
 */
export function parseUserAgent(raw?: string | null): ParsedUserAgent {
  const ua = (raw ?? "").trim();
  const none: ParsedUserAgent = {
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
    deviceType: "Unknown",
  };
  if (!ua) return none;

  // Urutan penting: Edge/Opera/Samsung Internet memakai token Chromium yang
  // sama, jadi harus diperiksa sebelum Chrome.
  const BROWSERS: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /Edg(?:e|A|iOS)?\/(\d+)/, name: "Microsoft Edge" },
    { pattern: /OPR\/(\d+)/, name: "Opera" },
    { pattern: /SamsungBrowser\/(\d+)/, name: "Samsung Internet" },
    { pattern: /YaBrowser\/(\d+)/, name: "Yandex Browser" },
    { pattern: /Firefox\/(\d+)/, name: "Firefox" },
    { pattern: /(?:Chrome|CriOS)\/(\d+)/, name: "Chrome" },
    { pattern: /Version\/(\d+)[\d.]*\.[\d.]*\s+.*Safari/, name: "Safari" },
    { pattern: /MSIE (\d+)/, name: "Internet Explorer" },
  ];
  const browserMatch = BROWSERS.map((entry) => ({ entry, match: ua.match(entry.pattern) })).find(
    (found) => Boolean(found.match?.[1]),
  );
  const browser = browserMatch ? browserMatch.entry.name : null;
  const browserVersion = browserMatch?.match?.[1] ?? null;

  const windowsNt = ua.match(/Windows NT (\d+(?:\.\d+)?)/)?.[1] ?? null;
  const androidVersion = ua.match(/Android (\d+(?:\.\d+)?)/)?.[1] ?? null;
  const iosMatch = ua.match(/(?:iPhone |CPU )?OS (\d+)[_.](\d+)(?:[_.](\d+))?/);
  const iosVersion = iosMatch ? [iosMatch[1], iosMatch[2], iosMatch[3] ?? "0"].slice(0, 2).join(".") : null;
  const macVersion = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/)?.[1]?.replace(/_/g, ".") ?? null;

  let os: string | null = null;
  let osVersion: string | null = null;
  if (windowsNt) {
    os = "Windows";
    osVersion = WINDOWS_NAMES[windowsNt] ?? windowsNt;
  } else if (androidVersion) {
    os = "Android";
    osVersion = androidVersion;
  } else if (iosMatch) {
    os = "iOS";
    osVersion = iosVersion;
  } else if (ua.includes("CrOS")) {
    os = "ChromeOS";
  } else if (macVersion) {
    os = "macOS";
    osVersion = macVersion;
  } else if (ua.includes("Linux")) {
    os = "Linux";
  }

  const isTablet =
    /iPad|Silk|PlayBook|Kindle|Nexus (?:7|10)|Android(?!.*Mobile)/.test(ua) ||
    (ua.includes("Macintosh") && ua.includes("Touch"));
  const isMobile = /Mobi|iPhone|iPod|IEMobile|Windows Phone/.test(ua);
  const deviceType: DeviceType = isTablet
    ? "Tablet"
    : isMobile
      ? "Mobile"
      : /Windows NT|Macintosh|X11|Linux|CrOS/.test(ua)
        ? "Desktop"
        : "Unknown";

  return { browser, browserVersion, os, osVersion, deviceType };
}

/**
 * Alasan kegagalan yang aman untuk ditampilkan di audit internal.
 * Tidak pernah menyebut apakah sebuah akun ada — itu bahan enumerasi.
 */
export function describeFailure(reason?: string | null): string {
  switch (reason) {
    case "wrong_passcode":
      return "Passcode salah";
    case "rate_limited":
      return "Rate limit tercapai";
    case "locked":
      return "Percobaan dikunci";
    case "invalid_ticket":
      return "Tiket tidak valid";
    case "expired_ticket":
      return "Tiket kedaluwarsa";
    case "missing_client_context":
      return "Konteks permintaan tidak lengkap";
    case "unconfigured":
      return "Passcode belum dikonfigurasi";
    default:
      return "Tidak diketahui";
  }
}

export type SecuritySignal =
  | "NEW_IP"
  | "NEW_DEVICE"
  | "NEW_BROWSER"
  | "NEW_OS"
  | "NEW_TIMEZONE"
  | "NEW_GEO"
  | "IP_CHANGED"
  | "MULTIPLE_FAILED"
  | "RAPID_RETRY"
  | "PROXY_SEEN";

/** Bahasa netral. Tidak ada "penyerang" atau "penyusup" di sini: yang ditunjuk
 *  adalah perubahan yang layak dilihat operator, bukan vonis. */
export const SIGNAL_LABEL: Record<SecuritySignal, string> = {
  NEW_IP: "IP baru",
  NEW_DEVICE: "Perangkat berbeda",
  NEW_BROWSER: "Browser berbeda",
  NEW_OS: "Sistem operasi berbeda",
  NEW_TIMEZONE: "Zona waktu berbeda",
  NEW_GEO: "Lokasi jaringan berbeda",
  IP_CHANGED: "IP berubah sejak percobaan lalu",
  MULTIPLE_FAILED: "Beberapa kegagalan beruntun",
  RAPID_RETRY: "Percobaan ulang sangat cepat",
  PROXY_SEEN: "Permintaan melalui proxy/CDN",
};

/** Ambang waktu untuk "percobaan ulang sangat cepat". */
export const RAPID_RETRY_MS = 60_000;

/**
 * Sinyal turunan per percobaan, dihitung server dari satu kali baca tabel.
 *
 * Semua input nullable: kalau sebuah sinyal tidak bisa dihitung karena datanya
 * memang tidak ada, sinyalnya tidak dibuat. Sinyal yang
 * tidak bisa dibuktikan lebih baik hilang daripada menebak.
 */
export function deriveSecuritySignals(input: {
  ipHash?: string | null;
  seenIps?: ReadonlySet<string>;
  previousSameSession?: { ipHash?: string | null; browser?: string | null; os?: string | null; deviceType?: string | null; timezone?: string | null; country?: string | null } | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  timezone?: string | null;
  country?: string | null;
  failedInWindow?: number;
  rapidAttempts?: number;
  maxAttempts?: number;
  proxyDetected?: boolean | null;
}): SecuritySignal[] {
  const signals: SecuritySignal[] = [];
  if (input.proxyDetected) signals.push("PROXY_SEEN");
  if (input.ipHash && input.seenIps && !input.seenIps.has(input.ipHash)) signals.push("NEW_IP");
  if ((input.failedInWindow ?? 0) >= Math.max(1, (input.maxAttempts ?? 3) - 1)) signals.push("MULTIPLE_FAILED");
  if ((input.rapidAttempts ?? 0) >= 3) signals.push("RAPID_RETRY");

  const previous = input.previousSameSession;
  if (previous) {
    if (input.ipHash && previous.ipHash && input.ipHash !== previous.ipHash) signals.push("IP_CHANGED");
    if (input.browser && previous.browser && input.browser !== previous.browser) signals.push("NEW_BROWSER");
    if (input.os && previous.os && input.os !== previous.os) signals.push("NEW_OS");
    if (input.timezone && previous.timezone && input.timezone !== previous.timezone) signals.push("NEW_TIMEZONE");
    if (input.country && previous.country && input.country !== previous.country) signals.push("NEW_GEO");
  } else if (input.browser && input.os && input.deviceType) {
    // Sesi yang belum pernah terlihat sebelumnya: seluruh perangkatnya baru.
    signals.push("NEW_DEVICE");
  }
  return signals;
}

/** Status keamanan berbasis aturan transparan, bukan skor kotak hitam. */
export function securityStatus(input: {
  outcome: string;
  failedInWindow: number;
  locked: boolean;
  maxAttempts: number;
}): "Normal" | "Rate limited" | "Blocked" {
  if (input.locked) return "Blocked";
  if (input.failedInWindow >= Math.max(1, input.maxAttempts - 1)) return "Rate limited";
  if (input.outcome === "failed" && input.failedInWindow > 1) return "Rate limited";
  return "Normal";
}

export const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** Hash satu arah untuk korelasi tanpa menyimpan IP mentah. */
export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/**
 * Sidik jari sesi: hash dari deviceId + salt server. Nilai yang tampil hanya
 * 4 karakter terakhir, jadi tidak bisa dipakai mengidentifikasi ulang di luar
 * UI ini. DeviceId sendiri tidak pernah disimpan mentah.
 */
export async function deriveSessionFingerprint(
  deviceId: string,
  salt: string,
): Promise<string> {
  const digest = await sha256Hex(`${salt}:${deviceId.trim().toLowerCase()}`);
  return `sfp_${digest.slice(0, 16)}`;
}

/** Samarkan sidik jari untuk tampilan: sisakan 4 karakter terakhir. */
export function maskFingerprint(fingerprint?: string | null): string | null {
  const trimmed = (fingerprint ?? "").trim();
  if (!trimmed) return null;
  return `••••${trimmed.slice(-4)}`;
}

/** Samarkan request id: sisakan awal dan akhir. */
export function maskRequestId(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.length <= 10 ? `${trimmed.slice(0, 3)}••••` : `${trimmed.slice(0, 7)}••••${trimmed.slice(-4)}`;
}
