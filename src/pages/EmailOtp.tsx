// Halaman masuk dengan email (OTP 6 digit) — pengganti popup dialog.
//
// Chrome-nya 100% meniru `/auth` layar warga: baris atas (Kembali + lencana
// "Akun warga"), kartu putih dengan logo, judul "Masuk ke Buku Kerja", dan
// deskripsi yang sama. Isinya alur email dua tahap + sukses, lalu navigasi
// ke `returnTo` (default `/dashboard`).
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnimatedContent, GlassSurface, ScrollReveal, ShinyText } from "@/components/react-bits";
import { EmailOtpFlow } from "@/components/email-otp-flow";
import { useAuth } from "@/hooks/use-auth";
import { resolveRedirectAfterAuth } from "@/lib/auth-redirect";

/* Sumber logo yang sama dengan navbar, admin, dan /auth. */
const BRAND_LOGO = "/brand/logo-mark.svg";

const SHELL_WIDTH = "mx-auto w-full max-w-md sm:max-w-lg";

export default function EmailOtpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"));
  const { isLoading: authLoading, isAuthenticated } = useAuth();

  // Sudah masuk = tidak ada urusan di sini.
  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect]);

  return (
    <main className="notebook-paper flex min-h-dvh min-h-[100svh] flex-col px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <div className={`${SHELL_WIDTH} flex items-center justify-between gap-4`}>
        <button
          type="button"
          onClick={() => navigate("/auth")}
          className="-ml-2 flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <ArrowLeft className="size-5" />Kembali
        </button>
        <span className="rounded-full border border-blue-200 bg-white/80 px-3 py-2 text-sm font-extrabold text-blue-700">
          <ShinyText
            text="Akun warga"
            color="#1d4ed8"
            shineColor="#93c5fd"
            speed={4.5}
          />
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center px-2 py-8 sm:py-10">
        <ScrollReveal className={SHELL_WIDTH}>
          <GlassSurface tint="light" className="w-full rounded-2xl p-0 shadow-lg">
            <Card className="w-full border-slate-200 bg-white/95 p-0 shadow-lg sm:p-2">
              <AnimatedContent animationKey="email-otp">
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
                    Simpan listing favorit dan sinkronkan dari perangkat mana pun.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EmailOtpFlow onVerified={() => navigate(redirect)} />
                </CardContent>
              </AnimatedContent>
            </Card>
          </GlassSurface>
        </ScrollReveal>
      </div>
    </main>
  );
}
