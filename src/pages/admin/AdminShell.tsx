import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { flushSync } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminHeader } from "@/components/admin-workspace";
import { useReviewQueue, useCurrentAccess } from "@/lib/catalog-store";
import { useAuth } from "@/hooks/use-auth";

/**
 * Kerangka ruang pengelola untuk rute bertingkat `/admin/*`.
 *
 * Susunan kini: satu `AdminHeader` STICKY di puncak (mentok tepi viewport),
 * lalu bingkai konten dengan jarak ~50px di bawahnya. Sidebar diganti
 * menu tarik-turun akun pemilik di header (Ringkasan · Katalog · Moderasi ·
 * Keamanan · Sistem · Beranda · Profil · Keluar), mengikuti permintaan
 * modernisasi.
 *
 * Landasan main TUNGGAL hidup di sini (elemen main membungkus Outlet);
 * semua halaman di bawahnya mengembalikan div polos tanpa main maupun
 * bingkai dalam, supaya tiap halaman punya tepat satu landmark.
 *
 * Header diangkat ke shell supaya satu query profil + satu langganan
 * akses melayani semua halaman (sebelumnya tiap halaman mengulang).
 *
 * Gerak lintas-rute tetap kontrak opsi A (zoom 1.100ms + kilau Liquid
 * Glass, lihat `admin-motion-contract.test.ts`):
 *
 * 1. Transisi dipicu manual lewat intersepsi klik tautan `/admin`, karena
 *    mode deklaratif `BrowserRouter` + `<Routes>` TIDAK meneruskan prop
 *    `viewTransition` React Router ke `document.startViewTransition`.
 *    Tautan pembawa `state` router minta lolos lewat
 *    `data-no-view-transition`.
 * 2. Kilau menyusul zoom via `.admin-page-sweep` setelah snapshot baru
 *    selesai.
 */
export function AdminShell() {
  const reviewQueue = useReviewQueue();
  const access = useCurrentAccess();
  const { user } = useAuth();
  const myProfile = useQuery(api.users.myProfile, {});
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [sweep, setSweep] = useState(false);

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
    <div className="admin-workspace min-h-dvh min-h-[100svh] bg-[#FAF7EE] text-[#1A1A1A]">
      <AdminHeader
        role={access?.role ?? undefined}
        isOwner={access?.isOwner ?? false}
        accountName={user?.name ?? null}
        accountImageUrl={myProfile?.imageUrl ?? null}
        reviewQueue={reviewQueue ?? undefined}
      />
      {/* Desktop: jarak ~50px di bawah pill sticky. Mobile: bar bottom, jadi
          konten hanya perlu padding bawah yang cukup untuk bar + safe-area. */}
      <div className="admin-shell-frame relative mx-auto max-w-[1600px] px-3 pt-[50px] pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pb-10">
        <main className="min-w-0">
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
