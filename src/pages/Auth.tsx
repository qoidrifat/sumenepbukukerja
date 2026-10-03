import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, ShieldOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
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
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AuthAdminPanel } from "@/components/auth-admin-panel";
import { consumeAdminAuthIntent, rememberAdminAuthIntent } from "@/lib/admin-auth-intent";
import {
  createEmailAccount,
  currentFirebaseEmail,
  firebaseAvailable,
  firebaseErrorMessage,
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOutOfFirebase,
} from "@/lib/firebase-client";

/**
 * Pesan setelah permintaan reset sandi dikirim.
 *
 * Sengaja sama dengan pesan di `requestPasswordReset`: halaman publik tidak
 * boleh membedakan email terdaftar dan tidak terdaftar.
 */
const RESET_SENT =
  "Kalau email itu terdaftar di Buku Kerja, kami sudah mengirim tautan untuk membuat sandi baru. Cek kotak masuk dan folder spam.";

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
  const [step, setStep] = useState<"signIn" | "password">("signIn");
  // Bendera ini datang dari `SessionRevokedGuard`: perangkat ini baru saja
  // dicabut dari Security Desk, jadi orangnya perlu tahu kenapa ia mendarat
  // lagi di halaman masuk. Bukan error — ini konsekuensi yang dia minta sendiri
  // (atau yang orang lain minta untuk perangkatnya).
  const wasRevoked = searchParams.get("revoked") === "1";
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firebaseEnabled] = useState(() => firebaseAvailable());
  const [passwordMode, setPasswordMode] = useState<"signIn" | "signUp">("signIn");
  const [notice, setNotice] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  // Email tujuan reset sandi disimpan di state, bukan dibaca dari FormData.
  // Alasannya bukan selera: blok reset dulu dirender di DALAM form sign-in,
  // dan dua form bersarang membuat satu klik "Kirim tautan reset" menjalankan
  // dua penangan sekaligus - reset sandi DAN masuk dengan sandi lama itu.
  const [resetEmail, setResetEmail] = useState("");
  // Kode reset sandi yang datang dari tautan email. Kalau ada, halaman ini
  // tidak menampilkan daftar akun sama sekali.
  const resetCode = searchParams.get("oobCode");
  // Tautan reset dibuat Firebase, jadi `returnTo` tidak bisa ikut di dalamnya.
  // Niat "ini alur ruang admin" disimpan sebelum email dikirim dan dibaca satu
  // kali di sini, supaya layar buat-sandi baru tidak berubah tema di tengah
  // alur. Lihat `src/lib/admin-auth-intent.ts`.
  const [adminIntent] = useState(() =>
    resetCode ? consumeAdminAuthIntent() : null,
  );

  const passcodeGranted = gate.state.kind === "granted" ? gate.state : null;
  const needsPasscode = adminGateRequired && passcodeGranted === null;

  // Baris atas dan kartu berbagi satu lebar kolom, sehingga keduanya duduk di
  // sumbu tengah yang sama dan tidak terlihat melayang ke dua arah.
  const shellWidth = needsPasscode
    ? "mx-auto w-full max-w-md sm:max-w-xl lg:max-w-2xl"
    : "mx-auto w-full max-w-md sm:max-w-lg";

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect);
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handlePasscodeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const granted = await gate.submit(passcode);
    if (granted) {
      setPasscode("");
      setStep("signIn");
    }
  };

  const handlePasswordReset = async () => {
    const email = resetEmail.trim();
    if (!email) {
      setError("Tulis dulu email yang dipakai untuk masuk.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (adminGateRequired) rememberAdminAuthIntent(redirect);
      await requestPasswordReset(email);
      setResetEmail("");
      setNotice(RESET_SENT);
    } catch (caught) {
      setError(firebaseErrorMessage(caught));
    } finally {
      setIsLoading(false);
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
    setNotice(null);
    // Satu klik melewati tiga tahap yang punya penyebab kegagalan berbeda.
    // Kalau ketiganya masuk satu blok `try`, semuanya berakhir sebagai
    // "gagal masuk" dan pengunjung mengira sandinya salah lalu mencoba lagi
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
    try {
      await signIn("firebase", { token });
      navigate(redirect);
    } catch {
      setError(
        "Akun Google Anda sudah diterima, tetapi server belum bisa membuka sesi. Coba lagi sebentar lagi.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setNotice(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("firebaseEmail") ?? "").trim();
    const password = String(formData.get("firebasePassword") ?? "");
    // Tahap 1: Firebase. Sama seperti di tombol Google, kegagalan di sini
    // punya pesan sendiri dan bisa ditindaklanjuti pengguna.
    let token: string;
    try {
      token =
        passwordMode === "signUp"
          ? await createEmailAccount(email, password)
          : await signInWithEmail(email, password);
    } catch (caught) {
      if (passwordMode === "signUp" && firebaseErrorMessage(caught).includes("verifikasi")) {
        setNotice(
          "Akun dibuat. Buka email Anda dan klik tautan verifikasi, lalu masuk dengan sandi yang sama.",
        );
      }
      setError(firebaseErrorMessage(caught));
      setIsLoading(false);
      return;
    }
    // Tahap 2: penukaran tiket passcode.
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
    // Tahap 3: server Convex.
    try {
      await signIn("firebase", { token });
      navigate(redirect);
    } catch {
      setError(
        "Akun Anda sudah diterima, tetapi server belum bisa membuka sesi. Coba lagi sebentar lagi.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // `adminIntent` menutup kasus yang tidak bisa dilihat dari URL: pengelola
  // yang meminta tautan reset lewat `/auth?returnTo=/admin`, lalu membuka
  // tautannya di tab atau perangkat lain pada sesi berikutnya.
  if (resetCode) {
    return (
      <ResetPasswordForm
        oobCode={resetCode}
        variant={adminGateRequired || adminIntent ? "admin" : "public"}
        returnTo={adminIntent ?? redirect}
      />
    );
  }

  // Hati-hati: tujuan `/admin` mendapat layar bertema admin. "Sedang menuju ruang
  // pengelola" dan "halaman masuk warga" adalah dua produk berbeda; membuat
  // keduanya terlihat sama adalah cara seseorang mengetik passcode admin ke
  // halaman yang memang tidak pernah mengirimnya ke server. Logika tiga langkah
  // di atas tetap di tempatnya; yang dipindah hanya tampilannya.
  if (adminGateRequired) {
    return (
      <AuthAdminPanel
        step={step}
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
        passwordMode={passwordMode}
        resetEmail={resetEmail}
        onResetEmailChange={setResetEmail}
        showReset={showReset}
        onToggleReset={() => {
          setError(null);
          setNotice(null);
          setShowReset(true);
        }}
        onTogglePasswordMode={() => {
          setPasswordMode((mode) => (mode === "signIn" ? "signUp" : "signIn"));
          setError(null);
          setNotice(null);
        }}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onPasswordSubmit={handlePasswordSubmit}
        onPasswordReset={() => void handlePasswordReset()}
        error={error}
        notice={notice}
        onGoHome={() => navigate("/")}
        formatLockRemaining={formatLockRemaining}
      />
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
              animationKey={needsPasscode ? "passcode" : step === "password" ? "password" : "signIn"}
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
          ) : step === "signIn" || step === "password" ? (
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
                    : step === "password"
                      ? "Masuk dengan email dan sandi yang tersimpan di perangkat ini."
                      : "Simpan listing favorit dan sinkronkan dari perangkat mana pun."}
                </CardDescription>
              </CardHeader>
              {step === "password" ? (
                <form onSubmit={handlePasswordSubmit}>
                  <CardContent>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-extrabold text-slate-800">Email</span>
                      <span className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-blue-600" />
                        <Input
                          name="firebaseEmail"
                          placeholder="nama@email.com"
                          type="email"
                          autoComplete="email"
                          className="min-h-12 admin-input--slot-left text-base"
                          disabled={isLoading}
                          required
                        />
                      </span>
                    </label>
                    <label className="mt-4 flex flex-col gap-2">
                      <span className="text-sm font-extrabold text-slate-800">Sandi</span>
                      <span className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-blue-600" />
                        <Input
                          name="firebasePassword"
                          type="password"
                          autoComplete={
                            passwordMode === "signUp" ? "new-password" : "current-password"
                          }
                          minLength={6}
                          placeholder="Minimal 6 karakter"
                          className="min-h-12 admin-input--slot-left text-base"
                          disabled={isLoading}
                          required
                        />
                      </span>
                    </label>
                    {error && !showReset ? (
                      <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                        {error}
                      </p>
                    ) : null}
                    {notice ? (
                      <p className="mt-3 text-sm font-bold text-emerald-700">{notice}</p>
                    ) : null}
                    <Button
                      type="submit"
                      className="mt-5 min-h-12 w-full text-base"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <ArrowRight className="size-5" />
                      )}
                      {passwordMode === "signUp" ? "Daftar" : "Masuk"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 min-h-11 w-full text-sm"
                      onClick={() => {
                        setPasswordMode((mode) => (mode === "signIn" ? "signUp" : "signIn"));
                        setError(null);
                        setNotice(null);
                      }}
                      disabled={isLoading}
                    >
                      {passwordMode === "signIn"
                        ? "Belum punya akun? Daftar saja"
                        : "Sudah punya akun? Masuk saja"}
                    </Button>
                    {showReset ? (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <p className="text-sm leading-6 text-slate-600">
                          Tautan untuk membuat sandi baru dikirim ke email itu. Satu
                          akun satu email, jadi tautannya hanya berlaku sekali dan
                          hanya untuk orang yang memegang kotak masuk tersebut.
                        </p>
                        <label className="mt-3 flex flex-col gap-2">
                          <span className="text-sm font-extrabold text-slate-800">
                            Email untuk tautan reset
                          </span>
                          <Input
                            name="resetEmail"
                            type="email"
                            autoComplete="email"
                            placeholder="nama@email.com"
                            className="min-h-12 text-base"
                            value={resetEmail}
                            onChange={(event) => setResetEmail(event.target.value)}
                            disabled={isLoading}
                            required
                          />
                        </label>
                        {error ? (
                          <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                            {error}
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          className="mt-4 min-h-12 w-full text-base"
                          onClick={() => {
                            void handlePasswordReset();
                          }}
                          disabled={isLoading}
                        >
                          {isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
                          {isLoading ? "Mengirim..." : "Kirim tautan reset"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-1 min-h-11 w-full text-sm"
                        onClick={() => {
                          setError(null);
                          setNotice(null);
                          setShowReset(true);
                        }}
                        disabled={isLoading}
                      >
                        Lupa sandi?
                      </Button>
                    )}
                  </CardContent>
                </form>
              ) : (
              <div>
                <CardContent>
                  {/* FASE 9.2 - satu-satunya pintu masuk yang tersisa.

                      Provider `email-otp` sudah dihapus (lihat `src/convex/auth.ts`),
                      jadi tombol Google dan email-sandi ini sekarang SELURUH isi
                      layar ini. Karena itu, kalau `firebaseEnabled` false, layar
                      tidak boleh dibiarkan kosong: orang akan mengira situsnya rusak
                      lalu pergi. Blok di bawahnya menjelaskan apa yang belum
                      terisi dan apa yang harus diperbaiki administrator. */}
                  {firebaseEnabled ? (
                    <>
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
                      <div className="my-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <span className="h-px bg-slate-200" />
                        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
                          atau
                        </span>
                        <span className="h-px bg-slate-200" />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-12 w-full text-base"
                        onClick={() => {
                          setError(null);
                          setNotice(null);
                          setStep("password");
                        }}
                        disabled={isLoading}
                      >
                        Gunakan email dan sandi
                      </Button>
                    </>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
                      <p className="text-sm font-black text-slate-900">
                        Pintu masuk belum siap di lingkungan ini.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Masuk dengan Google dan masuk dengan email serta sandi
                        keduanya membaca satu konfigurasi Firebase yang belum
                        terisi pada build ini, jadi tidak ada pintu yang bisa dibuka
                        sekarang. Administrator perlu mengisi kunci API web
                        Firebase, lalu memuat ulang halaman ini. Sesi yang sudah
                        terbentuk tidak ikut hilang karena itu.
                      </p>
                    </div>
                  )}
                  {notice ? (
                    <p className="mt-3 text-sm font-bold text-emerald-700">{notice}</p>
                  ) : null}
                  {error && !showReset ? (
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
              )}
            </>
          ) : null}
            </AnimatedContent>
          </Card>
          </GlassSurface>
        </ScrollReveal>
      </div>
    </main>
  );
}

export default function AuthPage(props: AuthProps) {
  return <Auth {...props} />;
}
