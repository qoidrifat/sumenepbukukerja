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

const IP_HEADER_PRIORITY: Array<{ header: string; source: IpSource }> = [
  { header: "cf-connecting-ip", source: "CF-Connecting-IP" },
  { header: "true-client-ip", source: "True-Client-IP" },
  { header: "x-real-ip", source: "X-Real-IP" },
  { header: "fastly-client-ip", source: "Fastly-Client-IP" },
  { header: "fly-client-ip", source: "Fly-Client-IP" },
  { header: "x-client-ip", source: "Provider Header" },
];

/** Buang tanda kutip dan port, lalu cek bentuk IPv4/IPv6 yang masuk akal. */
export function normalizeIp(value?: string | null): string | null {
  const trimmed = (value ?? "").trim().replace(/^"|"$/g, "").trim();
  if (!trimmed || trimmed.length > 45) return null;

  // IPv6 dengan port selalu ditulis dalam kurung: [::1]:443
  if (trimmed.startsWith("[")) {
    const inner = (trimmed.match(/^\[([^\]]+)\]/) ?? [])[1]?.trim();
    return inner && isIpv6(inner) ? inner : null;
  }

  const v4 = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?$/);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    return octets.every((octet) => octet >= 0 && octet <= 255) ? octets.join(".") : null;
  }

  // Tanpa kurung, IPv6 tidak bisa dipisahkan dari port secara aman, jadi
  // nilainya dipakai apa adanya.
  return isIpv6(trimmed) ? trimmed : null;
}

function isIpv6(value: string) {
  return value.includes("::") || value.split(":").length === 8
    ? /^[0-9a-fA-F:]{2,45}$/.test(value) && value.includes(":")
    : false;
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
): { ip: string | null; source: IpSource } {
  for (const { header, source } of IP_HEADER_PRIORITY) {
    const ip = normalizeIp(headers.get(header));
    if (ip) return { ip, source };
  }
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Entri paling kiri adalah klien asli; sisanya proxy berantai.
    for (const part of forwarded.split(",")) {
      const ip = normalizeIp(part);
      if (ip) return { ip, source: "X-Forwarded-For" };
    }
  }
  return { ip: null, source: "Unknown" };
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
