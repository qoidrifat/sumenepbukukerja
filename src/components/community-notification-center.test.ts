import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

/**
 * Pusat notifikasi — kontrak visibilitas per peran.
 *
 * Blok ini tampil untuk semua akun login, jadi diagnosis operator tidak boleh
 * bocor ke warga: nama environment variable, kode provider mentah, dan alat
 * kirim-uji hanya berarti bagi pengelola. Warga hanya perlu preferensi,
 * nomornya sendiri, dan status berbahasa manusia.
 *
 * Default saat akses belum terjawab adalah warga: lebih baik staf menunggu
 * sekejap daripada info internal bocor sekilas saat loading.
 */

const state = vi.hoisted(() => ({
  access: undefined as { isStaff: boolean } | undefined,
  status: undefined as unknown,
}));

vi.mock("@/lib/catalog-store", () => ({
  useNotifications: () => [],
  useNotificationPreferences: () => ({
    whatsappUpdates: true,
    areaUpdates: false,
    requestUpdates: false,
    whatsappPhone: "6281234567890",
  }),
  useWhatsappStatus: () => state.status,
  useMyClaims: () => [],
  useCatalogActions: () => ({
    markNotificationsRead: async () => undefined,
    setNotificationPreferences: async () => undefined,
    sendTestWhatsapp: async () => undefined,
    markWhatsappThreadRead: async () => undefined,
  }),
  useCurrentAccess: () => state.access,
}));

const { NotificationCenter } = await import("./community-notification-center");

const STATUS_OPERATOR = {
  configured: true,
  provider: "meta",
  providerIssue: "ISU_OPERATOR_UJI",
  templateWarning: "WHATSAPP_TEMPLATE_NAME belum diisi, kode 131008",
  recent: [
    {
      deliveryKey: "k1",
      title: "Permintaan diperbarui",
      status: "failed",
      lastErrorCode: "190",
      updatedAt: Date.now(),
    },
  ],
  thread: null,
};

const render = () => renderToStaticMarkup(createElement(NotificationCenter));

describe("warga tidak melihat diagnosis operator", () => {
  test("peringatan template, nama env, kode mentah, dan tombol uji disembunyikan", () => {
    state.access = { isStaff: false };
    state.status = STATUS_OPERATOR;
    const html = render();
    expect(html).not.toContain("ISU_OPERATOR_UJI");
    expect(html).not.toContain("WHATSAPP_TEMPLATE_NAME");
    expect(html).not.toContain("131008");
    expect(html).not.toContain("Meta Cloud API");
    expect(html).not.toContain("Kirim pesan uji");
    expect(html).not.toContain("190");
  });

  test("kebutuhan warga tetap ada: preferensi, nomor, status manusiawi", () => {
    state.access = { isStaff: false };
    state.status = STATUS_OPERATOR;
    const html = render();
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Nomor WhatsApp untuk notifikasi");
    expect(html).toContain("Gagal");
    expect(html).toContain("Aktifkan kanal yang Anda butuhkan");
  });

  test("akses belum terjawab diperlakukan sebagai warga", () => {
    state.access = undefined;
    state.status = STATUS_OPERATOR;
    const html = render();
    expect(html).not.toContain("ISU_OPERATOR_UJI");
    expect(html).not.toContain("WHATSAPP_TEMPLATE_NAME");
    expect(html).not.toContain("Kirim pesan uji");
  });

  test("preferensi memakai sakelar geser iOS, bukan checkbox kotak", () => {
    state.access = { isStaff: false };
    state.status = STATUS_OPERATOR;
    const html = render();
    expect(html.match(/type="checkbox"/g)?.length).toBe(3);
    expect(html).toContain("peer-checked:bg-blue-600");
    expect(html).toContain("peer-checked:after:translate-x-5");
    expect(html).toContain("rounded-full");
  });

  test("status pengiriman tampil premium: titik status + label + waktu relatif", () => {
    state.access = { isStaff: false };
    state.status = STATUS_OPERATOR;
    const html = render();
    expect(html).toContain("Status pengiriman terakhir");
    expect(html).toContain("Permintaan diperbarui");
    expect(html).toContain("bg-red-500");
    expect(html).toContain("baru saja");
  });
});

describe("pengelola: tombol uji tampil, teks diagnosis tetap dihapus", () => {
  test("tombol uji tampil, peringatan template dan kode mentah tidak di mana pun", () => {
    state.access = { isStaff: true };
    state.status = STATUS_OPERATOR;
    const html = render();
    expect(html).toContain("Kirim pesan uji");
    expect(html).not.toContain("ISU_OPERATOR_UJI");
    expect(html).not.toContain("WHATSAPP_TEMPLATE_NAME");
    expect(html).not.toContain("131008");
    expect(html).not.toContain(">190<");
  });
});

describe("tata letak sakelar: vertikal selebar penuh", () => {
  const source = readFileSync(new URL("./community-notification-center.tsx", import.meta.url), "utf8");

  test("ketiga sakelar tersusun vertikal, bukan grid tiga kolom", () => {
    expect(source).toContain("flex flex-col gap-2");
    expect(source).not.toContain("sm:grid-cols-3");
  });

  test("setiap baris sakelar selebar penuh", () => {
    expect(source).toContain("min-h-12 w-full cursor-pointer");
  });

  test("sukses diam-diam: tanpa popup, gagal hanya pesan inline", () => {
    // toggle() tidak memanggil reportAndNotify: sukses = senyap total,
    // gagal = setPreferenceError (role=alert di bawah kartu), bukan dialog.
    expect(source).not.toContain("reportAndNotify");
    expect(source).toContain("setPreferenceError");
    expect(source).toContain('role="alert"');
  });
});
