/**
 * Aturan "akun pemilik" — satu sumber kebenaran.
 *
 * Dulu daftar email ini hidup di `src/convex/users.ts` saja. Begitu aturan yang
 * sama juga dipakai untuk gerbang passcode, menyalinnya ke file kedua akan
 * membuka risiko: cepat atau lambat keduanya berbeda pendapat, dan yang kalah
 * biasanya adalah yang lebih diam. Karena itu daftar ini dipindah ke sini, dan
 * semua tempat — server maupun klien — mengambil dari modul yang sama.
 *
 * Menambah atau mengurangi akun pemilik berarti mengubah SATU baris di bawah.
 */

/**
 * Email yang/setup sebagai akun pemilik sistem.
 *
 * Dipakai juga oleh tes, supaya alamat email itu tidak ditulis ulang di dua
 * tempat: ditulis ulang sekali berarti bisa mulai berbeda.
 */
export const OWNER_ACCOUNT_EMAIL = "qoidrifat23@gmail.com";

/** Semua akun pemilik, dalam bentuk ternormalisasi. */
export const OWNER_ACCOUNT_EMAILS: ReadonlySet<string> = new Set([OWNER_ACCOUNT_EMAIL]);

/** Gelar yang ditampilkan di panel pengelola untuk akun pemilik. */
export const OWNER_ACCOUNT_TITLE = "SuperAdmin · Developer";

/**
 * Gelar singkat untuk permukaan yang sempit — chip peran pada baris audit log.
 *
 * Versi lengkapnya (`OWNER_ACCOUNT_TITLE`) terlalu panjang untuk chip kecil,
 * jadi baris audit memakai bentuk singkat ini. Dua-duanya hidup di sini supaya
 * mengubah keduanya berarti menyentuh satu berkas, bukan mencari string
 * yang tersebar.
 */
export const OWNER_AUDIT_ROLE_LABEL = "Super Admin";

/**
 * Apakah sebuah email adalah akun pemilik.
 *
 * Normalisasi dilakukan di sini, bukan di pemanggil: `Qoidrifat23@Gmail.COM `
 * dengan spasi di ujung harus tetap dikenali, karena email dari form bisa saja
 * tidak rapi. Penentuan peran sendiri tetap memakai id user, bukan email.
 */
export function isOwnerAccount(email: string | null | undefined): boolean {
  return OWNER_ACCOUNT_EMAILS.has((email ?? "").trim().toLowerCase());
}
