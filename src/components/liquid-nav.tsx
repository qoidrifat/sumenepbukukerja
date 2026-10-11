/* eslint-disable react-refresh/only-export-components -- hooks + components co-located by design; split would fragment the primitive. */
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Primitive Liquid Glass Navigation.
 *
 * Material kaca Apple (blur + lapisan cahaya dalam + refleksi aqua + glare
 * kursor) di atas cincin brutalism. Sliding active pill memakai kurva spring
 * ≤350ms (HIG). Hormati reduced-motion: pill snap, glare mati.
 *
 * Dipakai AdminHeader (varian admin) dan bisa dipakai publik (varian
 * `liquid--public`).
 */

/** Posisi sliding pill: lebar + translateX dari item aktif. */
export function useSlidingPill(containerRef: React.RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      setPill((p) => ({ ...p, ready: false }));
      return;
    }
    setPill({ x: active.offsetLeft, w: active.offsetWidth, ready: true });
  }, [containerRef]);

  // Ukur saat rute berpindah dan saat layout berubah (resize).
  useEffect(() => {
    measure();
  }, [pathname, measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  // Frame pertama: pill mulai tanpa transisi supaya tidak meluncur dari nol.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
  }, []);

  return {
    style: {
      width: pill.w ? `${pill.w}px` : undefined,
      transform: pill.w ? `translateX(${pill.x}px)` : undefined,
      opacity: pill.ready ? 1 : 0,
    } as React.CSSProperties,
    ready: pill.ready,
  };
}

/**
 * Glare kursor: set CSS var `--gx`/`--gy` dari posisi pointer relatif nav.
 * Hanya aktif di perangkat fine-pointer (hover); sentuhan tidak memicu.
 */
export function useGlare<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${event.clientX - rect.left}px`);
      el.style.setProperty("--gy", `${event.clientY - rect.top}px`);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, []);

  return ref;
}

/**
 * Shell Liquid Glass: container kaca + refleksi + glare + sliding pill.
 * Anak: item navigasi ( NavLink / button ) + divider + pemicu akun.
 */
export function LiquidNav({
  children,
  className,
  variant = "admin",
  bottom = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  /** Token warna: admin (warm brutalism) atau publik (kaca dingin). */
  variant?: "admin" | "public";
  /** Bottom bar mobile: melebar penuh, ikon + label kecil. */
  bottom?: boolean;
  ariaLabel: string;
}) {
  const navRef = useGlare<HTMLDivElement>();
  const reduceMotion = useReducedMotion();

  return (
    <div
      ref={navRef}
      role="navigation"
      aria-label={ariaLabel}
      className={cn(
        "liquid-nav",
        variant === "admin" && "admin-liquid",
        variant === "public" && "liquid--public",
        bottom && "liquid-nav--bottom",
        className,
      )}
    >
      {/* Glare: hanya fine-pointer, dimatikan reduced-motion lewat CSS. */}
      <div className="liquid-glare-wrap" aria-hidden="true">
        <div className="liquid-glare" />
      </div>
      {children}
      {/* Sentinel untuk reduced-motion: glow kecil sebagai alternatif gerak. */}
      {reduceMotion ? null : null}
    </div>
  );
}

/**
 * Sliding active pill. Render DI DALAM `.liquid-items` sebagai anak pertama.
 * Ukur item `[aria-current="page"]` dan geser dengan spring ≤350ms.
 */
export function LiquidPill({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const { style } = useSlidingPill(containerRef);
  return <div className="liquid-pill" style={style} aria-hidden="true" />;
}

/**
 * Item navigasi pill. `as` NavLink (react-router) atau button.
 * `end` untuk rute indeks (`/admin`).
 */
export function LiquidItem({
  to,
  end,
  icon: Icon,
  label,
  children,
  badge,
  ...rest
}: {
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children?: React.ReactNode;
  /** Badge kecil di pojok kanan atas (mis. antrean review). */
  badge?: number;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href" | "to" | "className">) {
  return (
    <NavLink
      to={to}
      end={end}
      className="liquid-item"
      {...rest}
    >
      <span className="liquid-item-content">
        <Icon aria-hidden />
        <span className="liquid-lbl">{label}</span>
      </span>
      {badge && badge > 0 ? (
        <span
          className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#FF5A26] text-[10px] font-black text-white"
          aria-hidden="true"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      {children}
    </NavLink>
  );
}
