export const sanitizePhoneNumber = (phone: string) => phone.replace(/\D/g, "").replace(/^0/, "62");

/**
 * Bersihkan pesan error dari server sebelum ditampilkan ke pengguna.
 *
 * Convex membungkus error action dengan pelacak internal
 * ("Uncaught Error: ... at handler (src/convex/...:634:4) Called by client").
 * Tanpa dibersihkan, kalimat yang sengaja ditulis operator ikut hilang di
 * balik jejak internal yang tidak berguna bagi warga.
 */
export const formatConvexError = (caught: unknown, fallback: string) => {
  const raw = caught instanceof Error ? caught.message : typeof caught === "string" ? caught : "";
  const cleaned = raw
    // Nama kelas error di depan pesan. `err.message` dari Convex tidak
    // memuatnya (itu bagian dari `err.stack`), tapi teks yang dicatat di
    // laporan sering disalin dari stack, jadi bentuk ini ikut dibersihkan
    // supaya kedua bentuk menghasilkan pesan yang sama.
    .replace(/^\s*ConvexError:\s*/i, "")
    // Amplop yang ditambahkan klien Convex: nama fungsi, Request ID, dan
    // penanda "Server Error". Semuanya jejak internal, bukan untuk pengguna.
    .replace(/^\s*\[CONVEX[^\]]*\]\s*/i, "")
    .replace(/^\s*\[Request ID:[^\]]*\]\s*/i, "")
    .replace(/^\s*Server Error\s*/i, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/\s+at handler\s*\([^)]*\)\s*Called by client\s*$/i, "")
    .replace(/\s+at [^()]*\([^)]*\)\s*$/i, "")
    .replace(/\s*\(?\.\.\/src\/convex\/[^)]*\)?\s*$/i, "")
    .replace(/\s*\(?src\/convex\/[^)]*\)?\s*$/i, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return cleaned || fallback;
};

export type WhatsAppIntent = "general" | "availability" | "price" | "estimate" | "request";

export const recommendedWhatsAppIntent = (category: string): WhatsAppIntent =>
  category === "Kuliner" || category === "Transportasi"
    ? "availability"
    : "price";

export const generateWhatsAppMessage = ({
  vendorName,
  category,
  landmark,
  intent = "general",
  reference,
}: {
  vendorName: string;
  category: string;
  landmark: string;
  intent?: WhatsAppIntent;
  reference?: string;
}) => {
  const intro = `Halo ${vendorName}, saya melihat listing Anda di Sumenep Buku Kerja.`;
  const location = landmark === "all" ? "sekitar Sumenep" : `sekitar ${landmark}`;
  const context = {
    general: category === "Kuliner" ? "Mau tanya paket dan ketersediaan." : "Mau tanya layanan dan harga.",
    availability: "Apakah usaha sedang tersedia untuk kebutuhan hari ini?",
    price: "Mau tanya harga terbaru dan pilihan paket yang tersedia.",
    estimate: "Boleh minta estimasi waktu selesai dan cakupan pekerjaan?",
    request: `Saya melihat permintaan warga di papan lokal: "${reference ?? "kebutuhan baru"}". Boleh saya bantu?`,
  }[intent];
  return `${intro} ${context} Saya berada di ${location}.`;
};

/**
 * FASE 10 - `generateWhatsAppLink` DIHAPUS, bukan di-deprecate.
 *
 * Fungsi ini menuntut nomor mentah ada di peramban, dan itulah akar
 * kebocorannya: memakainya berarti katalog publik harus mengirim `phone`,
 * yang berarti satu permintaan anonim cukup untuk memanen seluruh direktori.
 *
 * Menghapusnya lebih berguna daripada menandainya deprecated, karena tidak
 * ada lagi satu pun tempat di repo ini yang bisa memanggilnya secara tidak
 * sengaja. Teks pesan (`generateWhatsAppMessage`) tetap hidup dan sekarang
 * dipanggil SERVER di `vendors:getContactHandoff`, yang juga menyusun
 * `wa.me`-nya. Nomor tidak pernah menyeberang ke klien.
 */
