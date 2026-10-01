// Layar "buat sandi baru" yang dibuka dari tautan di email.
//
// Kenapa komponen terpisah, bukan tambahan di `Auth.tsx`: berkas auth sudah
// punya tiga cabang tampilan (gerbang passcode, pilihan pintu masuk, dan form
// email-sandi). Menambah satu lagi di sana membuat condition-nya sulit dibaca,
// sementara layar ini punya satu tugas dan satu bentuk.
//
// Alur tautannya:
//   1. `/auth?oobCode=...` dibuka dari email reset
//   2. kode diverifikasi Firebase
//   3. sandi baru disimpan
//
// Yang dijaga di sini:
//   - Kode diverifikasi SEBELUM sandi bisa ditulis, jadi tautan kedaluwarsa
//     atau yang sudah dipakai tidak bisa mengubah kata sandi siapa pun.
//   - Sandi harus diketik dua kali. Kesalahan ketik adalah penyebab utama
//     orang mengira resetnya gagal lalu mencoba ulang.
//   - Setelah sukses, orang diarahkan ke daftar akun, bukan ke dashboard.
//     Memasukinya otomatis akan melewati satu tampilan yang membuat orang
//     merasa login sudah gagal.
//   - Layar ini punya dua tema, dipilih lewat `variant`. Warga mendapat tema
//     publik, pengelola mendapat tema ruang kerja. Ini bukan soal selera:
//     halaman bertema admin adalah pintu masuk sistem internal, dan halaman
//     publik yang muncul di tengah alur itu membuat orang mengira ia tiba di
//     situs yang salah lalu menekan "kembali".

import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Lock } from "lucide-react";
import { useNavigate } from "react-router";
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
import { AdminAuthIdentity, AdminAuthNotice } from "@/components/auth-admin-panel";
import { completePasswordReset, firebaseErrorMessage } from "@/lib/firebase-client";

/** Panjang minimum yang diterima Firebase. */
const MIN_PASSWORD_LENGTH = 6;

export function ResetPasswordForm({
  oobCode,
  variant = "public",
  returnTo = null,
}: {
  oobCode: string;
  /** `admin` dipakai saat tautan dibuka dari ruang /admin. */
  variant?: "public" | "admin";
  /** Tujuan setelah sandi tersimpan; hanya berarti bila `variant` = admin. */
  returnTo?: string | null;
}) {
  const navigate = useNavigate();
  const isAdmin = variant === "admin";
  const afterReset = isAdmin ? `/auth?returnTo=${encodeURIComponent(returnTo || "/admin")}` : "/auth";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && confirm.length > 0 && !mismatch && !isLoading;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mismatch) {
      setError("Kedua sandi tidak sama.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const target = await completePasswordReset(oobCode, password);
      setDone(target.email);
    } catch (caught) {
      setError(firebaseErrorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    if (isAdmin) {
      return (
        <main className="admin-workspace flex min-h-dvh min-h-[100svh] flex-col items-center justify-center px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[#1A1A1A]">
          <div className="admin-shell-frame w-full max-w-xl">
            <AdminAuthIdentity />
            <section className="admin-panel admin-panel-lg overflow-hidden">
              <div className="border-b-2 border-[#121212] bg-[#DCEBD7] px-4 py-4 sm:px-6">
                <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#24533A]">
                  Langkah terakhir
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] text-[#121212] sm:text-3xl">
                  Sandi baru tersimpan
                </h1>
                <p className="mt-2 break-all text-sm leading-6 text-[#1A1A1A]">
                  Akun {done} sudah bisa dipakai. Lanjut masuk dengan passcode
                  ruang admin lalu sandi yang baru saja Anda buat.
                </p>
              </div>
              <div className="px-4 py-4 sm:px-6">
                <button
                  type="button"
                  className="admin-btn admin-btn-primary w-full"
                  onClick={() => navigate(afterReset)}
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                  Kembali ke layar masuk
                </button>
              </div>
            </section>
          </div>
        </main>
      );
    }
    return (
      <main className="notebook-paper flex min-h-dvh min-h-[100svh] flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Card className="w-full max-w-lg border-slate-200 bg-white/95 p-0 shadow-lg sm:p-2">
          <CardHeader className="text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-slate-900 bg-emerald-50 text-emerald-700 shadow-[3px_3px_0_#0f172a]">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <CardTitle className="mt-4 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
              Sandi baru tersimpan
            </CardTitle>
            <CardDescription className="break-all text-base leading-7">
              Akun {done} sudah bisa dipakai. Masuk dengan sandi yang baru Anda buat.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              type="button"
              className="min-h-12 w-full text-base"
              onClick={() => navigate(afterReset)}
            >
              Masuk sekarang
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  if (isAdmin) {
    return (
      <main className="admin-workspace flex min-h-dvh min-h-[100svh] flex-col items-center justify-center px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[#1A1A1A]">
        <div className="admin-shell-frame w-full max-w-xl">
          <AdminAuthIdentity />
          <section className="admin-panel admin-panel-lg overflow-hidden">
            <div className="border-b-2 border-[#121212] bg-[#FFE662] px-4 py-4 sm:px-6">
              <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#525252]">
                Tautan sekali pakai
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] text-[#121212] sm:text-3xl">
                Buat sandi baru
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#1A1A1A]">
                Tautan ini berlaku sekali. Setelah sandi baru tersimpan, tautan
                yang sama tidak bisa dipakai lagi.
              </p>
            </div>

            <form onSubmit={submit}>
              <div className="space-y-4 px-4 py-4 sm:px-6">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-black text-[#1A1A1A]">Sandi baru</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="admin-input"
                    disabled={isLoading}
                    required
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-black text-[#1A1A1A]">Ulangi sandi baru</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Ketik ulang sandi yang sama"
                    className="admin-input"
                    disabled={isLoading}
                    aria-invalid={mismatch}
                    aria-describedby={mismatch ? "reset-mismatch" : undefined}
                    required
                  />
                </label>

                {mismatch ? (
                  <div id="reset-mismatch">
                    <AdminAuthNotice tone="error" icon={AlertTriangle}>
                      Kedua sandi tidak sama.
                    </AdminAuthNotice>
                  </div>
                ) : null}
                {error ? (
                  <AdminAuthNotice tone="error" icon={AlertTriangle}>
                    {error}
                  </AdminAuthNotice>
                ) : null}

                <button
                  type="submit"
                  className="admin-btn admin-btn-primary w-full"
                  disabled={!canSubmit}
                >
                  {isLoading ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  ) : null}
                  {isLoading ? "Menyimpan..." : "Simpan sandi baru"}
                </button>
              </div>

              <div className="flex flex-col gap-2 border-t-2 border-[#121212] px-4 py-4 sm:flex-row sm:px-6">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary w-full sm:w-auto"
                  onClick={() => navigate(afterReset)}
                  disabled={isLoading}
                >
                  <AlertTriangle className="size-5" aria-hidden="true" />
                  Kembali, minta tautan baru
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="notebook-paper flex min-h-dvh min-h-[100svh] flex-col items-center justify-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-lg border-slate-200 bg-white/95 p-0 shadow-lg sm:p-2">
        <form onSubmit={submit}>
          <CardHeader className="text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-slate-900 bg-blue-50 text-blue-700 shadow-[3px_3px_0_#0f172a]">
              <Lock className="size-8" aria-hidden="true" />
            </span>
            <CardTitle className="mt-4 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
              Buat sandi baru
            </CardTitle>
            <CardDescription className="text-base leading-7">
              Tautan ini berlaku sekali. Setelah sandi baru tersimpan, tautan yang
              sama tidak bisa dipakai lagi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-extrabold text-slate-800">Sandi baru</span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimal 6 karakter"
                className="min-h-12 text-base"
                disabled={isLoading}
                required
              />
            </label>
            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm font-extrabold text-slate-800">Ulangi sandi baru</span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Ketik ulang sandi yang sama"
                className="min-h-12 text-base"
                disabled={isLoading}
                aria-invalid={mismatch}
                aria-describedby={mismatch ? "reset-mismatch" : undefined}
                required
              />
            </label>
            {mismatch ? (
              <p id="reset-mismatch" className="mt-3 text-sm font-bold text-red-700" role="alert">
                Kedua sandi tidak sama.
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="mt-5 min-h-12 w-full text-base" disabled={!canSubmit}>
              {isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
              {isLoading ? "Menyimpan..." : "Simpan sandi baru"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 min-h-11 w-full text-sm"
              onClick={() => navigate(afterReset)}
              disabled={isLoading}
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
              Kembali, minta tautan baru
            </Button>
          </CardContent>
        </form>
      </Card>
    </main>
  );
}