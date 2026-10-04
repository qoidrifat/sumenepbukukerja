import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Loader2, Lock, ShieldCheck, ShieldOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* Sumber logo yang sama dengan navbar dan admin: /brand/logo-mark.svg. */
const BRAND_LOGO = "/brand/logo-mark.svg";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedContent, GlassSurface, ScrollReveal, ShinyText } from "@/components/react-bits";
import { useAdminPasscodeGate } from "@/lib/admin-gate-client";
import { AuthAdminPanel } from "@/components/auth-admin-panel";
import { EmailOtpDialog } from "@/components/email-otp-dialog";
import {
  currentFirebaseEmail,
  firebaseAvailable,
  firebaseErrorMessage,
  signInWithGoogle,
  signOutOfFirebase,
} from "@/lib/firebase-client";

/** Logo Google. Inline supaya tidak menambah permintaan jaringan. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.29a12 12 0 0 0 0 10.78l3.98-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.61l3.98 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/** Halaman auth khusus menampilkan passcode hanya bila tujuan akhirnya /admin. */
function isAdminDestination(redirect: string) {
  return redirect === "/admin" || redirect.startsWith("/admin/");
}

const formatLockRemaining = (lockedUntil: number) => {
  const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
  if (minutes >= 60) return `${Math.ceil(minutes / 60)} jam`;
  return `${minutes} menit`;
};

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const adminGateRequired = isAdminDestination(redirect);
  // Rute dan tujuan dikirim ke audit log supaya jejak_passcode punya konteks
  // halaman mana yang dicoba. Keduanya bukan bahan keputusan keamanan.
  const gate = useAdminPasscodeGate({
    route: "/auth",
    returnTo: searchParams.get("returnTo"),
  });
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  // Bendera ini datang dari `SessionRevokedGuard`: perangkat ini baru saja
  // dicabut dari Security Desk, jadi orangnya perlu tahu kenapa ia mendarat
  // lagi di halaman masuk. Bukan error — ini konsekuensi yang dia minta sendiri
  // (atau yang orang lain minta untuk perangkatnya).
  const wasRevoked = searchParams.get("revoked") === "1";

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firebaseEnabled] = useState(() => firebaseAvailable());
  // FASE 9.5: satu-satunya pintu selain Google adalah dialog OTP.
  // `otpStatus` undefined = query belum terjawab, BUKAN mati. Tombol
  // "Gunakan Email" hanya muncul setelah server menjawab hidup, supaya
  // fallback "belum siap" tidak flash sekilas saat halaman dimuat.
  const otpStatus = useQuery(api.otpEmail.status);
  const otpEnabled = otpStatus?.enabled === true;
  const otpKnown = otpStatus !== undefined;
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpDone, setOtpDone] = useState(false);
  // Navigasi pasca-masuk harus tepat sekali: dialog OTP menutup DULU lalu
  // memanggil `onVerified`, dan di saat yang sama efek sesi ikut melihat
  // sesi baru sudah terbentuk. Tanpa penjaga, dua navigasi ke tujuan yang
  // sama meluncur dalam satu tick dan menumpuk entri riwayat yang sama.
  // Stabil via `useCallback` supaya efek di bawah tidak re-subscribe tiap
  // render (identitas `navigate` dari router memang stabil).
  const navigatedRef = useRef(false);
  const navigateOnce = useCallback(
    (target: string) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      navigate(target);
    },
    [navigate],
  );

  const passcodeGranted = gate.state.kind === "granted" ? gate.state : null;
  const needsPasscode = adminGateRequired && passcodeGranted === null;

  // Baris atas dan kartu berbagi satu lebar kolom, sehingga keduanya duduk di
  // sumbu tengah yang sama dan tidak terlihat melayang ke dua arah.
  const shellWidth = needsPasscode
    ? "mx-auto w-full max-w-md sm:max-w-xl lg:max-w-2xl"
    : "mx-auto w-full max-w-md sm:max-w-lg";

  useEffect(() => {
    // Dialog OTP yang masih terbuka menahan navigasi otomatis: sesi baru
    // sudah terbentuk saat kode benar, dan tanpa penahan ini efek langsung
    // navigasi sehingga sekuens sukses Task 5 terpotong sebelum terlihat.
    // Navigasi pasca-OTP milik `onVerified` dialog. Semua lewat
    // `navigateOnce` supaya tidak ada entri riwayat ganda ke tujuan sama.
    if (!authLoading && isAuthenticated && !otpOpen) navigateOnce(redirect);
  }, [authLoading, isAuthenticated, navigateOnce, redirect, otpOpen]);

  const handlePasscodeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const granted = await gate.submit(passcode);
    if (granted) {
      setPasscode("");
    }
  };

  /**
   * Tukar tiket passcode dengan email milik akun yang BARU SAJA masuk di
   * Firebase, sebelum token-nya dikirim ke Convex.
   *
   * Urutan ini bukan gaya penulisan. Tiket passcode mengikat akses admin ke satu
   * email; kalau ditukar setelah sesi Convex terbentuk, passcode itu sempat
   * berlaku untuk sesi yang tidak diautentikasi. Kalau penukarannya gagal,
   * sesi Firebase dicabut supaya tidak ada Half-login yang tertinggal.
   */
  const redeemPasscodeForFirebase = async (): Promise<boolean> => {
    if (!passcodeGranted) return true;
    const email = currentFirebaseEmail();
    if (!email) {
      await signOutOfFirebase();
      setError("Akun ini tidak punya email yang bisa diverifikasi.");
      return false;
    }
    const ok = await gate.redeem(passcodeGranted.ticket, email);
    if (!ok) {
      await signOutOfFirebase();
      setError("Sesi passcode sudah tidak berlaku. Muat ulang halaman dan coba lagi.");
      gate.reset();
      return false;
    }
    return true;
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    // Satu klik melewati tiga tahap yang punya penyebab kegagalan berbeda.
    // Kalau ketiganya masuk satu blok `try`, semuanya berakhir sebagai
    // "gagal masuk" dan pengunjung mengira akunnya yang salah lalu mencoba lagi
    // berkali-kali - padahal masalahnya di server.
    //
    // Tahap 1: Firebase. Kegagalan di sini adalah masalah akun, peramban,
    // atau izin domain. Semuanya punya pesan sendiri dari peta error.
    let token: string;
    try {
      token = await signInWithGoogle();
    } catch (caught) {
      setError(firebaseErrorMessage(caught));
      setIsLoading(false);
      return;
    }
    // Tahap 2: penukaran tiket passcode, sebelum sesi menyentuh Convex.
    try {
      if (!(await redeemPasscodeForFirebase())) {
        setIsLoading(false);
        return;
      }
    } catch (caught) {
      setError(firebaseErrorMessage(caught));
      setIsLoading(false);
      return;
    }
    // Tahap 3: server Convex. Kalau gagal di sini, Google sudah berhasil dan
    // tokennya sah, jadi ini masalah kita - bukan salah akun pengguna.
    // Lewat `navigateOnce`: efek sesi di atas ikut melihat sesi baru dan
    // akan menembak navigasi yang sama — penjaga menahan yang kedua.
    try {
      await signIn("firebase", { token });
      navigateOnce(redirect);
    } catch {
      setError(
        "Akun Google Anda sudah diterima, tetapi server belum bisa membuka sesi. Coba lagi sebentar lagi.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Dipanggil dari ujung sekuens sukses OTP (tepat sekali, dijamin
  // komponen): tutup dialog lalu buka tujuan semula. Tepat-sekali ganda —
  // efek sesi di atas juga melihat sesi baru — ditahan `navigateOnce`.
  const handleOtpVerified = () => {
    setOtpDone(true);
    setOtpOpen(false);
    navigateOnce(redirect);
  };

  const handleOtpOpen = () => {
    setError(null);
    setOtpEmail("");
    setOtpOpen(true);
  };

  // Hati-hati: tujuan `/admin` mendapat layar bertema admin. "Sedang menuju ruang
  // pengelola" dan "halaman masuk warga" adalah dua produk berbeda; membuat
  // keduanya terlihat sama adalah cara seseorang mengetik passcode admin ke
  // halaman yang memang tidak pernah mengirimnya ke server. Logika tiga langkah
  // di atas tetap di tempatnya; yang dipindah hanya tampilannya.
  if (adminGateRequired) {
    return (
      <>
        <AuthAdminPanel
        passcodeGranted={passcodeGranted !== null}
        passcode={passcode}
        onPasscodeChange={setPasscode}
        showPasscode={showPasscode}
        onToggleShowPasscode={() => setShowPasscode((current) => !current)}
        onPasscodeSubmit={handlePasscodeSubmit}
        passcodeState={gate.state}
        wasRevoked={wasRevoked}
        isLoading={isLoading}
        firebaseEnabled={firebaseEnabled}
        otpEnabled={otpEnabled}
        otpKnown={otpKnown}
        onOtpOpen={handleOtpOpen}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        error={error}
        onGoHome={() => navigate("/")}
        formatLockRemaining={formatLockRemaining}
        />
        {/* Dialog yang sama dengan layar warga: panel admin hanya
            presentasi, state dan dialog tetap milik halaman ini. */}
        {otpDone ? null : (
          <EmailOtpDialog
            open={otpOpen}
            onOpenChange={setOtpOpen}
            initialEmail={otpEmail}
            redirect={redirect}
            onVerified={handleOtpVerified}
          />
        )}
      </>
    );
  }

  return (
    <main className="notebook-paper flex min-h-dvh min-h-[100svh] flex-col px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <div className={`${shellWidth} flex items-center justify-between gap-4`}>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="-ml-2 flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <ArrowLeft className="size-5" />Kembali
        </button>
        <span className="rounded-full border border-blue-200 bg-white/80 px-3 py-2 text-sm font-extrabold text-blue-700">
          <ShinyText
            text={adminGateRequired ? "Akses pengelola" : "Akun warga"}
            color="#1d4ed8"
            shineColor="#93c5fd"
            speed={4.5}
          />
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center px-2 py-8 sm:py-10">
        <ScrollReveal className={shellWidth}>
          <GlassSurface tint="light" className="w-full rounded-2xl p-0 shadow-lg">
          <Card className="w-full border-slate-200 bg-white/95 p-0 shadow-lg sm:p-2">
            <AnimatedContent
              animationKey={needsPasscode ? "passcode" : "signIn"}
            >
          {needsPasscode ? (
            <>
              <CardHeader className="text-center">
                <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-slate-900 bg-blue-50 text-blue-700 shadow-[3px_3px_0_#0f172a]">
                  <Lock className="size-8" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
                  Langkah 1 dari 2
                </p>
                <CardTitle className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
                  Passcode pengelola
                </CardTitle>
                <CardDescription className="text-base leading-7">
                  Ruang /admin dikunci. Masukkan passcode terlebih dahulu, lalu
                  lanjut ke verifikasi email.
                </CardDescription>
              </CardHeader>
              {wasRevoked ? (
                <p
                  className="flex items-start gap-2 border-t border-border px-6 py-3 text-sm font-bold text-amber-800"
                  role="status"
                >
                  <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Sesi Anda di perangkat ini sudah diakhiri dari ruang admin. Masuk lagi untuk
                  melanjutkan.
                </p>
              ) : null}
              <form onSubmit={handlePasscodeSubmit}>
                <CardContent>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-extrabold text-slate-800">Passcode</span>
                    <span className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-blue-600" />
                      <Input
                        name="passcode"
                        type={showPasscode ? "text" : "password"}
                        value={passcode}
                        onChange={(event) => setPasscode(event.target.value)}
                        placeholder="••••••••••••••••"
                        autoComplete="off"
                        autoFocus
                        className="min-h-12 admin-input--slot-left admin-input--slot-right text-base"
                        disabled={gate.state.kind === "checking" || gate.state.kind === "locked"}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasscode((current) => !current)}
                        className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        aria-label={showPasscode ? "Sembunyikan passcode" : "Tampilkan passcode"}
                      >
                        {showPasscode ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    </span>
                  </label>

                  {gate.state.kind === "invalid" ? (
                    <p className="mt-3 flex items-start gap-2 text-sm font-bold text-red-700" role="alert">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{gate.state.message}</span>
                    </p>
                  ) : null}

                  {gate.state.kind === "unconfigured" ? (
                    <p className="mt-3 flex items-start gap-2 text-sm font-bold text-amber-800" role="alert">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        {gate.state.message} Isi environment{" "}
                        <code className="rounded bg-slate-100 px-1">ADMIN_PASSCODE_HASH</code> di
                        dashboard Convex.
                      </span>
                    </p>
                  ) : null}

                  {gate.state.kind === "locked" ? (
                    <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4">
                      <p className="flex items-center gap-2 text-sm font-black text-red-900">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        Akses dicatat dan dikunci {formatLockRemaining(gate.state.lockedUntil)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-red-800">
                        Sistem menyimpan jejak percobaan ini dan pengelola dapat
                        meninjaunya di panel admin. Data yang tersimpan:
                      </p>
                      <dl className="mt-3 space-y-1.5 text-sm text-red-900">
                        {gate.state.alert.userAgent ? (
                          <div>
                            <dt className="inline font-black">Perangkat: </dt>
                            <dd className="inline break-all">{gate.state.alert.userAgent}</dd>
                          </div>
                        ) : null}
                        {gate.state.alert.timezone ? (
                          <div>
                            <dt className="inline font-black">Zona waktu: </dt>
                            <dd className="inline">{gate.state.alert.timezone}</dd>
                          </div>
                        ) : null}
                        {gate.state.alert.locale ? (
                          <div>
                            <dt className="inline font-black">Bahasa: </dt>
                            <dd className="inline">{gate.state.alert.locale}</dd>
                          </div>
                        ) : null}
                        {gate.state.alert.reportedIp ? (
                          <div>
                            <dt className="inline font-black">IP: </dt>
                            <dd className="inline">{gate.state.alert.reportedIp}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt className="inline font-black">Percobaan gagal: </dt>
                          <dd className="inline">{gate.state.alert.failedAttempts}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-sm text-red-800">
                        Alamat IP tidak dikirim: platform tidak mengekspos IP klien,
                        jadi tidak dikarang agar log tidak tampak lengkap padahal
                        kosong.
                      </p>
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    type="submit"
                    className="min-h-12 w-full text-base"
                    disabled={gate.state.kind === "checking" || gate.state.kind === "locked"}
                  >
                    {gate.state.kind === "checking" ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-5" />
                    )}
                    {gate.state.kind === "checking" ? "Memeriksa..." : "Verifikasi passcode"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12 w-full text-base"
                    onClick={() => navigate("/")}
                  >
                    Kembali ke katalog
                  </Button>
                </CardFooter>
              </form>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mx-auto flex min-h-12 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  aria-label="Buka beranda Sumenep Buku Kerja"
                >
                  <img src={BRAND_LOGO} alt="" width={64} height={64} className="rounded-xl" />
                </button>
                <CardTitle className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
                  Masuk ke Buku Kerja
                </CardTitle>
                <CardDescription className="text-base leading-7">
                  {passcodeGranted
                    ? "Passcode lolos. Sekarang verifikasi email untuk membuka ruang Anda."
                    : "Simpan listing favorit dan sinkronkan dari perangkat mana pun."}
                </CardDescription>
              </CardHeader>
              <div>
                <CardContent>
                  {/* FASE 9.5 - dua pintu masuk: Google dan Email OTP.

                      Pintu lama dihapus total (keputusan pemilik), jadi tombol
                      Google dan "Gunakan Email" ini sekarang SELURUH isi layar
                      ini. Pembatas "atau" hanya tampil bila KEDUA pintu hidup:
                      pembatas yang tidak memisahkan apa pun membuat orang
                      mengira masih ada pilihan ketiga yang belum tampil.
                      Kalau tidak ada pintu yang bisa dibuka, layar tidak boleh
                      kosong: orang akan mengira situsnya rusak lalu pergi. Blok
                      di bawahnya menjelaskan apa yang belum terisi dan apa yang
                      harus diperbaiki administrator. */}
                  {firebaseEnabled || otpEnabled ? (
                    <>
                      {firebaseEnabled ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-12 w-full text-base"
                          onClick={handleGoogleSignIn}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="size-5 animate-spin" />
                          ) : (
                            <GoogleMark />
                          )}
                          Masuk dengan Google
                        </Button>
                      ) : null}
                      {firebaseEnabled && otpEnabled ? (
                        <div className="my-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          <span className="h-px bg-slate-200" />
                          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
                            atau
                          </span>
                          <span className="h-px bg-slate-200" />
                        </div>
                      ) : null}
                      {otpEnabled ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-12 w-full text-base"
                          onClick={handleOtpOpen}
                          disabled={isLoading}
                        >
                          Gunakan Email
                        </Button>
                      ) : null}
                    </>
                  ) : otpKnown ? (
                    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
                      <p className="text-sm font-black text-slate-900">
                        Pintu masuk belum siap di lingkungan ini.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Masuk dengan Google membaca konfigurasi Firebase dan
                        masuk dengan Email OTP membaca kunci pengiriman email —
                        keduanya belum terisi pada build ini, jadi tidak ada
                        pintu yang bisa dibuka sekarang. Administrator perlu
                        mengisi konfigurasi tersebut, lalu memuat ulang halaman
                        ini. Sesi yang sudah terbentuk tidak ikut hilang karena
                        itu.
                      </p>
                    </div>
                  ) : null}
                  {error ? (
                    <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {/* Tidak ada "Masuk sebagai tamu" di halaman ini, dan
                      sengaja tidak akan ditambah lagi. Akun anonim tidak punya
                      email, jadi begitu peran pengelola diberikan padanya,
                      akun itu tidak pernah bisa dibuka kembali — persis akun
                      yang membuat seluruh deployment terkunci. Satu akun per
                      orang, satu email nyata, satu akun yang bisa dipulihkan. */}
                </CardContent>
              </div>
            </>
          )}
            </AnimatedContent>
          </Card>
          </GlassSurface>
        </ScrollReveal>
      </div>
      {/* Satu Dialog OTP untuk seluruh halaman ini (warga maupun pengelola
          setelah passcode). Tahap sukses dirender DI DALAM dialog yang sama
          oleh komponennya sendiri - tidak ada Dialog bersarang di sini.
          Dilepas dari pohon setelah selesai supaya tidak bisa dibuka ulang
          dalam keadaan basi. */}
      {otpDone ? null : (
        <EmailOtpDialog
          open={otpOpen}
          onOpenChange={setOtpOpen}
          initialEmail={otpEmail}
          redirect={redirect}
          onVerified={handleOtpVerified}
        />
      )}
    </main>
  );
}

export default function AuthPage(props: AuthProps) {
  return <Auth {...props} />;
}
