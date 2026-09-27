// Sisi klien untuk gerbang passcode admin.
//
// Yang dikumpulkan di sini sengaja dikit: ID perangkat acak, user agent, zona
// waktu, dan bahasa.
//
// TENTANG IP: sengaja tidak dikirim. Frontend tidak bisa mengetahui IP klien,
// dan tidak ada endpoint di proyek ini yang meneruskannya. Architektur Convex
// tidak mengekspos IP asli permintaan, jadi mengarangnya hanya akan menghasilkan
// log yang tampak lengkap padahal kosong. Field `reportedIp` di server sengaja
// dibiarkan kosong untuk suatu saat diisi reverse proxy, dan selalu ditampilkan
// tersamar.

import { useCallback, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";

const DEVICE_ID_KEY = "bk.device-id";

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

export type GateAlert = {
  emailMasked: string | null;
  reportedIp: string | null;
  userAgent: string | null;
  timezone: string | null;
  locale: string | null;
  failedAttempts: number;
};

export type PasscodeState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "granted"; ticket: string; expiresAt: number }
  | { kind: "invalid"; message: string; remaining: number }
  | { kind: "locked"; lockedUntil: number; message: string; alert: GateAlert }
  | { kind: "unconfigured"; message: string };

export function useAdminPasscodeGate() {
  const convex = useConvex();
  const [state, setState] = useState<PasscodeState>({ kind: "idle" });

  const submit = useCallback(
    async (passcode: string) => {
      setState({ kind: "checking" });
      try {
        const result = await convex.action(api.adminGate.verifyAdminPasscode, {
          passcode,
          deviceId: readDeviceId(),
          userAgent: navigator.userAgent,
          timezone: readTimeZone(),
          locale: navigator.language,
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
    [convex],
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
