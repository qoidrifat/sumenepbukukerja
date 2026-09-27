import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { useCatalogSeedBootstrap } from "@/lib/catalog-store";
import { BrandMascot } from "@/components/brand-mascot";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const VendorProfile = lazy(() => import("./pages/VendorProfile.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
/* Preview maskot hanya untuk QA desain (Phase 3). Routenya didaftarkan di
   bawah hanya saat DEV, jadi tidak pernah masuk build produksi. */
const MascotPreview = import.meta.env.DEV
  ? lazy(() => import("./pages/MascotPreview.tsx"))
  : null;

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-dvh min-h-[100svh] flex items-center justify-center bg-[#f7f8fc] text-base font-semibold text-slate-600">
      <div className="flex flex-col items-center gap-5">
        <BrandMascot state="working" size="md" animated={false} />
        <div className="animate-pulse">Menyiapkan catatan lokal...</div>
      </div>
    </div>
  );
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
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh min-h-[100svh] items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-lg rounded-2xl border border-border bg-background p-6 text-center shadow-lg" role="alert">
            <p className="text-lg font-black">Buku Kerja sedang mengalami gangguan</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Data Anda tidak diubah. Muat ulang halaman atau kembali ke katalog untuk melanjutkan.</p>
            <p className="mt-3 break-words text-xs text-muted-foreground">{this.state.message}</p>
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

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
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
        <BrowserRouter>
          <CatalogBootstrap />
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={<Admin />}
              />
              <Route path="/v/:slug" element={<VendorProfile />} />
              <Route path="*" element={<NotFound />} />
              {MascotPreview ? (
                <Route path="/__mascot" element={<MascotPreview />} />
              ) : null}
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
