import { expect, test, vi } from "vitest";

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: () => ({ status: "revoked" }),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: async () => {} }),
}));

vi.mock("react-router", () => ({
  useLocation: () => ({ pathname: "/admin" }),
  useNavigate: () => () => {},
}));

vi.mock("sonner", () => ({ toast: () => {} }));

const { nextExitStage } = await import("./session-revoked-guard");

/**
 * Kontrak keluarnya perangkat yang dicabut.
 *
 * Yang diuji adalah sifat anti-ulang. Satu pencabutan harus menghasilkan satu
 * toast, satu `signOut()`, dan satu redirect — tidak satu pun per render ulang
 * atau per kiriman ulang dari Convex. Kegagalan yang paling mungkin di sini
 * adalah toast bertumpuk: orang melihat lima pemberitahuan IDENTIK dan mulai
 * mengira ada lima kejadian berbeda, padahal hanya satu peristiwa yang terjadi.
 */

const REVOKED = { status: "revoked" as const, revokedAt: 1_790_000_000_000 };
const ALL_STAGES = ["idle", "notified", "signing_out", "redirected"] as const;

test("hanya status revoked yang memulai transisi keluar", () => {
  for (const status of [
    undefined,
    { status: "none" },
    { status: "untracked" },
    { status: "active" },
    { status: "current" },
    { status: "expired" },
  ] as const) {
    expect(nextExitStage("idle", status, false)).toBe("idle");
  }
  expect(nextExitStage("idle", REVOKED, false)).toBe("notified");
});

test("satu pencabutan hanya bisa diproses sekali, berapa kali pun datasanya dikirim ulang", () => {
  let stage = nextExitStage("idle", REVOKED, false);
  expect(stage).toBe("notified");
  // Seratus render ulang berikutnya tidak boleh memulai apa-apa.
  for (let i = 0; i < 100; i += 1) {
    stage = nextExitStage(stage, REVOKED, false);
  }
  expect(stage).toBe("notified");
});

test("tahapan yang sudah lewat tidak pernah diulang ke belakang", () => {
  // `idle` dikecualikan: memang satu-satunya tahap yang boleh maju, itu
  // seluruh tujuan fungsi ini. Tahap setelahnya harus membeku.
  for (const stage of ALL_STAGES.filter((s) => s !== "idle")) {
    expect(nextExitStage(stage, REVOKED, false)).toBe(stage);
  }
});

test("halaman masuk tidak memicu keluar lagi, sehingga toast tidak berputar", () => {
  // Setelah redirect, komponen masih terpasang sebentar di /auth. Kalau ia ikut
  // bereaksi di sana, notifikasi akan muncul berulang tanpa henti.
  expect(nextExitStage("idle", REVOKED, true)).toBe("idle");
  expect(nextExitStage("notified", REVOKED, true)).toBe("notified");
});
