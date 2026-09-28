import { api } from "@/convex/_generated/api";
import { TimeStampLabel } from "@/components/admin-workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation } from "convex/react";
import { LogOut, ShieldCheck, ShieldOff, UserCheck } from "lucide-react";
import { useState } from "react";

/**
 * Tombol "Logout dari sesi ini" pada satu kartu percobaan di Security Desk.
 *
 * Empat keadaan, dan masing-masing punya tindakan yang berbeda — tidak ada
 * tombol yang hanya mengubah tampilan:
 *
 *  - `active`    sesi hidup di perangkat lain → tombol merah + dialog konfirmasi.
 *  - `current`   ini perangkat yang sedang dipakai → label saja. Mencabut sesi
 *                sendiri lewat jalur ini akan berubah jadi "matikan semua sesi",
 *                jadi keluar lewat panel "Sesi Anda" di atas ruang admin.
 *  - `revoked`   sudah dicabut → badge mati beserta waktunya.
 *  - `untracked` baris lama sebelum fitur ini ada → tombol nonaktif, bukan
 *                error, karena memang tidak ada yang bisa dicabut.
 *
 * Setelah mutasi berhasil, kartu berubah reaktif sendiri lewat
 * `sessionRevokedAt` yang comes dari server. Tidak ada `setState` lokal yang
 * menahan tampilan tetap "aktif".
 */

export type SessionState = "none" | "untracked" | "active" | "current" | "revoked";

const REASON_LABEL: Record<string, string> = {
  SESSION_NOT_FOUND: "Sesi ini sudah tidak terlacak. Muat ulang Security Desk.",
  NOT_A_SUCCESSFUL_ATTEMPT: "Hanya percobaan berhasil yang punya sesi.",
  CURRENT_SESSION: "Ini sesi yang sedang Anda pakai. Keluar lewat panel Sesi Anda.",
  ATTEMPT_NOT_FOUND: "Percobaan ini sudah tidak ada.",
};

const note = "text-xs font-medium leading-5 text-[#525252]";

export function SessionRevokeControl({
  attemptId,
  sessionState,
  sessionRevokedAt,
  deviceLabel,
}: {
  attemptId: string;
  sessionState: SessionState | undefined;
  sessionRevokedAt?: number | null;
  deviceLabel: string;
}) {
  if (sessionState === "current") {
    return (
      <p className={`flex items-start gap-1.5 ${note}`}>
        <UserCheck className="mt-0.5 size-3.5 shrink-0 text-[#24533A]" aria-hidden="true" />
        <span>
          <span className="font-black text-[#24533A]">Sesi Anda saat ini.</span> Untuk keluar
          dari perangkat ini, pakai tombol Logout di panel Sesi Anda.
        </span>
      </p>
    );
  }

  if (sessionState === "revoked") {
    return (
      <p className={`flex items-start gap-1.5 ${note}`}>
        <ShieldOff className="mt-0.5 size-3.5 shrink-0 text-[#7C2D12]" aria-hidden="true" />
        <span>
          <span className="font-black text-[#7C2D12]">Sesi telah dicabut.</span>{" "}
          {sessionRevokedAt ? <TimeStampLabel timestamp={sessionRevokedAt} /> : null} Perangkat
          ini ditolak di server sejak saat itu.
        </span>
      </p>
    );
  }

  if (sessionState === "untracked") {
    return (
      <p className={`flex items-start gap-1.5 ${note}`}>
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>Sesi tidak terlacak — percobaan ini terjadi sebelum pencabutan sesi ada.</span>
      </p>
    );
  }

  // `none`, `undefined` (baris lama), dan state yang belum dikenal semuanya
  // berakhir di sini: tidak ada yang bisa dicabut, jadi tidak ada tombol.
  // Default-nya "tidak tampil", bukan "tampil" — supaya state baru yang
  // suatu hari ditambahkan tidak diam-diam muncul sebagai tombol yang tak pernah
  // bekerja.
  if (sessionState !== "active") return null;

  return <ActiveRevokeButton attemptId={attemptId} deviceLabel={deviceLabel} />;
}

/**
 * Dipisah ke komponen sendiri supaya hook `useMutation` hanya dibuat untuk
 * kartu yang benar-benar bisa dicabut. Kalau menyatu, Security Desk dengan banyak kartu akan mendaftarkan mutation hook untuk semuanya, termasuk
 * kartu yang tidak punya tombol sama sekali.
 */
function ActiveRevokeButton({
  attemptId,
  deviceLabel,
}: {
  attemptId: string;
  deviceLabel: string;
}) {
  const revoke = useMutation(api.adminGate.revokeAdminSession);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await revoke({ attemptId: attemptId as never });
      if (!result.ok) {
        setError(REASON_LABEL[result.reason] ?? "Sesi ini tidak bisa dicabut.");
        return;
      }
      setOpen(false);
    } catch {
      setError("Sesi ini tidak bisa dicabut sekarang. Coba lagi sebentar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={busy}
        className="admin-btn admin-btn-danger w-full shrink-0 gap-1.5 px-2.5 text-xs sm:w-auto"
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        Logout dari sesi ini
      </button>

      {error && !open ? (
        <p className={note} role="alert">
          {error}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cabut akses sesi ini?</DialogTitle>
            <DialogDescription>
              Perangkat tersebut ({deviceLabel}) akan langsung dikeluarkan dari ruang admin.
              Sesi di perangkat ini berakhir saat itu juga; perangkat lain milik Anda tidak
              tersentuh.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-sm font-bold text-[#7C2D12]" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="admin-btn admin-btn-quiet"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={busy}
              className="admin-btn admin-btn-danger"
            >
              {busy ? "Mengcabut..." : "Ya, cabut sesi ini"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
