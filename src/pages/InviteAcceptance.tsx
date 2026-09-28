import { useMutation, useQuery, useConvex } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { useCallback, useState } from "react";
import { useParams } from "react-router";

import { api } from "@/convex/_generated/api";
import { TimeStampLabel } from "@/components/admin-workspace";
import { staffRoleLongLabel } from "@/lib/select-options";

/**
 * Halaman penerima undangan: `/invite/:token`.
 *
 * Seseorang yang membuka tautan ini belum punya sesi — itu inti dari fitur
 * ini. Jadi halaman ini tidak pernah membaca apa pun dari localStorage:
 * status, nama peran, dan masa berlaku semuanya datang dari server lewat
 * `getInviteDetails`, dan satu-satunya aksi yang bisa dilakukan adalah
 * "Terima Undangan".
 *
 * Kenapa tidak ada tombol "Masuk" atau "Daftar" di sini: keduanya akan
 * keluar dari jalur undangan, sementara yang dijanjikan ke penerima
 * adalah "satu klik, langsung masuk".
 */

const springIn = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.9 };

export function InviteAcceptance() {
  const { token = "" } = useParams();
  const convex = useConvex();
  const accept = useMutation(api.users.acceptStaffInvite);
  const [phase, setPhase] = useState<"idle" | "accepting" | "done" | "failed">("idle");
  const [failure, setFailure] = useState<string | null>(null);

  const details = useQuery(api.users.getInviteDetails, { token });

  const handleAccept = useCallback(async () => {
    if (phase === "accepting" || phase === "done") return;
    setPhase("accepting");
    setFailure(null);
    try {
      const result = await accept({ token });
      if (!result.ok || !result.tokens) {
        setPhase("failed");
        setFailure(
          result.ok
            ? "Sesi belum bisa diterbitkan. Coba masuk dengan passcode seperti biasanya."
            : failureCopy[result.reason] ?? "Undangan ini tidak dapat diterima.",
        );
        return;
      }

      // Menyimpan token di bawah nama key yang sama seperti Convex Auth
      // sendiri, termasuk namespace alamat deployment. Tanpa namespace ini
      // provider membaca `undefined` dan menganggap belum masuk — persis
      // jebakan yang pernah ditemukan saat menulis harness QA.
      const namespace = convex.url.replace(/[^a-zA-Z0-9]/g, "");
      window.localStorage.setItem("__convexAuthJWT", result.tokens.token);
      window.localStorage.setItem("__convexAuthRefreshToken", result.tokens.refreshToken);
      window.localStorage.setItem(`__convexAuthJWT_${namespace}`, result.tokens.token);
      window.localStorage.setItem(
        `__convexAuthRefreshToken_${namespace}`,
        result.tokens.refreshToken,
      );

      setPhase("done");
      // Muat ulang supaya provider membaca sesi dari storage, lalu ke beranda
      // sesuai peran. `replace` supaya tombol "kembali" tidak menghidupkan
      // ulang halaman undangan yang sudah tidak berlaku.
      window.setTimeout(() => {
        window.location.replace(result.role === "admin" ? "/admin" : "/dashboard");
      }, 420);
    } catch {
      setPhase("failed");
      setFailure("Undangan ini tidak dapat diterima. Muat ulang halaman dan coba lagi.");
    }
  }, [accept, convex.url, phase, token]);

  return (
    <main className="relative flex min-h-dvh min-h-[100svh] items-center justify-center overflow-hidden bg-[#0F172A] p-4 sm:p-6">
      {/* Latar berlapis: tiga warna brand yang sudah ada, tidak ada token baru. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 size-80 rounded-full bg-[#1D4ED8] opacity-40 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 size-96 rounded-full bg-[#0F172A] opacity-70 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 size-72 -translate-y-1/2 rounded-full bg-[#F59E0B] opacity-20 blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {details === undefined ? (
          <motion.p
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex items-center gap-2 text-sm font-bold text-white/80"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Memeriksa undangan…
          </motion.p>
        ) : !details.valid ? (
          <InvalidInviteCard key="invalid" />
        ) : (
          <motion.div
            key="invite"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={springIn}
            className="relative z-10 w-full max-w-lg"
          >
            <div className="overflow-hidden rounded-3xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl">
              <div className="border-b border-white/15 bg-white/5 px-5 py-4 sm:px-7">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#F59E0B]/60 bg-[#F59E0B]/15">
                    <ShieldCheck className="size-5 text-[#F59E0B]" aria-hidden="true" />
                  </span>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">
                    Undangan Resmi Pengelola
                  </p>
                </div>
              </div>

              <div className="px-5 py-6 sm:px-7 sm:py-8">
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                  Undangan Bergabung ke Sistem
                </h1>
                <p className="mt-3 text-sm leading-6 text-white/80 sm:text-base sm:leading-7">
                  Anda telah diundang secara resmi oleh{" "}
                  <span className="font-bold text-white">{details.invitedByName}</span> untuk
                  bergabung dan bertugas pada Sistem Sumenep Buku Kerja.
                </p>

                <dl className="mt-6 space-y-3 rounded-2xl border border-white/15 bg-black/20 p-4 text-left sm:p-5">
                  <SummaryRow label="Akun Tujuan" value={details.email} mono />
                  <SummaryRow
                    label="Amanah / Peran"
                    value={staffRoleLongLabel(details.role)}
                  />
                  <SummaryRow label="Masa Berlaku" value={<TimeStampLabel timestamp={details.expiresAt} />} />
                </dl>

                <p className="mt-4 text-sm leading-6 text-white/75">
                  Dengan menerima undangan ini, sistem akan langsung mengaktifkan hak akses ruang
                  kerja Anda.
                </p>

                <button
                  type="button"
                  onClick={() => void handleAccept()}
                  disabled={phase === "accepting" || phase === "done"}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-base font-black text-[#0F172A] shadow-lg transition hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A] disabled:cursor-wait disabled:opacity-90"
                >
                  {phase === "accepting" ? (
                    <>
                      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                      Mempersiapkan Ruang Kerja…
                    </>
                  ) : phase === "done" ? (
                    <>
                      <ShieldCheck className="size-5" aria-hidden="true" />
                      Undangan Diterima
                    </>
                  ) : (
                    <>
                      Terima Undangan
                      <ArrowRight className="size-5" aria-hidden="true" />
                    </>
                  )}
                </button>

                <p className="mt-3 text-center text-xs leading-5 text-white/60">
                  Hanya berlaku satu kali, khusus untuk{" "}
                  <span className="font-bold text-white/80">{details.email}</span>.
                </p>

                {failure ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-3 py-2 text-sm font-bold text-[#FDE68A]"
                  >
                    {failure}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

const failureCopy: Record<string, string> = {
  ALREADY_ACCEPTED: "Undangan ini sudah pernah dipakai. Hubungi administrator untuk tautan baru.",
  EXPIRED_OR_INVALID: "Undangan ini sudah tidak berlaku atau pernah dipakai sebelumnya.",
  EMAIL_MISMATCH: "Anda sedang masuk dengan email lain. Keluar dulu, lalu buka ulang tautan ini.",
  CANNOT_DEMOTE_ADMIN: "Peran admin tidak dapat diubah lewat undangan.",
  SESSION_MINT_FAILED: "Akun sudah dibuat, tetapi sesi belum terbit. Masuk dengan passcode seperti biasanya.",
};

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-[0.7rem] font-black uppercase tracking-[0.1em] text-white/55 sm:w-32">
        {label}
      </dt>
      <dd
        className={`min-w-0 break-words text-sm font-bold text-white ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function InvalidInviteCard() {
  return (
    <motion.div
      key="invalid"
      initial={{ opacity: 0, scale: 0.95, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -8 }}
      transition={springIn}
      role="alert"
      className="relative z-10 w-full max-w-md"
    >
      <div className="overflow-hidden rounded-3xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl">
        <div className="px-5 py-6 text-center sm:px-7 sm:py-8">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/25 bg-white/10">
            <ShieldX className="size-6 text-white/80" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-black text-white sm:text-2xl">
            Tautan Undangan Tidak Berlaku
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Tautan ini telah digunakan sebelumnya atau masa aktifnya telah kedaluwarsa.
            Silakan hubungi Administrator untuk mendapatkan undangan baru.
          </p>
          <button
            type="button"
            onClick={() => window.location.replace("/auth")}
            className="mt-6 w-full rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0F172A] transition hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
          >
            Kembali ke Halaman Masuk
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default InviteAcceptance;
