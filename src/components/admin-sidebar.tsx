import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { Menu, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
 * Gerak (kontrak di `admin-motion-contract.test.ts`):
 *
 * - Desktop: `<aside>` ikut `min-[768px]:sticky` dengan offset
 *   `sm:top-7 lg:top-10` — persis padding `py-7`/`py-10` bingkai shell,
 *   supaya tepi sidebar sejajar tepi bingkai saat menempel. `pinned` datang
 *   dari sentinel di `AdminShell` dan menambah bayangan tipis `admin-stuck`.
 * - Mobile (≤767px): pembungkus tombol hamburger ikut sticky tepat di
 *   bawah header (`safe-area` + 64px baris + 10px bar + 2px border =
 *   4.75rem), dan panel drawer terbuka lewat `AnimatePresence` + spring
 *   ala Apple — dengan `useReducedMotion` mematikan geraknya. Panel
 *   ber-max-height agar baris terakhir tetap terjangkau di layar pendek.
 * - Semua item tetap `<NavLink>` asli (keyboard-native, tanpa `onClick`);
 *   drawer menutup sendiri saat rute berpindah, saat diklik di luar, dan
 *   saat Escape — dengan fokus dikembalikan ke pemicu
 *   (pola `admin-workspace.tsx:137-166`). Tampilan desktop tidak berubah.
 */
export function AdminSidebar({
  items,
  pinned,
}: {
  items: AdminSidebarItem[];
  pinned: boolean;
}) {
  const shown = items.filter((item) => item.visible);
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
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
      <div
        className={`w-full shrink-0 sticky top-[calc(env(safe-area-inset-top)+4.75rem)] z-30${pinned ? " admin-stuck" : ""}`}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? "navigasi-pengelola" : undefined}
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
        <AnimatePresence>
          {open ? (
            <motion.aside
              ref={panelRef}
              aria-label="Navigasi ruang pengelola"
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 420, damping: 32, mass: 0.7 }
              }
              className="mt-2 max-h-[calc(100dvh-4.75rem-env(safe-area-inset-top))] origin-top overflow-y-auto border-2 border-[#121212] bg-[#FAF7EE] p-3"
            >
              <nav id="navigasi-pengelola" aria-label="Bagian ruang pengelola">
                <ul className="flex flex-col gap-2">
                  {renderLinks("min-w-0")}
                </ul>
              </nav>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <aside
      aria-label="Navigasi ruang pengelola"
      className={`w-full shrink-0 border-2 border-[#121212] bg-[#FAF7EE] p-3 sm:w-60 min-[768px]:sticky sm:top-7 lg:top-10${pinned ? " admin-stuck" : ""}`}
    >
      <nav aria-label="Bagian ruang pengelola">
        <ul className="flex flex-row flex-wrap gap-2 sm:flex-col sm:flex-nowrap">
          {renderLinks("min-w-0 flex-1 sm:flex-none")}
        </ul>
      </nav>
    </aside>
  );
}
