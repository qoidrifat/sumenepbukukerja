import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Lock,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

/** Peran pengelola, ditulis ulang supaya daftar di halaman akses tertutup sama
 *  persis dengan aturan yang ditegakkan server. */
const STAFF_ROLE_CARDS = [
  {
    role: "Admin",
    tone: "bg-[#FFE662]",
    summary: "Akses penuh, termasuk mengelola peran pengelola lain.",
    points: ["Moderasi & arsip listing", "Verifikasi klaim dan foto", "Kelola peran staff"],
  },
  {
    role: "Staff",
    tone: "bg-[#DCEBD7]",
    summary: "Moderasi harian dan pengelolaan data listing.",
    points: ["Setujui atau tolak klaim", "Moderasi foto dan laporan", "Ubah status listing"],
  },
  {
    role: "Viewer",
    tone: "bg-[#E7E5E4]",
    summary: "Hanya membaca data, tanpa bisa mengubah apa pun.",
    points: ["Lihat seluruh katalog", "Lihat antrean moderasi", "Tidak dapat menyimpan perubahan"],
  },
] as const;

/**
 * Halaman "/admin" untuk siapa pun yang belum berhak: tamu yang belum masuk
 * maupun warga yang sudah masuk tetapi belum punya peran.instead of redirect,
 *cbi menjelaskan di sini supaya tidak terasa seperti halaman rusak.
 */
export type AdminAccessGateState = {
  signedIn: boolean;
  accountName?: string;
  bootstrapAvailable: boolean;
  bootstrapEligible: boolean;
  bootstrapBlocker?: "signedOut" | "noEmail" | "notAllowlisted" | null;
  deployment?: string | null;
  accountEmail?: string | null;
};

/**
 * Alasan tombol mati ditulis per penyebab, karena setiap penyebab punya
 * tindakan yang sama sekali berbeda. Satu pesan generik membuat orang mencoba
 * ulang berkali-kali tanpa tahu harus mengubah apa.
 */
const BLOCKER_GUIDE: Record<string, { title: string; body: string }> = {
  noEmail: {
    title: "Akun ini masuk sebagai tamu, jadi tidak punya email",
    body: "Sesi yang sedang dipakai dibuat lewat Mode tamu, sehingga tidak tercatat email sama sekali. Allowlist tidak akan pernah cocok untuk akun tanpa email. Keluar dulu dari akun ini, lalu masuk lagi memakai email Anda dan kode OTP.",
  },
  notAllowlisted: {
    title: "Email Anda belum terdaftar untuk akses awal",
    body: "Akun ini punya email, tapi email itu tidak ada di daftar yang diizinkan. Salin email di bawah, lalu tempelkan ke variabel STAFF_BOOTSTRAP_EMAILS di tab Keys. Halaman ini akan ikut berubah sendiri begitu daftarnya cocok, tanpa perlu muat ulang.",
  },
  signedOut: {
    title: "Belum masuk",
    body: "Masuk terlebih dahulu supaya server bisa membandingkan email akun Anda dengan daftar yang diizinkan.",
  },
};

export function AdminAccessDenied({
  signedIn,
  accountName,
  bootstrapAvailable,
  bootstrapEligible,
  bootstrapBlocker = null,
  deployment = null,
  accountEmail = null,
}: AdminAccessGateState) {
  const navigate = useNavigate();
  const bootstrap = useMutation(api.users.bootstrapAdministrator);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyEmail = () => {
    if (!accountEmail) return;
    void navigator.clipboard
      .writeText(accountEmail)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };
  const activate = () => {
    setBusy(true);
    setError("");
    void bootstrap({})
      .then(() => window.location.reload())
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Admin awal belum dapat diaktifkan.",
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <div className="admin-workspace flex min-h-dvh flex-col bg-[#FAF7EE] text-[#1A1A1A]">
      <header className="border-b-2 border-[#121212] bg-[#FAF7EE] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-6 lg:px-10">
          <Link
            to="/"
            className="admin-btn admin-btn-secondary min-h-12 shrink-0 px-3 sm:px-4"
            aria-label="Kembali ke katalog publik"
          >
            <ArrowLeft className="size-5 shrink-0" />
            <span className="hidden sm:inline">Kembali ke katalog</span>
            <span className="sm:hidden">Beranda</span>
          </Link>
          <div className="flex min-w-0 items-center justify-end gap-3 text-right">
            <img
              src="/brand/logo-mark.svg"
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-lg border-2 border-[#121212] bg-white object-contain shadow-[2px_2px_0_#121212]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-black uppercase tracking-[-0.035em] sm:text-lg">
                Sumenep Buku Kerja
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#525252]">Ruang pengelola</p>
            </div>
          </div>
        </div>
      </header>
      <div
        className="h-2 shrink-0 bg-[linear-gradient(90deg,#ff5a26_0_38%,#ffe662_38%_72%,#121212_72%_100%)]"
        aria-hidden="true"
      />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <section className="admin-card p-6 sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[#121212] bg-[#FFE662] shadow-[4px_4px_0_#121212]">
              <Lock className="size-8" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF5A26]">
                Halaman terbatas
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                Ruang ini tidak bisa diakses
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-[#525252]">
                {signedIn
                  ? `${accountName ? `Akun ${accountName}` : "Akun Anda"} sudah masuk, tetapi belum memiliki peran admin, staff, atau viewer.${bootstrapAvailable ? " Jalur pemulihan untuk akses awal masih terbuka di bagian bawah halaman ini." : " Peran hanya bisa diberikan oleh admin yang sudah aktif lewat menu Peran & Audit, jadi ruang ini tidak bisa dibuka dari halaman ini."}`
                  : "Ruang pengelola hanya terbuka untuk pengelola Buku Kerja. Silakan masuk terlebih dahulu, lalu hubungi admin agar akun Anda diberi peran yang sesuai."}
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            {signedIn ? null : (
              <button
                type="button"
                onClick={() => navigate("/auth?returnTo=%2Fadmin")}
                className="admin-btn admin-btn-primary inline-flex min-h-12"
              >
                <KeyRound className="size-5" aria-hidden="true" />
                Masuk untuk cek akses
              </button>
            )}
            <Link to="/dashboard" className="admin-btn admin-btn-secondary inline-flex min-h-12">
              Ruang warga saya
            </Link>
            <Link to="/#permintaan" className="admin-btn admin-btn-secondary inline-flex min-h-12">
              Posting kebutuhan
            </Link>
          </div>
        </section>

        {signedIn && bootstrapAvailable ? (
          <section aria-labelledby="pulihkan-akses" className="admin-card p-6 sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[#121212] bg-[#DCEBD7] shadow-[4px_4px_0_#121212]">
                <ShieldCheck className="size-8" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF5A26]">
                  Jalur pemulihan
                </p>
                <h2
                  id="pulihkan-akses"
                  className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-3xl"
                >
                  {bootstrapEligible
                    ? "Email Anda terdaftar untuk akses awal"
                    : (BLOCKER_GUIDE[bootstrapBlocker ?? "notAllowlisted"]?.title ??
                      "Email Anda belum terdaftar untuk akses awal")}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[#525252]">
                  {bootstrapEligible
                    ? "Deployment ini masih membuka jalur bootstrap admin, dan email akun yang sedang masuk ada di daftar yang diizinkan. Klik tombol di bawah untuk menetapkan peran admin pada akun ini."
                    : (BLOCKER_GUIDE[bootstrapBlocker ?? "notAllowlisted"]?.body ??
                      "Email akun yang sedang masuk tidak ada di daftar yang diizinkan.")}
                </p>
                {deployment ? (
                  <p className="mt-4 break-all rounded-lg border-2 border-[#121212] bg-[#FAF7EE] p-3 text-xs leading-5 text-[#525252]">
                    <span className="font-black text-[#1A1A1A]">Backend yang dipakai: </span>
                    {deployment}
                  </p>
                ) : null}
                {error ? (
                  <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {bootstrapEligible ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={activate}
                      className="admin-btn admin-btn-primary inline-flex min-h-12"
                    >
                      <ShieldCheck className="size-5" aria-hidden="true" />
                      {busy ? "Mengaktifkan..." : "Aktifkan admin awal"}
                    </button>
                  ) : accountEmail ? (
                    <>
                      <p className="min-w-0 flex-1 break-all rounded-lg border-2 border-[#121212] bg-[#FAF7EE] p-3 text-sm font-bold text-[#1A1A1A]">
                        {accountEmail}
                      </p>
                      <button
                        type="button"
                        onClick={copyEmail}
                        className="admin-btn admin-btn-secondary inline-flex min-h-12 shrink-0"
                      >
                        <Copy className="size-5" aria-hidden="true" />
                        {copied ? "Tersalin" : "Salin email"}
                      </button>
                    </>
                  ) : null}
                  <Link to="/dashboard" className="admin-btn admin-btn-secondary inline-flex min-h-12">
                    Ruang warga saya
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="peran-pengelola">
          <h2
            id="peran-pengelola"
            className="text-sm font-black uppercase tracking-[0.18em] text-[#525252]"
          >
            Tiga peran pengelola
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {STAFF_ROLE_CARDS.map((card) => (
              <li key={card.role} className="admin-card flex flex-col p-5">
                <span
                  className={`inline-flex w-fit items-center rounded-lg border-2 border-[#121212] px-2.5 py-1 text-sm font-black uppercase tracking-[0.08em] shadow-[2px_2px_0_#121212] ${card.tone}`}
                >
                  {card.role}
                </span>
                <p className="mt-4 text-sm font-bold leading-6 text-[#1A1A1A]">{card.summary}</p>
                <ul className="mt-3 space-y-1.5">
                  {card.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-[#525252]">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[#FF5A26]"
                        aria-hidden="true"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <p className="max-w-3xl text-sm leading-6 text-[#525252]">
          Peran ditentukan oleh server dari catatan <code>staffMembers</code>, bukan
          dari tautan, parameter URL, atau kode yang diketik di browser. Karena itu
          tidak ada passcode yang bisa membuka halaman ini dari sisi pengunjung.
        </p>
      </main>
    </div>
  );
}

/**
 * Deployment ini belum punya satu pun pengelola. Tanpa kartu ini, pengunjung
 * hanya melihat "Anda bukan staff" — padahal tidak ada siapa pun yang bisa
 * memberikan peran itu. Steelit ini yang dingin, jadi di sini Told it.
 */
export function AdminSetupRequired({ bootstrapAvailable }: { bootstrapAvailable: boolean }) {
  const bootstrap = useMutation(api.users.bootstrapAdministrator);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="admin-workspace flex min-h-dvh flex-col bg-[#FAF7EE] text-[#1A1A1A]">
      <header className="border-b-2 border-[#121212] bg-[#FAF7EE] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="admin-btn admin-btn-secondary min-h-12 shrink-0 px-3 sm:px-4"
            aria-label="Kembali ke katalog publik"
          >
            <ArrowLeft className="size-5 shrink-0" />
            <span className="hidden sm:inline">Kembali ke katalog</span>
            <span className="sm:hidden">Beranda</span>
          </Link>
          <div className="flex min-w-0 items-center justify-end gap-3 text-right">
            <img
              src="/brand/logo-mark.svg"
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-lg border-2 border-[#121212] bg-white object-contain shadow-[2px_2px_0_#121212]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-black uppercase tracking-[-0.035em] sm:text-lg">
                Sumenep Buku Kerja
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#525252]">Ruang pengelola</p>
            </div>
          </div>
        </div>
      </header>
      <div
        className="h-2 shrink-0 bg-[linear-gradient(90deg,#ff5a26_0_38%,#ffe662_38%_72%,#121212_72%_100%)]"
        aria-hidden="true"
      />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-10 sm:px-6">
        <section className="admin-card p-6 sm:p-10">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl border-2 border-[#121212] bg-[#FFE662] shadow-[4px_4px_0_#121212]">
            <UserRound className="size-8" aria-hidden="true" />
          </span>
          <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-[#FF5A26]">
            Perlu satu langkah lagi
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
            Belum ada pengelola di deployment ini
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#525252]">
            Passcode dan verifikasi email Anda sudah benar. Yang belum ada adalah
            peran pengelola di akun ini, dan saat ini tidak ada pengelola lain
            yang bisa memberikan peran tersebut.
          </p>

          {bootstrapAvailable ? (
            <>
              <p className="mt-5 rounded-lg border-2 border-[#121212] bg-[#DCEBD7] p-4 text-sm font-bold leading-6 text-[#24533A]">
                Bootstrap admin aktif dan akun ini terdaftar di allowlist. Klik
                tombol di bawah untuk menetapkan diri sebagai admin awal.
              </p>
              {error ? (
                <p className="mt-3 text-sm font-bold text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void bootstrap({})
                      .then(() => window.location.reload())
                      .catch((caught: unknown) =>
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : "Admin awal belum dapat diaktifkan.",
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                  className="admin-btn admin-btn-primary inline-flex min-h-12"
                >
                  <ShieldCheck className="size-5" aria-hidden="true" />
                  {busy ? "Mengaktifkan..." : "Aktifkan admin awal"}
                </button>
                <Link to="/" className="admin-btn admin-btn-secondary inline-flex min-h-12">
                  Kembali ke katalog
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-5 rounded-lg border-2 border-[#121212] bg-[#E9B4A7] p-4 text-sm font-bold leading-6 text-[#7C2D12]">
                Bootstrap admin belum aktif, jadi belum ada cara untuk masuk
                sebagai pengelola. Tambahkan environment berikut di tab
                Keys/API keys, nilainya email yang sedang Anda pakai untuk
                masuk:
              </p>
              <pre className="mt-3 overflow-x-auto border-2 border-[#121212] bg-white p-4 text-sm font-black">
                STAFF_BOOTSTRAP_EMAILS = email-anda@contoh.com
              </pre>
              <p className="mt-3 text-sm leading-6 text-[#525252]">
                Setelah environment itu tersimpan, muat ulang halaman ini. Tombol
                Aktifkan admin awal akan muncul. Hapus environment tersebut
                setelah berhasil, supaya tidak ada akun lain yang bisa mengambil
                peran admin.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="admin-btn admin-btn-primary inline-flex min-h-12"
                >
                  <RotateCcw className="size-5" aria-hidden="true" />
                  Muat ulang halaman
                </button>
                <Link to="/" className="admin-btn admin-btn-secondary inline-flex min-h-12">
                  Kembali ke katalog
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
