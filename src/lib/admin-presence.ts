import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";

/**
 * Heartbeat ringan untuk menandai sesi pengelola yang sedang aktif di ruang
 * admin, supaya audit log bisa menampilkan "Aktif sekarang" tanpa perlu
 * polling dari klien.
 *
 * Kenapa 300 detik, bukan 1 detik: presence bukan data real-time yang perlu
 * presisi tinggi. Satu panggilan mutation per lima menit per tab sudah cukup untuk
 * membedakan "sedang bekerja" dari "terakhir terlihat sejam lalu", dan jauh
 * lebih murah daripada query berulang. Ambang "aktif" di server adalah 330
 * detik (interval + grace 30 detik), jadi satu heartbeat yang gagal tidak
 * langsung membuat status hilang. Ditambah guard no-op di server, heartbeat
 * yang datang saat baris masih segar tidak menulis sama sekali.
 *
 * Berhenti saat tab disembunyikan supaya tab yang ditinggalkan tidak terus
 * menandai diri sebagai aktif.
 */
const HEARTBEAT_MS = 300_000;

export function useAdminPresence(enabled = true) {
  const heartbeat = useMutation(api.adminGate.heartbeatAdminPresence);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = async () => {
      try {
        await heartbeat({ route: "/admin" });
      } catch {
        // Kehilangan heartbeat bukan kondisi fatal — status akan basi sendiri
        // lewat ambang 330 detik di server.
      }
      if (!cancelled) timer = setTimeout(beat, HEARTBEAT_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) void beat();
    };

    void beat();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, isAuthenticated, heartbeat]);
}
