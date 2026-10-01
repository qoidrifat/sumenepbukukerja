import { api } from "@/convex/_generated/api";
import { TimeStampLabel } from "@/components/admin-workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation } from "convex/react";
import { LogOut, ShieldCheck, ShieldOff, TriangleAlert, UserCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Kontrol pencabutan sesi pada satu kartu Security Desk.
 *
 * Enam keadaan, masing-masing dengan tindakan yang berbeda. Tidak ada tombol
 * yang hanya mengubah tampilan:
 *
 *  - `active`    sesi hidup di perangkat lain → tombol merah + dialog konfirmasi.
 *  - `current`   perangkat yang sedang dipakai → tombol dengan peringatan
 *                konsekuensi, lalu signOut + redirect (bukan label pasif).
 *  - `revoked`   sudah dicabut → badge mati beserta waktunya.
 *  - `expired`   sesi sudah berakhir sendiri → badge, tanpa aksi.
 *  - `untracked` baris lama sebelum fitur ini ada → label, bukan error.
 *  - `none`      percobaan gagal/terkunci → tidak tampil.
 *
 * Default-nya "tidak tampil" untuk state yang belum dikenal, supaya state
 * baru suatu hari tidak muncul diam-diam sebagai tombol yang tak pernah bekerja.
 *
 * CATATAN TEMA: dialog ini dulu memakai `DialogContent` polos. Karena dialog
 * dirender lewat portal Radix, isinya berada DI LUAR `.admin-workspace`, jadi
 * `admin-btn` dan `admin-btn-danger` di dalamnya tidak punya satu pun aturan
 * yang berlaku. Hasilnya: tombol merah dan tombol batal tampil seperti tombol
 * aplikasi biasa, dengan kotak putih melengkung di tengah panel kuning -
 * satu-satunya dialog admin yang benar-benar terlihat seperti sisipan dari
 * luar. Sekarang dialog ini memakai scope yang sama dengan dialog passcode dan
 * panel profil, jadi seluruhnya sekeluarga.
 */

export type SessionState =
  | "none"
  | "untracked"
  | "active"
  | "current"
  | "revoked"
  | "expired";

const REASON_LABEL: Record<string, string> = {
  SESSION_NOT_FOUND: "Sesi ini sudah tidak terlacak. Muat ulang Security Desk.",
  NOT_A_SUCCESSFUL_ATTEMPT: "Hanya percobaan berhasil yang punya sesi.",
  ATTEMPT_NOT_FOUND: "Percobaan ini sudah tidak ada.",
  UNKNOWN: "Sesi ini tidak bisa dicabut.",
};

const note = "text-xs font-medium leading-5 text-[#525252]";

export function SessionRevokeControl({
  attemptId,
  sessionState,
  sessionRevokedAt,
  deviceLabel,
  loginAt,
  ipMasked,
  onSelfRevoked,
}: {
  attemptId: string;
  sessionState: SessionState | undefined;
  sessionRevokedAt?: number | null;
  deviceLabel: string;
  loginAt: number;
  ipMasked: string | null;
  /** Dipanggil setelah sesi milik perangkat ini sendiri dicabut. */
  onSelfRevoked: () => void;
}) {
  if (sessionState === "revoked") {
    return (
      <p className={`flex items-start gap-1.5 ${note}`}>
        <ShieldOff className="mt-0.5 size-3.5 shrink-0 text-[#7C2D12]" aria-hidden="true" />
        <span>
          <span className="font-black text-[#7C2D12]">Sesi telah dicabut.</span>{" "}
          {sessionRevokedAt ? <TimeStampLabel timestamp={sessionRevokedAt} /> : null} Perangkat ini
          ditolak di server sejak saat itu.
        </span>
      </p>
    );
  }

  if (sessionState === "expired") {
    return (
      <p className={`flex items-start gap-1.5 ${note}`}>
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>Sesi telah berakhir — perangkat ini sudah keluar sendiri.</span>
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

  if (sessionState !== "active" && sessionState !== "current") return null;

  return (
    <RevokeButton
      attemptId={attemptId}
      isCurrentSession={sessionState === "current"}
      deviceLabel={deviceLabel}
      loginAt={loginAt}
      ipMasked={ipMasked}
      onSelfRevoked={onSelfRevoked}
    />
  );
}

function RevokeButton({
  attemptId,
  isCurrentSession,
  deviceLabel,
  loginAt,
  ipMasked,
  onSelfRevoked,
}: {
  attemptId: string;
  isCurrentSession: boolean;
  deviceLabel: string;
  loginAt: number;
  ipMasked: string | null;
  onSelfRevoked: () => void;
}) {
  const revoke = useMutation(api.adminGate.revokeAdminSession);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const headingId = `revoke-heading-${attemptId}`;
  const descriptionId = `revoke-desc-${attemptId}`;

  // Fokus dikembalikan ke pemicu setelah dialog ditutup, baik karena Batal
  // maupun karena selesai. Tanpa ini, pengguna keyboard kehilangan tempatnya
  // dan harus memindai seluruh halaman untuk menemukan tombolnya lagi.
  useEffect(() => {
    if (!open) triggerRef.current?.focus();
  }, [open]);

  const handleRevoke = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await revoke({ attemptId: attemptId as never });
      if (!result.ok) {
        setError(REASON_LABEL[result.reason] ?? REASON_LABEL.UNKNOWN);
        return;
      }
      if (result.alreadyRevoked) {
        // Bukan error: pencatatan ini memang sudah berstatus dicabut.
        setOpen(false);
        setNotice(
          result.revokedAt
            ? "Sesi sudah dicabut."
            : "Sesi ini sudah dicabut.",
        );
        return;
      }
      if (result.selfRevoked) {
        // Server sudah mencabut sesi ini juga. Meninggalkan browser di sini
        // akan menyisakan UI aktif yang tidak lagi didukung server.
        onSelfRevoked();
        return;
      }
      setOpen(false);
      setNotice("Sesi berhasil dicabut.");
    } catch {
      setError("Sesi ini tidak bisa dicabut sekarang. Coba lagi sebentar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setError(null);
          setNotice(null);
          setOpen(true);
        }}
        disabled={busy}
        className="admin-btn admin-btn-danger w-full shrink-0 gap-1.5 px-2.5 text-xs sm:w-auto"
      >
        {isCurrentSession ? (
          <UserCheck className="size-3.5" aria-hidden="true" />
        ) : (
          <LogOut className="size-3.5" aria-hidden="true" />
        )}
        {isCurrentSession ? "Logout dari perangkat ini" : "Logout dari sesi ini"}
      </button>

      {/* Penanda "ini sesi Anda sendiri" harus terlihat sebelum dialog dibuka.
          Kalau tidak, operator tidak punya cara tahu tombol mana yang
          mengeluarkan dia sendiri dan mana yang mengeluarkan orang lain. */}
      {isCurrentSession ? (
        <span className="flex items-center gap-1.5 text-xs font-black text-[#24533A]">
          <UserCheck className="size-3.5 shrink-0" aria-hidden="true" />
          Sesi Anda saat ini
        </span>
      ) : null}

      {notice ? (
        <p className={`flex items-start gap-1.5 ${note}`} role="status">
          <ShieldOff className="mt-0.5 size-3.5 shrink-0 text-[#7C2D12]" aria-hidden="true" />
          <span>
            {notice}{" "}
            {isCurrentSession ? "Anda akan dikeluarkan dari ruang admin." : null}
          </span>
        </p>
      ) : null}
      {error && !open ? (
        <p className={note} role="alert">
          {error}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <DialogContent
          className="admin-dialog-content mx-auto"
          overlayClassName="admin-dialog-overlay"
          showCloseButton={false}
          aria-labelledby={headingId}
          aria-describedby={descriptionId}
        >
          <div className="border-b-2 border-[#121212] bg-[#FFE662] px-4 py-4 sm:px-5">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#525252]">
              Keamanan ruang admin
            </p>
            <DialogTitle id={headingId} className="mt-1 text-xl font-black text-[#121212]">
              {isCurrentSession ? "Keluar dari sesi ini?" : "Cabut akses sesi ini?"}
            </DialogTitle>
            <DialogDescription id={descriptionId} className="mt-2 text-sm leading-6 text-[#1A1A1A]">
              {isCurrentSession
                ? "Ini adalah sesi yang sedang Anda gunakan. Melanjutkan akan mengakhiri akses admin pada perangkat ini, lalu Anda diarahkan kembali ke halaman masuk. Sesi di perangkat lain tidak tersentuh."
                : "Perangkat tersebut akan langsung dikeluarkan dari ruang admin. Sesi di perangkat ini berakhir saat itu juga; perangkat lain milik Anda tidak tersentuh."}
            </DialogDescription>
          </div>

          <div className="px-4 py-4 sm:px-5">
          <dl className="border-2 border-[#121212] bg-[#F5F0E5] p-3 text-left text-sm">
            <DetailRow label="Perangkat" value={deviceLabel} />
            <DetailRow
              label="Waktu login"
              value={<TimeStampLabel timestamp={loginAt} withSeconds />}
            />
            <DetailRow label="IP" value={ipMasked ?? "Tidak diketahui"} />
            <DetailRow label="Status" value={isCurrentSession ? "Sesi Anda saat ini" : "Sesi aktif"} />
          </dl>

          {isCurrentSession ? (
            <p className="mt-3 flex items-start gap-2 border-2 border-[#121212] bg-[#E9B4A7] px-3 py-2 text-sm font-bold text-[#7C2D12]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Anda akan langsung keluar dari ruang admin setelah melanjutkan.
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 border-2 border-[#121212] bg-white px-3 py-2 text-sm font-black text-[#7C2D12]" role="alert">
              {error}
            </p>
          ) : null}

          <p aria-live="polite" className="sr-only">
            {busy ? "Sedang mencabut sesi" : ""}
          </p>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="admin-btn admin-btn-quiet order-2 w-full sm:order-1 sm:w-auto"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={busy}
              className="admin-btn admin-btn-danger order-1 w-full sm:order-2 sm:w-auto"
            >
              {busy
                ? "Mengcabut..."
                : isCurrentSession
                  ? "Ya, keluar dari sesi ini"
                  : "Ya, cabut sesi ini"}
            </button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-baseline sm:gap-2">
      <dt className="shrink-0 text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#525252] sm:w-24">
        {label}
      </dt>
      <dd className="min-w-0 break-words font-bold text-[#1A1A1A]">{value}</dd>
    </div>
  );
}
