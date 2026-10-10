import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { flushSync } from "react-dom";
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
 *
 * Shell juga tempat dua mekanik gerak lintas-rute (kontrak di
 * `admin-motion-contract.test.ts`):
 *
 * 1. Efek pin — sentinel `size-px` di puncak bingkai; sidebar desktop
 *    (`sm:top-7 lg:top-10`) dan hamburger mobile menempel tepat pada
 *    offset padding bingkai, jadi momen sentinel keluar viewport == momen
 *    benar-benar "stuck". Kelas `admin-stuck` menambah bayangan tipis.
 * 2. Transisi opsi A (zoom 1.100ms + kilau) — dipicu manual lewat
 *    intersepsi klik tautan `/admin`, karena mode deklaratif
 *    `BrowserRouter` + `<Routes>` TIDAK meneruskan prop `viewTransition`
 *    React Router ke `document.startViewTransition` (navigasi jatuh ke
 *    `navigator.push(to, state)` tanpa kanal opsi). Tautan pembawa
 *    `state` router minta lolos lewat `data-no-view-transition` —
 *    `navigate(href)` hasil intersepsi tidak membawa state tersebut.
 */
export function AdminShell() {
  const reviewQueue = useReviewQueue();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const pinRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(false);
  const [sweep, setSweep] = useState(false);

  // Pin: sentinel di puncak bingkai (absolut, di luar alur flex). Ia keluar
  // viewport tepat ketika elemen sticky melewati offset padding-nya.
  useEffect(() => {
    const sentinel = pinRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Kilau Liquid Glass menyusul zoom: piksel snapshot membeku saat transisi
  // berjalan, jadi kilau baru boleh dilepas setelah `::view-transition-new`
  // selesai — persis peristiwa `animationend` yang disaring di bawah.
  useEffect(() => {
    let timer: number | undefined;
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.pseudoElement !== "::view-transition-new(root)") return;
      setSweep(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSweep(false), 520);
    };
    document.addEventListener("animationend", onAnimationEnd);
    return () => {
      document.removeEventListener("animationend", onAnimationEnd);
      window.clearTimeout(timer);
    };
  }, []);

  // Intersepsi tautan admin → View Transitions API. `preventDefault` fase
  // capture membuat `Link` internal React Router berhenti (handleClick-nya
  // memeriksa `event.defaultPrevented`), lalu navigasi diganti milik kita
  // di dalam callback snapshot. Gerbang: dukungan API, tanpa modifier
  // keyboard, bukan reduced-motion, href `/admin` saja, bukan halaman yang
  // sama, dan bukan tautan ber-state.
  useEffect(() => {
    if (typeof document.startViewTransition !== "function") return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || (href !== "/admin" && !href.startsWith("/admin/"))) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.hasAttribute("data-no-view-transition")) return;
      if (href === pathname + search) return;
      event.preventDefault();
      // `admin-rise` dimatikan sejak transisi pertama: blok yang masih di
      // titik nol animasi masuk akan tertangkap kosong oleh snapshot zoom.
      // Load pertama (tanpa kelas ini) tetap jalan seperti biasa.
      document.documentElement.classList.add("admin-vt-active");
      try {
        document.startViewTransition(() => {
          flushSync(() => navigate(href));
        });
      } catch {
        navigate(href);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate, pathname, search]);

  return (
    <div className="admin-workspace min-h-dvh min-h-[100svh] pb-[calc(2rem+env(safe-area-inset-bottom))] bg-[#FAF7EE] text-[#1A1A1A]">
      <div className="admin-shell-frame relative mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10 min-[768px]:flex-row min-[768px]:items-start">
        <div
          ref={pinRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 size-px"
        />
        <AdminSidebar
          pinned={pinned}
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
      <div
        className={`admin-page-sweep${sweep ? " is-on" : ""}`}
        aria-hidden="true"
      />
    </div>
  );
}
