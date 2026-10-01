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

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Lock } from "lucide-react";
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
import { completePasswordReset, firebaseErrorMessage } from "@/lib/firebase-client";

/** Panjang minimum yang diterima Firebase. */
const MIN_PASSWORD_LENGTH = 6;

export function ResetPasswordForm({ oobCode }: { oobCode: string }) {
  const navigate = useNavigate();
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
              onClick={() => navigate("/auth")}
            >
              Masuk sekarang
            </Button>
          </CardFooter>
        </Card>
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
              onClick={() => navigate("/auth")}
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