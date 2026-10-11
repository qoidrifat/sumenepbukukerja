/* eslint-disable react-refresh/only-export-components -- hooks + components co-located by design; split would fragment the primitive. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { cn } from "@/lib/utils";

/**
 * Primitive Liquid Glass Navigation — sinkron dengan referensi
 * liquid-nav-preview.html.
 *
 * Material kaca Apple (blur 42px, saturate 185%, lapisan cahaya dalam,
 * refleksi aqua, glare kursor) di atas cincin brutalism 2px. Sliding active
 * pill memakai kurva spring 320ms. Reduced-motion: pill snap, glare mati.
 *
 * Breakpoint ikon-only: 720px.
 */

export const LIQUID_MOBILE_MQ = "(max-width: 720px)";

/**
 * Sliding active pill: ukur item `[aria-current="page"]`, geser + lebar
 * sinkron. `useLayoutEffect` positioning sebelum paint — anti-lompat.
 */
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

  useLayoutEffect(() => {
    measure();
  }, [pathname, measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cleanup: Array<() => void> = [];

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => measure());
      ro.observe(container);
      cleanup.push(() => ro.disconnect());
    }

    if (typeof window.matchMedia === "function") {
      const mq = window.matchMedia(LIQUID_MOBILE_MQ);
      const onMq = () => measure();
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", onMq);
        cleanup.push(() => mq.removeEventListener("change", onMq));
      } else {
        mq.addListener(onMq);
        cleanup.push(() => mq.removeListener(onMq));
      }
    }

    return () => cleanup.forEach((fn) => fn());
  }, [containerRef, measure]);

  return {
    style: {
      width: pill.w ? `${pill.w}px` : undefined,
      transform: pill.w ? `translateX(${pill.x}px)` : undefined,
      opacity: pill.ready ? 1 : 0,
    } as React.CSSProperties,
  };
}

/**
 * Glare kursor: set `--gx`/`--gy` dari posisi pointer relatif nav.
 * Hanya fine-pointer (hover); sentuhan tidak memicu.
 */
export function useGlare<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window.matchMedia !== "function") return;
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
 * Shell Liquid Glass: container kaca + refleksi + glare.
 * Anak: LiquidItems + LiquidDivider + trigger akun (dropdown/dropup).
 */
export function LiquidNav({
  children,
  className,
  variant = "admin",
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "admin" | "public";
  ariaLabel: string;
}) {
  const navRef = useGlare<HTMLDivElement>();

  return (
    <div
      ref={navRef}
      role="navigation"
      aria-label={ariaLabel}
      className={cn(
        "liquid-nav",
        variant === "admin" && "admin-liquid",
        variant === "public" && "liquid--public",
        className,
      )}
    >
      <div className="liquid-glare-wrap" aria-hidden="true">
        <div className="liquid-glare" />
      </div>
      {children}
    </div>
  );
}

/**
 * Wrapper item navigasi + sliding pill. Render sebagai anak LiquidNav.
 */
export function LiquidItems({
  containerRef,
  children,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const { style } = useSlidingPill(containerRef);
  return (
    <div className="liquid-items" ref={containerRef}>
      <div className="liquid-pill" style={style} aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * Item navigasi pill. NavLink react-router; `end` untuk rute indeks.
 * Label tersembunyi di ≤720px lewat CSS; aria-label tetap tersedia.
 */
export function LiquidItem({
  to,
  end,
  icon: Icon,
  label,
  badge,
  ...rest
}: {
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  badge?: number;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href" | "to" | "className">) {
  return (
    <NavLink to={to} end={end} className="liquid-item" aria-label={label} {...rest}>
      <span className="liquid-item-content">
        <Icon aria-hidden />
        <span className="liquid-lbl">{label}</span>
      </span>
      {badge && badge > 0 ? (
        <span
          className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-full bg-[#FF5A26] text-[10px] font-black text-white"
          aria-hidden="true"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </NavLink>
  );
}

/** Divider vertikal antara item navigasi dan trigger akun. */
export function LiquidDivider() {
  return <div className="liquid-divider" aria-hidden="true" />;
}

/**
 * Deteksi mobile (≤720px). Dipakai untuk memilih dropdown (desktop) vs
 * dropup (mobile) pada menu akun.
 */
export function useIsMobileLiquid() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(LIQUID_MOBILE_MQ);
    const onChange = () => setMobile(mq.matches);
    onChange();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return mobile;
}
