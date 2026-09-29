// Sumber kebenaran tunggal untuk handoff WhatsApp ke admin.
//
// SEBELUMNYA
//   Notifikasi admin dikirim server-side lewat WhatsApp Cloud API. Server
//   memanggil Graph API Meta, lalu menandai baris `whatsappDeliveries` sebagai
//   `sent` atau `delivered` sesuai balasan provider.
//
// SEKARANG
//   Admin tidak lagi dikirimi pesan oleh server. Aplikasi hanya menyiapkan
//   tautan click-to-chat, lalu admin yang menekan kirim di aplikasi WhatsApp.
//
// APA YANG TIDAK BISA DIKLAIM
//   `wa.me` bukan Cloud API. Membuka tautan tidak memberi bukti apa pun bahwa
//   pesan sampai atau dibaca: tidak ada message ID, tidak ada status kiriman,
//   tidak ada webhook balasan. Karena itu modul ini tidak memakai kata
//   "sent" atau "delivered" di mana pun.
//
// BUKAN SECRET
//   Nomor ini bukan kredensial. Yang tidak boleh bocor ke mana pun adalah isi
//   pesan, bukan nomor tujuan. Satu-satunya nomor tujuan admin untuk
//   notifikasi operasional adalah konstanta di bawah; tidak ada duplikatnya
//   di komponen, tes, komentar, atau README.

/**
 * Nomor tujuan admin dalam format internasional: tanpa `+`, tanpa spasi,
 * tanpa tanda hubung, tanpa kurung, dan tanpa nol di depan.
 */
export const ADMIN_WHATSAPP_NUMBER = "6287869512332";

/** URL dasar hasil derivasi, bukan literal kedua di file mana pun. */
export const ADMIN_WHATSAPP_BASE_URL = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}`;

/** Bentuk yang sah untuk nomor Indonesia: `62` diikuti 9 sampai 13 digit. */
const INTERNATIONAL_NUMBER = /^62\d{9,13}$/;

/**
 * Nomor tujuan harus lolos bentuk internasional sebelum URL apa pun dibuat.
 * Nomor telepon bukan secret, tetapi URL dengan bentuk salah tidak akan sampai
 * ke mana pun -- lebih baik ditolak di sini daripada menampilkan CTA rusak.
 */
export const isValidAdminNumber = (value: string): boolean => INTERNATIONAL_NUMBER.test(value);

/**
 * Bukti yang BOLEH diklaim setelah handoff, dan tidak lebih dari itu.
 *
 * Dipakai sebagai teks antarmuka dan dikunci oleh tes, supaya tidak ada bagian
 * mana pun dari aplikasi yang menampilkan "Terkirim" untuk sesuatu yang hanya
 * berupa tautan.
 */
export const ADMIN_HANDOFF_EVIDENCE = {
  generated: "WhatsApp handoff URL generated correctly",
  recipient: "recipient verified",
  payload: "message payload encoded correctly",
  cta: "CTA rendered correctly",
  opened: "click opens WhatsApp destination",
  boundary: "handoff verified; external WhatsApp delivery unverified",
} as const;

export type AdminHandoffEvidence = keyof typeof ADMIN_HANDOFF_EVIDENCE;

export type AdminDailySummaryInput = {
  /** Tanggal operasional WIB, bentuk `YYYY-MM-DD`. */
  date: string;
  openErrorReports: number;
  newRequests: number;
  activeAdminSessions: number;
};

/**
 * Pesan handoff umum: konteks di baris pertama, isi di sisanya.
 *
 * Isi sudah disanitasi oleh pemanggilnya (`buildAdminAlertMessage` di
 * `error-reporting.ts` sudah melewati penyanitasi), jadi modul ini tidak
 * menambah apa pun ke dalamnya dan tidak pernah menempelkan metadata internal.
 */
export type AdminHandoffInput = {
  /** Judul atau konteks singkat. */
  title: string;
  /** Isi yang sudah disanitasi oleh pemanggilnya. */
  body: string;
};

/** Satu baris per nilai, selalu lewat penghitung supaya tidak ada string mentah. */
const countLine = (label: string, count: number): string => `${label}: ${count}`;

/**
 * Pesan ringkasan harian. Deterministik: input yang sama selalu menghasilkan
 * string yang sama, tanpa jam, tanpa zona waktu, dan tanpa locale yang bisa
 * bergeser. Tanggal berasal dari pemanggil, bukan dari `Date.now()`.
 */
export const buildAdminDailySummaryMessage = (input: AdminDailySummaryInput): string =>
  [
    `Buku Kerja - Ringkasan Harian ${input.date}`,
    "Jenis event: ringkasan harian admin",
    countLine("Laporan error belum ditangani", input.openErrorReports),
    countLine("Permintaan warga 24 jam", input.newRequests),
    countLine("Sesi admin aktif", input.activeAdminSessions),
    "Sumber: Buku Kerja (handoff WhatsApp manual)",
    "Pesan disiapkan otomatis; pengelola yang menekan kirim.",
  ].join("\n");

/** Pesan handoff umum: konteks di baris pertama, isi di sisanya. */
export const buildAdminHandoffMessage = ({ title, body }: AdminHandoffInput): string =>
  `${title.trim()}\n\n${body.trim()}`;

/**
 * Bangun URL handoff.
 *
 * `encodeURIComponent` dipakai utuh, bukan `URLSearchParams`, karena yang
 * kedua menulis spasi sebagai `+`. Keduanya sah menurut WHATWG untuk
 * `application/x-www-form-urlencoded`, tetapi hanya yang pertama memenuhi
 * syarat RFC 3986 untuk komponen query. Aplikasi menampilkan URL-nya apa
 * adanya di antarmuka, jadi bentuk yang tampil harus benar tanpa bergantung
 * pada parser.
 *
 * Hasilnya divalidasi ulang: kalau ada karakter yang membuat `URL` gagal
 * mengurai, atau kalau isi pesan tidak pulih utuh setelah di-decode, fungsi
 * ini melempar di sini -- bukan handing tautan rusak ke pengguna.
 */
export const buildAdminWhatsappLink = (message?: string): string => {
  const trimmed = message?.trim();
  if (!trimmed) return ADMIN_WHATSAPP_BASE_URL;
  const link = `${ADMIN_WHATSAPP_BASE_URL}?text=${encodeURIComponent(trimmed)}`;
  const parsed = new URL(link);
  if (parsed.origin !== "https://wa.me") {
    throw new Error("Handoff admin harus mengarah ke wa.me");
  }
  if (parsed.pathname.slice(1) !== ADMIN_WHATSAPP_NUMBER) {
    throw new Error("Nomor tujuan admin berubah saat URL dibangun");
  }
  if (parsed.searchParams.get("text") !== trimmed) {
    throw new Error("Pesan handoff tidak bisa di-encode tanpa kehilangan isi");
  }
  return link;
};

/**
 * Nomor tujuan ditampilkan hanya empat digit terakhirnya. Tidak ada alasan
 * operasional untuk memamerkan seluruh nomor di panel.
 */
export const maskAdminNumber = (value: string): string => value.replace(/\d(?=\d{4})/g, "•");
