import { useCallback, useEffect, useState } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { ERROR_CODES } from "@/lib/error-reporting";
import { useNavigate } from "react-router";
import { Activity, KeyRound, LogOut, Monitor, Radio, ShieldCheck } from "lucide-react";

import { useCurrentAdminSession } from "@/lib/catalog-store";
import { useAuth } from "@/hooks/use-auth";
import { useErrorReporter } from "@/lib/error-reporter";
import { api } from "@/convex/_generated/api";
import { assessPasscode, PASSCODE_MIN_LENGTH } from "@/lib/admin-passcode";
import { convexSiteUrl } from "@/lib/admin-gate-client";
import { UNKNOWN_LABEL, describeIpSource } from "@/lib/security-context";
import { TimeStampLabel } from "@/components/admin-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass } from "@/components/admin-workspace";

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
          headers: { "content-type": "application/json" },
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
        const deviceId =
          (() => {
            try {
              return window.localStorage.getItem("bk.device-id") ?? undefined;
            } catch {
              return undefined;
            }
          })() ?? undefined;
        await report({
          token: payload.contextId,
          requestId: payload.requestId ?? undefined,
          ipMasked: payload.ipMasked ?? undefined,
          ipSource: payload.ipSource ?? undefined,
          ipFamily: payload.ipFamily ?? undefined,
          userAgent: payload.userAgent ?? window.navigator.userAgent,
          sessionFingerprint: deviceId,
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
          <Row label="Peran">{session.role}</Row>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => setPasscodeOpen(true)}
            className="admin-btn admin-btn-secondary inline-flex min-h-12"
          >
            <KeyRound className="size-5" aria-hidden="true" />
            Ubah passcode
          </button>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah passcode admin</DialogTitle>
            <DialogDescription>
              Minimal {PASSCODE_MIN_LENGTH} karakter. Passcode baru harus berbeda dari yang
              lama, dan tidak boleh sama persis. Setelah diganti, setiap tiket masuk yang
              masih terbuka ikut dicabut.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePasscode} className="space-y-3">
            <label className="block">
              <span className="text-sm font-black text-[#1A1A1A]">Passcode saat ini</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                className={`${inputClass} mt-1`}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-black text-[#1A1A1A]">Passcode baru</span>
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                className={`${inputClass} mt-1`}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-black text-[#1A1A1A]">Ulangi passcode baru</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={`${inputClass} mt-1`}
                required
              />
            </label>
            {assessment ? (
              <p
                className={`text-sm font-black ${
                  assessment.ok ? "text-[#24533A]" : "text-[#7C2D12]"
                }`}
                aria-live="polite"
              >
                {assessment.ok
                  ? `Kekuatan passcode: ${assessment.label}`
                  : assessment.issues.join(" ")}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm font-bold text-[#7C2D12]" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasscodeOpen(false)}
                disabled={busy}
              >
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Menyimpan..." : "Simpan passcode baru"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}
