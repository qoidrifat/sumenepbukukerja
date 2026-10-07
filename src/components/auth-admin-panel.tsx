import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import type { PasscodeState } from "@/lib/admin-gate-client";

/**
 * Layar masuk ruang pengelola, dalam tema meja kerja admin.
 *
 * Kenapa layar tersendiri, bukan `Auth.tsx` yang dicatat dua warna:
 *
 *  Halaman `/auth` melayani dua kebutuhan yang berbeda dengan dua tema.
 *  Warga yang masuk ke `/dashboard` mendapat tema publik; pengelola yang masuk
 *  ke `/admin` ditahan passcode dulu dan harus langsung merasa bahwa ia sedang
 *  membuka sistem internal, bukan situs warga.
 *
 *  Menitipkan perbedaan itu pada satu berkas berarti setiap elemen harus
 *  menyimpan dua pendapat, dan pendapat yang kalah biasanya yang lebih
 *  senyap - persis kelas kesalahan yang repo ini tegakkan di
 *  `docs/security/PHASE-9.1-*`.
 *
 *  Yang dipakai di sini HANYA primitive admin: `.admin-workspace`,
 *  `.admin-panel`, `.admin-btn`, `.admin-input`, pita kuning, dan warna
 *  terracotta/mint. Tidak ada satu pun warna palet publik di berkas ini, dan
 *  `auth-admin-panel.test.ts` menjaganya.
 *
 *  Logika tidak diduplikasi: seluruh state dan handler tetap milik
 *  `src/pages/Auth.tsx` dan diteruskan lewat props. Yang dipindah hanya
 *  tampilannya.
 */

export type AuthAdminPanelProps = {
  passcodeGranted: boolean;
  passcode: string;
  onPasscodeChange: (value: string) => void;
  showPasscode: boolean;
  onToggleShowPasscode: () => void;
  onPasscodeSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  passcodeState: PasscodeState;
  /** Sesi di perangkat ini baru saja dicabut dari Security Desk. */
  wasRevoked: boolean;
  isLoading: boolean;
  firebaseEnabled: boolean;
  /** Hidup bila `api.otpEmail.status` menjawab enabled (Fase 9.5). */
  otpEnabled: boolean;
  /**
   * Query status OTP sudah terjawab (bukan loading). Selagi belum tahu,
   * panel menahan fallback "belum siap" supaya tidak flash lalu berganti
   * — aturan yang sama dengan layar warga.
   */
  otpKnown: boolean;
  onGoogleSignIn: () => void;
  onOtpOpen: () => void;
  error: string | null;
  onGoHome: () => void;
  formatLockRemaining: (lockedUntil: number) => string;
};

/** Notifikasi dalam palet admin: terracotta untuk salah, mint untuk berhasil. */
export function AdminAuthNotice({
  tone,
  icon: Icon,
  children,
}: {
  tone: "error" | "success" | "info";
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const palette =
    tone === "error"
      ? "bg-[#E9B4A7] text-[#7C2D12]"
      : tone === "success"
        ? "bg-[#DCEBD7] text-[#24533A]"
        : "bg-[#F1EDE3] text-[#525252]";
  return (
    <p
      className={`flex items-start gap-2 border-2 border-[#121212] px-3 py-2 text-sm font-black ${palette}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Baris identitas di atas panel masuk.
 *
 * Diekspor karena layar turunan di ruang pengelola memakai header
 * yang persis sama. Dua layar yang sama persis biasanya ditulis dua kali,
 * lalu satu kali berbeda.
 *
 * `flex-wrap` itu bukan hiasan. Di lebar di bawah 430px, lencana "Akses
 * mengelola" memakai lebih dari separuh baris dan judul brand ikut
 * terpotong ellipsis - dan nama yang tidak terbaca adalah hal pertama yang
 * hilang saat kartu dikritik "kurang profesional". Dengan boleh membungkus,
 * lencana turun ke baris kedua hanya di layar yang memang sempit; di lebar
 * normal tidak ada yang bergeser.
 */
export function AdminAuthIdentity() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <img
        src="/brand/logo-mark.svg"
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-[2px] border-2 border-[#121212] bg-white object-contain shadow-[2px_2px_0_#121212]"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-black uppercase tracking-[-0.035em] text-[#1A1A1A] sm:text-lg">
          Sumenep Buku Kerja
        </p>
        <p className="truncate text-xs font-bold text-[#525252] sm:text-sm">
          Ruang pengelola
        </p>
      </div>
      <span className="admin-status admin-status-confirmed ml-1 shrink-0 text-xs sm:text-sm">
        <span className="mr-1.5 size-2 rounded-full bg-[#1A1A1A]" aria-hidden="true" />
        Akses mengelola
      </span>
    </div>
  );
}

export function AuthAdminPanel(props: AuthAdminPanelProps) {
  const {
    passcodeGranted,
    passcode,
    onPasscodeChange,
    showPasscode,
    onToggleShowPasscode,
    onPasscodeSubmit,
    passcodeState,
    wasRevoked,
    isLoading,
    firebaseEnabled,
    otpEnabled,
    otpKnown,
    onGoogleSignIn,
    onOtpOpen,
    error,
    onGoHome,
    formatLockRemaining,
  } = props;

  const gateBusy = passcodeState.kind === "checking";
  const gateLocked = passcodeState.kind === "locked";

  return (
    <main className="admin-workspace flex min-h-dvh min-h-[100svh] flex-col items-center justify-center px-3 pb-[max(1.5rem,env(safe-area-inset-bottom)))] pt-[max(1rem,env(safe-area-inset-top))] text-[#1A1A1A]">
      <div className="admin-shell-frame admin-frame-card w-full max-w-2xl">
        {/* Identitas di luar panel: judul dan peran selalu terlihat, bahkan
            ketika isian terkunci karena percobaan berulang. */}
        <AdminAuthIdentity />

        <section className="admin-panel admin-panel-lg overflow-hidden" aria-labelledby="admin-auth-title">
          {/* Pita kuning: penanda yang sama dengan panel mana pun di meja
              kerja, jadi halaman ini langsung terbaca sebagai bagian dari
              sistem internal. */}
          <div className="border-b-2 border-[#121212] bg-[#FFE662] px-4 py-4 sm:px-6">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#525252]">
              {passcodeGranted ? "Langkah 2 dari 2" : "Langkah 1 dari 2"}
            </p>
            <h1
              id="admin-auth-title"
              className="mt-1 text-2xl font-black tracking-[-0.035em] text-[#121212] sm:text-3xl"
            >
              {passcodeGranted ? "Verifikasi email" : "Passcode pengelola"}
            </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1A1A1A]">
            {passcodeGranted
              ? "Ruang /admin terbuka setelah passcode. Pilih cara masuk, lalu akun diverifikasi server sebelum membuka sesi."
              : "Ruang /admin dikunci. Masukkan passcode terlebih dahulu, lalu lanjut ke verifikasi email."}
          </p>
          </div>

          {wasRevoked ? (
            <div className="border-b-2 border-[#121212] px-4 py-3 sm:px-6">
              <AdminAuthNotice tone="error" icon={ShieldOff}>
                Sesi Anda di perangkat ini sudah diakhiri dari ruang admin. Masuk
                lagi untuk melanjutkan.
              </AdminAuthNotice>
            </div>
          ) : null}

          {!passcodeGranted ? (
            <form onSubmit={onPasscodeSubmit}>
              <div className="space-y-3 px-4 py-4 sm:px-6">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-black text-[#1A1A1A]">Passcode</span>
                  <span className="relative block">
                    <Lock
                      className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#525252]"
                      aria-hidden="true"
                    />
                    <input
                      name="passcode"
                      type={showPasscode ? "text" : "password"}
                      value={passcode}
                      onChange={(event) => onPasscodeChange(event.target.value)}
                      placeholder="Passcode admin"
                      autoComplete="off"
                      autoFocus
                      aria-describedby="admin-passcode-help"
                      className="admin-input admin-input--slot-left admin-input--slot-right"
                      disabled={gateBusy || gateLocked}
                      required
                    />
                    <button
                      type="button"
                      onClick={onToggleShowPasscode}
                      className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-[#525252] hover:text-[#1A1A1A]"
                      aria-label={showPasscode ? "Sembunyikan passcode" : "Tampilkan passcode"}
                    >
                      {showPasscode ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </span>
                </label>

                <p id="admin-passcode-help" className="text-xs leading-5 text-[#525252]">
                  Passcode ini tidak pernah dikirim ke server dalam bentuk apa
                  pun. Yang dikirim hanya buktinya.
                </p>

                {passcodeState.kind === "invalid" ? (
                  <AdminAuthNotice tone="error" icon={AlertTriangle}>
                    {passcodeState.message}
                  </AdminAuthNotice>
                ) : null}

                {passcodeState.kind === "unconfigured" ? (
                  <AdminAuthNotice tone="info" icon={AlertTriangle}>
                    {passcodeState.message} Isi environment{" "}
                    <code className="font-black">ADMIN_PASSCODE_HASH</code> di
                    dashboard Convex.
                  </AdminAuthNotice>
                ) : null}

                {passcodeState.kind === "locked" ? (
                  <div className="border-2 border-[#121212] bg-[#E9B4A7] p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-[#7C2D12]">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                      Akses dicatat dan dikunci{" "}
                      {formatLockRemaining(passcodeState.lockedUntil)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#7C2D12]">
                      Sistem menyimpan jejak percobaan ini dan pengelola dapat
                      meninjaunya di panel admin. Data yang tersimpan:
                    </p>
                    <dl className="mt-3 space-y-1.5 text-sm text-[#7C2D12]">
                      {passcodeState.alert.userAgent ? (
                        <div>
                          <dt className="inline font-black">Perangkat: </dt>
                          <dd className="inline break-all">{passcodeState.alert.userAgent}</dd>
                        </div>
                      ) : null}
                      {passcodeState.alert.timezone ? (
                        <div>
                          <dt className="inline font-black">Zona waktu: </dt>
                          <dd className="inline">{passcodeState.alert.timezone}</dd>
                        </div>
                      ) : null}
                      {passcodeState.alert.locale ? (
                        <div>
                          <dt className="inline font-black">Bahasa: </dt>
                          <dd className="inline">{passcodeState.alert.locale}</dd>
                        </div>
                      ) : null}
                      {passcodeState.alert.reportedIp ? (
                        <div>
                          <dt className="inline font-black">IP: </dt>
                          <dd className="inline">{passcodeState.alert.reportedIp}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="inline font-black">Percobaan gagal: </dt>
                        <dd className="inline">{passcodeState.alert.failedAttempts}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-sm text-[#7C2D12]">
                      Alamat IP tidak dikirim: platform tidak mengekspos IP klien,
                      jadi tidak dikarang agar log tidak tampak lengkap padahal
                      kosong.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t-2 border-[#121212] px-4 py-4 sm:px-6">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-btn--half w-full"
                  onClick={onGoHome}
                >
                  <ArrowLeft className="size-5 shrink-0" aria-hidden="true" />
                  Kembali ke katalog
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary admin-btn--half w-full"
                  disabled={gateBusy || gateLocked}
                >
                  {gateBusy ? (
                    <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
                  )}
                  {gateBusy ? "Memeriksa..." : "Verifikasi passcode"}
                </button>
              </div>
            </form>
          ) : (
            <div className="px-4 py-4 sm:px-6">
              <div className="grid gap-2">
                {/* FASE 9.5: matriks yang sama dengan layar warga. Pembatas
                    "atau" hanya bila kedua pintu hidup; satu pintu tampil
                    tanpa pembatas; tidak ada pintu tampil fallback yang
                    menyebut Google + Email OTP — tapi HANYA setelah status
                    OTP diketahui (`otpKnown`), supaya fallback tidak flash
                    selagi query masih loading lalu berganti tombol. */}
                {firebaseEnabled || otpEnabled ? (
                  <>
                    {firebaseEnabled ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary w-full"
                        onClick={onGoogleSignIn}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                        ) : (
                          <GoogleGlyph />
                        )}
                        Masuk dengan Google
                      </button>
                    ) : null}
                    {firebaseEnabled && otpEnabled ? (
                      <div className="my-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <span className="h-px bg-[#121212]" />
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#525252]">
                          atau
                        </span>
                        <span className="h-px bg-[#121212]" />
                      </div>
                    ) : null}
                    {otpEnabled ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn-highlight w-full"
                        onClick={onOtpOpen}
                        disabled={isLoading}
                      >
                        <EmailGlyph />
                        Masuk dengan Email
                      </button>
                    ) : !otpKnown ? (
                      <div
                        role="status"
                        aria-label="Memuat opsi masuk"
                        className="h-12 w-full border-2 border-[#121212] bg-[#F5F0E5] motion-safe:animate-pulse"
                      />
                    ) : null}
                  </>
                ) : !otpKnown ? (
                  <div
                    role="status"
                    aria-label="Memuat opsi masuk"
                    className="h-12 w-full border-2 border-dashed border-[#121212] bg-[#F5F0E5] motion-safe:animate-pulse"
                  />
                ) : otpKnown ? (
                  <div className="border-2 border-dashed border-[#121212] bg-[#F5F0E5] p-4">
                    <p className="text-sm font-black text-[#1A1A1A]">
                      Pintu masuk belum siap di lingkungan ini.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#525252]">
                      Masuk dengan Google membaca konfigurasi Firebase dan
                      masuk dengan Email OTP membaca kunci pengiriman email —
                      keduanya belum terisi pada build ini, jadi tidak ada
                      pintu yang bisa dibuka sekarang. Administrator perlu
                        mengisi konfigurasi tersebut, lalu memuat ulang halaman
                        ini.
                      </p>
                    </div>
                  ) : null}

                {error ? <AdminAuthNotice tone="error" icon={AlertTriangle}>{error}</AdminAuthNotice> : null}
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t-2 border-[#121212] pt-4 sm:flex-row">
                <button
                  type="button"
                  className="admin-btn admin-btn-quiet w-full sm:w-auto"
                  onClick={onGoHome}
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                  Kembali ke katalog
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-3 flex items-start gap-2 px-1 text-xs leading-5 text-[#525252]">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Passcode dan sesi diverifikasi ulang di server. Halaman ini hanya
          menampilkan aksi; bukan sumber kebenaran hak akses.
        </p>
      </div>
    </main>
  );
}

/** Amplop mono currentColor: selaras tema meja kerja (tanpa warna palet publik). */
function EmailGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4 7.5 12 13.5 20 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logo Google. Inline supaya tidak menambah permintaan jaringan. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.64H1.29a12 12 0 0 0 0 10.72l3.98-3.09Z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.64l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}
