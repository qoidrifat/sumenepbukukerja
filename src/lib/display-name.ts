/**
 * Nama tampilan publik, diturunkan dari email akun.
 *
 * MENGAPA INI ADA
 * --------------
 * Papan permintaan publik sebelumnya memakai `users.name` milik akun. Nama itu
 * bisa apa saja yang diketik pengguna saat mendaftar, dan sebagian besar orang membiarkan
 * sistem mengisinya dari email - sehingga nama asli bisa bocor ke halaman yang
 * bisa dibaca siapa pun. Fase 9.1 mencatat itu sebagai keputusan produk
 * (F-05, `DECISION REQUIRED`).\n
 *
 * Modul ini memberi opsi ketiga: tampilkan nama TURUNAN, bukan nama akun.
 * `ahmanuddin.firman@gmail.com` menghasilkan "Ahmanuddin Firman" - persis,
 * tanpa tebakan, karena email itu sendiri yang memuat pemisahnya.
 * `budi.santoso@...` menghasilkan "Budi Santoso".
 *
 * CATATAN PENTING SOAL CONTOH YANG SERING DISALIN
 * -----------------------------------------------
 * `ahm.uddin.firman@gmail.com` menghasilkan **"Ahm Uddin Firman"**, bukan
 * "Ahmanuddin Firman". Aturan ini membaca apa yang tertulis di email, dan
 * `ahm.uddin` memang berisi dua singkatan, bukan satu nama. Untuk mendapat
 * "Ahmanuddin Firman" persis, emailnya harus ditulis
 * `ahmanuddin.firman@gmail.com` atau `ahman_uddin_firman@gmail.com`.
 *
 * BATAS YANG HARUS DIPAHAMI SEBELUM PAKAI
 * ---------------------------------------
 * `ahmanuddinfirman92@gmail.com` **tidak** bisa dipecah jadi "Ahmanuddin
 * Firman" oleh aturan apa pun. Tidak ada pemisah antara kedua kata itu, jadi
 * aturannya mengembalikan satu token: "Ahmanuddinfirman". Sistem seperti
 * GitHub menghadapi persis masalah ini dan menyelesaikannya dengan cara yang
 * sama: turunkan tebakan terbaik, tampilkan, lalu beri kesempatan mengoreksi
 * satu kali. Jalur koreksinya ada di `users.setMyDisplayName` dan di kolom
 * isian pada `MyRequestHistory`.
 *
 * Yang perlu diketahui pengambil keputusan: ini PSEUDONIM, bukan anonim.
 * "Ahmanuddin Firman" di papan publik bisa dibalik siapa pun yang reversing
 * nama itu menjadi alamat Gmail-nya. Yang berkurang adalah paparan tidak
 * sengaja; paparan yang disengaja tidak. Dicatat di
 * `docs/security/PII-DECISION-REGISTER.md` R-1 supaya tidak ada yang nanti
 * mengklaim nama tersebut sudah privat.
 *
 * ATURAN YANG SENGaja TIDAK ADA DI SINI
 * -------------------------------------
 * Tidak ada daftar nama-given untuk memecah token yang tidak terpisah.
 * Daftar seperti itu harus dipelihara terus-menerus, bias-nya ke satu kelompok nama, dan
 * sering salah pada nama yang memang tidak mengikuti pola. Satu tebakan yang
 * jujur lebih baik daripada daftar yang salah separuh waktu.
 */

/** Panjang maksimum nama tampilan. 60 cukup untuk "Nama Depan Nama Belakang". */
export const DISPLAY_NAME_MAX = 60;

/** Panjang minimum; di bawah ini terlalu mungkin terjadi dari email acak. */
const MIN_LENGTH = 2;

/**
 * Ambil bagian sebelum `@`.
 *
 * Mengembalikan `null` kalau input bukan bentuk email yang bisa dipercaya -
 * email `undefined` (akun anonymous), atau string tanpa `@`.
 */
function localPartOf(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  // Tanpa `@`, atau dengan lebih dari satu (`a@b@c` bukan alamat email),
  // tidak bisa ditafsirkan.
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null;
  return trimmed.slice(0, at);
}

/**
 * Bersihkan satu token: buang angka, sisakan huruf dan spasi.
 *
 * Angka dibuang seluruhnya, bukan hanya di ekor. `fitness123` menghasilkan
 * "fitness" yang tetap berguna, sedangkan memotong hanya digit terakhir
 * menyisakan `ahmanuddin1223` yang membingungkan.
 */
function lettersOnly(token: string): string {
  return token
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // buang tanda baca diaeresis
    // huruf turun dulu. Tanpa baris ini, kelas karakter di bawah hanya
    // menerima huruf kecil dan huruf besar ikut terpotong - "Budi Santoso"
    // menjadi "udiSantoso". `titleCase` mengembalikan bentuk kapitalnya
    // sendiri, jadi tidak ada yang hilang.
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `AHMAD` -> `Ahmad`. Camel-case per kata, bukan camelCase. */
function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Nama tampilan yang sudah dikoreksi pengguna, atau `null` kalau tidak ada.
 *
 * Fungsi ini TIDAK memvalidasi; `users.setMyDisplayName` sudah memvalidasi
 * sebelum menyimpan. Yang penting di sini: nilai yang dikoreksi menang
 * terhadap tebakan, dan tidak pernah ikut terpotong ulang tanpa alasan.
 */
export function sanitizeDisplayName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = titleCase(lettersOnly(raw));
  if (cleaned.length < MIN_LENGTH) return null;
  return cleaned.slice(0, DISPLAY_NAME_MAX);
}

/**
 * Nama tampilan turunan dari email. Mengembalikan `null` kalau tidak ada
 * yang bisa ditulis dengan jujur - pemanggil lalu memakai fallback
 * "Warga Sumenep".
 */
export function deriveDisplayName(email: string | null | undefined): string | null {
  const local = localPartOf(email);
  if (!local) return null;

  // Gmail mengabaikan titik dan semua setelah `+`, jadi
  // `a.b+tag@gmail.com` adalah akun yang sama dengan `ab@gmail.com`.
  // Membuang keduanya membuat tebakan sesuai identitas yang sebenarnya.
  const withoutTag = local.split("+")[0] ?? "";
  const withoutDots = withoutTag.replace(/\./g, " ");

  // Pemisah yang lazim: titik, garis bawah, tanda hubung. Kalau ada, satu
  // email bisa menghasilkan beberapa kata tanpa ada tebakan sama sekali.
  // `localPartOf` sudah menurunkan huruf, jadi Title Case di sini yang
  // mengubahnya kembali jadi bentuk yang enak dibaca.
  const words = lettersOnly(withoutDots.replace(/[-_]+/g, " "));
  if (words.length < MIN_LENGTH) return null;
  return titleCase(words).slice(0, DISPLAY_NAME_MAX);
}

/**
 * Nama yang harus tampil untuk satu akun.
 *
 * Urutannya penting dan tidak boleh dibalik: nama yang dikoreksi pengguna
 * selalu menang. Kalau tebakan menang, koreksi pengguna tidak akan pernah
 * berlaku - dan orang berhenti mengoreksinya.
 */
export function resolveDisplayName(
  stored: string | null | undefined,
  email: string | null | undefined,
): string {
  return (
    sanitizeDisplayName(stored) ??
    deriveDisplayName(email) ??
    "Warga Sumenep"
  );
}
