import { Outlet } from "react-router";
import {
  BarChart3,
  Inbox,
  LayoutDashboard,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { AdminSidebar } from "@/components/admin-sidebar";
import { useCurrentAccess } from "@/lib/catalog-store";

/**
 * Kerangka ruang pengelola untuk rute bertingkat `/admin/*`.
 *
 * Hanya scope + sidebar + `<Outlet/>`: header dan isi tiap halaman tetap
 * milik halamannya masing-masing, supaya slice pertama ini tidak mengubah
 * tampilan panel yang sudah ada. Item "Peran" tampil hanya bila
 * `useCurrentAccess().canManageRoles` — sembunyi = UX saja, guard tetap
 * server.
 */
export function AdminShell() {
  const access = useCurrentAccess();
  return (
    <div className="admin-workspace min-h-dvh bg-[#FAF7EE] text-[#1A1A1A]">
      <div className="admin-shell-frame mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10 sm:flex-row sm:items-start">
        <AdminSidebar
          items={[
            { to: "/admin", label: "Ringkasan", icon: LayoutDashboard, visible: true },
            { to: "/admin/katalog", label: "Katalog", icon: Store, visible: true },
            { to: "/admin/moderasi", label: "Moderasi", icon: Inbox, visible: true },
            { to: "/admin/keamanan", label: "Keamanan", icon: ShieldCheck, visible: true },
            { to: "/admin/sistem", label: "Sistem", icon: BarChart3, visible: true },
            {
              to: "/admin/peran",
              label: "Peran",
              icon: UserRound,
              visible: access?.canManageRoles ?? false,
            },
          ]}
        />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
