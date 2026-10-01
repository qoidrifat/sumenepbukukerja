/**
 * Ingat tujuan `/admin` selama satu alur lupa sandi.
 *
 * Masalah yang dipecahkan modul ini sempit dan nyata. Tautan reset sandi
 * dibuat oleh Firebase dari template di Firebase Console, jadi `returnTo`
 * TIDAK bisa ikut di dalam tautannya. Akibatnya pengelola yang menekan "Kirim
 * tautan reset" dari `/auth?returnTo=/admin` akan menerima email yang
 * membukanya ke layar tema publik - di tengah alur yang semuanya internal.
 *
 * Solusinya bukan mengubah template Firebase, melainkan menaruh niat itu di
 * `sessionStorage` sebelum email dikirim, lalu membacanya sekali saat tautan
 * dibuka. Sifatnya sengaja:
 *
 *  - `sessionStorage`, bukan `localStorage`: niatnya berumur satu alur, bukan
 *    satu perangkat. Niat yang basi lebih buruk daripada tidak ada niat.
 *  - Ada kedaluwarsa. Tautan Firebase sendiri berumur satu jam; menumpuk
 *    niat yang sudah lewat hanya membuat layar berikutnya salah tema.
 *  - Dibaca sekali lalu dihapus (`consume`). Kalau tidak dihapus, seluruh
 *    kunjungan berikutnya ke `/auth` akan ikut memakai tema admin.
 *
 * Modul ini TIDAK menyimpan hak akses apa pun. Yang diputuskan di sini hanya
 * tema tampilannya, sedangkan penentuan akses tetap milik passcode dan token
 * Firebase di server.
 */

const STORAGE_KEY = "sbk:admin-auth-intent";

/** Umur niat: sedikit lebih panjang dari umur tautan reset Firebase. */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Panjang maksimum agar `sessionStorage` tidak jadi tempat sampah. */
const MAX_PATH_LENGTH = 200;

type Intent = { path: string; at: number };

function safeRead(): Intent | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Intent>;
    if (typeof parsed?.path !== "string" || typeof parsed?.at !== "number") return null;
    return { path: parsed.path, at: parsed.at };
  } catch {
    // Mode privat dan storage yang diblokir membuat `sessionStorage` melempar.
    // Itu bukan alasan alur ini gagal, cuma alasan untuk tidak diingat.
    return null;
  }
}

/** Dicatat hanya untuk tujuan di dalam aplikasi, bukan URL luar. */
function isInternalAdminPath(path: string): boolean {
  return (
    path === "/admin" || (path.startsWith("/admin/") && !path.startsWith("//"))
  );
}

/** Ingat bahwa alur ini menuju ruang pengelola. Tidak melakukan apa pun bila tidak. */
export function rememberAdminAuthIntent(path: string): void {
  if (!isInternalAdminPath(path)) return;
  const payload: Intent = { path: path.slice(0, MAX_PATH_LENGTH), at: Date.now() };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ditolak storage berarti tidak ada yang bisa diingat. Layar tetap
    // berfungsi; hanya temanya yang kembali ke versi publik.
  }
}

/** Baca niat satu kali lalu hapus, supaya tidak berlaku ke kunjungan berikutnya. */
export function consumeAdminAuthIntent(): string | null {
  const intent = safeRead();
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sama seperti di atas: tidak ada storage, tidak ada yang perlu dihapus.
  }
  if (!intent) return null;
  if (Date.now() - intent.at > MAX_AGE_MS) return null;
  return isInternalAdminPath(intent.path) ? intent.path : null;
}
