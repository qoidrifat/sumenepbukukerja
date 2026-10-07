import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type OtpStatus = { enabled: boolean; known: boolean };

/** Batas menunggu jawaban server sebelum pintu dibuka provisional. */
export const OTP_STATUS_TIMEOUT_MS = 500;

/**
 * Aturan seragam pintu OTP (murni, unit-tested):
 * - Server SUDAH menjawab → pakai jawabannya (mati tetap mati).
 * - Server BELUM menjawab + masih segar → tutup (skeleton, tanpa flash fallback).
 * - Server BELUM menjawab + lewat batas → BUKA provisional: izinkan coba,
 *   validasi sungguhan terjadi saat kirim (konsisten dengan `otpDisabled`
 *   di `email-otp-flow.tsx`, dan kegagalan kirim tampil jujur di sana).
 */
export function resolveOtpGate(
  status: { enabled: boolean } | undefined,
  timedOut: boolean,
): OtpStatus {
  if (status !== undefined) return { enabled: status.enabled === true, known: true };
  if (timedOut) return { enabled: true, known: false };
  return { enabled: false, known: false };
}

export function useOtpStatus(): OtpStatus {
  const [timedOut, setTimedOut] = useState(false);
  let status: { enabled: boolean } | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    status = useQuery(api.otpEmail.status);
  } catch {
    // Kegagalan query = belum terjawab juga: biarkan timeout yang memutuskan
    // (provisional), bukan skeleton abadi. Tanpa tangkapan, lemparan naik ke
    // RootErrorBoundary dan SELURUH /auth mati (regresi ERR-20261005-0O72S0A).
  }
  const pending = status === undefined;
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTimedOut(true), OTP_STATUS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  return resolveOtpGate(status, timedOut);
}
