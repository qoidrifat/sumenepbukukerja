import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useErrorReporter } from "@/lib/error-reporter";
import { ERROR_CODES } from "@/lib/error-reporting";

/**
 * Satu-satunya jalan keluar dari ruang admin.
 *
 * Logout adalah operasi yang mudah ditulis dua kali dan berbahaya kalau
 * berbeda sedikit: `logoutAdmin` mencabut sesi di server, `signOut()`
 * membatalkan JWT di peramban, lalu redirect. Kalau satu tempat lupa salah
 * satu langkah, pengelola menekan "Keluar", tidak terjadi apa-apa, dan ia
 * mengira sudah keluar padahal sesinya masih hidup.
 *
 * Karena itu logika ini hidup di modul sendiri, bukan di dalam komponen.
 * Panel Sesi Anda dan menu header sama-sama memanggilnya, jadi tidak ada
 * jalan keluar kedua yang bisa berbeda.
 *
 * Urutannya disengaja: jejak dulu, cabut sesi belakangan. Kalau pencatatan
 * audit gagal, sesi tetap harus dicabut - yang penting admin benar-benar
 * keluar. Kegagalan pencatatan dilaporkan sebagai peringatan, bukan
 *eskalasi, karena tidak ada data warga yang hilang dari kejadian itu.
 *
 * Kegagalan TOTAL (sesi tidak bisa dicabut) sengaja tidak ditelan: pemanggil
 * menerima `false` supaya bisa menampilkan sesuatu yang bisa ditindaklanjuti,
 * bukan membuat orang mengira sudah keluar.
 */
export function useAdminLogout() {
  const logout = useMutation(api.adminGate.logoutAdmin);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const report = useErrorReporter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const logoutAdmin = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setFailed(false);
    try {
      try {
        await logout({ route: "/admin" });
      } catch (caught) {
        await report({
          kind: "operation",
          code: ERROR_CODES.adminLogoutAudit,
          feature: "Admin Security Desk",
          operation: "admin.logout.audit",
          route: "/admin",
          severity: "warning",
          message: "Jejak audit logout gagal dicatat; sesi tetap dicabut.",
          context: { reason: caught instanceof Error ? caught.message : "unknown" },
        });
      }
      await signOut();
      navigate("/auth?returnTo=%2Fadmin", { replace: true });
      return true;
    } catch (caught) {
      setBusy(false);
      setFailed(true);
      await report({
        kind: "operation",
        code: ERROR_CODES.adminLogout,
        feature: "Admin Security Desk",
        operation: "admin.logout",
        route: "/admin",
        severity: "error",
        message: "Sesi admin tidak dapat dicabut dari panel ini.",
        context: { reason: caught instanceof Error ? caught.message : "unknown" },
      });
      return false;
    }
  }, [busy, logout, navigate, report, signOut]);

  return { logoutAdmin, logoutBusy: busy, logoutFailed: failed };
}