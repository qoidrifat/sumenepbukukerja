import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { Menu, X, type LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

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
 *
 * Di bawah `sm` sidebar menjadi drawer: tombol hamburger (`aria-expanded`)
 * membuka/menutup panel. Semua item tetap `<NavLink>` asli (keyboard-native,
 * tanpa `onClick`); drawer menutup sendiri saat rute berpindah, saat diklik
 * di luar, dan saat Escape — dengan fokus dikembalikan ke pemicu
 * (pola `admin-workspace.tsx:137-166`). Tampilan desktop tidak berubah.
 */
export function AdminSidebar({ items }: { items: AdminSidebarItem[] }) {
  const shown = items.filter((item) => item.visible);
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  // Drawer terikat pada rute tempat ia dibuka: pindah halaman otomatis
  // menutup (turunan murni dari `pathname`, tanpa effect) dan fokus pembaca
  // layar mendarat di isi halaman baru tanpa dicuri.
  const [drawer, setDrawer] = useState({ forPathname: pathname, open: false });
  const open = drawer.forPathname === pathname && drawer.open;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  // Panel menutup saat diklik di luar dan saat Escape, dengan fokus
  // dikembalikan ke pemicunya. Tanpa dua hal itu, drawer yang terbuka di
  // ponsel tetap menggantung dan menutupi isi tanpa ada yang memicunya.
  useEffect(() => {
    if (!open) return;
    const close = () =>
      setDrawer((prev) => ({ forPathname: prev.forPathname, open: false }));
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Butir tautan SELALU NavLink asli: bisa difokus keyboard dan diaktifkan
  // dengan Enter tanpa handler klik kustom apa pun.
  const renderLinks = (itemClassName: string) =>
    shown.map((item) => {
      const Icon = item.icon;
      return (
        <li key={item.to} className={itemClassName}>
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
    });

  if (isMobile) {
    return (
      <div className="w-full shrink-0">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls="navigasi-pengelola"
          onClick={() => setDrawer({ forPathname: pathname, open: !open })}
          className="admin-btn admin-btn-secondary w-full justify-start"
        >
          {open ? (
            <X className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Menu className="size-4 shrink-0" aria-hidden="true" />
          )}
          {open ? "Tutup menu" : "Buka menu"}
        </button>
        {open ? (
          <aside
            ref={panelRef}
            aria-label="Navigasi ruang pengelola"
            className="mt-2 border-2 border-[#121212] bg-[#FAF7EE] p-3"
          >
            <nav id="navigasi-pengelola" aria-label="Bagian ruang pengelola">
              <ul className="flex flex-col gap-2">
                {renderLinks("min-w-0")}
              </ul>
            </nav>
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <aside
      aria-label="Navigasi ruang pengelola"
      className="w-full shrink-0 border-2 border-[#121212] bg-[#FAF7EE] p-3 sm:w-60"
    >
      <nav aria-label="Bagian ruang pengelola">
        <ul className="flex flex-row flex-wrap gap-2 sm:flex-col sm:flex-nowrap">
          {renderLinks("min-w-0 flex-1 sm:flex-none")}
        </ul>
      </nav>
    </aside>
  );
}
