import { useQuery } from "convex/react";
import { Outlet } from "react-router";
import { api } from "@/convex/_generated/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAccessDenied, AdminSetupRequired } from "@/components/admin-access-gate";
import { useCurrentAccess } from "@/lib/catalog-store";
import { useAuth } from "@/hooks/use-auth";

/**
 * Gerbang `/admin`: otorisasi tetap di sini dan tidak berubah.
 *
 * Isi ruang kerja sudah pindah ke rute bertingkat (`OverviewPage`,
 * `KatalogPage`, `ModerasiPage`, `KeamananPage`, `SistemPage`) yang dirender
 * lewat `<Outlet/>` di dalam `AdminShell`. Gate ini hanya mengizinkan atau
 * menolak, bukan menampung panel.
 */
function AdminGate() {
  const access = useCurrentAccess();
  const { isAuthenticated, user } = useAuth();
  const setup = useQuery(api.users.adminSetupStatus, {});
  if (access === undefined || setup === undefined) {
    return (
      <div className="admin-workspace flex min-h-dvh items-center justify-center bg-[#FAF7EE] p-6 text-[#1A1A1A]">
        <div className="admin-card flex items-center gap-3 px-5 py-4">
          <span className="size-3 animate-pulse rounded-full bg-[#FF5A26]" aria-hidden="true" />
          <p className="font-black">Memeriksa akses pengelola...</p>
        </div>
      </div>
    );
  }
  if (access.canViewAdmin) {
    return (
      <TooltipProvider delayDuration={200}>
        <Outlet />
      </TooltipProvider>
    );
  }
  if (!setup.hasAnyStaff) {
    return <AdminSetupRequired bootstrapAvailable={setup.bootstrapAvailable} />;
  }
  return (
    <AdminAccessDenied
      signedIn={isAuthenticated}
      accountName={user?.name}
      bootstrapAvailable={setup.bootstrapAvailable}
      bootstrapEligible={setup.bootstrapEligible}
      bootstrapBlocker={setup.bootstrapBlocker}
      deployment={setup.deployment}
      accountEmail={setup.accountEmail}
    />
  );
}

export default function Admin() {
  return <AdminGate />;
}
