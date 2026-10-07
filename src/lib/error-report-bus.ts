// Toko kecil yang menghubungkan pelapor error dengan popup.
//
// Dipisah dari komponen supaya tiga hal bisa berbagi satu kanal: popup
// (komponen React), penanganan error global (`window.onerror`, yang jalan di
// luar React), dan pembungkus aksi di `catalog-store`.
//
// Ini bukan state manager. Satu objek, satu set listener, tanpa dependensi.

import type { ErrorReportInput } from "./error-reporting";

export type ErrorDialogPhase = "idle" | "reporting" | "reported" | "failed";

/**
 * Bentuk yang dirender popup untuk sebuah state.
 *
 * Dipisah dari komponen supaya setiap status (sedang mencatat, berhasil,
 * gagal) bisa diuji tanpa DOM. Popup hanyalah penggambar dari nilai ini.
 */
export type ErrorDialogView = {
  open: boolean;
  title: string;
  badge?: string;
  hint?: string;
  tone?: string;
  showReportId: boolean;
  showDetail: boolean;
  showRetry: boolean;
  /** True bila tautan handoff WhatsApp ke admin sudah siap dipakai. */
  showWhatsapp: boolean;
  /**
   * True bila pengguna sudah menekan "Kirim ke admin": tombol WA diganti
   * "Tutup Pesan" selebar penuh. Tidak ada jalan tutup sebelum ini —
   * laporan harus diteruskan dulu.
   */
  showTutupPesan: boolean;
  busy: boolean;
};

export const describeErrorDialog = (state: ErrorDialogState): ErrorDialogView => {
  if (state.phase === "idle") {
    return {
      open: false,
      title: state.title,
      showReportId: false,
      showDetail: false,
      showRetry: false,
      showWhatsapp: false,
      showTutupPesan: false,
      busy: false,
    };
  }
  const copy: Record<
    Exclude<ErrorDialogPhase, "idle">,
    { badge: string; hint: string; tone: string }
  > = {
    reporting: {
      badge: "Mencatat laporan...",
      hint: "Mohon tunggu sebentar, sistem sedang menyimpan detail masalah ini.",
      tone: "border-blue-200 bg-blue-50 text-blue-900",
    },
    reported: {
      badge: "Laporan berhasil dicatat",
      hint: "Laporan sudah tersimpan dengan ID di bawah. Tim pengelola bisa menelusurinya.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    },
    failed: {
      badge: "Laporan belum dapat disimpan",
      hint: "Sistem gagal mencatat laporan secara otomatis. Silakan coba lagi atau hubungi pengelola.",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
    },
  };
  return {
    open: true,
    title: state.title,
    ...copy[state.phase],
    showReportId: Boolean(state.reportId),
    showDetail: Boolean(state.detail),
    showRetry: state.canRetry,
    showWhatsapp: Boolean(state.adminWhatsappUrl) && !state.adminShared,
    showTutupPesan: Boolean(state.adminWhatsappUrl) && Boolean(state.adminShared),
    busy: state.phase === "reporting",
  };
};

export type ErrorDialogState = {
  /** Undefined berarti belum ada laporan yang tersimpan. */
  reportId?: string;
  phase: ErrorDialogPhase;
  title: string;
  message: string;
  errorCode?: string;
  /** Detail teknis yang sudah disanitasi. Tidak pernah ditampilkan tanpa
   *  pengguna membuka synopsis secara sadar. */
  detail?: string;
  occurredAt: number;
  canRetry: boolean;
  onRetry?: () => void;
  /**
   * Tautan handoff `wa.me` ke nomor admin dengan pesan alert premium yang
   * sudah terisi. Hanya ada bila laporan tercatat (ada reportId): tanpa ID,
   * admin tidak bisa menelusuri apa pun. Disiapkan oleh `reportAndNotify`,
   * bukan oleh komponen — komponen hanya menggambarnya.
   */
  adminWhatsappUrl?: string;
  /**
   * True setelah pengguna menekan tautan handoff (tab WhatsApp dibuka).
   * Pengiriman aktual di aplikasi WhatsApp tidak terdeteksi dari sini
   * (`wa.me` tidak memberi callback), jadi klik = niat kirim. Diset oleh
   * komponen lewat `patchErrorDialog`, bukan oleh pelapor.
   */
  adminShared?: boolean;
};

const CLOSED: ErrorDialogState = {
  phase: "idle",
  title: "",
  message: "",
  occurredAt: 0,
  canRetry: false,
};

let state: ErrorDialogState = CLOSED;
/**
 * Token stadium dialog naik setiap kali dialog dibuka, sehingga laporan yang
 * datang belakangan tahu apakah dia yang sedang membuka layarnya -- dan tidak
 * menimpa ID laporan yang lebih baru dengan miliknya sendiri.
 */
let activeToken = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const subscribeErrorDialog = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getErrorDialog = () => state;

export const getErrorDialogToken = () => activeToken;

export const setErrorDialog = (next: ErrorDialogState): number => {
  state = next;
  activeToken += 1;
  emit();
  return activeToken;
};

export const patchErrorDialog = (patch: Partial<ErrorDialogState>, token?: number) => {
  // Patch dari stadium yang sudah tidak aktif diabaikan: itu laporan lama
  // yang mencoba menimpa laporan yang lebih baru.
  if (token !== undefined && token !== activeToken) return;
  state = { ...state, ...patch };
  emit();
};

export const closeErrorDialog = () => {
  state = CLOSED;
  activeToken += 1;
  emit();
};

/* ------------------------------------------------------------------ */
/* Reporter yang didaftarkan dari provider                             */
/* ------------------------------------------------------------------ */

export type RegisteredReporter = (
  payload: ErrorReportInput,
) => Promise<{ reportId?: string } | null>;

let reporter: RegisteredReporter | null = null;

/** Mendaftarkan reporter aktif. Mengembalikan fungsi pelepas. */
export const registerErrorReporter = (next: RegisteredReporter | null) => {
  reporter = next;
  return () => {
    if (reporter === next) reporter = null;
  };
};

export const getErrorReporter = () => reporter;
