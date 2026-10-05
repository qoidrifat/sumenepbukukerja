import type { MascotState, MascotTone } from "@/lib/mascot-config";

/**
 * Peta rute → maskot loading + koreografi ekspresi.
 *
 * Dipisah dari komponen (aturan react-refresh: berkas komponen hanya boleh
 * mengekspor komponen) dan supaya bisa diuji unit tanpa DOM.
 */
export type LoaderRoute = {
  /** State pembuka; tiga pendampingnya fixed di bawah. */
  base: MascotState;
  tone: MascotTone;
  caption: string;
};

const COMPANIONS: MascotState[] = ["hello", "search", "empty"];

/** Koreografi 4 ketuk × 600ms = 2,4 detik; ketuk terakhir kembali ke pembuka. */
export function loaderSequence(base: MascotState): MascotState[] {
  // Ruang kerja tenang: admin tidak ikut sirkus ekspresi.
  if (base === "working") return [base];
  const rest = COMPANIONS.filter((state) => state !== base);
  const sequence: MascotState[] = [base, ...rest];
  while (sequence.length < 4) sequence.push(base);
  return sequence;
}

export function loaderRouteFor(pathname: string): LoaderRoute {
  if (pathname.startsWith("/admin")) {
    // Ruang kerja tenang: satu pose, tanpa sirkus ekspresi.
    return { base: "working", tone: "admin", caption: "Menyiapkan ruang kerja…" };
  }
  if (pathname.startsWith("/auth")) {
    return { base: "hello", tone: "public", caption: "Menyiapkan ruang masuk…" };
  }
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/warga/") || pathname.startsWith("/staff/")) {
    return { base: "found", tone: "public", caption: "Membuka dasbor…" };
  }
  if (pathname.startsWith("/v/")) {
    return { base: "connect", tone: "public", caption: "Membuka lapak…" };
  }
  if (pathname.startsWith("/invite")) {
    return { base: "hello", tone: "public", caption: "Membuka undangan…" };
  }
  if (pathname === "/kebijakan-privasi" || pathname === "/syarat-ketentuan") {
    return { base: "neutral", tone: "public", caption: "Membuka dokumen…" };
  }
  return { base: "search", tone: "public", caption: "Mencari usaha di sekitarmu…" };
}
