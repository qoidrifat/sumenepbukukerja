// Payload Meta Cloud API untuk pengiriman pesan keluar. Dipisahkan dari
// src/convex/whatsapp.ts supaya format parameter template (named vs positional)
// dan aturan pemotongan panjang bisa diuji tanpa memanggil Graph API.
//
// WhatsApp Manager hanya menerima variabel bernama (huruf kecil, garis bawah,
// angka), jadi template WAJIB memakai `parameter_name`. Urutan parameter harus
// sama dengan urutan variabel di body template.

export type MessageInput = { phone: string; title: string; body: string };

export type TemplateOptions = {
  /** WHATSAPP_TEMPLATE_NAME */
  name: string;
  /** WHATSAPP_TEMPLATE_LANGUAGE, default `id` */
  language: string;
  /** WHATSAPP_TEMPLATE_PARAM_TITLE, default `judul` */
  titleParam: string;
  /** WHATSAPP_TEMPLATE_PARAM_BODY, default `isi` */
  bodyParam: string;
};

export type OtpParameter = { name: string; text: string };

export type OtpOptions = {
  /** WHATSAPP_OTP_TEMPLATE_NAME */
  name: string;
  /** WHATSAPP_OTP_TEMPLATE_LANGUAGE, default `id` */
  language: string;
  /**
   * Nilai variabel template sesuai urutan kemunculannya di body. Template
   * pustaka Meta memakai nama yang berulang (`{{teks}}` dua kali), jadi
   * pencocokan dilakukan berdasarkan urutan, bukan nama unik.
   */
  parameters: OtpParameter[];
};

/** Batas aman sebelum Meta menolak parameter yang terlalu panjang. */
const TITLE_MAX = 200;
const BODY_MAX = 700;

/** Pesan teks bebas. Hanya legal di dalam jendela layanan 24 jam. */
export const buildTextPayload = (input: MessageInput) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: input.phone,
  type: "text",
  text: { preview_url: false, body: `${input.title}\n\n${input.body}` },
});

/**
 * Pesan template. Satu-satunya jenis yang boleh dikirim di luar jendela 24 jam.
 * Header, footer, dan tombol sengaja tidak dikirim: kode tidak punya nilai untuk
 * komponen itu, dan Meta menolak bila template punya komponen yang tidak diisi.
 */
export const buildTemplatePayload = (input: MessageInput, options: TemplateOptions) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: input.phone,
  type: "template",
  template: {
    name: options.name,
    language: { code: options.language },
    components: [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            parameter_name: options.titleParam,
            text: input.title.slice(0, TITLE_MAX),
          },
          {
            type: "text",
            parameter_name: options.bodyParam,
            text: input.body.slice(0, BODY_MAX),
          },
        ],
      },
    ],
  },
});

/**
 * Kode OTP verifikasi nomor. Template kategori Authentication dari pustaka Meta
 * memakai variabel bernama, jadi setiap parameter menyertakan `parameter_name`
 * dan urutannya harus sama dengan urutan variabel di body template.
 *
 * Menyertakan nama aplikasi dan nomor kontak penting: tanpa itu, pesan OTP kita
 * tidak bisa dibedakan dari pesan menipu yang mengaku berasal dari Buku Kerja.
 */
export const buildOtpTemplatePayload = (
  input: { phone: string },
  options: OtpOptions,
) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: input.phone,
  type: "template",
  template: {
    name: options.name,
    language: { code: options.language },
    components: [
      {
        type: "body",
        parameters: options.parameters.map((parameter) => ({
          type: "text",
          parameter_name: parameter.name,
          text: parameter.text.slice(0, 200),
        })),
      },
    ],
  },
});
