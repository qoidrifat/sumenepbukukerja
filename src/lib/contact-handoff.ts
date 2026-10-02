// FASE 10 - handoff kontak yang tidak pernah menampakkan nomor ke peramban.
//
// MASALAH YANG DISERIKAN MODUL INI
//
// Dulu setiap tombol WhatsApp dibangun di peramban:
//
//   generateWhatsAppLink({ phone: vendor.phone, ... })
//
// Itu menuntut `vendor.phone` ada di state React, jadi DTO katalog publik
// harus mengirim nomor mentah. Konsekuensinya: satu permintaan anonim ke
// `vendors:listActive` cukup untuk memanen SELURUH direktori tanpa membuka
// halaman, tanpa JavaScript, tanpa interaksi. HTTPS tidak menolong di sini,
// karena yang meminta memang dialing sendiri ke endpoint yang memang publik.
//
// YANG BERUBAH
//
// Peramban sekarang hanya memegang `contactRef`: pegangan opaque 128 bit yang
// tidak bisa ditebak dan tidak memuat informasi apa pun. Nomor penuh lahir
// di server, di dalam `vendors:getContactHandoff`, setelah empat pemeriksaan
// lulus: bentuk pegangan, listing masih aktif, kuota laju, dan jejak audit.
// Hasilnya URL yang langsung dibuka - jadi nomor itu tidak pernah mendarat
// di state, localStorage, analitik, atau laporan error.
//
// CATATAN PENTANG SOAL POPUP BLOCKER
//
// `window.open` yang dipanggil SESUDAH `await` akan diblokir peramban. Jadi
// tab kosong dibuka secara SINKRON di dalam handler klik - ketika gestur
// pengguna masih dianggap sah - lalu hanya alamatnya yang diganti setelah
// server menjawab. Karena itu `openContact` harus dipanggil langsung dari
// event handler, bukan dari `.then()` di tempat lain.

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { formatConvexError, type WhatsAppIntent } from "./whatsapp";

export type ContactHandoffOptions = {
  /** Pegangan opaque dari DTO listing. Kosong berarti kontak belum tersedia. */
  contactRef?: string | null;
  intent?: WhatsAppIntent;
  /** Rujukan singkat untuk intent `request`, mis. judul permintaan warga. */
  reference?: string;
};

type HandoffResult = { url: string; telUrl: string };

/**
 * Satu hook untuk semua tombol kontak di aplikasi.
 *
 * `openContact` melempar error kalau gagal, supaya pemanggil yang butuh tahu
 * (mis. tombol telepon) bisa bertindak sendiri. `openContactWithFeedback`
 * sudah menampilkan toast-nya, sehingga tidak ada tombol yang gagal diam-diam.
 */
export const useContactHandoff = () => {
  const getContactHandoff = useMutation(api.vendors.getContactHandoff);
  const [pending, setPending] = useState(false);

  const openContact = useCallback(
    async (options: ContactHandoffOptions): Promise<HandoffResult> => {
      const { contactRef, intent, reference } = options;
      if (!contactRef) {
        throw new Error("Kontak WhatsApp usaha ini belum tersedia.");
      }

      // Dibuka sinkron di dalam handler klik. Kalau baris ini dipindahkan
      // ke belakang `await`, peramban akan memblokirnya dan pengguna
      // mendapat tab kosong tanpa penjelasan.
      const tab = window.open("about:blank", "_blank", "noopener,noreferrer");
      setPending(true);
      try {
        const result = await getContactHandoff({ contactRef, intent, reference });
        if (tab) {
          tab.location.replace(result.url);
        } else {
          // Popup diblokir. Tetap buka di tab yang sama supaya pengguna
          // tidak mendapat apa pun tanpa penjelasan.
          window.location.assign(result.url);
        }
        return result;
      } catch (caught) {
        // Tab kosong yang terlanjur dibuka harus ditutup. Membiarkannya
        // terbuka adalah bentuk tombol mati yang paling membingungkan.
        tab?.close();
        throw caught;
      } finally {
        setPending(false);
      }
    },
    [getContactHandoff],
  );

  const openContactWithFeedback = useCallback(
    (options: ContactHandoffOptions) => {
      void openContact(options).catch((caught: unknown) => {
        toast.error(
          formatConvexError(caught, "Kontak WhatsApp belum bisa dibuka sekarang."),
        );
      });
    },
    [openContact],
  );

  /**
   * Membuka aplikasi telepon.
   *
   * `tel:` tidak punya jalur yang benar-benar server-side: skema-nya harus
   * sudah ada sebelum diklik. Jadi nomor ini tetap sampai ke peramban - TAPI
   * hanya setelah pengguna menekan tombol, bukan di respons katalog. Itu
   * perbedaan yang menentukan: yang bisa dipanen adalah respons API, dan
   * respons API sekarang tidak memuat nomor sama sekali.
   *
   * Kuota dan jejaknya tetap milik handoff yang sama, jadi tombol telepon
   * tidak bisa dipakai untuk memanen nomor tanpa batas.
   */
  const callContact = useCallback(
    (options: ContactHandoffOptions) => {
      const { contactRef } = options;
      if (!contactRef) {
        toast.error("Kontak telepon usaha ini belum tersedia.");
        return;
      }
      setPending(true);
      void getContactHandoff({ contactRef: contactRef })
        .then((result) => {
          window.location.assign(result.telUrl);
        })
        .catch((caught: unknown) => {
          toast.error(formatConvexError(caught, "Nomor telepon belum bisa dibuka."));
        })
        .finally(() => {
          setPending(false);
        });
    },
    [getContactHandoff],
  );

  return { openContact, openContactWithFeedback, callContact, pending };
};