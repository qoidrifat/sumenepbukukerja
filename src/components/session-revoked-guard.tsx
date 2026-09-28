import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

/** Tahap keluar perangkat. Setiap tahap hanya boleh dilalui satu kali. */
export type ExitStage = "idle" | "notified" | "signing_out" | "redirected";

/** Status sesi yang dipantau watchdog, sebagaimana bentuk di server. */
export type WatchedSessionStatus = {
  status: "none" | "untracked" | "active" | "current" | "revoked" | "expired";
  revokedAt?: number;
};

/**
 * Aturan transisi keluar, dipisah dari komponen supaya bisa diuji langsung.
 *
 * Sifat yang dijaga di sini: satu pencabutan menghasilkan tepat satu
 * transisi dari `idle`. Render ulang, kiriman ulang dari Convex, dan
 * sambungan kembali semuanya melewati fungsi yang sama, jadi tidak ada jalan
 * untuk memulai keluarnya dua kali — dan karena itu tidak akan ada dua toast
 * untuk satu peristiwa yang sama.
 */
export function nextExitStage(
  stage: ExitStage,
  status: WatchedSessionStatus | undefined,
  onAuthPage: boolean,
): ExitStage {
  if (onAuthPage) return stage;
  if (status?.status !== "revoked") return stage;
  if (stage !== "idle") return stage;
  return "notified";
}

/**
 * Watchdog sesi reaktif.
 *
 * Satu query reaktif memberitahu perangkat ini apakah sesinya masih hidup.
 * Begitu server menandai dicabut, klien keluar dengan rapi: satu toast, satu
 * `signOut()`, satu redirect. Penegakan sesungguhnya tetap di server lewat
 * `assertSessionNotRevoked`; yang ini supaya keluarnya terasa bersih dan
 * orangnya tahu kenapa ia dikeluarkan.
 */
export function SessionRevokedGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();

  const status = useQuery(
    api.adminGate.currentAdminSessionStatus,
    isAuthenticated ? {} : "skip",
  );

  // Ref, bukan state: render ulang tidak boleh memulai atau mengulang
  // transisi keluar.
  const stageRef = useRef<ExitStage>("idle");
  const onAuthPage =
    location.pathname === "/auth" || location.pathname.startsWith("/auth/");

  useEffect(() => {
    if (nextExitStage(stageRef.current, status, onAuthPage) !== "notified") return;
    stageRef.current = "notified";
    toast("Sesi Anda telah diakhiri oleh pengelola admin.", {
      description: "Masuk kembali untuk melanjutkan pekerjaan Anda.",
    });

    void (async () => {
      try {
        await signOut();
      } catch {
        // Kegagalan signOut tidak boleh menahan redirect. Server sudah
        // menolak sesi ini, jadi artefak lokal tidak boleh membuat orang
        // terjebak di halaman yang tidak bisa dipakai lagi.
      }
      stageRef.current = "signing_out";
      navigate("/auth?returnTo=/admin&revoked=1", { replace: true });
      stageRef.current = "redirected";
    })();
  }, [status, signOut, navigate, onAuthPage]);

  return <>{children}</>;
}
