import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type OtpStatus = { enabled: boolean; known: boolean };

/**
 * Status pintu Email OTP yang tahan terhadap kegagalan query.
 *
 * `useQuery` MELEMPAR saat server error (backend belum di-deploy, fungsi
 * belum sync, jaringan putus). Tanpa tangkapan, lemparan naik ke
 * RootErrorBoundary dan SELURUH halaman /auth mati dengan dialog "mengalami
 * gangguan" — padahal pintu Google sehat (regresi ERR-20261005-0O72S0A).
 *
 * Hook ini menangkap lemparan itu di badan render dan mengunci status
 * "mati-tak-diketahui", sehingga Auth jatuh ke mode Google-saja. Begitu
 * query menjawab normal lagi, kait dilepas dan status live dipakai.
 *
 * `setQueryFailed` di badan render adalah render-phase update untuk state
 * komponen SENDIRI (pola React yang diizinkan, bukan efek), jadi aman dari
 * aturan `react-hooks/set-state-in-effect` dan urutan hook tidak berubah:
 * `useQuery` tetap dipanggil di setiap render.
 */
export function useOtpStatus(): OtpStatus {
  const [queryFailed, setQueryFailed] = useState(false);
  let status: { enabled: boolean } | undefined;
  try {
    // Panggilan di bawah TIDAK kondisional: blok try selalu dieksekusi dan
    // tidak ada return sebelum baris ini, jadi urutan hook identik di setiap
    // render. try/catch hanya menelan lemparan server-error Convex.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    status = useQuery(api.otpEmail.status);
  } catch {
    // Gagal: kunci mode degradasi. `if` mencegah loop — setelah true,
    // pemanggilan berikutnya no-op karena nilai sama.
    if (!queryFailed) setQueryFailed(true);
    return { enabled: false, known: false };
  }
  // Pulih: query menjawab lagi, lepas kait degradasi.
  if (queryFailed) setQueryFailed(false);
  if (status === undefined) return { enabled: false, known: false };
  return { enabled: status.enabled === true, known: true };
}
