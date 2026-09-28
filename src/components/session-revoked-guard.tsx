import { useAuthActions } from "@convex-dev/auth/react";
import { Component, useCallback, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Reaksi ke `SESSION_REVOKED` di satu tempat: perangkat yang sesinya dicabut
 * dari Security Desk harus langsung keluar, bukan menampilkan halaman error
 * generik yang membuat orang mengira aplikasinya rusak.
 *
 * Cara kerjanya: server menolak setiap permintaan dengan
 * `ConvexError({ code: "SESSION_REVOKED" })`. Di sisi klien error itu muncul
 * sebagai render error di komponen mana pun yang sedang memanggil query
 * terlindungi, jadi penjaga ini dipasang sekali di atas seluruh rute.
 *
 * Yang dilakukan: hapus sesi di server (bukan sekadar mengosongkan storage),
 * lalu arahkan ke `/auth` dengan `returnTo` supaya orang itu kembali ke tempat
 * yang tadi ia buka setelah masuk ulang.
 */
export function SessionRevokedGuard({ children }: { children: ReactNode }) {
  const { signOut } = useAuthActions();
  const location = useLocation();

  const handleRevoked = useCallback(() => {
    void signOut().catch(() => {
      // Sesi sudah ditolak server. Kegagalan signOut di sini tidak boleh
      // menahan pemindahan halaman.
    });
  }, [signOut]);

  return (
    <SessionRevokedBoundary onRevoked={handleRevoked} returnTo={`${location.pathname}${location.search}`}>
      {children}
    </SessionRevokedBoundary>
  );
}

/**
 * Error boundary khusus untuk satu jenis error ini.
 *
 * Sengaja tidak memakai `RootErrorBoundary` yang sudah ada: yang itu
 * menampilkan tombol "Muat ulang" untuk error tak terduga, sedangkan di sini
 * satu jenis error punya jalur keluar yang sudah ditentukan — keluar dari
 * sesi, bukan memuat ulang halaman yang sama.
 */
class SessionRevokedBoundary extends Component<
  { children: ReactNode; onRevoked: () => void; returnTo: string },
  { revoked: boolean; failed: boolean }
> {
  state = { revoked: false, failed: false };

  static getDerivedStateFromError(error: unknown) {
    if (isSessionRevoked(error)) return { revoked: true, failed: false };
    return { revoked: false, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isSessionRevoked(error)) {
      this.props.onRevoked();
      return;
    }
    // Error lain bukan urusan penjaga ini. Biarkan penjaga error di atas
    // menanganinya; pencatatannya tetap jalan supaya tidak hilang jejak.
    console.error("Kesalahan saat render di luar cakupan penjaga sesi:", error, info.componentStack);
  }

  render() {
    if (this.state.revoked) return <SigningOutScreen returnTo={this.props.returnTo} />;
    if (this.state.failed) {
      return (
        <main className="flex min-h-dvh min-h-[100svh] items-center justify-center bg-background p-6 text-foreground">
          <p className="text-sm font-bold text-muted-foreground" role="alert">
            Halaman ini gagal dimuat.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}

/**
 * Layar perpindahan. Sengaja menampilkan penjelasan singkat, karena
 * parameter `revoked=1` di address bar saja tidak memberi tahu orang apa yang
 * sebenarnya terjadi.
 */
function SigningOutScreen({ returnTo }: { returnTo: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    // Notifikasi sesaat di layar tempat penolakan terjadi. Penting karena
    // orang yang dicabut sedang bekerja dengan halaman yang tidak
    // bergerak — tanpa ini dia hanya melihat layar berganti tanpa alasan.
    // Banner di `/auth` menangani penjelasan yang bertahan setelah landing.
    toast.warning("Sesi Anda telah diakhiri dari perangkat lain.", {
      description: "Masuk kembali dengan passcode untuk melanjutkan.",
      duration: 8000,
    });
    navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}&revoked=1`, { replace: true });
  }, [navigate, returnTo]);

  return (
    <main className="flex min-h-dvh min-h-[100svh] items-center justify-center bg-background p-6 text-foreground">
      <div
        className="max-w-lg rounded-2xl border border-border bg-background p-6 text-center shadow-lg"
        role="status"
        aria-live="polite"
      >
        <p className="text-lg font-black">Sesi Anda telah diakhiri</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Akses ruang admin dicabut dari perangkat lain. Masuk kembali dengan passcode untuk
          melanjutkan.
        </p>
      </div>
    </main>
  );
}

/** ConvexError menyimpan payload-nya di `data`; pesan teks adalah jaring kedua. */
export function isSessionRevoked(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const data = (error as { data?: unknown }).data;
  if (data && typeof data === "object") {
    const code = (data as { code?: unknown }).code;
    if (code === "SESSION_REVOKED") return true;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("diakhiri oleh admin");
}
