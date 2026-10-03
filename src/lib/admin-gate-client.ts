// Sisi klien untuk gerbang passcode admin.
//
// Yang dikirim dari sini sengaja dipisah dua kelompok:
//
//  1. Metadata lingkungan (viewport, platform, titik sentuh, device pixel
//     ratio). Ini bukan bahan keputusan keamanan, hanya membantu enak dibaca
//     saat insiden. Tidak ada canvas/GPU/audio/font fingerprint yang diambil.
//
//  2. Token konteks yang diperoleh dari `POST /admin-gate/context`. Konteks itu
//     yang membaca header permintaan di sisi server, karena `ctx` pada action
//     Convex tidak punya akses `request` sama sekali. Browser tidak pernah
//     mencoba menebak IP-nya sendiri — kalau beacon gagal, auditnya jadi lebih
//     tipis dan login tetap berjalan.

import { useCallback, useState } from "react";
import { RELAY_PATH, convexSiteUrl } from "./admin-context-relay";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";

/* `convexSiteUrl` tinggal diekspor ulang dari modul relay supaya berkas ini
   tidak punya salinan kedua dari koreksi yang sama. Pemanggil di luar repo
   ikut rusak kalau hanya satu sisinya yang diperbarui. */
export { convexSiteUrl };

const DEVICE_ID_KEY = "bk.device-id";
/**
 * Route langsung ke Convex. Dipakai sebagai cadangan.
 *
 * Rute ini dipanggil dari origin berbeda, jadi butuh CORS allowlist di
 * backend. Kalau allowlist kosong, backend menjawab preflight TANPA
 * `access-control-allow-origin` dan peramban memblokir beacon - itu kondisi
 * produksi sebelum relay ada, dan gejalanya persis "IP tidak terdeteksi"
 * padahal request-nya sebenarnya sampai.
 */
const CONTEXT_ROUTE = "/admin-gate/context";
/**
 * Relay same-origin. Dipakai lebih dulu karena inilah jalur yang benar-benar
 * punya alamat IP: permintaan ke origin sendiri melewati Vercel, sehingga
 * header IP dan geo benar-benar ada. Same-origin juga berarti tidak ada
 * preflight sama sekali.
 */
const RELAY_URL = RELAY_PATH;
const CONTEXT_TIMEOUT_MS = 2_500;


/**
 * ID perangkat acak, hanya untuk membedakan rate limit antar perangkat. Bukan
 * pengenal yang stabil, dan sengaja bisa dihapus pengguna — itu sebabnya ada
 * juga plafon global di server.
 */
function readDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const created = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // Mode privat atau storage diblokir: pakai id yang hanya hidup di memory.
    return `mem-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/** Zona waktu browser. Petunjuk lokasi kasar, tanpa presisi yang mengganggu. */
function readTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Metadata tampilan perangkat. Tidak pernah dipakai keputusan keamanan. */
function readClientEnvironment() {
  if (typeof window === "undefined") {
    return {} as {
      platform?: string;
      viewportWidth?: number;
      viewportHeight?: number;
      devicePixelRatio?: number;
      touchPoints?: number;
    };
  }
  return {
    platform: window.navigator.platform || undefined,
    viewportWidth: Math.round(window.innerWidth) || undefined,
    viewportHeight: Math.round(window.innerHeight) || undefined,
    devicePixelRatio: Math.round((window.devicePixelRatio ?? 1) * 100) / 100 || undefined,
    touchPoints: Number.isFinite(window.navigator.maxTouchPoints)
      ? window.navigator.maxTouchPoints
      : undefined,
  };
}

type ServerContext = {
  contextId: string | null;
  requestId: string | null;
  ipMasked: string | null;
  ipSource: string;
  ipFamily: string;
  ipTrust: string;
  proxyDetected: boolean;
  chainLength: number;
  geoResolved: boolean;
};

const EMPTY_CONTEXT: ServerContext = {
  contextId: null,
  requestId: null,
  ipMasked: null,
  ipSource: "Unknown",
  ipFamily: "unknown",
  ipTrust: "unknown",
  proxyDetected: false,
  chainLength: 0,
  geoResolved: false,
};

/**
 * Satu percobaan ke satu endpoint. Timeout pendek supaya halaman auth tidak
 * menunggu; hasilnya dinormalisasi sehingga bentuknya sama apa pun yang
 * terjadi di jaringan.
 */
async function askContext(url: string): Promise<ServerContext> {
  try {
    const response = await fetch(url, {
      method: "POST",
      // `text/plain` adalah simple header, jadi browser tidak perlu preflight.
      // Body-nya tetap JSON; route ini tidak pernah mem-parsing body.
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: "{}",
      signal: AbortSignal.timeout(CONTEXT_TIMEOUT_MS),
    });
    if (!response.ok) return EMPTY_CONTEXT;
    const payload = (await response.json()) as Partial<ServerContext>;
    return {
      contextId: payload.contextId ?? null,
      requestId: payload.requestId ?? null,
      ipMasked: payload.ipMasked ?? null,
      ipSource: payload.ipSource ?? "Unknown",
      ipFamily: payload.ipFamily ?? "unknown",
      ipTrust: payload.ipTrust ?? "unknown",
      proxyDetected: payload.proxyDetected === true,
      chainLength: Number.isFinite(payload.chainLength) ? Number(payload.chainLength) : 0,
      geoResolved: payload.geoResolved === true,
    };
  } catch {
    return EMPTY_CONTEXT;
  }
}

/**
 * Minta satu kali jejak header ke server.
 *
 * Urutannya bukan formalitas: relay dicoba lebih dulu karena hanya jalur itu
 * yang menghasilkan IP sungguhan. Route langsung ke Convex tetap dicoba
 * sebagai cadangan supaya instalasi yang belum mengaktifkan relay tidak
 * kehilangan device, locale, dan zona waktu.
 *
 * Kegagalan diam-diam diabaikan di kedua percobaan - login tidak boleh
 * bergantung pada audit.
 */
async function fetchServerContext(cloudUrl: string): Promise<ServerContext> {
  const lewatRelay = await askContext(RELAY_URL);
  if (lewatRelay.contextId) return lewatRelay;
  return askContext(`${convexSiteUrl(cloudUrl)}${CONTEXT_ROUTE}`);
}

export type GateAlert = {
  emailMasked: string | null;
  reportedIp: string | null;
  userAgent: string | null;
  timezone: string | null;
  locale: string | null;
  ipMasked: string | null;
  ipSource: string | null;
  requestId: string | null;
  failedAttempts: number;
};

export type PasscodeState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "granted"; ticket: string; expiresAt: number }
  | { kind: "invalid"; message: string; remaining: number }
  | { kind: "locked"; lockedUntil: number; message: string; alert: GateAlert }
  | { kind: "unconfigured"; message: string };

export function useAdminPasscodeGate(options: { route?: string; returnTo?: string | null } = {}) {
  const convex = useConvex();
  const [state, setState] = useState<PasscodeState>({ kind: "idle" });
  const { route, returnTo } = options;

  const submit = useCallback(
    async (passcode: string) => {
      setState({ kind: "checking" });
      try {
        // Konteks diambil lebih dulu supaya IP, request id, dan header yang
        // dibaca server ikut tercatat bersama percobaan ini.
        const [serverContext, environment] = await Promise.all([
          fetchServerContext(convex.url),
          Promise.resolve(readClientEnvironment()),
        ]);
        const result = await convex.action(api.adminGate.verifyAdminPasscode, {
          passcode,
          deviceId: readDeviceId(),
          userAgent: navigator.userAgent,
          timezone: readTimeZone(),
          locale: navigator.language,
          contextId: serverContext.contextId ?? undefined,
          route,
          returnTo: returnTo ?? undefined,
          ...environment,
        });
        if (result.ok) {
          setState({ kind: "granted", ticket: result.ticket, expiresAt: result.expiresAt });
          return true;
        }
        if (result.reason === "unconfigured") {
          setState({
            kind: "unconfigured",
            message: "Passcode admin belum dikonfigurasi di server.",
          });
          return false;
        }
        if (result.reason === "locked") {
          const lockedUntil = result.lockedUntil ?? Date.now() + 60 * 60_000;
          setState({
            kind: "locked",
            lockedUntil,
            message: "Percobaan habis. Ruang ini terkunci selama satu jam.",
            alert: result.alert ?? {
              emailMasked: null,
              reportedIp: null,
              userAgent: null,
              timezone: null,
              locale: null,
              ipMasked: serverContext.ipMasked,
              ipSource: serverContext.ipSource,
              requestId: null,
              failedAttempts: 0,
            },
          });
          return false;
        }
        setState({
          kind: "invalid",
          remaining: result.remaining,
          message:
            result.remaining > 0
              ? `Passcode belum tepat. Sisa percobaan: ${result.remaining}.`
              : "Passcode belum tepat.",
        });
        return false;
      } catch (caught) {
        setState({
          kind: "invalid",
          remaining: 0,
          message:
            caught instanceof Error
              ? caught.message
              : "Passcode belum dapat diperiksa. Coba lagi.",
        });
        return false;
      }
    },
    [convex, route, returnTo],
  );

  /** Dipanggil sebelum verifikasi email, untuk menukar tiket sekali pakai. */
  const redeem = useCallback(
    async (ticket: string, email: string) => {
      const result = await convex.action(api.adminGate.verifyAdminTicket, { ticket, email });
      return result.ok;
    },
    [convex],
  );

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, submit, redeem, reset };
}
