import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { SessionRevokedGuard } from "@/components/session-revoked-guard";
import { RequireAuth } from "@/components/RequireAuth";
import { SessionGateBoundary } from "@/components/SessionGateBoundary";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { useCatalogSeedBootstrap } from "@/lib/catalog-store";
import { MascotLoader } from "@/components/mascot-loader";
import { ErrorReportDialog, ErrorReportProvider } from "@/components/error-report-dialog";
import { StatusDialogHost } from "@/components/status-dialog";
import { getErrorReporter } from "@/lib/error-report-bus";
import { reportErrorToServer } from "@/lib/error-reporter";
import { ERROR_CODES } from "@/lib/error-reporting";
import { isStaleChunkError, recoverFromStaleChunk } from "@/lib/chunk-recovery";
import "./index.css";

// Lazy load route components for better code splitting

/**
 * Toolbar pratinjau dimuat SAAT SIBUK, bukan saat render awal.
 *
 * Alasannya diukur, bukan dugaan: berkasnya mengimpor `@zumer/snapdom`,
 * yang menarik `html2canvas` (56 kB). Saat diimpor statis, kedua paket itu
 * ikut terunduh di jalur kritis SETIAP halaman publik - termasuk landing yang
 * katalognya harus tampil cepat. Alat ini untuk memeriksa desain, bukan
 * bagian dari fungsi katalog, jadi menundanya tidak mengubah apa pun
 * yang dilihat pengguna.
 *
 * Berkas `vly-toolbar-readonly.tsx` tidak diubah; hanya cara memuatnya.
 */
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const EmailOtpPage = lazy(() => import("./pages/EmailOtp.tsx"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicy.tsx"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfService.tsx"));
const InviteAcceptance = lazy(() => import("./pages/InviteAcceptance.tsx"));
const WargaDashboard = lazy(() => import("./pages/WargaDashboard.tsx"));
const MitraDashboard = lazy(() => import("./pages/MitraDashboard.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
// Kerangka + halaman bertingkat ruang pengelola (slice Task 1: baru `/sistem`).
// Komponennya named export, jadi dipetakan ke default untuk `lazy`.
const AdminShell = lazy(() =>
  import("./pages/admin/AdminShell.tsx").then((m) => ({ default: m.AdminShell })),
);
const SistemPage = lazy(() =>
  import("./pages/admin/SistemPage.tsx").then((m) => ({ default: m.SistemPage })),
);
const VendorProfile = lazy(() => import("./pages/VendorProfile.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
/* Preview maskot hanya untuk QA desain (Phase 3). Routenya didaftarkan di
   bawah hanya saat DEV, jadi tidak pernah masuk build produksi. */
const MascotPreview = import.meta.env.DEV
  ? lazy(() => import("./pages/MascotPreview.tsx"))
  : null;

// Loading maskot per rute untuk transisi halaman: maskot + ekspresi
// berbeda tiap halaman, koreografi 2,4 detik, diam total saat
// reduced-motion. Menggantikan teks denyut statis sebelumnya.
function RouteLoading() {
  return <MascotLoader />;
}

/**
 * Backward-compat `/dashboard` → `/warga/dashboard`.
 *
 * Hash dipertahankan: tautan `/dashboard#listing-saya` (notifikasi) harus
 * mendarat di section yang sama, dan `Navigate` polos akan membuangnya.
 */
function DashboardRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/warga/dashboard", hash: location.hash }} replace />;
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string; reportId?: string }
> {
  state = { hasError: false, message: "", stack: "", reportId: undefined };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
      reportId: undefined,
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
    // Chunk basi dipulihkan dulu: satu muat ulang, dibatasi `sessionStorage`
    // supaya tidak berputar tanpa henti kalau asetnya memang benar-benar tidak
    // ada. Kalau ini berhasil, layar gangguan hanya sempat berkedip.
    const recovery = recoverFromStaleChunk(err.message, {
      reload: () => window.location.reload(),
    });
    // Muat ulang langsung mematikan konteks JS ini, jadi laporan Critical yang
    // dikirim sekarang hampir pasti tidak sampai ke server. Peristiwa yang
    // memulihkan dirinya sendiri pun bukan gangguan yang perlu ditindak admin:
    // jejaknya cukup di console. Jalur lain (bukan chunk basi, atau penjaga
    // anti-putar sudah kena sehingga muat ulang ditahan) tetap dilaporkan.
    if (recovery === "reloaded") return;
    // Crash total dilaporkan, tapi popup sengaja tidak dibuka: dialog-nya ada
    // di dalam provider yang justru ikut tumbang. ID laporan ditampilkan
    // inline supaya pengguna bisa menyebutkannya.
    const reporter = getErrorReporter();
    if (!reporter) return;
    void reportErrorToServer(reporter, {
      kind: "critical",
      code: ERROR_CODES.runtime,
      severity: "critical",
      source: "client",
      feature: "Application Shell",
      operation: "RootErrorBoundary",
      route: typeof window === "undefined" || !window.location ? undefined : window.location.pathname,
      message: err.message,
      stack: err.stack,
      userMessage: "Aplikasi mengalami gangguan total dan dimuat ulang.",
      context: { boundary: "root", staleChunkRecovery: recovery },
    }).then((outcome) => {
      if (outcome.reportId) this.setState({ reportId: outcome.reportId });
    });
  }
  render() {
    if (this.state.hasError) {
      // Chunk basi bukan kerusakan data, jadi pengguna tidak perlu diberi tahu
      // bahwa aplikasinya "mengalami gangguan total" — cukup bahwa halaman
      // sedang menyegarkan versi asetnya.
      const staleChunk = isStaleChunkError(this.state.message);
      return (
        <div className="flex min-h-dvh min-h-[100svh] items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-lg rounded-2xl border border-border bg-background p-6 text-center shadow-lg" role="alert">
            <p className="text-lg font-black">
              {staleChunk ? "Menyegarkan versi terbaru" : "Buku Kerja sedang mengalami gangguan"}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {staleChunk
                ? "Aplikasi sudah diperbarui sejak tab ini dibuka, jadi versi aset di halaman ini sudah tidak cocok lagi. Muat ulang halaman sekali untuk melanjutkan."
                : "Data Anda tidak diubah. Muat ulang halaman atau kembali ke katalog untuk melanjutkan."}
            </p>
            <p className="mt-3 break-words text-xs text-muted-foreground">{this.state.message}</p>
            {this.state.reportId ? (
              <p className="mt-2 font-mono text-xs font-bold text-muted-foreground">
                ID Laporan {this.state.reportId}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Muat ulang</button>
              <a href="/" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Kembali ke katalog</a>
            </div>
            {this.state.stack ? <details className="mt-4 text-left text-xs text-muted-foreground"><summary>Detail teknis</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border/60 p-2">{this.state.stack}</pre></details> : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Preferensi tampilan yang sudah tersimpan tetap dihormati setelah tombol
 * "Teks besar" dan "Kontras" dihapus dari antarmuka.
 *
 * Kedua tombol itu tidak ada lagi, jadi tidak ada yang bisa MENGAKTIFKAN
 * preferensi baru. Yang masih bisa terjadi adalah pengguna yang dulu pernah
 * menyalakannya membuka lagi situs ini: tanpa baris di bawah, preferensi yang
 * sudah tersimpan berhenti berlaku diam-diam dan override CSS-nya jadi tidak
 * terpakai. Baris ini menutup celah itu, dan nilainya dibaca SEBELUM render
 * pertama supaya tidak ada kedipan layout.
 *
 * Nama key localStorage dan nama atribut di `<html>` tidak berubah keduanya
 * bagian dari keputusan yang dikunci `display-mode-decision.test.ts`.
 *
 * Kegagalan localStorage (mode privat, iframe tersematkan) tidak boleh
 * menghentikan halaman: preferensi ini kosmetik, jadi galatnya ditelan.
 */
function applyStoredDisplayPreferences(): void {
  if (typeof document === "undefined") return;
  const pasangan = [
    ["sumenep-large-text", "largeText"],
    ["sumenep-high-contrast", "highContrast"],
  ] as const;
  for (const [key, atribut] of pasangan) {
    try {
      document.documentElement.dataset[atribut] =
        window.localStorage.getItem(key) === "true" ? "true" : "false";
    } catch {
      // Lihat catatan fungsi ini: preferensi kosmetik, halaman tetap jalan.
    }
  }
}

applyStoredDisplayPreferences();

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function CatalogBootstrap() {
  useCatalogSeedBootstrap();
  useEffect(() => {
    // The managed dev server has HMR and a live Convex connection. Registering
    // the offline shell there can serve stale HTML/assets and obscure runtime
    // errors, so it is enabled only for a production build.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Offline shell could not be registered:", error);
      });
    }
  }, []);
  return null;
}

/**
 * Origin yang benar-benar boleh menerima telemetri rute dari iframe ini.
 *
 * SEBELUM PERBAIKAN (FASE 9): satu baris `window.parent.postMessage(
 * { rute }, "*")` mengirimkan setiap perpindahan rute ke SIAPA PUN yang
 * membuka halaman ini di dalam iframe. Pemilik situs luar cukup memasang
 * iframe yang menunjuk ke aplikasi ini dan secara pasif menerima seluruh
 * jejak navigasi pengunjung - termasuk rute profil listing yang sedang
 * dibuka warga, dan rute undangan sebelum tautannya dikonsumsi.
 *
 * Penanda bintang juga berarti pesan yang sama terkirim ke popup/opener mana
 * pun yang kebetulan memegang referensi window ini.
 *
 * Yang dipakai sekarang bukan daftar hitam, melainkan daftar putih eksplisit:
 *
 *  1. DEV - panel pratinjau Freebuff memang butuh telemetri ini untuk
 *     menyinkronkan bilah rutenya, dan origin induknya berasal dari
 *     `VITE_PREVIEW_PARENT_ORIGIN`. Kalau variabel itu tidak diisi, DEV memakai
 *     origin halaman sendiri sehingga pesannya tidak sampai ke induk lintas
 *     origin - dan itu memang perilaku yang benar.
 *  2. PROD - tidak ada nilai bawaan. Telemetri hanya aktif kalau operator
 *     secara eksplisit mengisi `VITE_PREVIEW_PARENT_ORIGIN`. Tanpa itu, tidak
 *     ada satu pun pesan keluar.
 *
 * Sisi masuk (perintah `navigate` dari induk) memakai daftar yang sama, jadi
 * situs luar tidak bisa memerintahkan `history.back()`/`forward()` pada
 * aplikasi ini - itu bukan sekadar kebocoran data, itu manipulasi navigasi.
 */
function trustedParentOrigins(): string[] {
  const configured = (
    import.meta.env.VITE_PREVIEW_PARENT_ORIGIN as string | undefined
  )
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) {
    // Dinormalkan ke bentuk origin supaya variasi garis miring di ujung tetap
    // cocok, tapi jalur lain tidak pernah cocok.
    return configured
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean);
  }
  // DEV tanpa konfigurasi: halaman sendiri. Tidak ada induk lintas origin yang
  // bisa menerima, jadi tidak ada kebocoran - dan tidak ada perintah masuk
  // yang diterima.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return [window.location.origin];
  }
  return [];
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    // `window.parent === window` berarti halaman ini TIDAK berjalan di dalam
    // iframe. Mengirim pesan ke diri sendiri tidak berguna, jadi dilewati.
    if (window.parent === window) return;
    const allowed = trustedParentOrigins();
    if (allowed.length === 0) return;
    for (const origin of allowed) {
      window.parent.postMessage(
        { type: "iframe-route-change", path: location.pathname },
        origin,
      );
    }
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type !== "navigate") return;
      // Perintah navigasi hanya diterima dari induk langsung dan hanya dari
      // origin yang ada di daftar putih. Tanpa dua syarat itu, perintah dari
      // jendela mana pun bisa menggeser riwayat pengguna.
      if (event.source !== window.parent) return;
      const allowed = trustedParentOrigins();
      if (allowed.length === 0 || !allowed.includes(event.origin)) return;
      if (event.data.direction === "back") window.history.back();
      if (event.data.direction === "forward") window.history.forward();
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <ErrorReportProvider>
        <BrowserRouter>
          <CatalogBootstrap />
          <RouteSyncer />
          <SessionRevokedGuard>
          <Suspense fallback={<RouteLoading />}>
            {/* Penolakan sesi ditangani DI DALAM batas root. Tanpa ini,
                sesi yang kedaluwarsa di /dashboard atau /admin akan
                dilaporkan sebagai `critical` dan pengguna melihat
                "gangguan total" padahal yang terjadi cuma perlu masuk
                lagi. Error lain tetap jatuh ke RootErrorBoundary. */}
            <SessionGateBoundary>
              <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route path="/auth/email" element={<EmailOtpPage />} />
              <Route path="/kebijakan-privasi" element={<PrivacyPolicyPage />} />
              <Route path="/syarat-ketentuan" element={<TermsOfServicePage />} />
              <Route path="/dashboard" element={<DashboardRedirect />} />
              <Route
                path="/warga/dashboard"
                element={
                  <RequireAuth>
                    <WargaDashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/mitra/dashboard"
                element={
                  <RequireAuth>
                    <MitraDashboard />
                  </RequireAuth>
                }
              />
              {/* Gate tetap di induk `/admin` (isi `Admin` tidak berubah);
                  halaman bertingkat dirender lewat `AdminShell` + `<Outlet/>`.
                  Slice Task 1: baru `sistem`, rute lain menyusul. */}
              <Route path="/admin" element={<Admin />}>
                <Route element={<AdminShell />}>
                  <Route path="sistem" element={<SistemPage />} />
                </Route>
              </Route>
              <Route
                path="/invite/:token"
                element={<InviteAcceptance />}
              />
              <Route path="/v/:slug" element={<VendorProfile />} />
              <Route path="*" element={<NotFound />} />
                {MascotPreview ? (
                  <Route path="/__mascot" element={<MascotPreview />} />
                ) : null}
              </Routes>
            </SessionGateBoundary>
          </Suspense>
          </SessionRevokedGuard>
        </BrowserRouter>
        <Toaster />
        <ErrorReportDialog />
        <StatusDialogHost />
        </ErrorReportProvider>
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
