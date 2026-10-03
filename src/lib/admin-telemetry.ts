/*
 * Telemetry keamanan ruang pengelola: bagaimana sebuah event menyatakan
 * seberapa lengkap buktinya, dan bagaimana hash IP dibentuk.
 *
 * MASALAH YANG INI SELESAIKAN
 *
 * Security Desk menampilkan "IP tidak terdeteksi" dan "lokasi tidak
 * terdeteksi" untuk hampir semua baris, dan operator tidak bisa membedakan
 * empat hal yang sangat berbeda:
 *
 *  - tidak ada alat yang mengirimi data apa pun
 *  - alat mengirim, tapi tidak menemukan IP
 *  - alat mengirim IP, tapi tidak ada lokasi untuk IP itu
 *  - konteks lengkap, semua ada
 *
 * Semuanya sebelumnya terlihat sama persis di layar. Modul ini membuat perbedaan
 * itu menjadi data, bukan tebakan: setiap baris membawa `telemetryStatus`, dan
 * nilainya hanya boleh berasal dari bukti yang benar-benar ada.
 *
 * ATURAN YANG TIDAK BOLEH DILANGGAR
 *
 * Fungsi ini tidak pernah menghasilkan "lengkap" kalau tidak ada IP, dan tidak
 * pernah menghasilkan "lengkap" dari jalur yang tidak memegang IP sama sekali.
 * Jalur tanpa IP ditandai sebagai gagal atau sebagian, bukan dilaporkan
 * berhasil.
 */

// Dari mana konteks jaringan itu datang. Hanya `vercel-edge` yang benar-benar
// melihat klien; `convex` berarti jalur cadangan yang tidak membawa IP.
export type TelemetryRelay = "vercel-edge" | "convex" | "unavailable";

/**
 * Seberapa lengkap bukti sebuah event.
 *
 *  - `complete`: IP benar-benar diamati dan lokasi ada.
 *  - `partial`: ada sebagian konteks, tapi ada yang tidak bisa diisi.
 *  - `failed`: tidak ada konteks jaringan sama sekali.
 */
export type TelemetryStatus = "complete" | "partial" | "failed";

/**
 * Cara `ipHash` dibentuk, dicatat supaya hash polos tidak tersamar.
 *
 * Keempat nilai ini dibedakan karena tiga di antaranya berarti "ada yang
 * salah konfigurasi", bukan sekadar "tidak ada data". Kalau hanya ada dua,
 * operator production akan melihat `unavailable` dan mengira relay yang
 * mati, padahal masalahnya satu environment yang belum diisi.
 */
export type IpHashMethod =
  | "hmac-sha256"
  | "hmac-sha256-fallback"
  | "unavailable"
  | "missing-in-production";

/** Dari kunci mana `ipHash` dibentuk. */
export type IpHashSecretSource = "dedicated" | "relay-fallback" | "none";

/**
 * Hasil pemilihan kunci, beserta alasan kalau tidak ada kunci.
 *
 * `missing_dedicated` sengaja dibedakan dari `missing_all`: yang pertama
 * berarti `SERVER_IP_HASH_SECRET` belum diisi di produksi, dan itu memang
 * harus diperbaiki. Yang kedua berarti tidak ada environment hash sama
 * sekali, dan itu juga harus diperbaiki, tapi masalahnya berbeda.
 */
export type IpHashSecretResult = {
  secret: string | null;
  source: IpHashSecretSource;
  reason: "ok" | "missing_dedicated" | "missing_all";
};

/** Nama environment yang dipakai untuk kunci hash IP, urutan prioritas. */
export const IP_HASH_SECRET_ENV = "SERVER_IP_HASH_SECRET";
export const IP_HASH_FALLBACK_SECRET_ENV = "ADMIN_CONTEXT_RELAY_SECRET";

/**
 * Nilai `telemetryStatus` untuk satu event.
 *
 * `complete` sengaja punya syarat yang bisa diperiksa ulang dari baris yang
 * tersimpan: relay harus edge, IP harus ada, dan minimal negara harus ada.
 * Tanpa syarat ketiga, "lengkap" akan berarti "IP ada tapi lokasi kosong",
 * dan itu persis kebohongan yang keluhan pengguna.
 *
 * `failed` hanya untuk relay yang benar-benar tidak hidup. Kalau relay hidup
 * tapi hanya sebagian konteksnya yang terisi, jawabannya `partial`, bukan
 * `failed`: keduanya berbeda bagi operator yang sedang menelusuri insiden.
 */
export function deriveTelemetryStatus(input: {
  relay: TelemetryRelay | null | undefined;
  hasIp: boolean;
  hasGeo: boolean;
}): TelemetryStatus {
  const relay = (input.relay ?? "unavailable") as TelemetryRelay;
  if (relay === "unavailable" || !input.hasIp) return "failed";
  return input.hasGeo ? "complete" : "partial";
}

/**
 * Kunci hash IP.
 *
 * Urutannya: kunci khusus dulu, baru secret relay. Tapi urutan kedua hanya
 * berlaku di luar produksi.
 *
 * Kenapa produksi menutup diri di sini: `ADMIN_CONTEXT_RELAY_SECRET` sudah ada
 * di dua tempat (Vercel dan Convex) dan tugasnya satu, yaitu membuktikan
 * identitas pengirim. `SERVER_IP_HASH_SECRET` tugasnya berbeda, yaitu menjaga
 * hash IP tidak bisa ditebak. Dua tugas, dua kunci. Kalau satu kunci dipakai
 * untuk dua hal, kebocoran di satu tempat langsung membuka yang lain, dan tidak
 * ada cara mengetahui kunci mana yang bocor.
 *
 * Jadi kalau produksi tanpa kunci khusus, jawabannya bukan "pakai saja yang
 * ada", melainkan `null` dengan alasan `missing_dedicated`. Baris auditnya
 * tetap ditulis: lebih baik tidak punya hash daripada punya hash yang kunci
 * rahasianya bocor ke tempat lain. `ipHashMethod` mencatat
 * `missing-in-production` supaya operator tahu apa yang harus diisi, bukan
 * mengira relaynya yang mati.
 *
 * `production` sengaja diteruskan oleh pemanggil, bukan dibaca di sini.
 * Modul ini ikut masuk ke bundel peramban lewat Security Desk, dan menarik
 * `resolveEnvironment` ke sini akan menyeret modul error-reporting beserta
 * dependensinya ke bundel itu. Server yang memutuskan, modul ini mengikutinya.
 */
export function resolveIpHashSecret(
  env: Record<string, string | undefined>,
  options: { production?: boolean } = {},
): IpHashSecretResult {
  const khusus = (env[IP_HASH_SECRET_ENV] ?? "").trim();
  if (khusus) return { secret: khusus, source: "dedicated", reason: "ok" };

  if (options.production) {
    return { secret: null, source: "none", reason: "missing_dedicated" };
  }

  // Di luar produksi secret relay boleh dipakai sebagai cadangan supaya
  // `ipHash` tidak hilang hanya karena satu environment belum diisi.
  // Hasilnya ditandai `hmac-sha256-fallback`, jadi kalau bocor ke produksi
  // terbaca sebagai penyimpangan, bukan konfigurasi yang wajar.
  const relay = (env[IP_HASH_FALLBACK_SECRET_ENV] ?? "").trim();
  return relay ? { secret: relay, source: "relay-fallback", reason: "ok" }
    : { secret: null, source: "none", reason: "missing_all" };
}

/**
 * Terjemahkan hasil pemilihan kunci menjadi nilai yang disimpan di baris.
 *
 * Dipisah dari `resolveIpHashSecret` supaya pemetaannya bisa diuji tanpa
 * menyalin logikanya ke setiap call site. Dua tempat memanggilnya, dan
 * kalau hanya salah satu yang benar, dua jalur yang tampak sama akan menulis
 * nilai berbeda untuk keadaan yang sama.
 */
export function ipHashMethodFor(result: IpHashSecretResult, formed: boolean): IpHashMethod {
  if (!formed) {
    return result.reason === "missing_dedicated" ? "missing-in-production" : "unavailable";
  }
  return result.source === "relay-fallback" ? "hmac-sha256-fallback" : "hmac-sha256";
}

/**
 * Label singkat untuk ditampilkan Security Desk.
 *
 * `undefined` berarti baris yang ditulis sebelum Fase 9.2, jadi tidak ada
 * status yang bisa dibaca. Itu tetap ditampilkan, tapi jujur sebagai
 * "tidak tercatat", bukan "tidak terdeteksi" - yang terakhir berarti kita
 * mencoba dan gagal, sedangkan ini berarti baris lama tidak pernah punya
 * keterangan itu sejak awal.
 */
export function describeTelemetryStatus(
  status: string | null | undefined,
): { label: string; tone: "ok" | "warn" | "bad" | "none" } {
  if (status === "complete") return { label: "Lengkap", tone: "ok" };
  if (status === "partial") {
    return { label: "Sebagian terkumpul", tone: "warn" };
  }
  if (status === "failed") {
    return { label: "Gagal terkirim", tone: "bad" };
  }
  return { label: "Tidak tercatat", tone: "none" };
}

/**
 * Label jalur relay. Nama internal `convex` tidak ditampilkan mentah ke
 * operator karena membingungkan: yang penting bagi operator adalah apakah
 * jalur ini memegang alamat IP, dan jalur langsung ke backend tidak
 * memegangnya.
 */
export function describeRelay(relay: string | null | undefined): string {
  if (relay === "vercel-edge") return "Relay edge (memegang IP)";
  if (relay === "convex") return "Langsung ke backend (tanpa IP)";
  if (relay === "rejected") return "Ditolak";
  if (relay === "unavailable") return "Tidak tersedia";
  return "Tidak tercatat";
}

/**
 * Cara `ipHash` dibentuk, dalam bahasa operator.
 *
 * `unavailable` sengaja dibedakan dari hash berkey: yang pertama berarti
 * korelasi lintas baris tidak bisa dilakukan lewat hash, yang kedua berarti
 * bisa tetapi hash-nya tidak bisa dicocokkan dengan daftar alamat yang sudah
 * diketahui.
 */
export function describeIpHashMethod(method: string | null | undefined): string {
  if (method === "hmac-sha256") return "HMAC-SHA-256 (kunci khusus)";
  if (method === "hmac-sha256-fallback")
    return "HMAC-SHA-256 (kunci cadangan - bukan untuk produksi)";
  if (method === "missing-in-production")
    return "Tidak dibuat - SERVER_IP_HASH_SECRET belum diisi";
  if (method === "unavailable") return "Tidak dibuat - tidak ada kunci";
  return "Tidak tercatat";
}

/** Field yang boleh ikut ke log. Dipakai sebagai daftar putih, bukan hitam. */
export type SafeTelemetryLog = {
  type: "security_telemetry";
  eventId?: string | null;
  attemptCode?: string | null;
  relay: TelemetryRelay;
  relayTraceId?: string | null;
  requestId?: string | null;
  telemetryStatus: TelemetryStatus;
  ipSource?: string | null;
  ipHashMethod?: IpHashMethod | null;
  geoResolved: boolean;
  outcome?: string | null;
  rejection?: string | null;
};

const clip = (value: string | null | undefined, max: number) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/**
 * Bentuk baris log yang aman.
 *
 * Daftar putih, bukan daftar hitam. Field yang tidak disebut di sini tidak
 * punya jalan masuk ke log sama sekali, jadi `ip` mentah, `secret`, passcode,
 * atau token sesi tidak bisa bocor karena ada field baru yang tidak diingat.
 *
 * Tidak ada IP di sini, juga tidak ada yang mirip IP. Yang ada adalah
 * `ipSource` dan `ipHashMethod`, dua keterangan tentang asal dan mutu
 * bukti - bukan bukti itu sendiri.
 */
export function buildTelemetryLog(input: {
  relay: TelemetryRelay;
  telemetryStatus: TelemetryStatus;
  geoResolved: boolean;
  eventId?: string | null;
  attemptCode?: string | null;
  relayTraceId?: string | null;
  requestId?: string | null;
  ipSource?: string | null;
  ipHashMethod?: IpHashMethod | null;
  outcome?: string | null;
  rejection?: string | null;
}): SafeTelemetryLog {
  return {
    type: "security_telemetry",
    relay: input.relay,
    telemetryStatus: input.telemetryStatus,
    geoResolved: input.geoResolved,
    eventId: clip(input.eventId, 40),
    attemptCode: clip(input.attemptCode, 24),
    relayTraceId: clip(input.relayTraceId, 32),
    requestId: clip(input.requestId, 40),
    ipSource: clip(input.ipSource, 40),
    ipHashMethod: input.ipHashMethod ?? null,
    outcome: clip(input.outcome, 32),
    rejection: clip(input.rejection, 40),
  };
}