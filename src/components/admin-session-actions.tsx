import { useCallback, useEffect, useState } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { ERROR_CODES } from "@/lib/error-reporting";
import { useNavigate } from "react-router";
import { Activity, Eye, EyeOff, KeyRound, LogOut, Monitor, Radio, ShieldCheck } from "lucide-react";

import { useCurrentAdminSession } from "@/lib/catalog-store";
import { useAuth } from "@/hooks/use-auth";
import { useErrorReporter } from "@/lib/error-reporter";
import { api } from "@/convex/_generated/api";
import { assessPasscode, PASSCODE_MIN_LENGTH } from "@/lib/admin-passcode";
import { convexSiteUrl } from "@/lib/admin-gate-client";
import { UNKNOWN_LABEL, describeIpSource } from "@/lib/security-context";
import { TimeStampLabel } from "@/components/admin-workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass } from "@/components/admin-workspace";
import { OWNER_ACCOUNT_TITLE } from "@/lib/owner-account";

/**
 * "Sesi Anda" + tindakan keamanan untuk ruang admin.
 *
 * Tiga hal yang dijaga di sini:
 *
 * 1. IP yang ditampilkan adalah bentuk yang diamati server. Panel ini memakai
 *    beacon yang sama dengan gerbang passcode, jadi angkanya bukan klaim
 *    browser dan bukan "what is my IP" dari klien.
 * 2. Logout benar-benar mencabut sesi. `signOut()` membatalkan JWT Convex Auth,
 *    jadi setiap query berikutnya ditolak server dan tombol Back tidak
 *    menghidupkan apa pun. Menavigasi ke /auth saja tidak akan cukup.
 * 3. Passcode tidak pernah masuk state React sebagai nilai yang bisa di-back,
 *    dan tidak pernah masuk pelaporan error.
 */

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5 border-b border-[#EDEAE0] py-1.5 last:border-b-0 sm:flex-row sm:gap-3">
    <dt className="shrink-0 text-[0.7rem] font-black uppercase leading-5 tracking-[0.08em] text-[#525252] sm:w-32">
      {label}
    </dt>
    <dd className="min-w-0 break-words text-sm font-bold leading-5 text-[#1A1A1A]">{children}</dd>
  </div>
);

const shown = (input: string | number | null | undefined) =>
  input === null || input === undefined || input === ""
    ? <span className="font-medium text-[#525252]">{UNKNOWN_LABEL}</span>
    : String(input);

/** Keterangan singkat per tingkat kekuatan, ditulis di satu tempat. */
const STRENGTH_NOTE: Record<"weak" | "fair" | "strong", string> = {
  weak: "Masih mudah ditebak",
  fair: "Cukup untuk ruang admin",
  strong: "Sulit ditebak",
};

/**
 * Satu baris isian passcode: label, kotak isian bertema admin, tombol lihat,
 * dan catatan kecil. Tombol lihat memakai `aria-pressed` supaya pembaca layar
 *pembaca layar tahu sedang menampilkan atau menyembunyikan nilai.
 */
function PasscodeField({
  id,
  label,
  value,
  revealed,
  autoComplete,
  hint,
  error,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  revealed: boolean;
  autoComplete: string;
  hint?: string;
  error?: string | null;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-black text-[#1A1A1A]">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-xs text-[#525252]">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-stretch gap-2">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          aria-describedby={error ? `${id}-error` : hint ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={revealed}
          aria-label={revealed ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`}
          className="admin-btn admin-btn-quiet w-12 shrink-0 px-0"
        >
          {revealed ? (
            <EyeOff className="size-5" aria-hidden="true" />
          ) : (
            <Eye className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-black text-[#7C2D12]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Indikator kekuatan memakai bentuk yang sudah dikenal di meja kerja admin:
 * kotak bertanda hub, bukan sekadar teks. Warna sendirinya tidak pernah jadi
 * satu-satunya pembawa makna — label dan catatan selalu ikut tertulis.
 */
function PasscodeStrength({
  assessment,
}: {
  assessment: { ok: boolean; level: "weak" | "fair" | "strong"; label: string; issues: string[] };
}) {
  const tone =
    assessment.level === "strong"
      ? { bar: "bg-[#24533A]", text: "text-[#24533A]", filled: 3 }
      : assessment.level === "fair"
        ? { bar: "bg-[#FF5A26]", text: "text-[#24533A]", filled: 2 }
        : { bar: "bg-[#7C2D12]", text: "text-[#7C2D12]", filled: 1 };

  return (
    <div className="border-2 border-[#121212] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm font-black ${tone.text}`}>
          Kekuatan passcode: {assessment.label}
        </p>
        <p className="text-xs text-[#525252]">{STRENGTH_NOTE[assessment.level]}</p>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((step) => (
          <span
            key={step}
            className={`h-2.5 flex-1 border-2 border-[#121212] ${
              step < tone.filled ? tone.bar : "bg-white"
            }`}
          />
        ))}
      </div>
      {assessment.issues.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs font-bold text-[#7C2D12]">
          {assessment.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Kirim satu jejak header ke server lalu minta server menalinkannya ke sesi
 * yang sedang aktif. Kegagalan diam-diam: panel tetap harus terbuka meski
 * beacon diblokir jaringan.
 */
function useAdminSessionBeacon() {
  const convex = useConvex();
  // Publik, tapi server tetap menolak pemanggil tanpa peran pengelola.
  const report = useMutation(api.adminGate.reportSessionContext);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(`${convexSiteUrl(convex.url)}/admin-gate/context`, {
          method: "POST",
          headers: { "content-type": "text/plain;charset=UTF-8" },
          body: "{}",
          signal: AbortSignal.timeout(2500),
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          contextId?: string | null;
          requestId?: string | null;
          ipMasked?: string | null;
          ipSource?: string | null;
          ipFamily?: string | null;
          userAgent?: string | null;
        };
        if (!payload.contextId) return;
        const deviceId = (() => {
          try {
            return window.localStorage.getItem("bk.device-id") ?? undefined;
          } catch {
            return undefined;
          }
        })();
        await report({
          token: payload.contextId,
          requestId: payload.requestId ?? undefined,
          ipMasked: payload.ipMasked ?? undefined,
          ipSource: payload.ipSource ?? undefined,
          ipFamily: payload.ipFamily ?? undefined,
          userAgent: payload.userAgent ?? window.navigator.userAgent,
          // Yang dikirim device id mentah; server yang meng-hash-nya, sama
          // seperti saat login. Mengirim sidik jadi dari klien membuat dua sisi
          // tidak bisa dibandingkan, dan device id mentah ikut tersimpan.
          deviceId,
        });
      } catch {
        // Beacon bukan syarat. Panel sesi tetap berguna tanpa IP.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [convex.url, report]);
}

export function AdminSessionActions() {
  const session = useCurrentAdminSession();
  const logout = useMutation(api.adminGate.logoutAdmin);
  // `changeAdminPasscode` adalah action: workhorse-nya PBKDF2, bukan write
  // langsung, karena ctx action tidak punya akses database.
  const changePasscode = useAction(api.adminGate.changeAdminPasscode);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const report = useErrorReporter();

  useAdminSessionBeacon();

  const [busy, setBusy] = useState(false);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revealed, setRevealed] = useState({ current: false, next: false, confirm: false });
  const passcodeDescriptionId = "admin-passcode-description";

  const assessment = next ? assessPasscode(next, current) : null;

  const handleLogout = useCallback(async () => {
    setBusy(true);
    try {
      // Jejak dulu, selesaikan sesi belakangan. Kalau pencatatan gagal, sesi
      // tetap harus dicabut — yang penting admin benar-benar keluar.
      try {
        await logout({ route: "/admin" });
      } catch (caught) {
        await report({
          kind: "operation",
          code: ERROR_CODES.adminLogoutAudit,
          feature: "Admin Security Desk",
          operation: "admin.logout.audit",
          route: "/admin",
          severity: "warning",
          message: "Jejak audit logout gagal dicatat; sesi tetap dicabut.",
          context: { reason: caught instanceof Error ? caught.message : "unknown" },
        });
      }
      await signOut();
      navigate("/auth?returnTo=%2Fadmin", { replace: true });
    } catch (caught) {
      setBusy(false);
      setNotice("");
      await report({
        kind: "operation",
        code: ERROR_CODES.adminLogout,
        feature: "Admin Security Desk",
        operation: "admin.logout",
        route: "/admin",
        severity: "error",
        message: "Sesi admin tidak dapat dicabut dari panel ini.",
        context: { reason: caught instanceof Error ? caught.message : "unknown" },
      });
    }
  }, [logout, signOut, navigate, report]);

  const handleChangePasscode = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError("");
      setNotice("");
      if (next !== confirm) {
        setError("Konfirmasi tidak cocok dengan passcode baru.");
        return;
      }
      setBusy(true);
      try {
        const result = await changePasscode({
          currentPasscode: current,
          newPasscode: next,
        });
        if (!result.ok) {
          // Kegagalan yang diharapkan: TIDAK dilaporkan ke sistem error dan
          // tidak memicu alert WhatsApp. Satu orang salah ketik bukan insiden.
          setError(
            result.reason === "wrong_current"
              ? "Passcode saat ini tidak cocok."
              : result.reason === "unauthorized"
                ? "Hanya admin yang dapat mengganti passcode."
                : result.reason === "unconfigured"
                  ? "Passcode admin belum dikonfigurasi di server."
                  : (result.issues?.[0] ?? "Passcode baru belum memenuhi syarat."),
          );
          setBusy(false);
          return;
        }
        setCurrent("");
        setNext("");
        setConfirm("");
        setPasscodeOpen(false);
        setNotice(
          `Passcode berhasil diubah${result.revokedTickets > 0 ? `. ${result.revokedTickets} tiket masuk yang masih terbuka dicabut.` : "."}`,
        );
      } catch (caught) {
        setBusy(false);
        await report({
          kind: "operation",
          code: ERROR_CODES.adminPasscodeChange,
          feature: "Admin Security Desk",
          operation: "admin.changePasscode",
          route: "/admin",
          severity: "error",
          message: "Permintaan ganti passcode gagal diproses server.",
          // Passcode tidak pernah ikut di sini, hanya alasan gagalnya.
          context: { reason: caught instanceof Error ? caught.message : "unknown" },
        });
      }
    },
    [changePasscode, current, next, confirm, report],
  );

  const deviceLine = session
    ? [session.os, session.browser, session.deviceType].filter(Boolean).join(" · ")
    : "";

  return (
    <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-[#1A1A1A]">Sesi Anda</h3>
          <p className="mt-1 text-sm leading-6 text-[#525252]">
            Konteks yang diamati server untuk sesi ini. Nilai disamarkan, dan tidak ada
            passcode, token, atau cookie yang pernah sampai ke panel ini.
          </p>
        </div>
        {session ? (
          <span
            className={`inline-flex shrink-0 items-center gap-2 border-2 border-[#121212] px-2.5 py-1 text-xs font-black ${
              session.active ? "bg-[#DCEBD7] text-[#24533A]" : "bg-[#F1EDE3] text-[#525252]"
            }`}
          >
            {session.active ? (
              <Radio className="size-4" aria-hidden="true" />
            ) : (
              <Activity className="size-4" aria-hidden="true" />
            )}
            {session.active ? "Aktif" : "Terakhir terlihat"}
          </span>
        ) : null}
      </div>

      {session ? (
        <dl className="mt-3 grid gap-x-6 md:grid-cols-2">
          <Row label="Peran">{session.isOwnerAccount ? OWNER_ACCOUNT_TITLE : session.role}</Row>
          <Row label="Nama akun">{shown(session.name)}</Row>
          <Row label="Masuk sejak">
            {session.signedInAt ? <TimeStampLabel timestamp={session.signedInAt} withSeconds /> : shown(null)}
          </Row>
          <Row label="Aktivitas terakhir">
            {session.lastSeenAt ? <TimeStampLabel timestamp={session.lastSeenAt} withSeconds /> : shown(null)}
          </Row>
          <Row label="IP">
            {session.ipMasked ? `${session.ipMasked} · ${session.ipFamily ?? "—"}` : shown(null)}
          </Row>
          <Row label="Sumber IP">{describeIpSource(session.ipSource)}</Row>
          <Row label="Perangkat">{shown(deviceLine)}</Row>
          <Row label="Zona waktu">{shown(session.timezone)}</Row>
          <Row label="Sidik sesi">{shown(session.sessionFingerprint)}</Row>
          <Row label="Request ID">{shown(session.requestId)}</Row>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[#525252]">Memuat konteks sesi...</p>
      )}

      <div className="mt-4 border-t-2 border-[#121212] pt-3">
        <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#525252]">
          Tindakan keamanan
        </h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {/* Passcode hanya milik akun pemilik. Tombolnya disembunyikan untuk
              yang lain, dan server juga menolaknya — lihat
              `changeAdminPasscode`. Menyembunyikan tombol saja tidak cukup,
              tapi menyembunyikannya pun tetap langkah yang benar. */}
          {session?.isOwnerAccount ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setPasscodeOpen(true)}
              className="admin-btn admin-btn-secondary inline-flex min-h-12"
            >
              <KeyRound className="size-5" aria-hidden="true" />
              Ubah passcode
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleLogout()}
            className="admin-btn admin-btn-danger inline-flex min-h-12"
          >
            <LogOut className="size-5" aria-hidden="true" />
            {busy ? "Mengakhiri sesi..." : "Logout"}
          </button>
        </div>
        <p className="mt-2 flex items-start gap-2 text-xs leading-6 text-[#525252]">
          <Monitor className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Logout mencabut sesi di server, bukan sekadar memindahkan halaman. Setelah keluar,
          setiap permintaan ke ruang admin ditolak sampai Anda masuk lagi dengan passcode baru.
        </p>
      </div>

      {notice ? (
        <p className="mt-3 flex items-start gap-2 text-sm font-black text-[#24533A]" role="status">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      <Dialog open={passcodeOpen} onOpenChange={setPasscodeOpen}>
        <DialogContent className="admin-dialog-content" overlayClassName="admin-dialog-overlay">
          <div className="border-b-2 border-[#121212] bg-[#FFE662] px-4 py-4 sm:px-5">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#525252]">
              Keamanan ruang admin
            </p>
            <DialogTitle className="mt-1 text-xl font-black text-[#121212]">
              Ubah passcode admin
            </DialogTitle>
            <DialogDescription
              id={passcodeDescriptionId}
              className="mt-2 text-sm leading-6 text-[#1A1A1A]"
            >
              Minimal {PASSCODE_MIN_LENGTH} karakter. Passcode baru harus berbeda dari yang
              lama, dan tidak boleh sama persis. Setelah diganti, setiap tiket masuk yang
              masih terbuka ikut dicabut.
            </DialogDescription>
          </div>

          <form
            onSubmit={handleChangePasscode}
            aria-describedby={passcodeDescriptionId}
            className="space-y-3 px-4 py-4 sm:px-5"
          >
            <PasscodeField
              id="admin-passcode-current"
              label="Passcode saat ini"
              value={current}
              revealed={revealed.current}
              autoComplete="current-password"
              onChange={setCurrent}
              onToggle={() => setRevealed((r) => ({ ...r, current: !r.current }))}
            />
            <PasscodeField
              id="admin-passcode-new"
              label="Passcode baru"
              value={next}
              revealed={revealed.next}
              autoComplete="new-password"
              hint={`Minimal ${PASSCODE_MIN_LENGTH} karakter`}
              onChange={setNext}
              onToggle={() => setRevealed((r) => ({ ...r, next: !r.next }))}
            />
            <PasscodeField
              id="admin-passcode-confirm"
              label="Ulangi passcode baru"
              value={confirm}
              revealed={revealed.confirm}
              autoComplete="new-password"
              error={
                confirm && confirm !== next
                  ? "Konfirmasi tidak cocok dengan passcode baru."
                  : null
              }
              onChange={setConfirm}
              onToggle={() => setRevealed((r) => ({ ...r, confirm: !r.confirm }))}
            />

            {assessment ? <PasscodeStrength assessment={assessment} /> : null}
            {error ? (
              <p
                className="border-2 border-[#7C2D12] bg-white px-3 py-2 text-sm font-black text-[#7C2D12]"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <button
                type="button"
                onClick={() => setPasscodeOpen(false)}
                disabled={busy}
                className="admin-btn admin-btn-secondary order-2 w-full sm:order-1 sm:w-auto"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="admin-btn admin-btn-primary order-1 w-full sm:order-2 sm:w-auto"
              >
                <KeyRound className="size-5" aria-hidden="true" />
                {busy ? "Menyimpan..." : "Simpan passcode baru"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}
