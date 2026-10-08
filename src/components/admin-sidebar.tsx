import { NavLink } from "react-router";
import { type LucideIcon } from "lucide-react";

/**
 * Satu item navigasi ruang pengelola.
 *
 * `visible` hanya mengatur TAMPILAN — sembunyi bukan izin. Guard tetap di
 * server (`users.currentAccess` + query yang melempar untuk non-pengelola),
 * jadi item yang disembunyikan tidak bisa dibuka lewat URL langsung.
 */
export type AdminSidebarItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  visible: boolean;
};

/**
 * Sidebar kustom ruang pengelola.
 *
 * Sengaja TIDAK memakai `src/components/ui/sidebar.tsx`: primitive itu milik
 * tema aplikasi (palet + sudut aplikasi), sedangkan ruang pengelola memakai
 * token admin saja (`admin-btn`, hex Warm Brutalism). `NavLink` mengatur
 * `aria-current="page"` otomatis saat rutenya aktif, jadi pembaca layar tahu
 * posisi tanpa atribut manual.
 */
export function AdminSidebar({ items }: { items: AdminSidebarItem[] }) {
  const shown = items.filter((item) => item.visible);
  return (
    <aside
      aria-label="Navigasi ruang pengelola"
      className="w-full shrink-0 border-2 border-[#121212] bg-[#FAF7EE] p-3 sm:w-60"
    >
      <nav aria-label="Bagian ruang pengelola">
        <ul className="flex flex-row flex-wrap gap-2 sm:flex-col sm:flex-nowrap">
          {shown.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to} className="min-w-0 flex-1 sm:flex-none">
                <NavLink
                  to={item.to}
                  end={item.to === "/admin"}
                  className={({ isActive }) =>
                    `admin-btn w-full justify-start ${isActive ? "admin-btn-primary" : "admin-btn-secondary"}`
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
