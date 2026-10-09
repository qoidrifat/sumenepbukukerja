import { Outlet } from "react-router";
import {
  BarChart3,
  Inbox,
  LayoutDashboard,
  ShieldCheck,
  Store,
} from "lucide-react";
import { AdminSidebar } from "@/components/admin-sidebar";
import { useReviewQueue } from "@/lib/catalog-store";

/**
 * Kerangka ruang pengelola untuk rute bertingkat `/admin/*`.
 *
 * Hanya scope + sidebar + `<Outlet/>`: header dan isi tiap halaman tetap
 * milik halamannya masing-masing, supaya slice pertama ini tidak mengubah
 * tampilan panel yang sudah ada.
 *
 * Landmark main TUNGGAL hidup di sini (elemen main membungkus Outlet);
 * semua halaman di bawahnya mengembalikan div polos tanpa main maupun
 * bingkai dalam, supaya tiap halaman punya tepat satu landmark.
 *
 * Item "Peran" SENGAJA tidak ada: tidak ada halaman `/admin/peran` di IA.
 * Kelola peran + undangan hidup di `SistemPage` (halaman Sistem = metrik +
 * peran/undangan), jadi sidebar lima item sudah lengkap.
 *
 * Antrean review (`reviewQueue`, lonceng di `AdminHeader`) dihitung SEKALI
 * di sini lalu diteruskan lewat konteks `<Outlet/>`, supaya badge-nya tetap
 * hidup di semua halaman tanpa tiap halaman langganan sendiri. Convex
 * mendedup query yang sama, jadi langganan ganda (shell + `ModerasiPage`)
 * tidak menambah permintaan jaringan.
 */
export function AdminShell() {
  const reviewQueue = useReviewQueue();
  return (
    <div className="admin-workspace min-h-dvh min-h-[100svh] pb-[calc(2rem+env(safe-area-inset-bottom))] bg-[#FAF7EE] text-[#1A1A1A]">
      <div className="admin-shell-frame mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10 min-[768px]:flex-row min-[768px]:items-start">
        <AdminSidebar
          items={[
            { to: "/admin", label: "Ringkasan", icon: LayoutDashboard, visible: true },
            { to: "/admin/katalog", label: "Katalog", icon: Store, visible: true },
            { to: "/admin/moderasi", label: "Moderasi", icon: Inbox, visible: true },
            { to: "/admin/keamanan", label: "Keamanan", icon: ShieldCheck, visible: true },
            { to: "/admin/sistem", label: "Sistem", icon: BarChart3, visible: true },
          ]}
        />
        <main className="min-w-0 flex-1">
          <Outlet context={{ reviewQueue }} />
        </main>
      </div>
    </div>
  );
}
